/**
 * useCritiqueReplay: fetches the critique transcript file for a completed run,
 * detects .ndjson vs .ndjson.gz, decodes line-by-line, and dispatches each
 * PanelEvent through panelEventToSse into the reducer at the chosen speed.
 *
 * The transcript is fetched from:
 *   /api/projects/:projectId/artifacts/:artifactId/critique/:runId/transcript
 * This endpoint is a future hook-up; a fetchTranscript adapter is injectable
 * so tests run without a server.
 *
 * @see specs/current/critique-theater.md § UI surface (replay)
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import type { PanelEvent } from '@open-design/contracts';
import { panelEventToSse } from '@open-design/contracts';
import { initialState, reduce } from '../state/reducer.js';
import type { CritiqueState } from '../state/reducer.js';

// ---------------------------------------------------------------------------
// Replay speed constants
// ---------------------------------------------------------------------------

/** Supported replay speeds. */
export const REPLAY_SPEEDS = ['1x', '4x', 'instant'] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

const SPEED_MULTIPLIER: Record<ReplaySpeed, number> = {
  '1x': 1,
  '4x': 4,
  instant: Infinity,
};

/** Default inter-event gap (ms) when no sentAt timestamp is available. */
const DEFAULT_GAP_MS = 80;

// ---------------------------------------------------------------------------
// Transcript adapter type
// ---------------------------------------------------------------------------

/**
 * Injectable transcript fetcher. The default implementation hits the daemon
 * REST endpoint. Tests inject a stub.
 */
export type FetchTranscript = (opts: {
  projectId: string;
  artifactId: string;
  runId: string;
}) => Promise<PanelEvent[]>;

/** Default network-based fetcher. */
async function defaultFetchTranscript(opts: {
  projectId: string;
  artifactId: string;
  runId: string;
}): Promise<PanelEvent[]> {
  const { projectId, artifactId, runId } = opts;
  const url = `/api/projects/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifactId)}/critique/${encodeURIComponent(runId)}/transcript`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`transcript_unavailable: HTTP ${resp.status}`);
  }
  const contentType = resp.headers.get('content-type') ?? '';
  const isGzip =
    contentType.includes('gzip') ||
    url.endsWith('.ndjson.gz');

  let text: string;
  if (isGzip) {
    const blob = await resp.blob();
    const ds = new DecompressionStream('gzip');
    const decompressed = blob.stream().pipeThrough(ds);
    text = await new Response(decompressed).text();
  } else {
    text = await resp.text();
  }

  const events: PanelEvent[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as PanelEvent);
    } catch {
      // Skip malformed lines.
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Hook options
// ---------------------------------------------------------------------------

export interface UseCritiqueReplayOptions {
  projectId: string;
  artifactId: string;
  runId: string;
  /** Default '4x'. */
  speed?: ReplaySpeed;
  /** Default true; pause/resume controlled by caller. */
  autoplay?: boolean;
  /**
   * Injectable transcript fetcher so the hook is testable without a server.
   * Defaults to fetching from the daemon REST endpoint.
   */
  fetchTranscript?: FetchTranscript;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches the transcript file via the existing artifact-read endpoint,
 * detects .ndjson vs .ndjson.gz, decodes line-by-line, and dispatches each
 * PanelEvent through panelEventToSse into the reducer at the chosen speed.
 *
 * 'instant' replays everything synchronously on mount (no setTimeout chain).
 * '1x' / '4x' use wall-clock pacing: events originally n ms apart are
 * replayed at n / speedMultiplier (1x = 1, 4x = 0.25).
 *
 * @see specs/current/critique-theater.md § UI surface (replay)
 */
export function useCritiqueReplay(opts: UseCritiqueReplayOptions): {
  state: CritiqueState;
  isReplaying: boolean;
  /** 0..1 progress through the transcript. */
  progress: number;
  /** Caller can pause/resume. */
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: ReplaySpeed) => void;
} {
  const {
    projectId,
    artifactId,
    runId,
    speed: initialSpeed = '4x',
    autoplay = true,
    fetchTranscript = defaultFetchTranscript,
  } = opts;

  if (!projectId) throw new Error('useCritiqueReplay: projectId is required');
  if (!artifactId) throw new Error('useCritiqueReplay: artifactId is required');
  if (!runId) throw new Error('useCritiqueReplay: runId is required');

  const [state, dispatchReducer] = useReducer(
    (s: CritiqueState, e: ReturnType<typeof panelEventToSse>) => reduce(s, e),
    initialState,
  );

  const [isReplaying, setIsReplaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeedState] = useState<ReplaySpeed>(initialSpeed);
  const [isPlaying, setIsPlayingState] = useState(autoplay);

  // Stable refs so the replay loop can read current values without
  // restarting the entire effect on each change.
  const speedRef = useRef(speed);
  const isPlayingRef = useRef(isPlaying);
  // Counter to cancel in-flight replay loops when key params change.
  const generationRef = useRef(0);

  const setSpeed = useCallback((s: ReplaySpeed) => {
    speedRef.current = s;
    setSpeedState(s);
  }, []);

  const setPlaying = useCallback((playing: boolean) => {
    isPlayingRef.current = playing;
    setIsPlayingState(playing);
  }, []);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    let cancelled = false;
    const generation = ++generationRef.current;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function run(): Promise<void> {
      setIsReplaying(true);
      setProgress(0);

      let events: PanelEvent[];
      try {
        events = await fetchTranscript({ projectId, artifactId, runId });
      } catch {
        // Fetch failure -> degraded state. Always clear replaying regardless of
        // cancellation, since we already dispatched the degraded event.
        dispatchReducer(
          panelEventToSse({
            type: 'degraded',
            runId,
            reason: 'missing_artifact',
            adapter: '',
          }),
        );
        setIsReplaying(false);
        return;
      }

      if (cancelled || generation !== generationRef.current) return;
      if (events.length === 0) {
        setIsReplaying(false);
        setProgress(1);
        return;
      }

      const currentSpeed = speedRef.current;

      if (currentSpeed === 'instant') {
        // Dispatch all synchronously.
        for (const evt of events) {
          dispatchReducer(panelEventToSse(evt));
        }
        if (!cancelled && generation === generationRef.current) {
          setProgress(1);
          setIsReplaying(false);
        }
        return;
      }

      // Timed replay.
      const multiplier = SPEED_MULTIPLIER[currentSpeed];
      let idx = 0;

      function dispatchNext(): void {
        if (cancelled || generation !== generationRef.current) return;

        // Pause support: poll until resumed.
        if (!isPlayingRef.current) {
          timeoutId = setTimeout(dispatchNext, 50);
          return;
        }

        const event = events[idx];
        if (event === undefined) {
          setProgress(1);
          setIsReplaying(false);
          return;
        }

        dispatchReducer(panelEventToSse(event));
        setProgress((idx + 1) / events.length);
        idx++;

        if (idx >= events.length) {
          setProgress(1);
          setIsReplaying(false);
          return;
        }

        // Compute gap to next event.
        const nextEvent = events[idx];
        let gapMs = DEFAULT_GAP_MS;
        if (
          nextEvent !== undefined &&
          'sentAt' in nextEvent &&
          typeof (nextEvent as Record<string, unknown>)['sentAt'] === 'number' &&
          'sentAt' in event &&
          typeof (event as Record<string, unknown>)['sentAt'] === 'number'
        ) {
          const diff =
            ((nextEvent as Record<string, unknown>)['sentAt'] as number) -
            ((event as Record<string, unknown>)['sentAt'] as number);
          if (diff > 0) gapMs = diff;
        }

        const delay = Math.max(0, gapMs / multiplier);
        timeoutId = setTimeout(dispatchNext, delay);
      }

      dispatchNext();
    }

    void run();

    return () => {
      cancelled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  // Re-run when the identity of key params changes. Speed/playing changes
  // are handled via refs to avoid re-fetching the transcript.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, artifactId, runId, fetchTranscript]);

  return { state, isReplaying, progress, setPlaying, setSpeed };
}

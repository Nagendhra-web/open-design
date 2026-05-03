/**
 * useCritiqueStream: subscribes to the project event bus via a raw EventSource
 * (no useProjectEvents abstraction exists in this repo -- the existing pattern
 * in providers/daemon.ts and providers/sse.ts uses raw fetch + ReadableStream
 * for agent runs; there is no shared project-level SSE hook to reuse).
 *
 * This hook opens an EventSource on:
 *   /api/projects/:projectId/events
 * and forwards every critique.* event into the reducer.
 *
 * @see specs/current/critique-theater.md § UI surface (theater stage)
 */

import { useCallback, useEffect, useReducer } from 'react';

import type { CritiqueSseEvent } from '@open-design/contracts';
import { CRITIQUE_SSE_EVENT_NAMES } from '@open-design/contracts';
import { initialState, reduce } from '../state/reducer.js';
import type { CritiqueState } from '../state/reducer.js';

export interface UseCritiqueStreamOptions {
  projectId: string;
  /**
   * Optional filter so we only feed events for one specific run. When
   * omitted, the hook follows whichever run the project event bus is
   * currently emitting.
   */
  runId?: string;
}

/**
 * Subscribes to the existing project event bus and feeds critique.* events
 * into the reducer. Returns the live state plus a stable dispatch function
 * (used by tests and replay).
 *
 * Lifecycle:
 *   - Mount: open EventSource, register listeners for all critique.* event names.
 *   - Each event: dispatch reduce(state, event).
 *   - Unmount: close EventSource.
 *
 * @see specs/current/critique-theater.md § UI surface (theater stage)
 */
export function useCritiqueStream(opts: UseCritiqueStreamOptions): {
  state: CritiqueState;
  /** Manual dispatch for test / replay injection. */
  dispatch: (event: CritiqueSseEvent) => void;
} {
  const { projectId, runId } = opts;

  if (!projectId) {
    throw new Error('useCritiqueStream: projectId is required');
  }

  const [state, dispatchReducer] = useReducer(
    (s: CritiqueState, e: CritiqueSseEvent) => reduce(s, e),
    initialState,
  );

  const dispatch = useCallback(
    (event: CritiqueSseEvent) => {
      dispatchReducer(event);
    },
    [],
  );

  useEffect(() => {
    const url = `/api/projects/${encodeURIComponent(projectId)}/events`;
    const source = new EventSource(url);

    function handleSseEvent(eventName: CritiqueSseEvent['event'], raw: MessageEvent): void {
      let data: unknown;
      try {
        data = JSON.parse(String(raw.data)) as unknown;
      } catch {
        // Malformed frame -- skip.
        return;
      }
      const sseEvent = { event: eventName, data } as CritiqueSseEvent;
      // When runId filter is active, skip events for other runs.
      if (runId !== undefined) {
        const payload = data as Record<string, unknown>;
        if (typeof payload['runId'] === 'string' && payload['runId'] !== runId) {
          return;
        }
      }
      dispatchReducer(sseEvent);
    }

    const listeners: Array<{ name: CritiqueSseEvent['event']; fn: (e: MessageEvent) => void }> = [];
    for (const name of CRITIQUE_SSE_EVENT_NAMES) {
      const fn = (e: MessageEvent) => handleSseEvent(name, e);
      source.addEventListener(name, fn as EventListener);
      listeners.push({ name, fn });
    }

    return () => {
      for (const { name, fn } of listeners) {
        source.removeEventListener(name, fn as EventListener);
      }
      source.close();
    };
  }, [projectId, runId]);

  return { state, dispatch };
}

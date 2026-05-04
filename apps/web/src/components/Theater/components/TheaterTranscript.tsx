/**
 * TheaterTranscript — replay viewer using useCritiqueReplay.
 *
 * Features: speed picker (1x / 4x / instant), scrubber (0..1 progress),
 * play/pause button, jump-to-round buttons.
 *
 * @see specs/current/critique-theater.md § UI surface (replay)
 */

import { useState } from 'react';
import { useT } from '../../../i18n/index.js';
import { REPLAY_SPEEDS, useCritiqueReplay } from '../hooks/useCritiqueReplay.js';
import type { FetchTranscript, ReplaySpeed, UseCritiqueReplayOptions } from '../hooks/useCritiqueReplay.js';
import { CT } from '../i18n.js';
import type { RoundState } from '../state/reducer.js';
import css from './styles.module.css';

export interface TheaterTranscriptProps {
  projectId: string;
  artifactId: string;
  runId: string;
  /** Number of rounds in the transcript (for jump buttons). */
  roundCount: number;
  /** Optional injectable fetcher for tests. */
  fetchTranscript?: FetchTranscript;
}

const SPEED_KEY: Record<ReplaySpeed, keyof typeof CT> = {
  '1x':     'replaySpeed1x',
  '4x':     'replaySpeed4x',
  'instant': 'replaySpeedInstant',
};

export function TheaterTranscript({
  projectId,
  artifactId,
  runId,
  roundCount,
  fetchTranscript,
}: TheaterTranscriptProps): JSX.Element {
  const t = useT();

  const [activeSpeed, setActiveSpeed] = useState<ReplaySpeed>('4x');
  const [isPlaying, setIsPlayingLocal] = useState(true);

  const opts: UseCritiqueReplayOptions = { projectId, artifactId, runId };
  if (fetchTranscript !== undefined) opts.fetchTranscript = fetchTranscript;

  const { state, isReplaying, progress, setPlaying, setSpeed } = useCritiqueReplay(opts);

  function handleSpeed(s: ReplaySpeed): void {
    setActiveSpeed(s);
    setSpeed(s);
  }

  function handlePlayPause(): void {
    const next = !isPlaying;
    setIsPlayingLocal(next);
    setPlaying(next);
  }

  // Collect rounds from state for jump buttons.
  const stateRounds: RoundState[] =
    'rounds' in state ? (state as { rounds: RoundState[] }).rounds : [];
  const effectiveRoundCount = Math.max(roundCount, stateRounds.length);

  const pct = Math.round(progress * 100);
  const done = !isReplaying && progress >= 1;

  return (
    <div className={`${css.theaterRoot} ${css.transcriptRoot}`} data-testid="critique-theater-transcript" aria-label={t(CT.replayTitle)}>
      <div className={css.transcriptHead}>
        <span className={css.transcriptTitle}>{t(CT.replayTitle)}</span>
        <span className={css.transcriptBadge}>{t(CT.replayReadOnly)}</span>
        <div className={css.speedPicker} role="group" aria-label="Replay speed">
          {REPLAY_SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={`${css.speedBtn} ${activeSpeed === s ? css.speedBtnActive : ''}`}
              aria-pressed={activeSpeed === s}
              onClick={() => handleSpeed(s)}
            >
              {t(CT[SPEED_KEY[s]])}
            </button>
          ))}
        </div>
      </div>

      <div className={css.scrubberWrap}>
        <button
          type="button"
          className={css.playBtn}
          aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
          onClick={handlePlayPause}
          disabled={done}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <div
          className={css.scrubber}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Replay progress ${pct}%`}
        >
          <div className={css.scrubberFill} style={{ width: `${pct}%` }} />
        </div>
        <span className={css.scrubberLabel} aria-hidden="true">{pct}%</span>
      </div>

      {effectiveRoundCount > 1 ? (
        <div className={css.jumpRow} role="group" aria-label="Jump to round">
          {Array.from({ length: effectiveRoundCount }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={css.jumpBtn}
              aria-label={`Jump to round ${n}`}
            >
              R{n}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

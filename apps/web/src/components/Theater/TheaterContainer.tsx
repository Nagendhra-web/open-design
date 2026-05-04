/**
 * TheaterContainer: top-level mount for the Critique Theater.
 *
 * Subscribes to the project SSE bus via useCritiqueStream and renders the
 * correct inner component per phase:
 *   idle        -> placeholder (no active run)
 *   running     -> TheaterStage
 *   shipped     -> TheaterCollapsed + TheaterTranscript overlay on click
 *   interrupted -> TheaterCollapsed (best round) + TheaterTranscript overlay
 *   degraded    -> TheaterDegraded
 *   failed      -> small error card
 *
 * When enabled === false the container returns null and never opens the SSE
 * subscription so the legacy single-pass path is undisturbed.
 *
 * @see specs/current/critique-theater.md § UI surface
 */

import { useState } from 'react';
import { useT } from '../../i18n/index.js';
import { CT } from './i18n.js';
import { useCritiqueStream } from './hooks/useCritiqueStream.js';
import { selectRoleScores } from './state/selectors.js';
import { TheaterCollapsed } from './components/TheaterCollapsed.js';
import { TheaterDegraded } from './components/TheaterDegraded.js';
import { TheaterStage } from './components/TheaterStage.js';
import { TheaterTranscript } from './components/TheaterTranscript.js';

export interface TheaterContainerProps {
  projectId: string;
  enabled: boolean;
  onInterrupt?: (runId: string) => void;
  onRerun?: (artifactId: string) => void;
}

/**
 * Inner component: only rendered when enabled === true, so hooks are always
 * called unconditionally within it.
 */
function TheaterContainerInner({
  projectId,
  onInterrupt,
  onRerun,
}: Omit<TheaterContainerProps, 'enabled'>): JSX.Element | null {
  const t = useT();
  const { state } = useCritiqueStream({ projectId });
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  if (state.phase === 'idle') {
    return (
      <div className="theater-container theater-container--idle" data-testid="theater-idle">
        <span className="theater-container__name">{t(CT.userFacingName)}</span>
        <span className="theater-container__hint">{t(CT.noRunYet)}</span>
      </div>
    );
  }

  if (state.phase === 'running') {
    return (
      <TheaterStage
        state={state}
        onInterrupt={
          onInterrupt !== undefined
            ? () => onInterrupt(state.runId)
            : undefined
        }
      />
    );
  }

  if (state.phase === 'shipped') {
    const roleScores = selectRoleScores(state);
    return (
      <>
        <TheaterCollapsed
          composite={state.final.composite}
          scale={state.scale}
          threshold={state.threshold}
          roundCount={state.final.round}
          roleScores={roleScores}
          onExpand={() => setTranscriptOpen(true)}
        />
        {transcriptOpen ? (
          <div
            className="modal-backdrop"
            onClick={() => setTranscriptOpen(false)}
          >
            <div
              className="modal"
              onClick={(e) => e.stopPropagation()}
            >
              <TheaterTranscript
                projectId={projectId}
                artifactId={state.final.artifactRef.artifactId}
                runId={state.runId}
                roundCount={state.final.round}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setTranscriptOpen(false)}
                >
                  {t(CT.interruptConfirmNo)}
                </button>
                {onRerun !== undefined ? (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      onRerun(state.final.artifactRef.artifactId);
                      setTranscriptOpen(false);
                    }}
                  >
                    {t(CT.shippedRerun)}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  if (state.phase === 'interrupted') {
    const roleScores = selectRoleScores(state);
    return (
      <>
        <TheaterCollapsed
          composite={state.composite}
          scale={state.scale}
          threshold={state.threshold}
          roundCount={state.bestRound}
          roleScores={roleScores}
          onExpand={() => setTranscriptOpen(true)}
        />
        {transcriptOpen ? (
          <div
            className="modal-backdrop"
            onClick={() => setTranscriptOpen(false)}
          >
            <div
              className="modal"
              onClick={(e) => e.stopPropagation()}
            >
              <TheaterTranscript
                projectId={projectId}
                artifactId={state.runId}
                runId={state.runId}
                roundCount={state.bestRound}
              />
              <button
                type="button"
                className="ghost"
                onClick={() => setTranscriptOpen(false)}
              >
                {t(CT.interruptConfirmNo)}
              </button>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  if (state.phase === 'degraded') {
    return (
      <TheaterDegraded
        reason={state.reason}
        adapter={state.adapter}
      />
    );
  }

  if (state.phase === 'failed') {
    return (
      <div
        className="theater-container theater-container--failed"
        role="alert"
        data-testid="theater-failed"
      >
        <span className="theater-container__name">{t(CT.userFacingName)}</span>
        <span className="theater-container__hint">{state.cause}</span>
      </div>
    );
  }

  return null;
}

export function TheaterContainer({
  projectId,
  enabled,
  onInterrupt,
  onRerun,
}: TheaterContainerProps): JSX.Element | null {
  if (!enabled) return null;

  if (!projectId) {
    throw new Error('TheaterContainer: projectId is required');
  }

  return (
    <TheaterContainerInner
      projectId={projectId}
      onInterrupt={onInterrupt}
      onRerun={onRerun}
    />
  );
}

/**
 * TheaterStage — live theater during the running phase.
 *
 * Composes: ScoreTicker + RoundDivider + lane grid (PanelistLane[]) + InterruptButton.
 *
 * Density modes:
 *   'smart'    (default) — active panelist expanded, rest collapsed.
 *   'active'             — only the active panelist shown.
 *   'expanded'           — all panelists expanded.
 *
 * Keyboard map (per spec):
 *   Tab    — native focus cycling through lanes.
 *   Enter  — toggle dim detail for focused lane (handled in PanelistLane via button).
 *   Esc    — trigger Interrupt confirm (delegated to InterruptButton via global handler).
 *   [ / ]  — step rounds in collapsed/replay mode (no-op in live running phase).
 *
 * A single offscreen aria-live="polite" region announces round_end and ship events.
 *
 * For non-running states returns null (parent picks the correct component).
 *
 * @see specs/current/critique-theater.md § UI surface (theater stage)
 * @see specs/current/critique-theater.md § Lane density
 */

import { useEffect, useRef, useState } from 'react';
import { useT } from '../../../i18n/index.js';
import { CT } from '../i18n.js';
import type { CritiqueState } from '../state/reducer.js';
import { selectLatestComposite, selectOpenMustFix } from '../state/selectors.js';
import { InterruptButton } from './InterruptButton.js';
import { PanelistLane } from './PanelistLane.js';
import { RoundDivider } from './RoundDivider.js';
import { ScoreTicker } from './ScoreTicker.js';
import css from './styles.module.css';

export type DensityMode = 'active' | 'smart' | 'expanded';

export interface TheaterStageProps {
  state: CritiqueState;
  /** Density mode. Default 'smart'. */
  density?: DensityMode;
  onDensityChange?: (next: DensityMode) => void;
  onInterrupt?: () => void;
}

const DENSITY_MODES: DensityMode[] = ['active', 'smart', 'expanded'];

// Running-phase state extracted from the union.
type RunningState = Extract<CritiqueState, { phase: 'running' }>;

interface RunningStageProps {
  state: RunningState;
  density: DensityMode;
  onDensityChange?: (next: DensityMode) => void;
  onInterrupt?: () => void;
}

/** Inner component: only mounts when phase === 'running', so hooks are always called. */
function RunningStage({
  state,
  density,
  onDensityChange,
  onInterrupt,
}: RunningStageProps): JSX.Element {
  const t = useT();

  // Per-lane collapsed state (user overrides the density default).
  const [laneOverrides, setLaneOverrides] = useState<Partial<Record<string, boolean>>>({});

  // Announce round_end and ship via aria-live.
  const [announcement, setAnnouncement] = useState('');
  const prevRoundsLen = useRef(state.rounds.length);
  const prevPhase = useRef<string>(state.phase);

  useEffect(() => {
    const newLen = state.rounds.length;
    if (newLen > prevRoundsLen.current) {
      const round = state.rounds[newLen - 1];
      if (round !== undefined && round.composite !== undefined) {
        setAnnouncement(
          t(CT.roundLabel, { round: round.n, total: state.maxRounds }) +
          ` ${t(CT.shippedScore)} ${round.composite.toFixed(1)}`,
        );
      }
    }
    prevRoundsLen.current = newLen;
  }, [state.rounds, state.maxRounds, t]);

  useEffect(() => {
    const cur: string = state.phase;
    if (cur !== prevPhase.current) {
      setAnnouncement(t(CT.userFacingName));
    }
    prevPhase.current = cur;
  }, [state.phase, t]);

  const composite = selectLatestComposite(state);
  const mustFixOpen = selectOpenMustFix(state);

  function isCollapsed(role: string): boolean {
    const override = laneOverrides[role];
    if (override !== undefined) return override;
    switch (density) {
      case 'active':
        return role !== state.activePanelist;
      case 'expanded':
        return false;
      case 'smart':
      default:
        return role !== state.activePanelist;
    }
  }

  function toggleLane(role: string): void {
    setLaneOverrides((prev) => ({ ...prev, [role]: !isCollapsed(role) }));
  }

  const ruleLine = t(CT.ruleLineRunning, {
    threshold: state.threshold,
    max: state.maxRounds,
  });

  const currentRound = state.activeRound;

  // Visible cast: in 'active' density, filter to only activePanelist.
  const visibleCast =
    density === 'active' && state.activePanelist !== null
      ? state.cast.filter((r) => r === state.activePanelist)
      : state.cast;

  const currentRoundState = state.rounds[currentRound - 1];

  const densityLabel: Record<DensityMode, keyof typeof CT> = {
    active:   'densityActive',
    smart:    'densitySmart',
    expanded: 'densityExpanded',
  };

  return (
    <div className={`${css.theaterRoot} ${css.stageRoot}`} data-testid="critique-theater-stage">
      {/* Offscreen aria-live for round_end and ship announcements */}
      <div className={css.srOnly} aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* Stage header: score + density picker */}
      <div className={css.stageHeader}>
        <ScoreTicker
          composite={composite}
          threshold={state.threshold}
          scale={state.scale}
          mustFixOpen={mustFixOpen}
          ruleLine={ruleLine}
        />
        <div className={css.densityToggle} role="group" aria-label="Lane density">
          {DENSITY_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`${css.densityBtn} ${density === mode ? css.densityBtnActive : ''}`}
              aria-pressed={density === mode}
              onClick={() => {
                setLaneOverrides({});
                onDensityChange?.(mode);
              }}
            >
              {t(CT[densityLabel[mode]])}
            </button>
          ))}
        </div>
      </div>

      {/* Round divider */}
      {currentRound > 0 ? (
        <RoundDivider round={currentRound} totalRounds={state.maxRounds} />
      ) : null}

      {/* Lane grid */}
      <div className={css.laneGrid}>
        {visibleCast.map((role) => {
          const panelistState = currentRoundState?.panelists[role] ?? {
            dims: [],
            mustFixes: [],
          };
          const collapsed = isCollapsed(role);
          const isActive = role === state.activePanelist;

          return (
            <PanelistLane
              key={role}
              role={role}
              scale={state.scale}
              panelist={panelistState}
              collapsed={collapsed}
              isActive={isActive}
              onToggle={() => toggleLane(role)}
            />
          );
        })}
      </div>

      {/* Interrupt button — always visible during running phase */}
      <InterruptButton onConfirm={onInterrupt} />
    </div>
  );
}

export function TheaterStage({
  state,
  density = 'smart',
  onDensityChange,
  onInterrupt,
}: TheaterStageProps): JSX.Element | null {
  if (!DENSITY_MODES.includes(density)) {
    throw new Error(`TheaterStage: invalid density "${String(density)}"`);
  }

  if (state.phase !== 'running') return null;

  return (
    <RunningStage
      state={state}
      density={density}
      onDensityChange={onDensityChange}
      onInterrupt={onInterrupt}
    />
  );
}

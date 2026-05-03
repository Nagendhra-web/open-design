/**
 * Pure selector functions over CritiqueState. No memoization library used;
 * React useMemo lives in the consuming hook or component.
 *
 * @see specs/current/critique-theater.md § UI surface (state machine)
 */

import type { PanelistRole } from '@open-design/contracts';
import type { CritiqueState, RoundState } from './reducer.js';

/**
 * Round currently being worked, or null when not running.
 *
 * @see specs/current/critique-theater.md § UI surface (theater stage)
 */
export function selectActiveRound(state: CritiqueState): RoundState | null {
  if (state.phase !== 'running') return null;
  const round = state.rounds[state.activeRound - 1];
  return round ?? null;
}

/**
 * Latest closed round's composite score, or null when no round has closed yet.
 *
 * @see specs/current/critique-theater.md § UI surface (score badge)
 */
export function selectLatestComposite(state: CritiqueState): number | null {
  if (state.phase !== 'running' && state.phase !== 'shipped' && state.phase !== 'interrupted') {
    return null;
  }
  const rounds = state.rounds;
  // Walk backwards to find the last round with a composite score.
  for (let i = rounds.length - 1; i >= 0; i--) {
    const round = rounds[i];
    if (round !== undefined && round.composite !== undefined) {
      return round.composite;
    }
  }
  return null;
}

/**
 * Total open must-fix count across all rounds in the active run.
 *
 * @see specs/current/critique-theater.md § UI surface (must-fix badge)
 */
export function selectOpenMustFix(state: CritiqueState): number {
  if (state.phase !== 'running' && state.phase !== 'shipped' && state.phase !== 'interrupted') {
    return 0;
  }
  return state.rounds.reduce((sum, r) => sum + r.mustFix, 0);
}

/**
 * True when the state is in a terminal phase (shipped / interrupted / failed / degraded).
 *
 * @see specs/current/critique-theater.md § UI surface (state machine)
 */
export function isTerminal(state: CritiqueState): boolean {
  return (
    state.phase === 'shipped' ||
    state.phase === 'interrupted' ||
    state.phase === 'failed' ||
    state.phase === 'degraded'
  );
}

/**
 * Per-role aggregated score for the most recently closed round, or an empty
 * object when no round has closed yet. Used by the score badge collapse view.
 *
 * @see specs/current/critique-theater.md § UI surface (score badge)
 */
export function selectRoleScores(state: CritiqueState): Partial<Record<PanelistRole, number>> {
  if (state.phase !== 'running' && state.phase !== 'shipped' && state.phase !== 'interrupted') {
    return {};
  }
  const rounds = state.rounds;
  // Find the last round with a composite (i.e., a closed round).
  for (let i = rounds.length - 1; i >= 0; i--) {
    const round = rounds[i];
    if (round === undefined || round.composite === undefined) continue;
    const scores: Partial<Record<PanelistRole, number>> = {};
    for (const [role, pState] of Object.entries(round.panelists) as Array<
      [PanelistRole, (typeof round.panelists)[PanelistRole]]
    >) {
      if (pState !== undefined && pState.score !== undefined) {
        scores[role] = pState.score;
      }
    }
    return scores;
  }
  return {};
}

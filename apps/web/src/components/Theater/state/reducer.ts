/**
 * Pure reducer over CritiqueSseEvent. No side effects, no I/O, no timers.
 *
 * @see specs/current/critique-theater.md § UI surface (state machine)
 */

import type { CritiqueSseEvent, PanelistRole } from '@open-design/contracts';

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

/** One panelist's contribution within a single round. */
export interface PanelistRoundState {
  dims: ReadonlyArray<{ name: string; score: number; note: string }>;
  mustFixes: ReadonlyArray<string>;
  /** undefined until panelist_close arrives. */
  score?: number;
}

/** State for a single critique round. */
export interface RoundState {
  n: number;
  /** Composite arrives via critique.round_end; before then it is undefined. */
  composite?: number;
  mustFix: number;
  panelists: Partial<Record<PanelistRole, PanelistRoundState>>;
}

/** Union of all possible theater phases. */
export type CritiqueState =
  | { phase: 'idle' }
  | {
      phase: 'running';
      runId: string;
      rounds: RoundState[];
      activeRound: number;
      activePanelist: PanelistRole | null;
      cast: ReadonlyArray<PanelistRole>;
      maxRounds: number;
      threshold: number;
      scale: number;
    }
  | {
      phase: 'shipped';
      runId: string;
      rounds: RoundState[];
      cast: ReadonlyArray<PanelistRole>;
      maxRounds: number;
      threshold: number;
      scale: number;
      final: {
        composite: number;
        round: number;
        status: 'shipped' | 'below_threshold' | 'timed_out' | 'interrupted';
        summary: string;
        artifactRef: { projectId: string; artifactId: string };
      };
    }
  | { phase: 'degraded'; runId: string; reason: string; adapter: string }
  | {
      phase: 'interrupted';
      runId: string;
      rounds: RoundState[];
      cast: ReadonlyArray<PanelistRole>;
      maxRounds: number;
      threshold: number;
      scale: number;
      bestRound: number;
      composite: number;
    }
  | { phase: 'failed'; runId: string; cause: string };

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

/** Starting state for the theater -- no active run. */
export const initialState: CritiqueState = { phase: 'idle' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ensure a round entry exists at index n (1-based round number). */
function ensureRound(rounds: RoundState[], n: number): RoundState[] {
  const idx = n - 1;
  if (idx < 0) return rounds;
  const existing = rounds[idx];
  if (existing !== undefined) return rounds;
  const next = [...rounds];
  // Fill any gaps with empty rounds (shouldn't happen with a well-behaved daemon,
  // but defensive code handles out-of-order or skipped indices).
  for (let i = next.length; i <= idx; i++) {
    next.push({ n: i + 1, mustFix: 0, panelists: {} });
  }
  return next;
}

/** Ensure a panelist entry exists for role within the given round. */
function ensurePanelist(round: RoundState, role: PanelistRole): RoundState {
  if (round.panelists[role] !== undefined) return round;
  return {
    ...round,
    panelists: {
      ...round.panelists,
      [role]: { dims: [], mustFixes: [] },
    },
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Pure reducer over CritiqueSseEvent. Unknown event types are returned
 * unchanged (forward-compat for v2 protocol). Out-of-order events for a
 * non-running phase are returned unchanged. Defensive copies are taken when
 * appending so consumers can safely use Object.is checks.
 *
 * @see specs/current/critique-theater.md § UI surface (state machine)
 */
export function reduce(state: CritiqueState, event: CritiqueSseEvent): CritiqueState {
  switch (event.event) {
    // -----------------------------------------------------------------------
    case 'critique.run_started': {
      // Only transition from idle; ignore duplicates / late handshakes.
      if (state.phase !== 'idle') return state;
      const { runId, cast, maxRounds, threshold, scale } = event.data;
      return {
        phase: 'running',
        runId,
        rounds: [],
        activeRound: 1,
        activePanelist: null,
        cast,
        maxRounds,
        threshold,
        scale,
      };
    }

    // -----------------------------------------------------------------------
    case 'critique.panelist_open': {
      if (state.phase !== 'running') return state;
      const { round, role } = event.data;
      const rounds = ensureRound(state.rounds, round);
      return {
        ...state,
        rounds,
        activeRound: round,
        activePanelist: role,
      };
    }

    // -----------------------------------------------------------------------
    case 'critique.panelist_dim': {
      if (state.phase !== 'running') return state;
      const { round, role, dimName, dimScore, dimNote } = event.data;
      let rounds = ensureRound(state.rounds, round);
      const idx = round - 1;
      const roundEntry = rounds[idx];
      if (roundEntry === undefined) return state;
      const withPanelist = ensurePanelist(roundEntry, role);
      const pState = withPanelist.panelists[role];
      if (pState === undefined) return state;
      const updatedPanelist: PanelistRoundState = {
        ...pState,
        dims: [...pState.dims, { name: dimName, score: dimScore, note: dimNote }],
      };
      const updatedRound: RoundState = {
        ...withPanelist,
        panelists: { ...withPanelist.panelists, [role]: updatedPanelist },
      };
      rounds = rounds.map((r, i) => (i === idx ? updatedRound : r));
      return { ...state, rounds };
    }

    // -----------------------------------------------------------------------
    case 'critique.panelist_must_fix': {
      if (state.phase !== 'running') return state;
      const { round, role, text } = event.data;
      let rounds = ensureRound(state.rounds, round);
      const idx = round - 1;
      const roundEntry = rounds[idx];
      if (roundEntry === undefined) return state;
      const withPanelist = ensurePanelist(roundEntry, role);
      const pState = withPanelist.panelists[role];
      if (pState === undefined) return state;
      const updatedPanelist: PanelistRoundState = {
        ...pState,
        mustFixes: [...pState.mustFixes, text],
      };
      const updatedRound: RoundState = {
        ...withPanelist,
        mustFix: withPanelist.mustFix + 1,
        panelists: { ...withPanelist.panelists, [role]: updatedPanelist },
      };
      rounds = rounds.map((r, i) => (i === idx ? updatedRound : r));
      return { ...state, rounds };
    }

    // -----------------------------------------------------------------------
    case 'critique.panelist_close': {
      if (state.phase !== 'running') return state;
      const { round, role, score } = event.data;
      let rounds = ensureRound(state.rounds, round);
      const idx = round - 1;
      const roundEntry = rounds[idx];
      if (roundEntry === undefined) return state;
      const withPanelist = ensurePanelist(roundEntry, role);
      const pState = withPanelist.panelists[role];
      if (pState === undefined) return state;
      const updatedPanelist: PanelistRoundState = { ...pState, score };
      const updatedRound: RoundState = {
        ...withPanelist,
        panelists: { ...withPanelist.panelists, [role]: updatedPanelist },
      };
      rounds = rounds.map((r, i) => (i === idx ? updatedRound : r));
      return { ...state, rounds, activePanelist: null };
    }

    // -----------------------------------------------------------------------
    case 'critique.round_end': {
      if (state.phase !== 'running') return state;
      const { round, composite } = event.data;
      let rounds = ensureRound(state.rounds, round);
      const idx = round - 1;
      const roundEntry = rounds[idx];
      if (roundEntry === undefined) return state;
      const updatedRound: RoundState = { ...roundEntry, composite };
      rounds = rounds.map((r, i) => (i === idx ? updatedRound : r));
      return { ...state, rounds, activeRound: round + 1 };
    }

    // -----------------------------------------------------------------------
    case 'critique.ship': {
      if (state.phase !== 'running') return state;
      const { runId, round, composite, status, artifactRef, summary } = event.data;
      return {
        phase: 'shipped',
        runId,
        rounds: state.rounds,
        cast: state.cast,
        maxRounds: state.maxRounds,
        threshold: state.threshold,
        scale: state.scale,
        final: { composite, round, status, artifactRef, summary },
      };
    }

    // -----------------------------------------------------------------------
    case 'critique.degraded': {
      const { runId, reason, adapter } = event.data;
      return { phase: 'degraded', runId, reason, adapter };
    }

    // -----------------------------------------------------------------------
    case 'critique.interrupted': {
      const { runId, bestRound, composite } = event.data;
      if (state.phase === 'running') {
        return {
          phase: 'interrupted',
          runId,
          rounds: state.rounds,
          cast: state.cast,
          maxRounds: state.maxRounds,
          threshold: state.threshold,
          scale: state.scale,
          bestRound,
          composite,
        };
      }
      return {
        phase: 'interrupted',
        runId,
        rounds: [],
        cast: [],
        maxRounds: 0,
        threshold: 0,
        scale: 0,
        bestRound,
        composite,
      };
    }

    // -----------------------------------------------------------------------
    case 'critique.failed': {
      const { runId, cause } = event.data;
      return { phase: 'failed', runId, cause };
    }

    // -----------------------------------------------------------------------
    case 'critique.parser_warning': {
      // Parser warnings do not alter state; logged elsewhere.
      return state;
    }

    // -----------------------------------------------------------------------
    default: {
      // Forward-compat: unknown event types pass through unchanged.
      return state;
    }
  }
}

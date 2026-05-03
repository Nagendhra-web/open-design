import { describe, expect, it } from 'vitest';

import type { CritiqueSseEvent } from '@open-design/contracts';
import { initialState, reduce } from '../reducer.js';
import type { CritiqueState } from '../reducer.js';
import {
  isTerminal,
  selectActiveRound,
  selectLatestComposite,
  selectOpenMustFix,
  selectRoleScores,
} from '../selectors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runStarted(overrides: Partial<CritiqueSseEvent['data'] & Record<string, unknown>> = {}): CritiqueSseEvent {
  return {
    event: 'critique.run_started',
    data: {
      runId: 'run-1',
      protocolVersion: 1,
      cast: ['designer', 'critic'],
      maxRounds: 3,
      threshold: 8,
      scale: 10,
      ...overrides,
    },
  } as CritiqueSseEvent;
}

function panelistOpen(round: number, role: 'designer' | 'critic' = 'designer'): CritiqueSseEvent {
  return {
    event: 'critique.panelist_open',
    data: { runId: 'run-1', round, role },
  } as CritiqueSseEvent;
}

function panelistDim(round: number, role: 'designer' | 'critic' = 'designer'): CritiqueSseEvent {
  return {
    event: 'critique.panelist_dim',
    data: {
      runId: 'run-1',
      round,
      role,
      dimName: 'Layout',
      dimScore: 7,
      dimNote: 'spacing is tight',
    },
  } as CritiqueSseEvent;
}

function panelistMustFix(round: number, role: 'designer' | 'critic' = 'designer'): CritiqueSseEvent {
  return {
    event: 'critique.panelist_must_fix',
    data: { runId: 'run-1', round, role, text: 'Fix contrast' },
  } as CritiqueSseEvent;
}

function panelistClose(round: number, role: 'designer' | 'critic' = 'designer', score = 7): CritiqueSseEvent {
  return {
    event: 'critique.panelist_close',
    data: { runId: 'run-1', round, role, score },
  } as CritiqueSseEvent;
}

function roundEnd(round: number, composite = 7.5): CritiqueSseEvent {
  return {
    event: 'critique.round_end',
    data: {
      runId: 'run-1',
      round,
      composite,
      mustFix: 1,
      decision: 'continue' as const,
      reason: 'below threshold',
    },
  } as CritiqueSseEvent;
}

function ship(): CritiqueSseEvent {
  return {
    event: 'critique.ship',
    data: {
      runId: 'run-1',
      round: 1,
      composite: 9.0,
      status: 'shipped' as const,
      artifactRef: { projectId: 'proj-1', artifactId: 'art-1' },
      summary: 'Looks good',
    },
  } as CritiqueSseEvent;
}

function degraded(): CritiqueSseEvent {
  return {
    event: 'critique.degraded',
    data: { runId: 'run-1', reason: 'malformed_block' as const, adapter: 'claude' },
  } as CritiqueSseEvent;
}

function interrupted(): CritiqueSseEvent {
  return {
    event: 'critique.interrupted',
    data: { runId: 'run-1', bestRound: 1, composite: 7.0 },
  } as CritiqueSseEvent;
}

function failed(): CritiqueSseEvent {
  return {
    event: 'critique.failed',
    data: { runId: 'run-1', cause: 'per_round_timeout' as const },
  } as CritiqueSseEvent;
}

function parserWarning(): CritiqueSseEvent {
  return {
    event: 'critique.parser_warning',
    data: { runId: 'run-1', kind: 'weak_debate' as const, position: 0 },
  } as CritiqueSseEvent;
}

// ---------------------------------------------------------------------------
// Reducer: phase transitions
// ---------------------------------------------------------------------------

describe('reduce()', () => {
  it('idle + run_started -> running with cast/maxRounds/threshold/scale', () => {
    const next = reduce(initialState, runStarted());
    expect(next.phase).toBe('running');
    if (next.phase !== 'running') return;
    expect(next.runId).toBe('run-1');
    expect(next.cast).toEqual(['designer', 'critic']);
    expect(next.maxRounds).toBe(3);
    expect(next.threshold).toBe(8);
    expect(next.scale).toBe(10);
    expect(next.rounds).toEqual([]);
    expect(next.activeRound).toBe(1);
    expect(next.activePanelist).toBeNull();
  });

  it('running + run_started -> ignored (duplicate handshake)', () => {
    const running = reduce(initialState, runStarted());
    const next = reduce(running, runStarted());
    expect(next).toBe(running);
  });

  it('idle + run_started -> running; second run_started does not mutate', () => {
    const s1 = reduce(initialState, runStarted({ runId: 'run-A' }));
    const s2 = reduce(s1, runStarted({ runId: 'run-B' }));
    expect(s2).toBe(s1);
    if (s2.phase !== 'running') return;
    expect(s2.runId).toBe('run-A');
  });

  it('running + panelist_open -> running with activePanelist set', () => {
    const s0 = reduce(initialState, runStarted());
    const s1 = reduce(s0, panelistOpen(1, 'designer'));
    expect(s1.phase).toBe('running');
    if (s1.phase !== 'running') return;
    expect(s1.activePanelist).toBe('designer');
    expect(s1.activeRound).toBe(1);
  });

  it('running + panelist_dim -> dim pushed into the matching panelist', () => {
    const s0 = reduce(initialState, runStarted());
    const s1 = reduce(s0, panelistOpen(1, 'designer'));
    const s2 = reduce(s1, panelistDim(1, 'designer'));
    if (s2.phase !== 'running') throw new Error('Expected running');
    const round = s2.rounds[0];
    if (round === undefined) throw new Error('Expected round 1');
    const panelist = round.panelists['designer'];
    if (panelist === undefined) throw new Error('Expected panelist');
    expect(panelist.dims).toHaveLength(1);
    expect(panelist.dims[0]).toMatchObject({ name: 'Layout', score: 7, note: 'spacing is tight' });
  });

  it('running + panelist_must_fix -> text pushed and round mustFix incremented', () => {
    const s0 = reduce(initialState, runStarted());
    const s1 = reduce(s0, panelistOpen(1));
    const s2 = reduce(s1, panelistMustFix(1));
    if (s2.phase !== 'running') throw new Error('Expected running');
    const round = s2.rounds[0];
    if (round === undefined) throw new Error('Expected round 1');
    expect(round.mustFix).toBe(1);
    const panelist = round.panelists['designer'];
    if (panelist === undefined) throw new Error('Expected panelist');
    expect(panelist.mustFixes).toEqual(['Fix contrast']);
  });

  it('running + panelist_close -> panelist score set, activePanelist cleared', () => {
    const s0 = reduce(initialState, runStarted());
    const s1 = reduce(s0, panelistOpen(1));
    const s2 = reduce(s1, panelistClose(1, 'designer', 8));
    if (s2.phase !== 'running') throw new Error('Expected running');
    expect(s2.activePanelist).toBeNull();
    const round = s2.rounds[0];
    if (round === undefined) throw new Error('Expected round 1');
    const panelist = round.panelists['designer'];
    if (panelist === undefined) throw new Error('Expected panelist');
    expect(panelist.score).toBe(8);
  });

  it('running + round_end -> composite set, activeRound advanced', () => {
    const s0 = reduce(initialState, runStarted());
    const s1 = reduce(s0, panelistOpen(1));
    const s2 = reduce(s1, panelistClose(1));
    const s3 = reduce(s2, roundEnd(1, 7.5));
    if (s3.phase !== 'running') throw new Error('Expected running');
    expect(s3.activeRound).toBe(2);
    const round = s3.rounds[0];
    if (round === undefined) throw new Error('Expected round 1');
    expect(round.composite).toBe(7.5);
  });

  it('running + ship -> shipped with final payload populated', () => {
    const s0 = reduce(initialState, runStarted());
    const s1 = reduce(s0, ship());
    expect(s1.phase).toBe('shipped');
    if (s1.phase !== 'shipped') return;
    expect(s1.final.composite).toBe(9.0);
    expect(s1.final.status).toBe('shipped');
    expect(s1.final.artifactRef).toEqual({ projectId: 'proj-1', artifactId: 'art-1' });
    expect(s1.final.summary).toBe('Looks good');
  });

  it('running + degraded -> degraded', () => {
    const s0 = reduce(initialState, runStarted());
    const s1 = reduce(s0, degraded());
    expect(s1.phase).toBe('degraded');
    if (s1.phase !== 'degraded') return;
    expect(s1.reason).toBe('malformed_block');
    expect(s1.adapter).toBe('claude');
  });

  it('idle + degraded -> degraded', () => {
    const s1 = reduce(initialState, degraded());
    expect(s1.phase).toBe('degraded');
  });

  it('running + interrupted -> interrupted with rounds preserved', () => {
    const s0 = reduce(initialState, runStarted());
    const s1 = reduce(s0, panelistOpen(1));
    const s2 = reduce(s1, interrupted());
    expect(s2.phase).toBe('interrupted');
    if (s2.phase !== 'interrupted') return;
    expect(s2.bestRound).toBe(1);
    expect(s2.composite).toBe(7.0);
    expect(s2.rounds).toHaveLength(1);
  });

  it('idle + interrupted -> interrupted with empty rounds', () => {
    const s1 = reduce(initialState, interrupted());
    expect(s1.phase).toBe('interrupted');
    if (s1.phase !== 'interrupted') return;
    expect(s1.rounds).toEqual([]);
  });

  it('running + failed -> failed', () => {
    const s0 = reduce(initialState, runStarted());
    const s1 = reduce(s0, failed());
    expect(s1.phase).toBe('failed');
    if (s1.phase !== 'failed') return;
    expect(s1.cause).toBe('per_round_timeout');
  });

  it('running + parser_warning -> running, state structurally unchanged', () => {
    const s0 = reduce(initialState, runStarted());
    const s1 = reduce(s0, panelistOpen(1));
    const s2 = reduce(s1, parserWarning());
    expect(s2).toBe(s1);
  });

  it('forward-compat: unknown event type returns state unchanged', () => {
    const s0 = reduce(initialState, runStarted());
    const unknownEvent = { event: 'critique.future_event', data: { runId: 'run-1' } } as unknown as CritiqueSseEvent;
    const s1 = reduce(s0, unknownEvent);
    expect(s1).toBe(s0);
  });

  it('idempotence: dispatching the same shipped event twice keeps state in shipped', () => {
    const s0 = reduce(initialState, runStarted());
    const s1 = reduce(s0, ship());
    const s2 = reduce(s1, ship());
    expect(s2).toBe(s1);
    expect(s2.phase).toBe('shipped');
  });

  it('panelist_dim before panelist_open creates the entry implicitly', () => {
    const s0 = reduce(initialState, runStarted());
    // No panelist_open -- send dim directly
    const s1 = reduce(s0, panelistDim(1, 'critic'));
    if (s1.phase !== 'running') throw new Error('Expected running');
    const round = s1.rounds[0];
    if (round === undefined) throw new Error('Expected round 1');
    const panelist = round.panelists['critic'];
    if (panelist === undefined) throw new Error('Expected panelist');
    expect(panelist.dims).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

describe('selectActiveRound()', () => {
  it('returns the round matching activeRound while running', () => {
    let s: CritiqueState = reduce(initialState, runStarted());
    s = reduce(s, panelistOpen(1));
    const round = selectActiveRound(s);
    expect(round).not.toBeNull();
    expect(round?.n).toBe(1);
  });

  it('returns null when not running', () => {
    expect(selectActiveRound(initialState)).toBeNull();
    const shipped = reduce(reduce(initialState, runStarted()), ship());
    expect(selectActiveRound(shipped)).toBeNull();
  });

  it('returns null when activeRound index is beyond collected rounds', () => {
    const running = reduce(initialState, runStarted());
    // No rounds collected yet
    expect(selectActiveRound(running)).toBeNull();
  });
});

describe('selectLatestComposite()', () => {
  it('returns the latest round composite, null when no round closed', () => {
    const s0 = reduce(initialState, runStarted());
    expect(selectLatestComposite(s0)).toBeNull();

    const s1 = reduce(s0, panelistOpen(1));
    const s2 = reduce(s1, panelistClose(1));
    const s3 = reduce(s2, roundEnd(1, 7.5));
    expect(selectLatestComposite(s3)).toBe(7.5);
  });

  it('returns null for idle state', () => {
    expect(selectLatestComposite(initialState)).toBeNull();
  });

  it('returns composite from shipped state', () => {
    const s0 = reduce(initialState, runStarted());
    const s1 = reduce(s0, panelistOpen(1));
    const s2 = reduce(s1, panelistClose(1));
    const s3 = reduce(s2, roundEnd(1, 7.5));
    const shipped = reduce(s3, ship());
    expect(selectLatestComposite(shipped)).toBe(7.5);
  });
});

describe('selectOpenMustFix()', () => {
  it('sums mustFix across rounds', () => {
    const s0 = reduce(initialState, runStarted());
    const s1 = reduce(s0, panelistOpen(1));
    const s2 = reduce(s1, panelistMustFix(1));
    const s3 = reduce(s2, panelistMustFix(1));
    expect(selectOpenMustFix(s3)).toBe(2);
  });

  it('returns 0 for idle', () => {
    expect(selectOpenMustFix(initialState)).toBe(0);
  });

  it('returns 0 for failed', () => {
    const s = reduce(reduce(initialState, runStarted()), failed());
    expect(selectOpenMustFix(s)).toBe(0);
  });
});

describe('isTerminal()', () => {
  it('returns true for shipped, interrupted, failed, degraded', () => {
    const s0 = reduce(initialState, runStarted());
    expect(isTerminal(reduce(s0, ship()))).toBe(true);
    expect(isTerminal(reduce(s0, interrupted()))).toBe(true);
    expect(isTerminal(reduce(s0, failed()))).toBe(true);
    expect(isTerminal(reduce(s0, degraded()))).toBe(true);
  });

  it('returns false for idle and running', () => {
    expect(isTerminal(initialState)).toBe(false);
    expect(isTerminal(reduce(initialState, runStarted()))).toBe(false);
  });
});

describe('selectRoleScores()', () => {
  it('builds map from the latest closed round panelist scores', () => {
    const s0 = reduce(initialState, runStarted());
    const s1 = reduce(s0, panelistOpen(1, 'designer'));
    const s2 = reduce(s1, panelistClose(1, 'designer', 8));
    const s3 = reduce(s2, panelistOpen(1, 'critic'));
    const s4 = reduce(s3, panelistClose(1, 'critic', 7));
    const s5 = reduce(s4, roundEnd(1, 7.5));
    const scores = selectRoleScores(s5);
    expect(scores['designer']).toBe(8);
    expect(scores['critic']).toBe(7);
  });

  it('returns empty object when no round closed yet', () => {
    const s0 = reduce(initialState, runStarted());
    expect(selectRoleScores(s0)).toEqual({});
  });

  it('returns empty object for idle', () => {
    expect(selectRoleScores(initialState)).toEqual({});
  });
});

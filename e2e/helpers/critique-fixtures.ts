/**
 * Named Critique Theater SSE scenarios used by Playwright specs.
 *
 * Each scenario is a hand-built ReadonlyArray<CritiqueSseEvent> that drives
 * the theater reducer through a specific end-state without requiring a real
 * CLI adapter on PATH. Events are kept small (< 8 KiB per scenario).
 *
 * Cast: designer, critic, brand, a11y, copy (5 panelists)
 * Scale: 10, threshold: 8.0, maxRounds: 3
 */

// ---------------------------------------------------------------------------
// Minimal local CritiqueSseEvent type (mirrors @open-design/contracts shape).
// Defined locally so the e2e tsconfig does not need to traverse workspace
// source packages, which use a different moduleResolution config.
// ---------------------------------------------------------------------------

interface SseFrame<E extends string, D> {
  id?: string;
  event: E;
  data: D;
}

type PanelistRoleLocal = 'designer' | 'critic' | 'brand' | 'a11y' | 'copy';
type RoundDecisionLocal = 'continue' | 'ship';
type ShipStatusLocal = 'shipped' | 'below_threshold' | 'timed_out' | 'interrupted';
type DegradedReasonLocal = 'malformed_block' | 'oversize_block' | 'adapter_unsupported' | 'protocol_version_mismatch' | 'missing_artifact';
type FailedCauseLocal = 'cli_exit_nonzero' | 'per_round_timeout' | 'total_timeout' | 'orchestrator_internal';
type ParserWarningKindLocal = 'weak_debate' | 'unknown_role' | 'score_clamped' | 'composite_mismatch' | 'duplicate_ship';

type CritiqueSseEvent =
  | SseFrame<'critique.run_started',       { runId: string; protocolVersion: number; cast: PanelistRoleLocal[]; maxRounds: number; threshold: number; scale: number }>
  | SseFrame<'critique.panelist_open',     { runId: string; round: number; role: PanelistRoleLocal }>
  | SseFrame<'critique.panelist_dim',      { runId: string; round: number; role: PanelistRoleLocal; dimName: string; dimScore: number; dimNote: string }>
  | SseFrame<'critique.panelist_must_fix', { runId: string; round: number; role: PanelistRoleLocal; text: string }>
  | SseFrame<'critique.panelist_close',    { runId: string; round: number; role: PanelistRoleLocal; score: number }>
  | SseFrame<'critique.round_end',         { runId: string; round: number; composite: number; mustFix: number; decision: RoundDecisionLocal; reason: string }>
  | SseFrame<'critique.ship',              { runId: string; round: number; composite: number; status: ShipStatusLocal; artifactRef: { projectId: string; artifactId: string }; summary: string }>
  | SseFrame<'critique.degraded',          { runId: string; reason: DegradedReasonLocal; adapter: string }>
  | SseFrame<'critique.interrupted',       { runId: string; bestRound: number; composite: number }>
  | SseFrame<'critique.failed',            { runId: string; cause: FailedCauseLocal }>
  | SseFrame<'critique.parser_warning',    { runId: string; kind: ParserWarningKindLocal; position: number }>;

// Export the type so critique-sse.ts can reference it.
export type { CritiqueSseEvent };

// ---------------------------------------------------------------------------
// Constants (no magic numbers)
// ---------------------------------------------------------------------------

export const SCENARIO_SCALE = 10;
export const SCENARIO_THRESHOLD = 8.0;
export const SCENARIO_MAX_ROUNDS = 3;
export const SCENARIO_CAST = ['designer', 'critic', 'brand', 'a11y', 'copy'] as const;
export const SCENARIO_RUN_ID = 'r1-e2e-fixture';
export const SCENARIO_PROJECT_ID = 'proj-e2e';
export const SCENARIO_ARTIFACT_ID = 'artifact-e2e-1';

// ---------------------------------------------------------------------------
// Scenario type
// ---------------------------------------------------------------------------

export type ScenarioName =
  | 'happyShipped'
  | 'runningRound2'
  | 'degraded'
  | 'interrupted'
  | 'failed';

export interface Scenario {
  name: ScenarioName;
  events: ReadonlyArray<CritiqueSseEvent>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runStarted(): CritiqueSseEvent {
  return {
    event: 'critique.run_started',
    data: {
      runId: SCENARIO_RUN_ID,
      protocolVersion: 1,
      cast: [...SCENARIO_CAST],
      maxRounds: SCENARIO_MAX_ROUNDS,
      threshold: SCENARIO_THRESHOLD,
      scale: SCENARIO_SCALE,
    },
  };
}

type PanelistRole = (typeof SCENARIO_CAST)[number];

function panelistOpen(round: number, role: PanelistRole): CritiqueSseEvent {
  return {
    event: 'critique.panelist_open',
    data: { runId: SCENARIO_RUN_ID, round, role },
  };
}

function panelistDim(
  round: number,
  role: PanelistRole,
  dimName: string,
  dimScore: number,
  dimNote: string,
): CritiqueSseEvent {
  return {
    event: 'critique.panelist_dim',
    data: { runId: SCENARIO_RUN_ID, round, role, dimName, dimScore, dimNote },
  };
}

function panelistClose(round: number, role: PanelistRole, score: number): CritiqueSseEvent {
  return {
    event: 'critique.panelist_close',
    data: { runId: SCENARIO_RUN_ID, round, role, score },
  };
}

function roundEnd(round: number, composite: number): CritiqueSseEvent {
  return {
    event: 'critique.round_end',
    data: {
      runId: SCENARIO_RUN_ID,
      round,
      composite,
      mustFix: 0,
      decision: round < SCENARIO_MAX_ROUNDS ? 'continue' : 'ship',
      reason: round < SCENARIO_MAX_ROUNDS ? 'below_threshold' : 'shipped',
    },
  };
}

function ship(round: number, composite: number): CritiqueSseEvent {
  return {
    event: 'critique.ship',
    data: {
      runId: SCENARIO_RUN_ID,
      round,
      composite,
      status: 'shipped',
      artifactRef: {
        projectId: SCENARIO_PROJECT_ID,
        artifactId: SCENARIO_ARTIFACT_ID,
      },
      summary: 'Design approved after 3 rounds.',
    },
  };
}

/** Emit a complete single round for all 5 panelists. */
function buildRound(roundN: number, baseScore: number): ReadonlyArray<CritiqueSseEvent> {
  const events: CritiqueSseEvent[] = [];
  for (const role of SCENARIO_CAST) {
    const score = Math.min(SCENARIO_SCALE, baseScore + (role === 'critic' ? 0 : 0.5));
    events.push(panelistOpen(roundN, role));
    events.push(panelistDim(roundN, role, 'clarity', score, `Round ${roundN} ${role} clarity`));
    events.push(panelistClose(roundN, role, score));
  }
  return events;
}

// ---------------------------------------------------------------------------
// Scenario: happyShipped -- 3 full rounds, final composite 8.5
// ---------------------------------------------------------------------------

const happyShippedEvents: ReadonlyArray<CritiqueSseEvent> = [
  runStarted(),
  ...buildRound(1, 7.5),
  roundEnd(1, 7.5),
  ...buildRound(2, 8.0),
  roundEnd(2, 8.0),
  ...buildRound(3, 8.5),
  roundEnd(3, 8.5),
  ship(3, 8.5),
];

// ---------------------------------------------------------------------------
// Scenario: runningRound2 -- stops mid round 2, after round 1 is complete
// ---------------------------------------------------------------------------

const runningRound2Events: ReadonlyArray<CritiqueSseEvent> = [
  runStarted(),
  ...buildRound(1, 7.0),
  roundEnd(1, 7.0),
  // Begin round 2, first two panelists only
  panelistOpen(2, 'designer'),
  panelistDim(2, 'designer', 'layout', 7.5, 'Layout is improving.'),
  panelistClose(2, 'designer', 7.5),
  panelistOpen(2, 'critic'),
  panelistDim(2, 'critic', 'contrast', 8.0, 'Contrast is acceptable.'),
  // Stopped here -- round 2 still running, critic lane open
];

// ---------------------------------------------------------------------------
// Scenario: degraded -- emits degraded after run_started
// ---------------------------------------------------------------------------

const degradedEvents: ReadonlyArray<CritiqueSseEvent> = [
  runStarted(),
  {
    event: 'critique.degraded',
    data: {
      runId: SCENARIO_RUN_ID,
      reason: 'malformed_block',
      adapter: 'mock-adapter',
    },
  },
];

// ---------------------------------------------------------------------------
// Scenario: interrupted -- 2 full rounds then interrupted
// ---------------------------------------------------------------------------

const interruptedEvents: ReadonlyArray<CritiqueSseEvent> = [
  runStarted(),
  ...buildRound(1, 7.0),
  roundEnd(1, 7.0),
  ...buildRound(2, 7.8),
  roundEnd(2, 7.8),
  {
    event: 'critique.interrupted',
    data: {
      runId: SCENARIO_RUN_ID,
      bestRound: 2,
      composite: 7.8,
    },
  },
];

// ---------------------------------------------------------------------------
// Scenario: failed -- run_started then failed
// ---------------------------------------------------------------------------

const failedEvents: ReadonlyArray<CritiqueSseEvent> = [
  runStarted(),
  {
    event: 'critique.failed',
    data: {
      runId: SCENARIO_RUN_ID,
      cause: 'total_timeout',
    },
  },
];

// ---------------------------------------------------------------------------
// Exported catalog
// ---------------------------------------------------------------------------

export const SCENARIOS: ReadonlyArray<Scenario> = [
  { name: 'happyShipped',  events: happyShippedEvents },
  { name: 'runningRound2', events: runningRound2Events },
  { name: 'degraded',      events: degradedEvents },
  { name: 'interrupted',   events: interruptedEvents },
  { name: 'failed',        events: failedEvents },
];

export function scenarioFor(name: ScenarioName): Scenario {
  const found = SCENARIOS.find((s) => s.name === name);
  if (found === undefined) {
    throw new Error(`critique-fixtures: unknown scenario "${name}"`);
  }
  return found;
}

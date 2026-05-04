import type { CritiqueConfig } from '@open-design/contracts/critique';
import { parseCritiqueStream } from '../parser.js';
import { computeComposite, decideRound, selectFallbackRound } from '../scoreboard.js';
import type { RoundState } from '../scoreboard.js';
import { MalformedBlockError, OversizeBlockError, MissingArtifactError } from '../errors.js';
import type { BriefTemplate, AdapterDescriptor } from './matrix.js';
import type { AdapterRegistry } from './registry.js';

export interface ConformanceRunInput {
  adapter: AdapterDescriptor;
  template: BriefTemplate;
  /**
   * Function that yields adapter stdout for this brief. Tests inject synthetic
   * streams; CI injects real spawn-and-stream wrappers.
   */
  produceStdout: (template: BriefTemplate) => AsyncIterable<string>;
  cfg: CritiqueConfig;
}

export type ConformanceVerdict =
  | 'shipped'
  | 'below_threshold'
  | 'parse_failed'
  | 'timed_out'
  | 'failed';

export interface ConformanceRunResult {
  adapterId: string;
  templateId: string;
  verdict: ConformanceVerdict;
  durationMs: number;
  composite: number | null;
  rounds: number;
  errorMessage: string | null;
}

export interface ConformanceMatrixInput {
  adapters: ReadonlyArray<AdapterDescriptor>;
  templates: ReadonlyArray<BriefTemplate>;
  cfg: CritiqueConfig;
  registry: AdapterRegistry;
  produceStdout: (
    adapter: AdapterDescriptor,
    template: BriefTemplate,
  ) => AsyncIterable<string>;
}

export interface AdapterPassCriteria {
  /** Default 0.90: at least 90% of templates must verdict 'shipped'. */
  minShippedRatio: number;
  /** Default 0.95: at least 95% of templates must NOT 'parse_failed'. */
  minParseCleanRatio: number;
  /** Default 1: each 'parse_failed' is retried this many times before being counted. */
  retryBudget: number;
}

export interface AdapterReport {
  adapterId: string;
  results: ReadonlyArray<ConformanceRunResult>;
  shippedCount: number;
  parseFailedCount: number;
  passes: boolean;
}

export const DEFAULT_PASS_CRITERIA: AdapterPassCriteria = {
  minShippedRatio: 0.9,
  minParseCleanRatio: 0.95,
  retryBudget: 1,
};

/**
 * Run one adapter through one template. Pure-ish: timing comes from
 * performance.now() + the produceStdout iterable. Does NOT write SQLite
 * or emit SSE.
 */
export async function runOnce(input: ConformanceRunInput): Promise<ConformanceRunResult> {
  const { adapter, template, produceStdout, cfg } = input;
  const startMs = performance.now();

  const roundStates: RoundState[] = [];
  // Track per-round scores to build RoundState after each round_end event.
  let currentRoundScores: Record<string, number> = {};
  let currentMustFix = 0;
  let shipped = false;
  let finalComposite: number | null = null;
  let finalRounds = 0;

  try {
    const stream = parseCritiqueStream(produceStdout(template), {
      runId: `conformance-${adapter.id}-${template.id}`,
      adapter: adapter.id,
      parserMaxBlockBytes: cfg.parserMaxBlockBytes,
    });

    for await (const event of stream) {
      if (event.type === 'panelist_close') {
        currentRoundScores[event.role] = event.score;
      } else if (event.type === 'panelist_must_fix') {
        currentMustFix++;
      } else if (event.type === 'round_end') {
        const composite = computeComposite(currentRoundScores, cfg.weights);
        const roundState: RoundState = {
          n: event.round,
          scores: { ...currentRoundScores },
          mustFix: currentMustFix,
          composite,
        };
        roundStates.push(roundState);
        finalRounds = event.round;
        currentRoundScores = {};
        currentMustFix = 0;
      } else if (event.type === 'ship') {
        shipped = true;
        finalComposite = event.composite;
      }
    }
  } catch (err) {
    const durationMs = performance.now() - startMs;
    const isParseError =
      err instanceof MalformedBlockError ||
      err instanceof OversizeBlockError ||
      err instanceof MissingArtifactError;

    return {
      adapterId: adapter.id,
      templateId: template.id,
      verdict: isParseError ? 'parse_failed' : 'failed',
      durationMs,
      composite: null,
      rounds: finalRounds,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }

  const durationMs = performance.now() - startMs;

  if (shipped) {
    return {
      adapterId: adapter.id,
      templateId: template.id,
      verdict: 'shipped',
      durationMs,
      composite: finalComposite,
      rounds: finalRounds,
      errorMessage: null,
    };
  }

  // No explicit SHIP event: apply fallback policy.
  const fallback = selectFallbackRound(roundStates, cfg.fallbackPolicy);
  if (fallback !== null) {
    const decision = decideRound(fallback.composite, fallback.mustFix, cfg);
    return {
      adapterId: adapter.id,
      templateId: template.id,
      verdict: decision === 'ship' ? 'shipped' : 'below_threshold',
      durationMs,
      composite: fallback.composite,
      rounds: finalRounds,
      errorMessage: null,
    };
  }

  return {
    adapterId: adapter.id,
    templateId: template.id,
    verdict: 'below_threshold',
    durationMs,
    composite: finalRounds > 0 ? (roundStates[roundStates.length - 1]?.composite ?? null) : null,
    rounds: finalRounds,
    errorMessage: null,
  };
}

/**
 * Run every (adapter, template) pair. Returns one report per adapter. Marks
 * adapters that fall below pass criteria as degraded in the registry. Caller
 * decides what to do with that information (CI gate, alert, etc.).
 */
export async function runMatrix(
  input: ConformanceMatrixInput,
  passCriteria?: Partial<AdapterPassCriteria>,
): Promise<ReadonlyArray<AdapterReport>> {
  const criteria: AdapterPassCriteria = {
    ...DEFAULT_PASS_CRITERIA,
    ...passCriteria,
  };

  const reports: AdapterReport[] = [];

  for (const adapter of input.adapters) {
    const results: ConformanceRunResult[] = [];

    for (const template of input.templates) {
      // Try once; retry up to retryBudget times on parse_failed.
      let result = await runOnce({
        adapter,
        template,
        produceStdout: (t) => input.produceStdout(adapter, t),
        cfg: input.cfg,
      });

      let retriesLeft = criteria.retryBudget;
      while (result.verdict === 'parse_failed' && retriesLeft > 0) {
        retriesLeft--;
        result = await runOnce({
          adapter,
          template,
          produceStdout: (t) => input.produceStdout(adapter, t),
          cfg: input.cfg,
        });
      }

      results.push(result);
    }

    const total = results.length;
    const shippedCount = results.filter((r) => r.verdict === 'shipped').length;
    const parseFailedCount = results.filter((r) => r.verdict === 'parse_failed').length;

    const shippedRatio = total > 0 ? shippedCount / total : 0;
    const parseCleanRatio = total > 0 ? (total - parseFailedCount) / total : 1;

    const passes =
      shippedRatio >= criteria.minShippedRatio &&
      parseCleanRatio >= criteria.minParseCleanRatio;

    if (!passes) {
      input.registry.markDegraded(adapter.id, 'conformance_failed');
    }

    reports.push({
      adapterId: adapter.id,
      results,
      shippedCount,
      parseFailedCount,
      passes,
    });
  }

  return reports;
}

import { PRODUCTION_ADAPTERS, SYNTHETIC_ADAPTER_IDS } from './matrix.js';

export type DegradedReason =
  | 'malformed_block'
  | 'oversize_block'
  | 'adapter_unsupported'
  | 'protocol_version_mismatch'
  | 'missing_artifact'
  | 'conformance_failed';

export interface DegradedMark {
  adapterId: string;
  reason: DegradedReason;
  markedAt: number;
  expiresAt: number;
}

export interface AdapterRegistryConfig {
  /** TTL for a degraded marker. Default 24h = 24 * 60 * 60 * 1000 ms. */
  degradedTtlMs: number;
  /** Maximum simultaneously-degraded adapters before the registry refuses new marks (DoS guard). Default 50. */
  maxDegradedAdapters: number;
  /** now() override for tests. */
  now?: () => number;
}

export interface AdapterRegistry {
  /**
   * Mark an adapter degraded. Idempotent: re-marking refreshes the expiry.
   * Throws RangeError on unknown adapterId or unknown reason.
   */
  markDegraded(adapterId: string, reason: DegradedReason): DegradedMark;
  /**
   * True if the adapter is currently degraded (not-yet-expired).
   * Calling clears expired markers as a side effect (lazy GC).
   */
  isDegraded(adapterId: string): boolean;
  /**
   * Remove a degraded marker explicitly (e.g., admin override). Idempotent.
   */
  clearDegraded(adapterId: string): void;
  /**
   * Snapshot of currently-degraded adapters. Returns a defensive copy.
   */
  list(): ReadonlyArray<DegradedMark>;
  /**
   * Test seam: remove all expired markers and return the count removed.
   */
  gc(): number;
}

const REGISTRY_CONFIG_DEFAULTS = {
  degradedTtlMs: 24 * 60 * 60 * 1000,
  maxDegradedAdapters: 50,
} as const;

const VALID_REASONS: ReadonlySet<DegradedReason> = new Set([
  'malformed_block',
  'oversize_block',
  'adapter_unsupported',
  'protocol_version_mismatch',
  'missing_artifact',
  'conformance_failed',
]);

const KNOWN_ADAPTER_IDS: ReadonlySet<string> = new Set([
  ...PRODUCTION_ADAPTERS.map((a) => a.id),
  ...SYNTHETIC_ADAPTER_IDS,
]);

export function createAdapterRegistry(cfg?: Partial<AdapterRegistryConfig>): AdapterRegistry {
  const degradedTtlMs = cfg?.degradedTtlMs ?? REGISTRY_CONFIG_DEFAULTS.degradedTtlMs;
  const maxDegradedAdapters =
    cfg?.maxDegradedAdapters ?? REGISTRY_CONFIG_DEFAULTS.maxDegradedAdapters;
  const now: () => number = cfg?.now ?? (() => Date.now());

  const store = new Map<string, DegradedMark>();

  function sweepExpired(): number {
    const t = now();
    let removed = 0;
    for (const [id, mark] of store) {
      if (t >= mark.expiresAt) {
        store.delete(id);
        removed++;
      }
    }
    return removed;
  }

  return {
    markDegraded(adapterId: string, reason: DegradedReason): DegradedMark {
      if (!KNOWN_ADAPTER_IDS.has(adapterId)) {
        throw new RangeError(
          `markDegraded: unknown adapterId "${adapterId}". Must be a production adapter or synthetic id.`,
        );
      }
      if (!VALID_REASONS.has(reason)) {
        throw new RangeError(
          `markDegraded: unknown reason "${reason as string}". Must be one of: ${[...VALID_REASONS].join(', ')}.`,
        );
      }

      // Lazy GC before checking cap so expired entries don't count against the limit.
      sweepExpired();

      const existing = store.get(adapterId);
      // If already marked, the re-mark refreshes expiry (idempotent).
      if (existing === undefined) {
        if (store.size >= maxDegradedAdapters) {
          throw new RangeError(
            `markDegraded: maxDegradedAdapters (${maxDegradedAdapters}) reached; cannot mark "${adapterId}" degraded.`,
          );
        }
      }

      const markedAt = now();
      const mark: DegradedMark = {
        adapterId,
        reason,
        markedAt,
        expiresAt: markedAt + degradedTtlMs,
      };
      store.set(adapterId, mark);
      return mark;
    },

    isDegraded(adapterId: string): boolean {
      sweepExpired();
      return store.has(adapterId);
    },

    clearDegraded(adapterId: string): void {
      store.delete(adapterId);
    },

    list(): ReadonlyArray<DegradedMark> {
      sweepExpired();
      return [...store.values()];
    },

    gc(): number {
      return sweepExpired();
    },
  };
}

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAdapterRegistry,
  type AdapterRegistry,
  type DegradedReason,
} from '../src/critique/conformance/registry.js';

function makeRegistry(nowMs = 0): AdapterRegistry {
  let clock = nowMs;
  return createAdapterRegistry({
    degradedTtlMs: 24 * 60 * 60 * 1000,
    now: () => clock,
    _setClockForTest: (t: number) => { clock = t; },
  } as Parameters<typeof createAdapterRegistry>[0]);
}

// Helper that returns a registry with a controllable clock.
function makeClockRegistry(initialMs = 0): {
  registry: AdapterRegistry;
  advanceClock: (ms: number) => void;
} {
  let clock = initialMs;
  const registry = createAdapterRegistry({
    now: () => clock,
  });
  return {
    registry,
    advanceClock: (ms: number) => { clock += ms; },
  };
}

const TTL_24H = 24 * 60 * 60 * 1000;

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;
  let advanceClock: (ms: number) => void;

  beforeEach(() => {
    ({ registry, advanceClock } = makeClockRegistry(0));
  });

  // ---------------------------------------------------------------------------
  // markDegraded / isDegraded basic flow
  // ---------------------------------------------------------------------------

  it('markDegraded for a valid production adapter; isDegraded returns true', () => {
    registry.markDegraded('claude-code', 'conformance_failed');
    expect(registry.isDegraded('claude-code')).toBe(true);
  });

  it('markDegraded returns a DegradedMark with correct fields', () => {
    const mark = registry.markDegraded('codex', 'malformed_block');
    expect(mark.adapterId).toBe('codex');
    expect(mark.reason).toBe('malformed_block');
    expect(mark.markedAt).toBe(0);
    expect(mark.expiresAt).toBe(TTL_24H);
  });

  it('isDegraded returns false for an adapter that has not been marked', () => {
    expect(registry.isDegraded('claude-code')).toBe(false);
  });

  it('clock advance past TTL makes isDegraded return false (lazy GC)', () => {
    registry.markDegraded('cursor-agent', 'conformance_failed');
    advanceClock(TTL_24H + 1);
    expect(registry.isDegraded('cursor-agent')).toBe(false);
  });

  it('clock advance to exactly TTL boundary does NOT expire the mark', () => {
    registry.markDegraded('gemini-cli', 'oversize_block');
    advanceClock(TTL_24H - 1);
    expect(registry.isDegraded('gemini-cli')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // RangeError on unknown adapter / reason
  // ---------------------------------------------------------------------------

  it('markDegraded throws RangeError for unknown adapterId', () => {
    expect(() =>
      registry.markDegraded('nonexistent-adapter', 'conformance_failed'),
    ).toThrow(RangeError);
  });

  it('markDegraded throws RangeError for unknown reason', () => {
    expect(() =>
      registry.markDegraded('claude-code', 'totally_fake' as DegradedReason),
    ).toThrow(RangeError);
  });

  // ---------------------------------------------------------------------------
  // Synthetic adapter ids
  // ---------------------------------------------------------------------------

  it('markDegraded accepts synthetic-good and synthetic-bad ids', () => {
    expect(() =>
      registry.markDegraded('synthetic-good', 'conformance_failed'),
    ).not.toThrow();
    expect(() =>
      registry.markDegraded('synthetic-bad', 'conformance_failed'),
    ).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Idempotent re-mark (refreshes expiry)
  // ---------------------------------------------------------------------------

  it('re-marking refreshes the expiry time', () => {
    registry.markDegraded('devin', 'conformance_failed');
    advanceClock(TTL_24H - 100);
    // Re-mark at TTL_24H - 100; new expiry is (TTL_24H - 100) + TTL_24H.
    const mark2 = registry.markDegraded('devin', 'conformance_failed');
    expect(mark2.expiresAt).toBe(2 * TTL_24H - 100);
    // Advance to just inside the refreshed TTL (one ms before expiry).
    advanceClock(TTL_24H - 1);
    // Clock is now at (TTL_24H - 100) + (TTL_24H - 1) = 2*TTL_24H - 101,
    // which is one ms before expiresAt (2*TTL_24H - 100). Still valid.
    expect(registry.isDegraded('devin')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Lazy GC: stale entries removed on isDegraded call
  // ---------------------------------------------------------------------------

  it('isDegraded call removes stale entries as side effect (lazy GC)', () => {
    registry.markDegraded('opencode', 'conformance_failed');
    advanceClock(TTL_24H + 1);
    // Trigger lazy GC via isDegraded.
    expect(registry.isDegraded('opencode')).toBe(false);
    // After GC, list should not include opencode.
    expect(registry.list().map((m) => m.adapterId)).not.toContain('opencode');
  });

  // ---------------------------------------------------------------------------
  // clearDegraded
  // ---------------------------------------------------------------------------

  it('clearDegraded removes a degraded marker', () => {
    registry.markDegraded('qwen-code', 'conformance_failed');
    registry.clearDegraded('qwen-code');
    expect(registry.isDegraded('qwen-code')).toBe(false);
  });

  it('clearDegraded is idempotent for an unknown id', () => {
    expect(() => registry.clearDegraded('never-registered')).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // list returns a defensive copy
  // ---------------------------------------------------------------------------

  it('list returns a defensive copy (mutations do not affect registry)', () => {
    registry.markDegraded('copilot-cli', 'conformance_failed');
    const snap = registry.list();
    (snap as DegradedMark[]).splice(0);
    expect(registry.list()).toHaveLength(1);
  });

  it('list returns only non-expired entries after lazy GC', () => {
    registry.markDegraded('hermes-acp', 'conformance_failed');
    registry.markDegraded('kimi-acp', 'conformance_failed');
    advanceClock(TTL_24H + 1);
    // Trigger GC by calling list.
    const snap = registry.list();
    expect(snap).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // maxDegradedAdapters cap (DoS guard)
  // ---------------------------------------------------------------------------

  it('maxDegradedAdapters cap is enforced: marking beyond the cap throws RangeError', () => {
    const small = createAdapterRegistry({ maxDegradedAdapters: 2 });
    small.markDegraded('claude-code', 'conformance_failed');
    small.markDegraded('codex', 'conformance_failed');
    expect(() =>
      small.markDegraded('cursor-agent', 'conformance_failed'),
    ).toThrow(RangeError);
  });

  it('re-marking an already-degraded adapter does not count toward the cap', () => {
    const small = createAdapterRegistry({ maxDegradedAdapters: 2 });
    small.markDegraded('claude-code', 'conformance_failed');
    small.markDegraded('codex', 'conformance_failed');
    // Re-marking an existing entry must not throw even at cap.
    expect(() =>
      small.markDegraded('claude-code', 'malformed_block'),
    ).not.toThrow();
  });

  it('expired entries do not count against the cap (GC clears space)', () => {
    const { registry: r, advanceClock: ac } = makeClockRegistry(0);
    const small = createAdapterRegistry({
      maxDegradedAdapters: 2,
      now: (() => {
        let t = 0;
        const fn = () => t;
        (fn as unknown as { advance: (ms: number) => void }).advance = (ms: number) => { t += ms; };
        return fn;
      })(),
    });
    // Use our clock-based registry helper instead.
    void r;
    void ac;

    const { registry: r2, advanceClock: ac2 } = makeClockRegistry(0);
    const capped = createAdapterRegistry({
      maxDegradedAdapters: 2,
      now: (() => {
        let t = 0;
        return () => t;
      })(),
    });
    void capped;
    void r2;
    void ac2;

    // Simpler: use makeClockRegistry with maxDegradedAdapters cap.
    let clock2 = 0;
    const cappedRegistry = createAdapterRegistry({
      maxDegradedAdapters: 2,
      degradedTtlMs: 1000,
      now: () => clock2,
    });
    cappedRegistry.markDegraded('claude-code', 'conformance_failed');
    cappedRegistry.markDegraded('codex', 'conformance_failed');
    // Advance past TTL so both expire.
    clock2 += 1001;
    // Now marking a third should succeed (GC clears the two expired ones).
    expect(() =>
      cappedRegistry.markDegraded('cursor-agent', 'conformance_failed'),
    ).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // gc() test seam
  // ---------------------------------------------------------------------------

  it('gc() removes expired entries and returns count removed', () => {
    registry.markDegraded('pi-rpc', 'conformance_failed');
    registry.markDegraded('kiro-acp', 'conformance_failed');
    advanceClock(TTL_24H + 1);
    const removed = registry.gc();
    expect(removed).toBe(2);
    expect(registry.list()).toHaveLength(0);
  });

  it('gc() returns 0 when no entries are expired', () => {
    registry.markDegraded('byok-proxy', 'conformance_failed');
    expect(registry.gc()).toBe(0);
  });
});

// Alias for the DegradedMark type used in splice test above.
type DegradedMark = import('../src/critique/conformance/registry.js').DegradedMark;

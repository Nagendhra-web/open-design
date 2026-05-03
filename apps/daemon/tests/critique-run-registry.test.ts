import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRunRegistry,
  type RunHandle,
  type RunRegistry,
} from '../src/critique/run-registry.js';

function makeHandle(runId: string, projectId = 'p1'): RunHandle {
  return {
    runId,
    projectId,
    abort: new AbortController(),
    startedAt: Date.now(),
  };
}

describe('RunRegistry', () => {
  let registry: RunRegistry;

  beforeEach(() => {
    registry = createRunRegistry();
  });

  // ---------------------------------------------------------------------------
  // register / get
  // ---------------------------------------------------------------------------

  it('returns null for an unregistered runId', () => {
    expect(registry.get('unknown')).toBeNull();
  });

  it('register + get round-trips the handle', () => {
    const h = makeHandle('crun_01');
    registry.register(h);
    expect(registry.get('crun_01')).toBe(h);
  });

  it('register throws on duplicate runId', () => {
    const h = makeHandle('crun_dup');
    registry.register(h);
    expect(() => registry.register(makeHandle('crun_dup'))).toThrow(
      /duplicate runId/,
    );
  });

  // ---------------------------------------------------------------------------
  // interrupt
  // ---------------------------------------------------------------------------

  it('interrupt returns false for an unknown runId', () => {
    expect(registry.interrupt('not-there')).toBe(false);
  });

  it('interrupt fires the AbortController and returns true', () => {
    const h = makeHandle('crun_02');
    registry.register(h);
    const aborted = registry.interrupt('crun_02', 'user_requested');
    expect(aborted).toBe(true);
    expect(h.abort.signal.aborted).toBe(true);
  });

  it('interrupt passes the reason string to the abort signal', () => {
    const h = makeHandle('crun_03');
    registry.register(h);
    registry.interrupt('crun_03', 'test_reason');
    // AbortSignal.reason is set by AbortController.abort(reason)
    expect(h.abort.signal.reason).toBe('test_reason');
  });

  it('interrupt with no reason still aborts the signal', () => {
    const h = makeHandle('crun_04');
    registry.register(h);
    registry.interrupt('crun_04');
    expect(h.abort.signal.aborted).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // unregister
  // ---------------------------------------------------------------------------

  it('unregister removes the entry so get returns null', () => {
    const h = makeHandle('crun_05');
    registry.register(h);
    registry.unregister('crun_05');
    expect(registry.get('crun_05')).toBeNull();
  });

  it('unregister is a no-op for an unknown runId', () => {
    expect(() => registry.unregister('ghost')).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------

  it('list returns empty array when no runs are registered', () => {
    expect(registry.list()).toEqual([]);
  });

  it('list returns a snapshot of all registered handles', () => {
    const h1 = makeHandle('crun_10');
    const h2 = makeHandle('crun_11');
    registry.register(h1);
    registry.register(h2);
    const snap = registry.list();
    expect(snap).toHaveLength(2);
    expect(snap).toContain(h1);
    expect(snap).toContain(h2);
  });

  it('list returns a defensive copy (mutations do not affect registry)', () => {
    registry.register(makeHandle('crun_12'));
    const snap = registry.list();
    snap.splice(0);
    expect(registry.list()).toHaveLength(1);
  });

  it('list excludes unregistered handles', () => {
    registry.register(makeHandle('crun_13'));
    registry.register(makeHandle('crun_14'));
    registry.unregister('crun_13');
    const ids = registry.list().map((h) => h.runId);
    expect(ids).not.toContain('crun_13');
    expect(ids).toContain('crun_14');
  });
});

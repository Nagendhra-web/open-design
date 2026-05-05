import { describe, expect, it, beforeEach } from 'vitest';
import {
  Counter,
  Gauge,
  Histogram,
  MetricsRegistry,
  critiqueMetrics,
  resetCritiqueMetricsForTest,
} from '../src/critique/metrics.js';

describe('Counter', () => {
  it('starts at zero and accumulates per label set', () => {
    const c = new Counter('test_total', 'help');
    expect(c.get({ a: '1' })).toBe(0);
    c.inc({ a: '1' });
    c.inc({ a: '1' }, 4);
    c.inc({ a: '2' });
    expect(c.get({ a: '1' })).toBe(5);
    expect(c.get({ a: '2' })).toBe(1);
  });

  it('rejects negative or non-finite increments', () => {
    const c = new Counter('test', 'help');
    expect(() => c.inc({}, -1)).toThrow(RangeError);
    expect(() => c.inc({}, Number.NaN)).toThrow(RangeError);
    expect(() => c.inc({}, Infinity)).toThrow(RangeError);
  });

  it('renders Prometheus text-format', () => {
    const c = new Counter('runs_total', 'critique runs');
    c.inc({ adapter: 'plain' }, 3);
    const out = c.render();
    expect(out).toContain('# HELP runs_total critique runs');
    expect(out).toContain('# TYPE runs_total counter');
    expect(out).toContain('runs_total{adapter="plain"} 3');
  });

  it('escapes special chars in label values', () => {
    const c = new Counter('runs', 'h');
    c.inc({ msg: 'with "quotes" and \\backslash and\nnewline' });
    const out = c.render();
    expect(out).toContain('with \\"quotes\\" and \\\\backslash and\\nnewline');
  });
});

describe('Gauge', () => {
  it('supports set/inc/dec', () => {
    const g = new Gauge('in_flight', 'help');
    g.set({}, 5);
    expect(g.get()).toBe(5);
    g.inc();
    expect(g.get()).toBe(6);
    g.dec({}, 2);
    expect(g.get()).toBe(4);
  });

  it('rejects non-finite set', () => {
    const g = new Gauge('test', 'h');
    expect(() => g.set({}, Number.NaN)).toThrow(RangeError);
  });
});

describe('Histogram', () => {
  it('counts cumulative buckets correctly', () => {
    const h = new Histogram('lat_ms', 'h', [10, 100, 1000]);
    h.observe({}, 5);
    h.observe({}, 50);
    h.observe({}, 500);
    h.observe({}, 5000);
    const snap = h.snapshot();
    expect(snap).not.toBeNull();
    expect(snap!.counts).toEqual([1, 2, 3]);
    expect(snap!.count).toBe(4);
    expect(snap!.sum).toBe(5555);
  });

  it('renders +Inf bucket and sum/count lines', () => {
    const h = new Histogram('lat_ms', 'h', [10, 100]);
    h.observe({ adapter: 'plain' }, 5);
    h.observe({ adapter: 'plain' }, 200);
    const out = h.render();
    expect(out).toContain('lat_ms_bucket{adapter="plain",le="10"} 1');
    expect(out).toContain('lat_ms_bucket{adapter="plain",le="100"} 1');
    expect(out).toContain('lat_ms_bucket{adapter="plain",le="+Inf"} 2');
    expect(out).toContain('lat_ms_sum{adapter="plain"} 205');
    expect(out).toContain('lat_ms_count{adapter="plain"} 2');
  });

  it('rejects non-finite or negative observations', () => {
    const h = new Histogram('test', 'h', [1, 2, 3]);
    expect(() => h.observe({}, -1)).toThrow(RangeError);
    expect(() => h.observe({}, Number.NaN)).toThrow(RangeError);
  });

  it('rejects empty buckets and duplicate boundaries', () => {
    expect(() => new Histogram('t', 'h', [])).toThrow(RangeError);
    expect(() => new Histogram('t', 'h', [1, 1, 2])).toThrow(RangeError);
  });
});

describe('MetricsRegistry', () => {
  it('rejects duplicate metric names', () => {
    const r = new MetricsRegistry();
    r.register(new Counter('dup', 'h'));
    expect(() => r.register(new Counter('dup', 'h'))).toThrow(/duplicate/);
  });

  it('renders all metrics joined by newlines and ends with newline', () => {
    const r = new MetricsRegistry();
    const c = r.register(new Counter('a', 'help-a'));
    const g = r.register(new Gauge('b', 'help-b'));
    c.inc({});
    g.set({}, 7);
    const out = r.render();
    expect(out).toMatch(/^# HELP a help-a/);
    expect(out).toContain('a 1');
    expect(out).toContain('b 7');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('resetAll clears every counter, gauge, and histogram', () => {
    const r = new MetricsRegistry();
    const c = r.register(new Counter('a', 'h'));
    const g = r.register(new Gauge('b', 'h'));
    const h = r.register(new Histogram('c', 'h', [1]));
    c.inc({});
    g.set({}, 1);
    h.observe({}, 0.5);
    r.resetAll();
    expect(c.get()).toBe(0);
    expect(g.get()).toBe(0);
    expect(h.snapshot()).toBeNull();
  });
});

describe('critiqueMetrics singleton', () => {
  beforeEach(() => {
    resetCritiqueMetricsForTest();
  });

  it('exposes the documented metric names', () => {
    critiqueMetrics.runsStarted.inc({ adapter: 'plain' });
    critiqueMetrics.runsCompleted.inc({ status: 'shipped', adapter: 'plain' });
    critiqueMetrics.roundsCompleted.inc({ decision: 'continue' });
    critiqueMetrics.parserWarnings.inc({ kind: 'weak_debate' });
    critiqueMetrics.degradedRuns.inc({ reason: 'malformed_block' });
    critiqueMetrics.failedRuns.inc({ cause: 'cli_exit_nonzero' });
    critiqueMetrics.bootReconciled.inc({});
    critiqueMetrics.inFlightRuns.set({}, 2);
    critiqueMetrics.runDurationMs.observe({ status: 'shipped' }, 1234);
    critiqueMetrics.roundDurationMs.observe({}, 800);
    critiqueMetrics.transcriptBytes.observe({ gzipped: 'true' }, 65_000);
    critiqueMetrics.compositeScore.observe({}, 7.5);

    const out = critiqueMetrics.registry.render();
    expect(out).toContain('od_critique_runs_started_total');
    expect(out).toContain('od_critique_runs_completed_total');
    expect(out).toContain('od_critique_rounds_completed_total');
    expect(out).toContain('od_critique_parser_warnings_total');
    expect(out).toContain('od_critique_degraded_runs_total');
    expect(out).toContain('od_critique_failed_runs_total');
    expect(out).toContain('od_critique_boot_reconciled_total');
    expect(out).toContain('od_critique_in_flight_runs');
    expect(out).toContain('od_critique_run_duration_ms');
    expect(out).toContain('od_critique_round_duration_ms');
    expect(out).toContain('od_critique_transcript_bytes');
    expect(out).toContain('od_critique_composite_score');
  });
});

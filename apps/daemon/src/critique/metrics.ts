/**
 * Critique Theater observability — in-process metrics registry.
 *
 * Dependency-free implementation of Counter / Gauge / Histogram with
 * Prometheus text-format export. Scoped to the critique subsystem so it can
 * be enabled in tests without touching the rest of the daemon.
 *
 * The exported `critiqueMetrics` singleton is consumed by the orchestrator,
 * parser, persistence, and transcript modules; the daemon HTTP layer scrapes
 * it via /metrics/critique.
 *
 * @see specs/current/critique-theater.md § Observability (Phase 12)
 */

export type MetricLabels = Readonly<Record<string, string>>;

interface MetricBase {
  readonly name: string;
  readonly help: string;
  readonly type: 'counter' | 'gauge' | 'histogram';
}

interface CounterValue {
  labels: MetricLabels;
  value: number;
}

interface GaugeValue {
  labels: MetricLabels;
  value: number;
}

interface HistogramValue {
  labels: MetricLabels;
  buckets: number[];
  counts: number[];
  sum: number;
  count: number;
}

function labelsKey(labels: MetricLabels): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return '';
  return keys.map((k) => `${k}=${labels[k]}`).join(',');
}

function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function renderLabels(labels: MetricLabels, extra?: MetricLabels): string {
  const merged = extra !== undefined ? { ...labels, ...extra } : labels;
  const keys = Object.keys(merged).sort();
  if (keys.length === 0) return '';
  const parts = keys.map((k) => `${k}="${escapeLabelValue(String(merged[k]))}"`);
  return `{${parts.join(',')}}`;
}

export class Counter implements MetricBase {
  readonly type = 'counter' as const;
  private readonly values = new Map<string, CounterValue>();

  constructor(readonly name: string, readonly help: string) {}

  inc(labels: MetricLabels = {}, by = 1): void {
    if (!Number.isFinite(by) || by < 0) {
      throw new RangeError(`Counter.inc: by must be finite and >= 0, got ${by}`);
    }
    const key = labelsKey(labels);
    const existing = this.values.get(key);
    if (existing === undefined) {
      this.values.set(key, { labels, value: by });
    } else {
      existing.value += by;
    }
  }

  get(labels: MetricLabels = {}): number {
    return this.values.get(labelsKey(labels))?.value ?? 0;
  }

  reset(): void {
    this.values.clear();
  }

  render(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
    ];
    for (const v of this.values.values()) {
      lines.push(`${this.name}${renderLabels(v.labels)} ${v.value}`);
    }
    return lines.join('\n');
  }
}

export class Gauge implements MetricBase {
  readonly type = 'gauge' as const;
  private readonly values = new Map<string, GaugeValue>();

  constructor(readonly name: string, readonly help: string) {}

  set(labels: MetricLabels, value: number): void {
    if (!Number.isFinite(value)) {
      throw new RangeError(`Gauge.set: value must be finite, got ${value}`);
    }
    const key = labelsKey(labels);
    this.values.set(key, { labels, value });
  }

  inc(labels: MetricLabels = {}, by = 1): void {
    const key = labelsKey(labels);
    const existing = this.values.get(key);
    this.values.set(key, { labels, value: (existing?.value ?? 0) + by });
  }

  dec(labels: MetricLabels = {}, by = 1): void {
    this.inc(labels, -by);
  }

  get(labels: MetricLabels = {}): number {
    return this.values.get(labelsKey(labels))?.value ?? 0;
  }

  reset(): void {
    this.values.clear();
  }

  render(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} gauge`,
    ];
    for (const v of this.values.values()) {
      lines.push(`${this.name}${renderLabels(v.labels)} ${v.value}`);
    }
    return lines.join('\n');
  }
}

export class Histogram implements MetricBase {
  readonly type = 'histogram' as const;
  private readonly defaults: number[];
  private readonly values = new Map<string, HistogramValue>();

  constructor(
    readonly name: string,
    readonly help: string,
    buckets: readonly number[],
  ) {
    if (buckets.length === 0) {
      throw new RangeError(`Histogram ${name}: buckets must be non-empty`);
    }
    const sorted = [...buckets].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i] === sorted[i - 1]) {
        throw new RangeError(`Histogram ${name}: duplicate bucket boundary ${sorted[i]}`);
      }
    }
    this.defaults = sorted;
  }

  observe(labels: MetricLabels, value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`Histogram.observe: value must be finite and >= 0, got ${value}`);
    }
    const key = labelsKey(labels);
    let entry = this.values.get(key);
    if (entry === undefined) {
      entry = {
        labels,
        buckets: [...this.defaults],
        counts: new Array(this.defaults.length).fill(0),
        sum: 0,
        count: 0,
      };
      this.values.set(key, entry);
    }
    entry.sum += value;
    entry.count += 1;
    for (let i = 0; i < entry.buckets.length; i += 1) {
      if (value <= entry.buckets[i]!) {
        entry.counts[i] = (entry.counts[i] ?? 0) + 1;
      }
    }
  }

  snapshot(labels: MetricLabels = {}): { sum: number; count: number; buckets: number[]; counts: number[] } | null {
    const entry = this.values.get(labelsKey(labels));
    if (entry === undefined) return null;
    return {
      sum: entry.sum,
      count: entry.count,
      buckets: [...entry.buckets],
      counts: [...entry.counts],
    };
  }

  reset(): void {
    this.values.clear();
  }

  render(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`,
    ];
    for (const v of this.values.values()) {
      for (let i = 0; i < v.buckets.length; i += 1) {
        const le = String(v.buckets[i]);
        lines.push(`${this.name}_bucket${renderLabels(v.labels, { le })} ${v.counts[i] ?? 0}`);
      }
      lines.push(`${this.name}_bucket${renderLabels(v.labels, { le: '+Inf' })} ${v.count}`);
      lines.push(`${this.name}_sum${renderLabels(v.labels)} ${v.sum}`);
      lines.push(`${this.name}_count${renderLabels(v.labels)} ${v.count}`);
    }
    return lines.join('\n');
  }
}

export class MetricsRegistry {
  private readonly metrics: MetricBase[] = [];

  register<T extends MetricBase>(metric: T): T {
    if (this.metrics.some((m) => m.name === metric.name)) {
      throw new Error(`MetricsRegistry: duplicate metric name "${metric.name}"`);
    }
    this.metrics.push(metric);
    return metric;
  }

  resetAll(): void {
    for (const m of this.metrics) {
      (m as Counter | Gauge | Histogram).reset();
    }
  }

  /** Render the full registry as Prometheus text-format. */
  render(): string {
    return this.metrics
      .map((m) => (m as Counter | Gauge | Histogram).render())
      .join('\n') + '\n';
  }
}

// ---------------------------------------------------------------------------
// Critique-scoped metrics
// ---------------------------------------------------------------------------

const HISTOGRAM_LATENCY_BUCKETS_MS = [
  100, 250, 500, 1_000, 2_500, 5_000, 10_000,
  30_000, 60_000, 120_000, 300_000,
] as const;

const HISTOGRAM_TRANSCRIPT_BYTES_BUCKETS = [
  1_024, 4_096, 16_384, 65_536, 262_144, 1_048_576, 4_194_304, 16_777_216,
] as const;

const HISTOGRAM_COMPOSITE_BUCKETS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
] as const;

export interface CritiqueMetrics {
  readonly registry: MetricsRegistry;
  readonly runsStarted: Counter;
  readonly runsCompleted: Counter;
  readonly roundsCompleted: Counter;
  readonly parserWarnings: Counter;
  readonly degradedRuns: Counter;
  readonly failedRuns: Counter;
  readonly bootReconciled: Counter;
  readonly inFlightRuns: Gauge;
  readonly runDurationMs: Histogram;
  readonly roundDurationMs: Histogram;
  readonly transcriptBytes: Histogram;
  readonly compositeScore: Histogram;
}

function buildCritiqueMetrics(): CritiqueMetrics {
  const registry = new MetricsRegistry();
  return {
    registry,
    runsStarted: registry.register(new Counter(
      'od_critique_runs_started_total',
      'Critique runs started, labeled by adapter.',
    )),
    runsCompleted: registry.register(new Counter(
      'od_critique_runs_completed_total',
      'Critique runs that reached a terminal status, labeled by status and adapter.',
    )),
    roundsCompleted: registry.register(new Counter(
      'od_critique_rounds_completed_total',
      'Rounds closed by round_end, labeled by decision (continue|ship).',
    )),
    parserWarnings: registry.register(new Counter(
      'od_critique_parser_warnings_total',
      'Parser warnings emitted, labeled by kind.',
    )),
    degradedRuns: registry.register(new Counter(
      'od_critique_degraded_runs_total',
      'Runs that hit a degraded path, labeled by reason.',
    )),
    failedRuns: registry.register(new Counter(
      'od_critique_failed_runs_total',
      'Runs that hit a failed path, labeled by cause.',
    )),
    bootReconciled: registry.register(new Counter(
      'od_critique_boot_reconciled_total',
      'Stale running rows flipped to interrupted on daemon boot.',
    )),
    inFlightRuns: registry.register(new Gauge(
      'od_critique_in_flight_runs',
      'Currently running critique orchestrator instances.',
    )),
    runDurationMs: registry.register(new Histogram(
      'od_critique_run_duration_ms',
      'Wall-clock duration of a critique run, by status.',
      HISTOGRAM_LATENCY_BUCKETS_MS,
    )),
    roundDurationMs: registry.register(new Histogram(
      'od_critique_round_duration_ms',
      'Wall-clock duration of a round.',
      HISTOGRAM_LATENCY_BUCKETS_MS,
    )),
    transcriptBytes: registry.register(new Histogram(
      'od_critique_transcript_bytes',
      'Transcript byte size at write time, labeled by gzipped (true|false).',
      HISTOGRAM_TRANSCRIPT_BYTES_BUCKETS,
    )),
    compositeScore: registry.register(new Histogram(
      'od_critique_composite_score',
      'Composite score of completed rounds.',
      HISTOGRAM_COMPOSITE_BUCKETS,
    )),
  };
}

export const critiqueMetrics: CritiqueMetrics = buildCritiqueMetrics();

/** Test helper. Resets every counter/gauge/histogram in the critique registry. */
export function resetCritiqueMetricsForTest(): void {
  critiqueMetrics.registry.resetAll();
}

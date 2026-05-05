# Critique Theater observability

The daemon emits Prometheus-style metrics and structured JSON logs for every
Critique Theater run. This document is the operator reference: which metrics
exist, what they label, and how to scrape and visualize them.

## Scrape endpoint

```
GET http://<daemon-host>:<daemon-port>/api/metrics/critique
Content-Type: text/plain; version=0.0.4; charset=utf-8
```

The endpoint returns the Prometheus 0.0.4 text exposition format and is
namespaced under `od_critique_*` so it can be merged with other process
metrics if a global registry is added later.

A colocated Prometheus or Grafana Agent should scrape this endpoint at the
same cadence as the daemon's other health endpoints (15s recommended).

## Metric reference

| Metric | Type | Labels | What it answers |
|---|---|---|---|
| `od_critique_runs_started_total` | counter | `adapter` | How many runs entered the orchestrator, per adapter. |
| `od_critique_runs_completed_total` | counter | `status`, `adapter` | Terminal status distribution (shipped, below_threshold, timed_out, interrupted, degraded, failed). |
| `od_critique_rounds_completed_total` | counter | `decision` | Round outcomes (continue vs ship) across all runs. |
| `od_critique_parser_warnings_total` | counter | `kind` | Parser warnings emitted (`weak_debate`, `unknown_role`, `score_clamped`, `composite_mismatch`, `duplicate_ship`). |
| `od_critique_degraded_runs_total` | counter | `reason` | Degraded paths (`malformed_block`, `oversize_block`, `adapter_unsupported`, `protocol_version_mismatch`, `missing_artifact`). |
| `od_critique_failed_runs_total` | counter | `cause` | Failed paths (`cli_exit_nonzero`, `per_round_timeout`, `total_timeout`, `orchestrator_internal`). |
| `od_critique_boot_reconciled_total` | counter | (none) | Stale running rows flipped to interrupted on each daemon boot. |
| `od_critique_in_flight_runs` | gauge | (none) | Concurrent in-flight orchestrator runs right now. |
| `od_critique_run_duration_ms` | histogram | `status` | Wall-clock duration of a critique run, by terminal status. |
| `od_critique_round_duration_ms` | histogram | (none) | Wall-clock duration of a single round. |
| `od_critique_transcript_bytes` | histogram | `gzipped` | Transcript byte size at write time, split by gzipped (`true`/`false`). |
| `od_critique_composite_score` | histogram | (none) | Daemon-authoritative composite score per closed round. |

Histogram buckets:

- Latency histograms (`run_duration_ms`, `round_duration_ms`): `100, 250,
  500, 1000, 2500, 5000, 10000, 30000, 60000, 120000, 300000` (ms).
- Transcript bytes: `1Ki, 4Ki, 16Ki, 64Ki, 256Ki, 1Mi, 4Mi, 16Mi`.
- Composite score: `1, 2, 3, 4, 5, 6, 7, 8, 9, 10`.

All histograms render the synthetic `+Inf` bucket plus `_sum` and `_count`.

## Structured logs

The orchestrator emits one JSON object per line on stderr with these required
fields: `ts`, `level`, `subsystem` (always `critique`), `event`, `message`,
`seq` (process-monotonic). Correlation fields when applicable: `runId`,
`projectId`, `adapter`, `round`, `role`.

Notable event names:

- `run.start`, `run.end`: lifecycle bookends with `protocolVersion`,
  `maxRounds`, `threshold` on start; `status`, `composite`, `rounds`,
  `durationMs` on end.
- `round.start`, `round.end`: round bookends. `round.end` carries both the
  daemon-authoritative `composite`/`mustFix` and the agent-supplied
  `agentComposite` so divergences are easy to grep.
- `parser.warning`: emitted whenever a `parser_warning` PanelEvent fires;
  carries `kind` and `position`.
- `run.timeout`, `run.child_exit`, `run.degraded`, `run.internal_error`,
  `run.interrupted`: terminal-path tags for failure analysis.
- `boot.reconcile`: emitted when daemon boot flips stale running rows.
- `adapter.unsupported`: emitted once per non-plain adapter format that
  encounters the critique-enabled flag.

Log level defaults to `info`. Set `OD_CRITIQUE_LOG_LEVEL=debug|info|warn|error`
to override.

## Grafana dashboard

A starter dashboard lives at
[critique-grafana-dashboard.json](./critique-grafana-dashboard.json). Import
it through Grafana's "Import via JSON" flow, point it at the Prometheus data
source that scrapes the daemon, and you get the panels described in the
dashboard JSON: in-flight gauge, run rate by status, round latency, composite
score histogram, and parser warning rate by kind.

## Alert ideas

These are sketched, not shipped. Wire them to your alerting stack of choice:

- `od_critique_failed_runs_total` rate spikes by cause.
- `od_critique_run_duration_ms` p99 above the configured `totalTimeoutMs` for
  more than 5 minutes (means timeouts are dominating real terminations).
- `od_critique_in_flight_runs` above `OD_CRITIQUE_MAX_CONCURRENT_RUNS` for
  any sustained period (means the queue is saturated).
- `od_critique_parser_warnings_total{kind="composite_mismatch"}` rate non-zero
  (means an agent is reporting composites that disagree with the daemon).

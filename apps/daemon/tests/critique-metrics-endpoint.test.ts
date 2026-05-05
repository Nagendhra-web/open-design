/**
 * Integration test for the /api/metrics/critique scrape endpoint.
 *
 * Mirrors the daemon's wiring: an express app mounts the same handler
 * registered in server.ts, observations are made through the singleton
 * registry, and the response body is asserted against the Prometheus
 * text-format contract.
 */
import http from 'node:http';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import {
  critiqueMetrics,
  resetCritiqueMetricsForTest,
} from '../src/critique/metrics.js';

function startMiniServer(): Promise<{ baseUrl: string; server: http.Server }> {
  const app = express();
  app.get('/api/metrics/critique', (_req, res) => {
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(critiqueMetrics.registry.render());
  });
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr !== 'object') {
        reject(new Error('could not bind'));
        return;
      }
      resolve({ baseUrl: `http://127.0.0.1:${addr.port}`, server });
    });
    server.on('error', reject);
  });
}

let baseUrl: string;
let server: http.Server;

beforeEach(async () => {
  resetCritiqueMetricsForTest();
  ({ baseUrl, server } = await startMiniServer());
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe('GET /api/metrics/critique', () => {
  it('returns 200 with Prometheus text-format content type', async () => {
    const res = await fetch(`${baseUrl}/api/metrics/critique`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(res.headers.get('content-type')).toContain('version=0.0.4');
  });

  it('exposes every documented critique metric name', async () => {
    critiqueMetrics.runsStarted.inc({ adapter: 'plain' });
    critiqueMetrics.runDurationMs.observe({ status: 'shipped' }, 1234);
    critiqueMetrics.parserWarnings.inc({ kind: 'weak_debate' });

    const res = await fetch(`${baseUrl}/api/metrics/critique`);
    const body = await res.text();

    for (const name of [
      'od_critique_runs_started_total',
      'od_critique_runs_completed_total',
      'od_critique_rounds_completed_total',
      'od_critique_parser_warnings_total',
      'od_critique_degraded_runs_total',
      'od_critique_failed_runs_total',
      'od_critique_boot_reconciled_total',
      'od_critique_in_flight_runs',
      'od_critique_run_duration_ms',
      'od_critique_round_duration_ms',
      'od_critique_transcript_bytes',
      'od_critique_composite_score',
    ]) {
      expect(body).toContain(`# HELP ${name}`);
      expect(body).toMatch(new RegExp(`# TYPE ${name} (counter|gauge|histogram)`));
    }
  });

  it('reflects observed values in the scrape output', async () => {
    critiqueMetrics.runsStarted.inc({ adapter: 'plain' }, 3);
    critiqueMetrics.runsCompleted.inc({ status: 'shipped', adapter: 'plain' });
    critiqueMetrics.bootReconciled.inc({}, 5);

    const res = await fetch(`${baseUrl}/api/metrics/critique`);
    const body = await res.text();

    expect(body).toContain('od_critique_runs_started_total{adapter="plain"} 3');
    expect(body).toContain('od_critique_runs_completed_total{adapter="plain",status="shipped"} 1');
    expect(body).toContain('od_critique_boot_reconciled_total 5');
  });
});

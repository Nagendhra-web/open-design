import { describe, it, expect, vi } from 'vitest';
import { defaultCritiqueConfig } from '@open-design/contracts/critique';
import {
  runOnce,
  runMatrix,
  DEFAULT_PASS_CRITERIA,
  type ConformanceRunInput,
  type ConformanceMatrixInput,
} from '../src/critique/conformance/runner.js';
import { createAdapterRegistry } from '../src/critique/conformance/registry.js';
import {
  syntheticGoodStdout,
  syntheticBadStdout,
} from '../src/critique/conformance/synthetic.js';
import { BRIEF_TEMPLATES, PRODUCTION_ADAPTERS } from '../src/critique/conformance/matrix.js';
import type { BriefTemplate, AdapterDescriptor } from '../src/critique/conformance/matrix.js';

const cfg = defaultCritiqueConfig();

const GOOD_ADAPTER: AdapterDescriptor = { id: 'synthetic-good', status: 'production' };
const BAD_ADAPTER: AdapterDescriptor = { id: 'synthetic-bad', status: 'production' };

const FIRST_TEMPLATE: BriefTemplate = BRIEF_TEMPLATES[0]!;

// ---------------------------------------------------------------------------
// DEFAULT_PASS_CRITERIA
// ---------------------------------------------------------------------------

describe('DEFAULT_PASS_CRITERIA', () => {
  it('minShippedRatio is 0.90', () => {
    expect(DEFAULT_PASS_CRITERIA.minShippedRatio).toBe(0.9);
  });

  it('minParseCleanRatio is 0.95', () => {
    expect(DEFAULT_PASS_CRITERIA.minParseCleanRatio).toBe(0.95);
  });

  it('retryBudget is 1', () => {
    expect(DEFAULT_PASS_CRITERIA.retryBudget).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// runOnce
// ---------------------------------------------------------------------------

describe('runOnce', () => {
  it('happy path: synthetic-good stream -> verdict shipped, composite >= 8, rounds = 3', async () => {
    const input: ConformanceRunInput = {
      adapter: GOOD_ADAPTER,
      template: FIRST_TEMPLATE,
      produceStdout: () => syntheticGoodStdout(),
      cfg,
    };
    const result = await runOnce(input);
    expect(result.verdict).toBe('shipped');
    expect(result.composite).not.toBeNull();
    expect(result.composite!).toBeGreaterThanOrEqual(8);
    expect(result.rounds).toBe(3);
    expect(result.errorMessage).toBeNull();
    expect(result.adapterId).toBe('synthetic-good');
    expect(result.templateId).toBe(FIRST_TEMPLATE.id);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('malformed stream: synthetic-bad -> verdict parse_failed, errorMessage populated', async () => {
    const input: ConformanceRunInput = {
      adapter: BAD_ADAPTER,
      template: FIRST_TEMPLATE,
      produceStdout: () => syntheticBadStdout(),
      cfg,
    };
    const result = await runOnce(input);
    expect(result.verdict).toBe('parse_failed');
    expect(result.errorMessage).not.toBeNull();
    expect(result.errorMessage!.length).toBeGreaterThan(0);
    expect(result.composite).toBeNull();
  });

  it('durationMs is a non-negative number', async () => {
    const result = await runOnce({
      adapter: GOOD_ADAPTER,
      template: FIRST_TEMPLATE,
      produceStdout: () => syntheticGoodStdout(),
      cfg,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('adapterId and templateId are correctly populated on error path', async () => {
    const result = await runOnce({
      adapter: BAD_ADAPTER,
      template: FIRST_TEMPLATE,
      produceStdout: () => syntheticBadStdout(),
      cfg,
    });
    expect(result.adapterId).toBe('synthetic-bad');
    expect(result.templateId).toBe(FIRST_TEMPLATE.id);
  });
});

// ---------------------------------------------------------------------------
// runMatrix
// ---------------------------------------------------------------------------

describe('runMatrix', () => {
  it('all 10 templates with synthetic-good -> AdapterReport.passes = true', async () => {
    const registry = createAdapterRegistry();
    const input: ConformanceMatrixInput = {
      adapters: [GOOD_ADAPTER],
      templates: BRIEF_TEMPLATES,
      cfg,
      registry,
      produceStdout: (_adapter, _template) => syntheticGoodStdout(),
    };
    const reports = await runMatrix(input);
    expect(reports).toHaveLength(1);
    const report = reports[0]!;
    expect(report.adapterId).toBe('synthetic-good');
    expect(report.passes).toBe(true);
    expect(report.shippedCount).toBe(10);
    expect(report.parseFailedCount).toBe(0);
    expect(report.results).toHaveLength(10);
  }, 60_000);

  it('all 10 templates with synthetic-bad -> AdapterReport.passes = false', async () => {
    const registry = createAdapterRegistry();
    const input: ConformanceMatrixInput = {
      adapters: [BAD_ADAPTER],
      templates: BRIEF_TEMPLATES,
      cfg,
      registry,
      produceStdout: (_adapter, _template) => syntheticBadStdout(),
    };
    const reports = await runMatrix(input);
    expect(reports).toHaveLength(1);
    const report = reports[0]!;
    expect(report.passes).toBe(false);
  }, 60_000);

  it('failing adapter is marked degraded in registry with reason conformance_failed', async () => {
    const registry = createAdapterRegistry();
    const markSpy = vi.spyOn(registry, 'markDegraded');
    const input: ConformanceMatrixInput = {
      adapters: [BAD_ADAPTER],
      templates: BRIEF_TEMPLATES,
      cfg,
      registry,
      produceStdout: () => syntheticBadStdout(),
    };
    await runMatrix(input);
    expect(markSpy).toHaveBeenCalledWith('synthetic-bad', 'conformance_failed');
  }, 60_000);

  it('passing adapter is NOT marked degraded in registry', async () => {
    const registry = createAdapterRegistry();
    const markSpy = vi.spyOn(registry, 'markDegraded');
    const input: ConformanceMatrixInput = {
      adapters: [GOOD_ADAPTER],
      templates: BRIEF_TEMPLATES,
      cfg,
      registry,
      produceStdout: () => syntheticGoodStdout(),
    };
    await runMatrix(input);
    expect(markSpy).not.toHaveBeenCalled();
  }, 60_000);

  it('markDegraded called exactly once per failing adapter (not once per template)', async () => {
    const registry = createAdapterRegistry();
    const markSpy = vi.spyOn(registry, 'markDegraded');
    const input: ConformanceMatrixInput = {
      adapters: [BAD_ADAPTER],
      templates: BRIEF_TEMPLATES,
      cfg,
      registry,
      produceStdout: () => syntheticBadStdout(),
    };
    await runMatrix(input);
    expect(markSpy).toHaveBeenCalledTimes(1);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Retry budget
// ---------------------------------------------------------------------------

describe('runMatrix retry budget', () => {
  it('flaky stream that fails once then succeeds: adapter passes', async () => {
    const registry = createAdapterRegistry();
    const callCounts = new Map<string, number>();

    const input: ConformanceMatrixInput = {
      adapters: [GOOD_ADAPTER],
      // Use just one template to keep the test fast.
      templates: [FIRST_TEMPLATE],
      cfg,
      registry,
      produceStdout: (_adapter, template) => {
        const key = template.id;
        const count = (callCounts.get(key) ?? 0) + 1;
        callCounts.set(key, count);
        // First call returns bad stream; subsequent calls return good stream.
        return count === 1 ? syntheticBadStdout() : syntheticGoodStdout();
      },
    };
    const reports = await runMatrix(input, { retryBudget: 1 });
    const report = reports[0]!;
    expect(report.passes).toBe(true);
    expect(report.shippedCount).toBe(1);
    // Should have been called twice for the one template (1 fail + 1 retry).
    expect(callCounts.get(FIRST_TEMPLATE.id)).toBe(2);
  });

  it('stream that fails twice with retryBudget=1: adapter is marked degraded', async () => {
    const registry = createAdapterRegistry();
    const markSpy = vi.spyOn(registry, 'markDegraded');
    const callCounts = new Map<string, number>();

    const input: ConformanceMatrixInput = {
      adapters: [GOOD_ADAPTER],
      templates: [FIRST_TEMPLATE],
      cfg,
      registry,
      produceStdout: (_adapter, template) => {
        const key = template.id;
        const count = (callCounts.get(key) ?? 0) + 1;
        callCounts.set(key, count);
        // Both the initial call and the one retry return bad streams.
        return syntheticBadStdout();
      },
    };
    const reports = await runMatrix(input, { retryBudget: 1 });
    const report = reports[0]!;
    expect(report.passes).toBe(false);
    expect(markSpy).toHaveBeenCalledWith('synthetic-good', 'conformance_failed');
  });

  it('stream that fails once with retryBudget=0: no retry, adapter marked degraded', async () => {
    const registry = createAdapterRegistry();
    const markSpy = vi.spyOn(registry, 'markDegraded');
    let callCount = 0;

    const input: ConformanceMatrixInput = {
      adapters: [GOOD_ADAPTER],
      templates: [FIRST_TEMPLATE],
      cfg,
      registry,
      produceStdout: () => {
        callCount++;
        return syntheticBadStdout();
      },
    };
    await runMatrix(input, { retryBudget: 0 });
    expect(callCount).toBe(1);
    expect(markSpy).toHaveBeenCalledWith('synthetic-good', 'conformance_failed');
  });

  it('reports contain one entry per (adapter, template) pair', async () => {
    const registry = createAdapterRegistry();
    const twoTemplates = [BRIEF_TEMPLATES[0]!, BRIEF_TEMPLATES[1]!];
    const twoAdapters: AdapterDescriptor[] = [GOOD_ADAPTER, BAD_ADAPTER];

    const input: ConformanceMatrixInput = {
      adapters: twoAdapters,
      templates: twoTemplates,
      cfg,
      registry,
      produceStdout: (adapter) =>
        adapter.id === 'synthetic-good' ? syntheticGoodStdout() : syntheticBadStdout(),
    };
    const reports = await runMatrix(input);
    expect(reports).toHaveLength(2);
    for (const report of reports) {
      expect(report.results).toHaveLength(2);
    }
  }, 30_000);

  it('PRODUCTION_ADAPTERS ids are known to the registry (no RangeError)', () => {
    const registry = createAdapterRegistry();
    for (const adapter of PRODUCTION_ADAPTERS) {
      expect(() =>
        registry.markDegraded(adapter.id, 'conformance_failed'),
      ).not.toThrow();
      registry.clearDegraded(adapter.id);
    }
  });
});

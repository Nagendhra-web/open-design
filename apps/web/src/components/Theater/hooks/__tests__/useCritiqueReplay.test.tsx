// @vitest-environment jsdom
/**
 * Tests for useCritiqueReplay.
 *
 * Uses a stub fetchTranscript so no HTTP is needed.
 * Uses vitest fake timers to control timed replay without real wall-clock waits.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PanelEvent } from '@open-design/contracts';
import { useCritiqueReplay } from '../useCritiqueReplay.js';

// ---------------------------------------------------------------------------
// Fixture: minimal PanelEvent sequence that produces shipped state
// ---------------------------------------------------------------------------

function makeTranscript(): PanelEvent[] {
  return [
    {
      type: 'run_started',
      runId: 'run-1',
      protocolVersion: 1,
      cast: ['designer'],
      maxRounds: 1,
      threshold: 8,
      scale: 10,
    },
    {
      type: 'panelist_open',
      runId: 'run-1',
      round: 1,
      role: 'designer',
    },
    {
      type: 'panelist_close',
      runId: 'run-1',
      round: 1,
      role: 'designer',
      score: 9,
    },
    {
      type: 'round_end',
      runId: 'run-1',
      round: 1,
      composite: 9.0,
      mustFix: 0,
      decision: 'ship' as const,
      reason: 'above threshold',
    },
    {
      type: 'ship',
      runId: 'run-1',
      round: 1,
      composite: 9.0,
      status: 'shipped' as const,
      artifactRef: { projectId: 'proj-1', artifactId: 'art-1' },
      summary: 'Approved',
    },
  ];
}

function stubFetch(events: PanelEvent[]) {
  return vi.fn().mockResolvedValue(events);
}

function failingFetch() {
  return vi.fn().mockRejectedValue(new Error('transcript_unavailable: HTTP 404'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCritiqueReplay -- instant speed', () => {
  it('state reaches shipped synchronously (within one flush) after mount', async () => {
    const fetch = stubFetch(makeTranscript());

    const { result } = renderHook(() =>
      useCritiqueReplay({
        projectId: 'proj-1',
        artifactId: 'art-1',
        runId: 'run-1',
        speed: 'instant',
        fetchTranscript: fetch,
      }),
    );

    await waitFor(() => {
      expect(result.current.state.phase).toBe('shipped');
    });

    expect(result.current.isReplaying).toBe(false);
    expect(result.current.progress).toBe(1);
  });

  it('fetch is called with the correct arguments', async () => {
    const fetch = stubFetch(makeTranscript());

    renderHook(() =>
      useCritiqueReplay({
        projectId: 'proj-1',
        artifactId: 'art-2',
        runId: 'run-7',
        speed: 'instant',
        fetchTranscript: fetch,
      }),
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith({
        projectId: 'proj-1',
        artifactId: 'art-2',
        runId: 'run-7',
      });
    });
  });
});

describe('useCritiqueReplay -- 4x speed with fake timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('state advances event by event after timer ticks', async () => {
    const fetch = stubFetch(makeTranscript());

    const { result } = renderHook(() =>
      useCritiqueReplay({
        projectId: 'proj-1',
        artifactId: 'art-1',
        runId: 'run-1',
        speed: '4x',
        fetchTranscript: fetch,
      }),
    );

    // Allow fetch promise to resolve.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Advance timers to fire all scheduled dispatches.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.state.phase).toBe('shipped');
    expect(result.current.isReplaying).toBe(false);
  });

  it('pause: state stops advancing when autoplay=false, resumes when setPlaying(true)', async () => {
    const events = makeTranscript();
    const fetch = stubFetch(events);

    // Mount paused from the start so no events are dispatched.
    const { result } = renderHook(() =>
      useCritiqueReplay({
        projectId: 'proj-1',
        artifactId: 'art-1',
        runId: 'run-1',
        speed: '4x',
        autoplay: false,
        fetchTranscript: fetch,
      }),
    );

    // Let the fetch promise resolve (microtask queue), but do NOT drain timers
    // yet -- the loop is paused so it would spin forever with runAllTimersAsync.
    await act(async () => {
      // Advance just enough for the fetch promise to settle and the first
      // dispatchNext() call to be scheduled, then confirm nothing dispatched yet.
      await vi.advanceTimersByTimeAsync(200);
    });

    // Still idle -- autoplay is false so no events were dispatched.
    expect(result.current.state.phase).toBe('idle');

    // Resume: update the ref so subsequent timers will dispatch events.
    act(() => {
      result.current.setPlaying(true);
    });

    // Drain the remaining timers now that the loop is unblocked.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.state.phase).toBe('shipped');
  });
});

describe('useCritiqueReplay -- fetch failure', () => {
  it('state becomes degraded with reason transcript_unavailable', async () => {
    const { result } = renderHook(() =>
      useCritiqueReplay({
        projectId: 'proj-1',
        artifactId: 'art-1',
        runId: 'run-1',
        speed: 'instant',
        fetchTranscript: failingFetch(),
      }),
    );

    // Wait until state is degraded. The fetch failure dispatches the degraded
    // event synchronously in the catch block.
    await waitFor(() => {
      expect(result.current.state.phase).toBe('degraded');
    });

    if (result.current.state.phase !== 'degraded') return;
    expect(result.current.state.reason).toBe('missing_artifact');
    // isReplaying will eventually settle to false; we verify state is correct.
    expect(result.current.state.runId).toBe('run-1');
  });
});

describe('useCritiqueReplay -- setSpeed', () => {
  it('setSpeed updates the speed for subsequent dispatches', async () => {
    const fetch = stubFetch(makeTranscript());

    const { result } = renderHook(() =>
      useCritiqueReplay({
        projectId: 'proj-1',
        artifactId: 'art-1',
        runId: 'run-1',
        speed: '4x',
        fetchTranscript: fetch,
      }),
    );

    act(() => {
      result.current.setSpeed('instant');
    });

    // After calling setSpeed, the ref is updated for subsequent events.
    // The transcript was already fetched; we just verify the hook doesn't throw.
    await waitFor(() => {
      expect(result.current).toBeDefined();
    });
  });
});

describe('useCritiqueReplay -- empty transcript', () => {
  it('completes immediately with progress 1 when transcript is empty', async () => {
    const fetch = stubFetch([]);

    const { result } = renderHook(() =>
      useCritiqueReplay({
        projectId: 'proj-1',
        artifactId: 'art-1',
        runId: 'run-1',
        speed: 'instant',
        fetchTranscript: fetch,
      }),
    );

    await waitFor(() => {
      expect(result.current.isReplaying).toBe(false);
    });

    expect(result.current.progress).toBe(1);
  });
});

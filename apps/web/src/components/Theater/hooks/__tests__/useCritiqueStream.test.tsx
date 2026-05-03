// @vitest-environment jsdom
/**
 * Tests for useCritiqueStream.
 *
 * We mock EventSource globally so no real HTTP is needed. The mock exposes
 * a static `emit` helper so individual test cases can drive the stream.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CritiqueSseEvent } from '@open-design/contracts';
import { useCritiqueStream } from '../useCritiqueStream.js';

// ---------------------------------------------------------------------------
// EventSource mock
// ---------------------------------------------------------------------------

type ListenerMap = Map<string, Array<(e: MessageEvent) => void>>;

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  private listeners: ListenerMap = new Map();
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: EventListenerOrEventListenerObject): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn as (e: MessageEvent) => void);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, fn: EventListenerOrEventListenerObject): void {
    const list = this.listeners.get(type);
    if (!list) return;
    this.listeners.set(
      type,
      list.filter((f) => f !== fn),
    );
  }

  close(): void {
    this.closed = true;
  }

  /** Emit a CritiqueSseEvent to all registered listeners. */
  emit(event: CritiqueSseEvent): void {
    const listeners = this.listeners.get(event.event) ?? [];
    const msg = new MessageEvent(event.event, {
      data: JSON.stringify(event.data),
    });
    for (const fn of listeners) {
      fn(msg);
    }
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runStartedEvent(): CritiqueSseEvent {
  return {
    event: 'critique.run_started',
    data: {
      runId: 'run-1',
      protocolVersion: 1,
      cast: ['designer', 'critic'],
      maxRounds: 3,
      threshold: 8,
      scale: 10,
    },
  } as CritiqueSseEvent;
}

function shipEvent(): CritiqueSseEvent {
  return {
    event: 'critique.ship',
    data: {
      runId: 'run-1',
      round: 1,
      composite: 9.0,
      status: 'shipped' as const,
      artifactRef: { projectId: 'proj-1', artifactId: 'art-1' },
      summary: 'Done',
    },
  } as CritiqueSseEvent;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCritiqueStream', () => {
  it('starts in idle phase', () => {
    const { result } = renderHook(() =>
      useCritiqueStream({ projectId: 'proj-1' }),
    );
    expect(result.current.state.phase).toBe('idle');
  });

  it('mount + emit run_started -> state.phase becomes running', async () => {
    const { result } = renderHook(() =>
      useCritiqueStream({ projectId: 'proj-1' }),
    );

    const source = MockEventSource.instances[0];
    expect(source).toBeDefined();

    act(() => {
      source!.emit(runStartedEvent());
    });

    expect(result.current.state.phase).toBe('running');
  });

  it('mount + emit ship -> state.phase becomes shipped', () => {
    const { result } = renderHook(() =>
      useCritiqueStream({ projectId: 'proj-1' }),
    );

    const source = MockEventSource.instances[0];
    if (source === undefined) throw new Error('No EventSource');

    act(() => {
      source.emit(runStartedEvent());
    });
    act(() => {
      source.emit(shipEvent());
    });

    expect(result.current.state.phase).toBe('shipped');
  });

  it('unmount closes the EventSource subscription', () => {
    const { unmount } = renderHook(() =>
      useCritiqueStream({ projectId: 'proj-1' }),
    );

    const source = MockEventSource.instances[0];
    if (source === undefined) throw new Error('No EventSource');

    unmount();

    expect(source.closed).toBe(true);
  });

  it('runId filter ignores events for different run', () => {
    const { result } = renderHook(() =>
      useCritiqueStream({ projectId: 'proj-1', runId: 'run-A' }),
    );

    const source = MockEventSource.instances[0];
    if (source === undefined) throw new Error('No EventSource');

    // Emit a run_started for run-B -- should be ignored.
    const otherRun: CritiqueSseEvent = {
      event: 'critique.run_started',
      data: {
        runId: 'run-B',
        protocolVersion: 1,
        cast: ['designer'],
        maxRounds: 1,
        threshold: 8,
        scale: 10,
      },
    } as CritiqueSseEvent;

    act(() => {
      source.emit(otherRun);
    });

    expect(result.current.state.phase).toBe('idle');

    // Now emit for run-A -- should be applied.
    const correctRun: CritiqueSseEvent = {
      event: 'critique.run_started',
      data: {
        runId: 'run-A',
        protocolVersion: 1,
        cast: ['designer'],
        maxRounds: 1,
        threshold: 8,
        scale: 10,
      },
    } as CritiqueSseEvent;

    act(() => {
      source.emit(correctRun);
    });

    expect(result.current.state.phase).toBe('running');
  });

  it('manual dispatch drives the reducer directly', () => {
    const { result } = renderHook(() =>
      useCritiqueStream({ projectId: 'proj-1' }),
    );

    act(() => {
      result.current.dispatch(runStartedEvent());
    });

    expect(result.current.state.phase).toBe('running');
  });

  it('opens EventSource on the correct URL', () => {
    renderHook(() => useCritiqueStream({ projectId: 'my-project' }));
    const source = MockEventSource.instances[0];
    expect(source?.url).toBe('/api/projects/my-project/events');
  });

  it('reconnection: a new source is created when projectId changes', () => {
    const { rerender } = renderHook(
      ({ projectId }: { projectId: string }) =>
        useCritiqueStream({ projectId }),
      { initialProps: { projectId: 'proj-1' } },
    );

    rerender({ projectId: 'proj-2' });

    // Two instances created, first one closed.
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[0]?.closed).toBe(true);
    expect(MockEventSource.instances[1]?.closed).toBe(false);
  });
});

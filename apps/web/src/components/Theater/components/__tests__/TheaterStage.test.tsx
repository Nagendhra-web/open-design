// @vitest-environment jsdom
/**
 * Tests for TheaterStage.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CritiqueState } from '../../state/reducer.js';
import { TheaterStage } from '../TheaterStage.js';

afterEach(cleanup);

const runningState: CritiqueState = {
  phase: 'running',
  runId: 'run-1',
  rounds: [],
  activeRound: 1,
  activePanelist: 'designer',
  cast: ['designer', 'critic', 'brand'],
  maxRounds: 3,
  threshold: 8,
  scale: 10,
};

describe('TheaterStage - render', () => {
  it('renders without crash for running state', () => {
    const { container } = render(
      <TheaterStage state={runningState} />,
    );
    expect(container).toBeTruthy();
  });

  it('returns null for idle state', () => {
    const { container } = render(
      <TheaterStage state={{ phase: 'idle' }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null for shipped state', () => {
    const shipped: CritiqueState = {
      phase: 'shipped',
      runId: 'run-1',
      rounds: [],
      cast: ['designer'],
      maxRounds: 3,
      threshold: 8,
      scale: 10,
      final: {
        composite: 9.0,
        round: 1,
        status: 'shipped',
        summary: 'OK',
        artifactRef: { projectId: 'p1', artifactId: 'a1' },
      },
    };
    const { container } = render(<TheaterStage state={shipped} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders all cast lanes in smart density', () => {
    render(<TheaterStage state={runningState} density="smart" />);
    // All 3 cast members should appear (as regions).
    const regions = screen.getAllByRole('region');
    expect(regions.length).toBeGreaterThanOrEqual(3);
  });

  it('renders all lanes expanded in expanded density', () => {
    const { container } = render(
      <TheaterStage state={runningState} density="expanded" />,
    );
    // All headers should show aria-expanded="true".
    const headers = container.querySelectorAll('[aria-expanded="true"]');
    expect(headers.length).toBe(runningState.cast.length);
  });

  it('renders only active lane in active density', () => {
    const { container } = render(
      <TheaterStage state={runningState} density="active" />,
    );
    // Only one region for 'active' density (only activePanelist shown).
    const regions = container.querySelectorAll('[role="region"]');
    expect(regions.length).toBe(1);
  });

  it('shows the density picker buttons', () => {
    render(<TheaterStage state={runningState} />);
    const group = screen.getByRole('group', { name: 'Lane density' });
    expect(group).toBeTruthy();
    const btns = group.querySelectorAll('button');
    expect(btns.length).toBe(3);
  });
});

describe('TheaterStage - density change', () => {
  it('calls onDensityChange when density button clicked', () => {
    const onDensityChange = vi.fn();
    render(
      <TheaterStage
        state={runningState}
        density="smart"
        onDensityChange={onDensityChange}
      />,
    );
    const group = screen.getByRole('group', { name: 'Lane density' });
    const btns = group.querySelectorAll('button');
    // Click "expanded" (3rd button).
    if (btns[2]) fireEvent.click(btns[2]);
    expect(onDensityChange).toHaveBeenCalledWith('expanded');
  });
});

describe('TheaterStage - interrupt', () => {
  it('shows InterruptButton', () => {
    render(<TheaterStage state={runningState} />);
    // InterruptButton has aria-keyshortcuts="Escape".
    const btn = document.querySelector('[aria-keyshortcuts="Escape"]');
    expect(btn).toBeTruthy();
  });
});

describe('TheaterStage - aria-live', () => {
  it('has an offscreen aria-live="polite" element', () => {
    const { container } = render(<TheaterStage state={runningState} />);
    const liveEl = container.querySelector('[aria-live="polite"]');
    expect(liveEl).toBeTruthy();
  });
});

describe('TheaterStage - throws on invalid density', () => {
  it('throws on invalid density mode', () => {
    expect(() =>
      render(
        // @ts-expect-error testing invalid density
        <TheaterStage state={runningState} density="bad" />,
      ),
    ).toThrow();
  });
});

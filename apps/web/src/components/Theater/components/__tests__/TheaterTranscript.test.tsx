// @vitest-environment jsdom
/**
 * Tests for TheaterTranscript.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PanelEvent } from '@open-design/contracts';
import { TheaterTranscript } from '../TheaterTranscript.js';

afterEach(cleanup);

function makeTranscript(): PanelEvent[] {
  return [
    {
      type: 'run_started',
      runId: 'run-1',
      protocolVersion: 1,
      cast: ['designer'],
      maxRounds: 2,
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

describe('TheaterTranscript - render', () => {
  it('renders without crash', async () => {
    const fetch = vi.fn().mockResolvedValue(makeTranscript());
    const { container } = render(
      <TheaterTranscript
        projectId="proj-1"
        artifactId="art-1"
        runId="run-1"
        roundCount={1}
        fetchTranscript={fetch}
      />,
    );
    expect(container).toBeTruthy();
  });

  it('shows replay title', () => {
    const fetch = vi.fn().mockResolvedValue([]);
    render(
      <TheaterTranscript
        projectId="proj-1"
        artifactId="art-1"
        runId="run-1"
        roundCount={1}
        fetchTranscript={fetch}
      />,
    );
    // The title should appear (sourced from i18n key).
    const titleEl = document.querySelector('[class*="transcriptTitle"]');
    expect(titleEl).toBeTruthy();
  });

  it('shows speed picker buttons', () => {
    const fetch = vi.fn().mockResolvedValue([]);
    render(
      <TheaterTranscript
        projectId="proj-1"
        artifactId="art-1"
        runId="run-1"
        roundCount={1}
        fetchTranscript={fetch}
      />,
    );
    const speedGroup = screen.getByRole('group', { name: 'Replay speed' });
    const btns = speedGroup.querySelectorAll('button');
    expect(btns.length).toBe(3);
  });

  it('clicking speed button marks it active', () => {
    const fetch = vi.fn().mockResolvedValue([]);
    render(
      <TheaterTranscript
        projectId="proj-1"
        artifactId="art-1"
        runId="run-1"
        roundCount={1}
        fetchTranscript={fetch}
      />,
    );
    const speedGroup = screen.getByRole('group', { name: 'Replay speed' });
    const btns = Array.from(speedGroup.querySelectorAll('button'));
    // Click first button (1x).
    if (btns[0]) fireEvent.click(btns[0]);
    expect(btns[0]?.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows progress scrubber', () => {
    const fetch = vi.fn().mockResolvedValue([]);
    const { container } = render(
      <TheaterTranscript
        projectId="proj-1"
        artifactId="art-1"
        runId="run-1"
        roundCount={1}
        fetchTranscript={fetch}
      />,
    );
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar).toBeTruthy();
  });

  it('shows jump buttons when roundCount > 1', () => {
    const fetch = vi.fn().mockResolvedValue([]);
    render(
      <TheaterTranscript
        projectId="proj-1"
        artifactId="art-1"
        runId="run-1"
        roundCount={3}
        fetchTranscript={fetch}
      />,
    );
    const jumpGroup = screen.getByRole('group', { name: 'Jump to round' });
    const btns = jumpGroup.querySelectorAll('button');
    expect(btns.length).toBe(3);
  });

  it('does not show jump buttons when roundCount == 1', () => {
    const fetch = vi.fn().mockResolvedValue([]);
    const { container } = render(
      <TheaterTranscript
        projectId="proj-1"
        artifactId="art-1"
        runId="run-1"
        roundCount={1}
        fetchTranscript={fetch}
      />,
    );
    // With roundCount=1, the jump row group should not be rendered.
    const jumpGroups = container.querySelectorAll('[aria-label="Jump to round"]');
    expect(jumpGroups.length).toBe(0);
  });

  it('progresses toward 100% after replay completes', async () => {
    const fetch = vi.fn().mockResolvedValue(makeTranscript());
    const { container } = render(
      <TheaterTranscript
        projectId="proj-1"
        artifactId="art-1"
        runId="run-1"
        roundCount={1}
        fetchTranscript={fetch}
      />,
    );
    // Wait for the replay to finish.
    await waitFor(() => {
      const label = container.querySelector('[class*="scrubberLabel"]');
      expect(label?.textContent).toBe('100%');
    }, { timeout: 3000 });
  });
});

// @vitest-environment jsdom
/**
 * Tests for TheaterDegraded.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TheaterDegraded } from '../TheaterDegraded.js';

afterEach(cleanup);

describe('TheaterDegraded - render', () => {
  it('renders without crash', () => {
    const { container } = render(
      <TheaterDegraded reason="malformed_block" adapter="openai" />,
    );
    expect(container).toBeTruthy();
  });

  it('shows reason and adapter', () => {
    render(<TheaterDegraded reason="malformed_block" adapter="openai" />);
    expect(screen.getByText(/malformed_block/)).toBeTruthy();
    expect(screen.getByText(/openai/)).toBeTruthy();
  });

  it('has role="alert"', () => {
    render(<TheaterDegraded reason="missing_artifact" adapter="" />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('shows retry button when onRetry provided', () => {
    const onRetry = vi.fn();
    render(<TheaterDegraded reason="missing_artifact" adapter="" onRetry={onRetry} />);
    const btns = screen.getAllByRole('button');
    expect(btns.some((b) => b.getAttribute('class')?.includes('retryBtn'))).toBe(true);
  });

  it('calls onRetry when retry button clicked', () => {
    const onRetry = vi.fn();
    render(<TheaterDegraded reason="missing_artifact" adapter="" onRetry={onRetry} />);
    const btn = screen.getAllByRole('button')[0];
    if (btn) fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows switch adapter button when onSwitchAdapter provided', () => {
    const onSwitchAdapter = vi.fn();
    render(
      <TheaterDegraded
        reason="missing_artifact"
        adapter=""
        onSwitchAdapter={onSwitchAdapter}
      />,
    );
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(1);
  });

  it('shows 24h TTL note', () => {
    render(<TheaterDegraded reason="missing_artifact" adapter="" />);
    expect(screen.getByText(/24h TTL/)).toBeTruthy();
  });

  it('shows "unknown" adapter when adapter is empty string', () => {
    render(<TheaterDegraded reason="missing_artifact" adapter="" />);
    expect(screen.getByText(/unknown/)).toBeTruthy();
  });
});

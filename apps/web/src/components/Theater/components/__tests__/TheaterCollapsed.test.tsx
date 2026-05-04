// @vitest-environment jsdom
/**
 * Tests for TheaterCollapsed.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TheaterCollapsed } from '../TheaterCollapsed.js';

afterEach(cleanup);

describe('TheaterCollapsed - render', () => {
  it('renders without crash', () => {
    const { container } = render(
      <TheaterCollapsed
        composite={8.5}
        scale={10}
        threshold={8}
        roundCount={2}
        roleScores={{ designer: 9.0, critic: 8.0 }}
      />,
    );
    expect(container).toBeTruthy();
  });

  it('shows composite score', () => {
    render(
      <TheaterCollapsed
        composite={8.5}
        scale={10}
        threshold={8}
        roundCount={1}
        roleScores={{}}
      />,
    );
    expect(screen.getByText('8.5')).toBeTruthy();
  });

  it('shows scale', () => {
    render(
      <TheaterCollapsed
        composite={8.5}
        scale={10}
        threshold={8}
        roundCount={1}
        roleScores={{}}
      />,
    );
    expect(screen.getByText('/ 10')).toBeTruthy();
  });

  it('shows role swatches for provided roles', () => {
    const { container } = render(
      <TheaterCollapsed
        composite={9.0}
        scale={10}
        threshold={8}
        roundCount={1}
        roleScores={{ designer: 9.0, critic: 8.0 }}
      />,
    );
    const swatches = container.querySelectorAll('[class*="roleSwatch"]');
    expect(swatches.length).toBe(2);
  });

  it('shows duration when provided', () => {
    render(
      <TheaterCollapsed
        composite={9.0}
        scale={10}
        threshold={8}
        roundCount={1}
        roleScores={{}}
        durationMs={5000}
      />,
    );
    expect(screen.getByText('5s')).toBeTruthy();
  });

  it('calls onExpand when clicked', () => {
    const onExpand = vi.fn();
    render(
      <TheaterCollapsed
        composite={9.0}
        scale={10}
        threshold={8}
        roundCount={1}
        roleScores={{}}
        onExpand={onExpand}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onExpand).toHaveBeenCalledOnce();
  });

  it('applies good color class when composite >= threshold', () => {
    const { container } = render(
      <TheaterCollapsed
        composite={9.0}
        scale={10}
        threshold={8}
        roundCount={1}
        roleScores={{}}
      />,
    );
    const el = container.querySelector('[class*="scoreGood"]');
    expect(el).toBeTruthy();
  });

  it('applies warn color class when composite < threshold', () => {
    const { container } = render(
      <TheaterCollapsed
        composite={6.0}
        scale={10}
        threshold={8}
        roundCount={1}
        roleScores={{}}
      />,
    );
    const el = container.querySelector('[class*="scoreWarn"]');
    expect(el).toBeTruthy();
  });

  it('throws on invalid scale', () => {
    expect(() =>
      render(
        <TheaterCollapsed
          composite={9}
          scale={0}
          threshold={8}
          roundCount={1}
          roleScores={{}}
        />,
      ),
    ).toThrow();
  });
});

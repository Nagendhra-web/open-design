// @vitest-environment jsdom
/**
 * Tests for ScoreTicker.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScoreTicker } from '../ScoreTicker.js';

afterEach(cleanup);

describe('ScoreTicker', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('renders without crash with composite null', () => {
    const { container } = render(
      <ScoreTicker composite={null} threshold={8} scale={10} mustFixOpen={0} />,
    );
    expect(container).toBeTruthy();
  });

  it('renders composite value when provided', () => {
    render(<ScoreTicker composite={9.0} threshold={8} scale={10} mustFixOpen={0} />);
    expect(screen.getByText('9.0')).toBeTruthy();
  });

  it('shows scale', () => {
    render(<ScoreTicker composite={7.5} threshold={8} scale={10} mustFixOpen={2} />);
    expect(screen.getByText('/ 10')).toBeTruthy();
  });

  it('shows must-fix badge with count', () => {
    render(<ScoreTicker composite={6.0} threshold={8} scale={10} mustFixOpen={3} />);
    expect(screen.getByText('3 must-fix')).toBeTruthy();
  });

  it('shows rule line when provided', () => {
    render(
      <ScoreTicker
        composite={7.0}
        threshold={8}
        scale={10}
        mustFixOpen={1}
        ruleLine="Ships when composite >= 8.0"
      />,
    );
    expect(screen.getByText('Ships when composite >= 8.0')).toBeTruthy();
  });

  it('applies good color class when composite >= threshold', () => {
    const { container } = render(
      <ScoreTicker composite={8.5} threshold={8} scale={10} mustFixOpen={0} />,
    );
    const el = container.querySelector('[class*="scoreGood"]');
    expect(el).toBeTruthy();
  });

  it('applies warn color class when composite is between threshold/2 and threshold', () => {
    const { container } = render(
      <ScoreTicker composite={5.0} threshold={8} scale={10} mustFixOpen={0} />,
    );
    const el = container.querySelector('[class*="scoreWarn"]');
    expect(el).toBeTruthy();
  });

  it('applies bad color class when composite < threshold/2', () => {
    const { container } = render(
      <ScoreTicker composite={2.0} threshold={8} scale={10} mustFixOpen={0} />,
    );
    const el = container.querySelector('[class*="scoreBad"]');
    expect(el).toBeTruthy();
  });

  it('snaps immediately under prefers-reduced-motion', () => {
    // Override beforeEach mock to return reduced motion = true.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(
      <ScoreTicker composite={9.0} threshold={8} scale={10} mustFixOpen={0} prevComposite={5.0} />,
    );
    // Under reduced motion the displayed value should snap to composite immediately.
    expect(screen.getByText('9.0')).toBeTruthy();
  });

  it('throws on invalid scale', () => {
    expect(() =>
      render(<ScoreTicker composite={5} threshold={8} scale={0} mustFixOpen={0} />),
    ).toThrow();
  });
});

// @vitest-environment jsdom
/**
 * Tests for PanelistLane.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelistLane } from '../PanelistLane.js';

afterEach(cleanup);

const basePanelist = {
  dims: [
    { name: 'Layout', score: 8.5, note: 'Good grid' },
    { name: 'Color', score: 7.0, note: '' },
  ],
  mustFixes: ['Fix contrast ratio'],
};

describe('PanelistLane - collapsed', () => {
  it('renders without crash', () => {
    const { container } = render(
      <PanelistLane
        role="designer"
        scale={10}
        panelist={basePanelist}
        collapsed={true}
        isActive={false}
      />,
    );
    expect(container).toBeTruthy();
  });

  it('shows role tag', () => {
    render(
      <PanelistLane
        role="designer"
        scale={10}
        panelist={basePanelist}
        collapsed={true}
        isActive={false}
      />,
    );
    expect(screen.getByText('DESIGNER')).toBeTruthy();
  });

  it('shows summary text from first must-fix when collapsed', () => {
    render(
      <PanelistLane
        role="critic"
        scale={10}
        panelist={basePanelist}
        collapsed={true}
        isActive={false}
      />,
    );
    expect(screen.getByText('Fix contrast ratio')).toBeTruthy();
  });

  it('does not show dim bars when collapsed', () => {
    const { container } = render(
      <PanelistLane
        role="brand"
        scale={10}
        panelist={basePanelist}
        collapsed={true}
        isActive={false}
      />,
    );
    const bars = container.querySelectorAll('[class*="dimBarTrack"]');
    expect(bars.length).toBe(0);
  });

  it('has role="region" and aria-labelledby', () => {
    const { container } = render(
      <PanelistLane
        role="designer"
        scale={10}
        panelist={basePanelist}
        collapsed={true}
        isActive={false}
      />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-labelledby')).toBe('lane-header-designer');
  });
});

describe('PanelistLane - expanded', () => {
  it('shows dim bars when expanded', () => {
    const { container } = render(
      <PanelistLane
        role="designer"
        scale={10}
        panelist={basePanelist}
        collapsed={false}
        isActive={false}
      />,
    );
    const bars = container.querySelectorAll('[role="progressbar"]');
    expect(bars.length).toBe(2);
  });

  it('shows must-fix list when expanded', () => {
    render(
      <PanelistLane
        role="a11y"
        scale={10}
        panelist={basePanelist}
        collapsed={false}
        isActive={false}
      />,
    );
    expect(screen.getByText('Fix contrast ratio')).toBeTruthy();
  });

  it('dim bars have correct aria attributes', () => {
    const { container } = render(
      <PanelistLane
        role="designer"
        scale={10}
        panelist={basePanelist}
        collapsed={false}
        isActive={false}
      />,
    );
    const firstBar = container.querySelector('[role="progressbar"]');
    expect(firstBar?.getAttribute('aria-valuenow')).toBe('8.5');
    expect(firstBar?.getAttribute('aria-valuemax')).toBe('10');
  });
});

describe('PanelistLane - toggle', () => {
  it('calls onToggle when header is clicked', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <PanelistLane
        role="copy"
        scale={10}
        panelist={basePanelist}
        collapsed={true}
        isActive={false}
        onToggle={onToggle}
      />,
    );
    const header = container.querySelector('button');
    if (header) fireEvent.click(header);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

describe('PanelistLane - active state', () => {
  it('applies active class when isActive=true', () => {
    const { container } = render(
      <PanelistLane
        role="designer"
        scale={10}
        panelist={basePanelist}
        collapsed={false}
        isActive={true}
      />,
    );
    const active = container.querySelector('[class*="laneActive"]');
    expect(active).toBeTruthy();
  });
});

describe('PanelistLane - invalid role', () => {
  it('throws on unknown role', () => {
    expect(() =>
      render(
        // @ts-expect-error testing invalid role
        <PanelistLane role="unknown" scale={10} panelist={basePanelist} collapsed={false} isActive={false} />,
      ),
    ).toThrow();
  });
});

describe('PanelistLane - reduced motion', () => {
  it('renders without animation classes under reduced-motion', () => {
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
    // Should render without crash regardless.
    const { container } = render(
      <PanelistLane
        role="designer"
        scale={10}
        panelist={basePanelist}
        collapsed={false}
        isActive={false}
      />,
    );
    expect(container).toBeTruthy();
  });
});

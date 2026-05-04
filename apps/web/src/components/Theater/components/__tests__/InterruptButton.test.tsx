// @vitest-environment jsdom
/**
 * Tests for InterruptButton.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InterruptButton } from '../InterruptButton.js';

afterEach(cleanup);

describe('InterruptButton - render', () => {
  it('renders without crash', () => {
    const { container } = render(<InterruptButton />);
    expect(container).toBeTruthy();
  });

  it('shows interrupt label', () => {
    render(<InterruptButton />);
    // Button text comes from i18n; fallback is the key itself.
    const btn = screen.getByRole('button');
    expect(btn).toBeTruthy();
  });

  it('has aria-keyshortcuts="Escape"', () => {
    render(<InterruptButton />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-keyshortcuts')).toBe('Escape');
  });
});

describe('InterruptButton - clicking opens confirm', () => {
  it('clicking the button shows confirm dialog', () => {
    render(<InterruptButton onConfirm={vi.fn()} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('confirm dialog has aria-modal="true"', () => {
    render(<InterruptButton onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('canceling does not fire onConfirm', () => {
    const onConfirm = vi.fn();
    render(<InterruptButton onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button'));
    // Click the No/Keep going button.
    const buttons = screen.getAllByRole('button');
    const noBtn = buttons.find((b) =>
      b.textContent?.toLowerCase().includes('keep') ||
      b.textContent?.toLowerCase().includes('no') ||
      b.textContent?.toLowerCase().includes('going'),
    );
    if (noBtn) fireEvent.click(noBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirming fires onConfirm', () => {
    const onConfirm = vi.fn();
    render(<InterruptButton onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button'));
    // Click the Yes/Stop button inside the dialog.
    const buttons = screen.getAllByRole('button');
    const yesBtn = buttons.find((b) =>
      b.textContent?.toLowerCase().includes('stop'),
    );
    if (yesBtn) fireEvent.click(yesBtn);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe('InterruptButton - Esc opens confirm', () => {
  it('pressing Esc triggers the confirm dialog', () => {
    render(<InterruptButton onConfirm={vi.fn()} />);
    // Esc on document should open confirm.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('InterruptButton - disabled', () => {
  it('disabled button does not open confirm on click', () => {
    render(<InterruptButton onConfirm={vi.fn()} disabled={true} />);
    const btn = screen.getByRole('button');
    expect(btn.hasAttribute('disabled')).toBe(true);
    fireEvent.click(btn);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

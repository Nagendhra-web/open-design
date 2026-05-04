/**
 * ScoreTicker — animated composite score display with threshold indicator
 * and must-fix badge.
 *
 * Animates from prevComposite to composite via requestAnimationFrame with
 * an ease-out easing. Under prefers-reduced-motion the value snaps immediately.
 *
 * Color tiers: bad < threshold/2, warn < threshold, good >= threshold.
 *
 * @see specs/current/critique-theater.md § UI surface (score badge)
 */

import { useEffect, useRef, useState } from 'react';
import { useT } from '../../../i18n/index.js';
import { CT } from '../i18n.js';
import css from './styles.module.css';

export interface ScoreTickerProps {
  composite: number | null;
  threshold: number;
  scale: number;
  prevComposite?: number;
  mustFixOpen: number;
  /** Optional rule-line text shown below the score. */
  ruleLine?: string;
}

/** Ease-out cubic. t in [0,1]. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const ANIM_DURATION_MS = 600;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function scoreColorClass(value: number, threshold: number): string {
  if (value >= threshold) return css.scoreGood ?? '';
  if (value >= threshold / 2) return css.scoreWarn ?? '';
  return css.scoreBad ?? '';
}

export function ScoreTicker({
  composite,
  threshold,
  scale,
  prevComposite,
  mustFixOpen,
  ruleLine,
}: ScoreTickerProps): JSX.Element {
  if (threshold < 0) throw new Error('ScoreTicker: threshold must be >= 0');
  if (scale <= 0) throw new Error('ScoreTicker: scale must be > 0');

  const t = useT();
  const [displayed, setDisplayed] = useState<number | null>(composite);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (composite === null) {
      setDisplayed(null);
      return;
    }

    const from = prevComposite ?? composite;
    const to = composite;

    if (prefersReducedMotion() || from === to) {
      setDisplayed(to);
      return;
    }

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    startTimeRef.current = null;

    function tick(now: number): void {
      if (startTimeRef.current === null) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / ANIM_DURATION_MS, 1);
      const eased = easeOut(progress);
      setDisplayed(from + (to - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayed(to);
        rafRef.current = null;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [composite, prevComposite]);

  const displayValue = displayed !== null ? displayed.toFixed(1) : '--';
  const colorClass = displayed !== null ? scoreColorClass(displayed, threshold) : css.scoreBad;

  const mustFixClean = mustFixOpen === 0;

  return (
    <div className={css.theaterRoot}>
      <div className={css.scoreTicker}>
        <span
          className={`${css.scoreComposite} ${colorClass}`}
          aria-label={`${t(CT.shippedScore)} ${displayValue} / ${scale}`}
        >
          {displayValue}
        </span>
        <span className={css.scoreThresholdLine} aria-hidden="true">
          / {scale}
        </span>
        <span
          className={`${css.mustFixBadge} ${mustFixClean ? css.mustFixBadgeClean : ''}`}
          aria-label={`${mustFixOpen} must-fix open`}
        >
          {mustFixOpen} must-fix
        </span>
      </div>
      {ruleLine !== undefined ? (
        <p className={css.scoreThresholdLine} role="note">
          {ruleLine}
        </p>
      ) : null}
    </div>
  );
}

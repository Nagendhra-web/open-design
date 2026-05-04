/**
 * TheaterCollapsed — score badge displayed above the artifact post-ship.
 *
 * Shows: composite + per-role swatches + round count + duration.
 * Clicking expands the transcript replay sheet via onExpand callback.
 *
 * @see specs/current/critique-theater.md § UI surface (score badge)
 */

import type { PanelistRole } from '@open-design/contracts';
import { useT } from '../../../i18n/index.js';
import { CT } from '../i18n.js';
import css from './styles.module.css';

export interface TheaterCollapsedProps {
  composite: number;
  scale: number;
  threshold: number;
  roundCount: number;
  /** Duration in milliseconds — displayed as seconds. */
  durationMs?: number;
  roleScores: Partial<Record<PanelistRole, number>>;
  onExpand?: () => void;
}

const ROLE_ABBR: Record<PanelistRole, string> = {
  designer: 'D',
  critic: 'C',
  brand: 'B',
  a11y: 'A',
  copy: 'P',
};

export function TheaterCollapsed({
  composite,
  scale,
  threshold,
  roundCount,
  durationMs,
  roleScores,
  onExpand,
}: TheaterCollapsedProps): JSX.Element {
  if (scale <= 0) throw new Error('TheaterCollapsed: scale must be > 0');

  const t = useT();

  const isGood = composite >= threshold;
  const scoreColorClass = isGood ? css.scoreGood : css.scoreWarn;

  const durationLabel =
    durationMs !== undefined ? `${Math.round(durationMs / 1000)}s` : null;

  const roles = Object.keys(roleScores) as PanelistRole[];

  return (
    <button
      type="button"
      className={`${css.theaterRoot} ${css.collapsedBadge}`}
      onClick={onExpand}
      aria-label={`${t(CT.userFacingName)}: ${t(CT.shippedScore)} ${composite.toFixed(1)} / ${scale}. ${t(CT.replayTitle)}`}
    >
      <span className={`${css.collapsedScore} ${scoreColorClass}`}>
        {composite.toFixed(1)}
      </span>
      <span className={css.collapsedMeta} aria-hidden="true">
        / {scale}
      </span>

      {roles.length > 0 ? (
        <span
          className={css.dimDots ?? ''}
          aria-label={t(CT.shippedDimsLegend)}
          style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
        >
          {roles.map((role) => {
            const score = roleScores[role];
            return (
              <span
                key={role}
                className={css.roleSwatch}
                style={{ background: `var(--ink-${role})` } as React.CSSProperties}
                aria-label={`${role} ${score !== undefined ? score.toFixed(1) : '?'}`}
                title={`${role}: ${score !== undefined ? score.toFixed(1) : '?'}`}
              >
                {ROLE_ABBR[role]}
              </span>
            );
          })}
        </span>
      ) : null}

      <span className={css.collapsedMeta}>
        {t(CT.roundLabel, { round: roundCount, total: roundCount })}
      </span>

      {durationLabel !== null ? (
        <span className={css.collapsedMeta} aria-hidden="true">
          {durationLabel}
        </span>
      ) : null}
    </button>
  );
}

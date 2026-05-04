/**
 * RoundDivider — "round N of M" horizontal separator between rounds.
 *
 * Round and totalRounds come from props (no hardcoded MAX_ROUNDS constant).
 *
 * @see specs/current/critique-theater.md § UI surface (theater stage)
 */

import { useT } from '../../../i18n/index.js';
import { CT } from '../i18n.js';
import css from './styles.module.css';

export interface RoundDividerProps {
  round: number;
  totalRounds: number;
}

export function RoundDivider({ round, totalRounds }: RoundDividerProps): JSX.Element {
  if (round < 1) throw new Error(`RoundDivider: round must be >= 1, got ${round}`);
  if (totalRounds < 1) throw new Error(`RoundDivider: totalRounds must be >= 1, got ${totalRounds}`);

  const t = useT();
  const label = t(CT.roundLabel, { round, total: totalRounds });

  return (
    <div className={`${css.theaterRoot} ${css.roundDivider}`} role="separator" aria-label={label}>
      <div className={css.roundDividerLine} aria-hidden="true" />
      <span className={css.roundDividerLabel}>{label}</span>
      <div className={css.roundDividerLine} aria-hidden="true" />
    </div>
  );
}

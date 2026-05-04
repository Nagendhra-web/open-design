/**
 * TheaterDegraded — banner shown when the critique run enters the degraded phase.
 *
 * Displays: reason, adapter, retry button (callback), 24h TTL note.
 * Uses warn ink and dashed border per spec.
 *
 * @see specs/current/critique-theater.md § UI surface (degraded)
 */

import { useT } from '../../../i18n/index.js';
import { CT } from '../i18n.js';
import css from './styles.module.css';

export interface TheaterDegradedProps {
  reason: string;
  adapter: string;
  onRetry?: () => void;
  onSwitchAdapter?: () => void;
  onReadLog?: () => void;
}

export function TheaterDegraded({
  reason,
  adapter,
  onRetry,
  onSwitchAdapter,
  onReadLog,
}: TheaterDegradedProps): JSX.Element {
  const t = useT();

  const adapterLabel = adapter.length > 0 ? adapter : 'unknown';
  const reasonLabel = `${reason} (${adapterLabel})`;

  return (
    <div
      className={`${css.theaterRoot} ${css.degradedRoot}`}
      role="alert"
      aria-live="assertive"
    >
      <h3 className={css.degradedTitle}>{t(CT.degradedTitle)}</h3>
      <p className={css.degradedReason}>{reasonLabel}</p>
      <div className={css.degradedActions}>
        {onRetry !== undefined ? (
          <button type="button" className={css.retryBtn} onClick={onRetry}>
            {t(CT.degradedRetry)}
          </button>
        ) : null}
        {onSwitchAdapter !== undefined ? (
          <button type="button" className={css.retryBtn} onClick={onSwitchAdapter}>
            {t(CT.degradedSwitchAdapter)}
          </button>
        ) : null}
        {onReadLog !== undefined ? (
          <button type="button" className={css.retryBtn} onClick={onReadLog}>
            {t(CT.degradedReadLog)}
          </button>
        ) : null}
        <span className={css.degradedTtl}>24h TTL</span>
      </div>
    </div>
  );
}

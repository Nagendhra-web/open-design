/**
 * PanelistLane — single collapsible panelist lane.
 *
 * Collapsed: header + role tag + name + 1-line summary + score + chevron.
 * Expanded: header + full dim bars (role-keyed color via CSS custom property)
 *   + must-fix list + any free-form dim notes.
 *
 * Color comes exclusively from CSS custom properties keyed by role
 * (var(--ink-${role})). No hex literals in this file.
 *
 * @see specs/current/critique-theater.md § UI surface (panelist lane)
 */

import type { PanelistRole } from '@open-design/contracts';
import { useT } from '../../../i18n/index.js';
import { CT } from '../i18n.js';
import type { PanelistRoundState } from '../state/reducer.js';
import css from './styles.module.css';

export interface PanelistLaneProps {
  role: PanelistRole;
  /** Run-declared scale (10 by default), used to normalize bar widths. */
  scale: number;
  panelist: PanelistRoundState;
  collapsed: boolean;
  /** Currently streaming — shows caret animation. */
  isActive: boolean;
  onToggle?: () => void;
}

const VALID_ROLES: ReadonlySet<PanelistRole> = new Set(['designer', 'critic', 'brand', 'a11y', 'copy']);

/** Map a role to its i18n key. */
function roleKey(role: PanelistRole): (typeof CT)[keyof typeof CT] {
  switch (role) {
    case 'designer': return CT.panelistDesigner;
    case 'critic':   return CT.panelistCritic;
    case 'brand':    return CT.panelistBrand;
    case 'a11y':     return CT.panelistA11y;
    case 'copy':     return CT.panelistCopy;
    default: {
      // Forward-compat: unknown role — use the raw value.
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export function PanelistLane({
  role,
  scale,
  panelist,
  collapsed,
  isActive,
  onToggle,
}: PanelistLaneProps): JSX.Element {
  if (!VALID_ROLES.has(role)) {
    throw new Error(`PanelistLane: unknown role "${String(role)}"`);
  }
  if (scale <= 0) throw new Error('PanelistLane: scale must be > 0');

  const t = useT();
  const roleName = t(roleKey(role));

  // 1-line summary: first must-fix text, or first dim note, or empty.
  const summaryText = (() => {
    const mf = panelist.mustFixes[0];
    if (mf !== undefined) return mf;
    const dn = panelist.dims[0];
    if (dn !== undefined) return dn.note;
    return '';
  })();

  const scoreDisplay = panelist.score !== undefined ? panelist.score.toFixed(1) : '...';

  // CSS custom property for the role ink.
  const roleColor = `var(--ink-${role})`;

  const headerId = `lane-header-${role}`;
  const regionId = `lane-region-${role}`;

  return (
    <div
      className={`${css.theaterRoot} ${css.lane} ${isActive ? css.laneActive : ''}`}
      role="region"
      aria-labelledby={headerId}
      id={regionId}
    >
      <button
        id={headerId}
        type="button"
        className={`${css.laneHeader} ${isActive ? css.caretBlink : ''}`}
        aria-expanded={!collapsed}
        aria-controls={regionId}
        onClick={onToggle}
        style={{ color: roleColor } as React.CSSProperties}
      >
        <span className={css.roleTag} aria-label={`role: ${roleName}`}>
          {role.toUpperCase()}
        </span>
        <span className={css.laneName}>{roleName}</span>
        {collapsed ? (
          <span className={css.laneSummary} aria-hidden="true">
            {summaryText}
          </span>
        ) : null}
        <span className={css.laneScore} style={{ color: roleColor } as React.CSSProperties}>
          {scoreDisplay}
        </span>
        <span className={`${css.chevron} ${collapsed ? '' : css.chevronOpen}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {!collapsed ? (
        <div className={css.laneBody}>
          {panelist.dims.length > 0 ? (
            <div role="list" aria-label={`${roleName} dimension scores`}>
              {panelist.dims.map((dim) => {
                const pct = Math.min(100, Math.max(0, (dim.score / scale) * 100));
                return (
                  <div key={dim.name} className={css.dimRow} role="listitem">
                    <span className={css.dimName} title={dim.name}>
                      {dim.name}
                    </span>
                    <div
                      className={css.dimBarTrack}
                      role="progressbar"
                      aria-valuenow={dim.score}
                      aria-valuemin={0}
                      aria-valuemax={scale}
                      aria-label={`${dim.name} score ${dim.score} of ${scale}`}
                    >
                      <div
                        className={css.dimBarFill}
                        style={{
                          width: `${pct}%`,
                          background: roleColor,
                        } as React.CSSProperties}
                      />
                    </div>
                    <span className={css.dimScore} style={{ color: roleColor } as React.CSSProperties}>
                      {dim.score.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}

          {panelist.dims.map((dim) =>
            dim.note ? (
              <p key={`note-${dim.name}`} className={css.dimNote}>
                {dim.name}: {dim.note}
              </p>
            ) : null,
          )}

          {panelist.mustFixes.length > 0 ? (
            <ul className={css.mustFixList} aria-label={`${roleName} must-fix items`}>
              {panelist.mustFixes.map((text, i) => (
                <li key={i} className={css.mustFixItem}>
                  {text}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

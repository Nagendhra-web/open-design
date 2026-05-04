/**
 * InterruptButton — always-visible danger button that opens a confirm dialog
 * before firing onConfirm.
 *
 * Keyboard: Esc triggers the confirm dialog (listed in aria-keyshortcuts).
 * The confirm dialog itself traps focus between Yes and No buttons.
 *
 * @see specs/current/critique-theater.md § UI surface (interrupt)
 */

import { useEffect, useRef, useState } from 'react';
import { useT } from '../../../i18n/index.js';
import { CT } from '../i18n.js';
import css from './styles.module.css';

export interface InterruptButtonProps {
  onConfirm?: () => void;
  disabled?: boolean;
}

export function InterruptButton({ onConfirm, disabled = false }: InterruptButtonProps): JSX.Element {
  const t = useT();
  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const noRef = useRef<HTMLButtonElement | null>(null);
  const yesRef = useRef<HTMLButtonElement | null>(null);

  // Esc on the page (not inside dialog) opens the confirm dialog.
  useEffect(() => {
    if (showConfirm) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !disabled) {
        e.preventDefault();
        setShowConfirm(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showConfirm, disabled]);

  // Focus the No button when dialog opens (safer default).
  useEffect(() => {
    if (showConfirm) {
      noRef.current?.focus();
    }
  }, [showConfirm]);

  // Trap focus inside dialog; Esc inside dialog closes it.
  useEffect(() => {
    if (!showConfirm) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setShowConfirm(false);
      }
      if (e.key === 'Tab') {
        const focusable = [noRef.current, yesRef.current].filter(Boolean) as HTMLButtonElement[];
        if (focusable.length < 2) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showConfirm]);

  function handleConfirm(): void {
    setPending(true);
    setShowConfirm(false);
    onConfirm?.();
  }

  const label = pending ? t(CT.interrupting) : t(CT.interrupt);

  return (
    <>
      <button
        type="button"
        className={css.interruptBtn}
        disabled={disabled || pending}
        aria-keyshortcuts="Escape"
        aria-label={label}
        onClick={() => setShowConfirm(true)}
      >
        {label}
      </button>

      {showConfirm ? (
        <div
          className={css.confirmOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="interrupt-confirm-title"
          aria-describedby="interrupt-confirm-body"
        >
          <div className={css.confirmDialog}>
            <h2 id="interrupt-confirm-title" className={css.confirmTitle}>
              {t(CT.interruptConfirmTitle)}
            </h2>
            <p id="interrupt-confirm-body" className={css.confirmBody}>
              {t(CT.interruptConfirmBody)}
            </p>
            <div className={css.confirmActions}>
              <button
                ref={noRef}
                type="button"
                className={css.confirmNo}
                onClick={() => setShowConfirm(false)}
              >
                {t(CT.interruptConfirmNo)}
              </button>
              <button
                ref={yesRef}
                type="button"
                className={css.confirmYes}
                onClick={handleConfirm}
              >
                {t(CT.interruptConfirmYes)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

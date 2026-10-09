'use client';
import { KeyboardEvent, ReactNode, useEffect, useId, useRef } from 'react';

type Props = {
  title: string;
  /** Texto que explica o que vai acontecer. */
  children: ReactNode;
  confirmLabel: string;
  /** Rótulo do botão de confirmar enquanto a ação está em andamento. */
  pendingLabel?: string;
  cancelLabel?: string;
  /** Ação destrutiva: o botão de confirmar usa o estilo de perigo. */
  danger?: boolean;
  pending?: boolean;
  /** Mantém o botão de confirmar desabilitado (ex.: campo obrigatório do conteúdo ainda vazio). */
  confirmDisabled?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select, textarea';

/**
 * Modal de confirmação do painel. Renderize só enquanto estiver aberto: ao montar, o foco vai
 * para "Cancelar"; Tab fica preso dentro do modal; Esc (ou clique fora) cancela; ao desmontar,
 * o foco volta para o elemento que abriu o modal.
 */
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  pendingLabel = 'Aguarde…',
  cancelLabel = 'Cancelar',
  danger = false,
  pending = false,
  confirmDisabled = false,
  error = '',
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (origin?.isConnected) origin.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!pending) onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="confirm-dialog-backdrop"
      onKeyDown={onKeyDown}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="confirm-dialog-title">
          {title}
        </h2>
        <div id={bodyId} className="confirm-dialog-body">
          {children}
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="confirm-dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="secondary-button"
            onClick={onCancel}
            disabled={pending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'danger-button' : 'secondary-button'}
            onClick={onConfirm}
            disabled={pending || confirmDisabled}
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// src/components/ui/Modal.tsx
//
// The shared foundation for every dialog in the app.
//
// Thirteen modals each carried their own overlay markup. None trapped the
// keyboard focus, none returned it when closing, none declared a role, none
// locked the background from scrolling, and only two listened for Escape —
// so a keyboard user could tab out of a dialog and into a page they could
// not see (REVIEW-BACKLOG.md F5, G1).

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../lib/I18nContext";
import Icon, { type IconName } from "./Icon";

/** Elements that can hold focus, in the order the browser visits them. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Rendered as the dialog's heading and announced as its accessible name. */
  title: React.ReactNode;
  /** Optional line under the title. */
  description?: React.ReactNode;
  /** Icon shown above the title; decorative, so it stays hidden. */
  icon?: IconName;
  children?: React.ReactNode;
  /** Buttons for the footer. Omit for a dialog the caller lays out itself. */
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /**
   * Whether clicking the backdrop closes the dialog. Off for anything
   * destructive, where a stray click should not decide the matter.
   */
  closeOnBackdrop?: boolean;
}

const SIZES: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

let openCount = 0;

export default function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 9)}`);

  // Remember what had focus, move it into the dialog, and hand it back on
  // close — otherwise the user lands at the top of the document.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // Lock background scrolling. Counted, because a dialog may open on top of
  // another one and the inner one must not unlock the page when it closes.
  useEffect(() => {
    if (!open) return;
    openCount++;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      openCount--;
      if (openCount === 0) document.body.style.overflow = previous;
    };
  }, [open]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      // Wrap around, so Tab never leaves the dialog for the page behind it.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        // mousedown rather than click: a drag that starts inside the panel
        // and ends on the backdrop should not count as clicking outside.
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`w-full ${SIZES[size]} max-h-[90vh] overflow-y-auto rounded-lg border border-line bg-surface p-6 shadow-lg outline-none`}
      >
        <div className="mb-5 text-center">
          {icon && (
            <div className="mb-3 flex justify-center text-accent">
              <Icon name={icon} size={40} />
            </div>
          )}
          <h2 id={titleId.current} className="text-lg font-bold text-primary">
            {title}
          </h2>
          {description && <p className="mt-2 text-sm text-secondary">{description}</p>}
        </div>

        {children}

        {footer && <div className="mt-6 flex gap-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Cancel button with the shared look; pairs with `ModalConfirmButton`. */
export function ModalCancelButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-1 rounded-md border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-secondary transition-all hover:opacity-80 disabled:opacity-50"
    >
      {children ?? t.common_cancel}
    </button>
  );
}

/** Confirm button; `tone` picks the token set. */
export function ModalConfirmButton({
  onClick,
  disabled,
  pending,
  tone = "accent",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  tone?: "accent" | "danger" | "warning" | "phase";
  children: React.ReactNode;
}) {
  const { t } = useT();
  const tones: Record<string, string> = {
    accent: "bg-accent text-accent-fg hover:bg-accent-hover",
    danger: "bg-danger text-danger-fg hover:opacity-90",
    warning: "bg-warning text-warning-fg hover:opacity-90",
    phase: "bg-phase text-phase-fg hover:bg-phase-hover",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-60 ${tones[tone]}`}
    >
      {pending ? (
        <>
          <Icon name="hourglass" /> {t.common_loading}
        </>
      ) : (
        children
      )}
    </button>
  );
}

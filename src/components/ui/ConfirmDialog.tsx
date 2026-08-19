// src/components/ui/ConfirmDialog.tsx
//
// One confirmation dialog for the cases that do not warrant a component of
// their own.
//
// The app had three ways of asking: styled modals, the browser's native
// confirm() and alert(), and Tauri's ask(). They look different, behave
// differently, and the native ones ignore the theme entirely
// (REVIEW-BACKLOG.md F4).

import { useState } from "react";
import { useT } from "../../lib/I18nContext";
import Modal, { ModalCancelButton, ModalConfirmButton } from "./Modal";
import type { IconName } from "./Icon";

export interface ConfirmRequest {
  title: string;
  message?: string;
  icon?: IconName;
  /** Picks the tone of the confirm button. */
  tone?: "accent" | "danger" | "warning";
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * When set, the user has to type this word before confirming. For the
   * few actions that destroy data outright.
   */
  requireWord?: string;
}

/**
 * Renders the dialog and returns an `ask` function that resolves to the
 * user's answer:
 *
 *   const [dialog, ask] = useConfirm();
 *   ...
 *   if (!(await ask({ title: "Delete?", tone: "danger" }))) return;
 *   ...
 *   return <>{dialog}</>;
 */
export function useConfirm(): [React.ReactNode, (request: ConfirmRequest) => Promise<boolean>] {
  const { t } = useT();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [typed, setTyped] = useState("");
  const [resolver, setResolver] = useState<((answer: boolean) => void) | null>(null);

  const ask = (next: ConfirmRequest) =>
    new Promise<boolean>((resolve) => {
      setTyped("");
      setRequest(next);
      // Stored in a function wrapper: setState would otherwise call it.
      setResolver(() => resolve);
    });

  const settle = (answer: boolean) => {
    resolver?.(answer);
    setResolver(null);
    setRequest(null);
  };

  const wordMissing = !!request?.requireWord && typed.trim() !== request.requireWord;

  const dialog = (
    <Modal
      open={request !== null}
      onClose={() => settle(false)}
      icon={request?.icon}
      title={request?.title ?? ""}
      description={request?.message}
      closeOnBackdrop={request?.tone !== "danger"}
      footer={
        <>
          <ModalCancelButton onClick={() => settle(false)}>
            {request?.cancelLabel}
          </ModalCancelButton>
          <ModalConfirmButton
            onClick={() => settle(true)}
            disabled={wordMissing}
            tone={request?.tone ?? "accent"}
          >
            {request?.confirmLabel ?? t.common_confirm}
          </ModalConfirmButton>
        </>
      }
    >
      {request?.requireWord && (
        <label className="block text-center text-sm">
          <span className="text-secondary">{request.requireWord}</span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-2 w-full rounded-md border border-line-strong bg-surface-input px-3 py-2 text-center font-mono text-primary outline-none focus:border-accent"
            aria-label={request.requireWord}
          />
        </label>
      )}
    </Modal>
  );

  return [dialog, ask];
}

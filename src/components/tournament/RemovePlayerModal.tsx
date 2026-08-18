import type { Player } from "../../lib/types";
import { playerDisplayName } from "../../lib/types";
import { useT } from "../../lib/I18nContext";
import { useAsyncAction } from "../../lib/useAsyncAction";
import Modal, { ModalCancelButton, ModalConfirmButton } from "../ui/Modal";

interface RemovePlayerModalProps {
  target: Player | null;
  onClose: () => void;
  onConfirm: (playerId: number) => void | Promise<void>;
}

/**
 * Confirm modal for removing a player from a tournament (draft status).
 * Used instead of a plain onClick to prevent accidental removals.
 */
export default function RemovePlayerModal({
  target,
  onClose,
  onConfirm,
}: RemovePlayerModalProps) {
  const { t } = useT();
  const [doConfirm, pending] = useAsyncAction(async (playerId: number) => {
    await onConfirm(playerId);
    onClose();
  });

  const displayName = target ? playerDisplayName(target) : "";

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      icon="⚠️"
      title={t.management_remove_confirm_title}
      closeOnBackdrop={false}
      footer={
        <>
          <ModalCancelButton onClick={onClose} disabled={pending} />
          <ModalConfirmButton
            onClick={() => target && doConfirm(target.id)}
            pending={pending}
            tone="danger"
          >
            {t.management_remove_confirm_action}
          </ModalConfirmButton>
        </>
      }
    >
      <div className="text-center">
        <p className="text-sm text-secondary">
          {t.management_remove_confirm_message.replace("{name}", "").trim()}{" "}
          <span className="font-semibold text-primary">{displayName}</span>
        </p>
        <p className="mt-2 text-xs text-muted">{t.management_remove_confirm_hint}</p>
      </div>
    </Modal>
  );
}

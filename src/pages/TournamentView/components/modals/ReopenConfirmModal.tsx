// src/pages/TournamentView/components/modals/ReopenConfirmModal.tsx
//
// Simple yes/no confirm before re-activating a completed/archived
// tournament. Status flips back to "active" so the TD can edit results,
// add rounds, etc. Cosmetic safety prompt — no destructive side effects.

import { useT } from "../../../../lib/I18nContext";
import Modal, { ModalCancelButton, ModalConfirmButton } from "../../../../components/ui/Modal";

export default function ReopenConfirmModal({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();

  return (
    <Modal
      open={open}
      onClose={onCancel}
      icon="unlock"
      title={t.tournament_view_reopen}
      description={t.tournament_view_reopen_confirm}
      size="sm"
      footer={
        <>
          <ModalCancelButton onClick={onCancel} />
          <ModalConfirmButton onClick={onConfirm}>
            {t.tournament_view_reopen}
          </ModalConfirmButton>
        </>
      }
    />
  );
}

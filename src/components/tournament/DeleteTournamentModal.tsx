import type { Tournament } from "../../lib/types";
import { useT } from "../../lib/I18nContext";
import { useAsyncAction } from "../../lib/useAsyncAction";
import Modal, { ModalCancelButton, ModalConfirmButton } from "../ui/Modal";

interface DeleteTournamentModalProps {
  tournament: Tournament;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function DeleteTournamentModal({
  tournament,
  onClose,
  onConfirm,
}: DeleteTournamentModalProps) {
  const { t } = useT();
  const [doConfirm, deleting] = useAsyncAction(onConfirm);

  return (
    <Modal
      open
      onClose={onClose}
      icon="trash"
      title={t.delete_tournament_title}
      closeOnBackdrop={false}
      footer={
        <>
          <ModalCancelButton onClick={onClose} disabled={deleting} />
          <ModalConfirmButton onClick={doConfirm} pending={deleting} tone="danger">
            {t.common_delete_permanently}
          </ModalConfirmButton>
        </>
      }
    >
      <div className="text-center">
        <p className="text-sm text-secondary">
          <span className="font-semibold text-primary">{tournament.name}</span>{" "}
          {t.delete_tournament_message.replace("{name}", "").trim()}
        </p>
        <p className="mt-2 text-xs text-muted">{t.delete_tournament_details}</p>
      </div>
    </Modal>
  );
}

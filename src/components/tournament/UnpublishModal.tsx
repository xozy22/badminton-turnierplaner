import { useT } from "../../lib/I18nContext";
import { useAsyncAction } from "../../lib/useAsyncAction";
import Modal, { ModalCancelButton, ModalConfirmButton } from "../ui/Modal";

interface UnpublishModalProps {
  open: boolean;
  tournamentName: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

/**
 * Confirm modal for stopping live publishing of a tournament. Sends a
 * delete-request to the configured WP endpoint so the public website
 * stops showing this tournament. Local data is untouched.
 */
export default function UnpublishModal({
  open,
  tournamentName,
  onClose,
  onConfirm,
}: UnpublishModalProps) {
  const { t } = useT();
  const [doConfirm, pending] = useAsyncAction(async () => {
    await onConfirm();
    onClose();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="radio"
      title={t.tournament_unpublish}
      description={t.tournament_unpublish_confirm}
      closeOnBackdrop={false}
      footer={
        <>
          <ModalCancelButton onClick={onClose} disabled={pending} />
          <ModalConfirmButton onClick={() => doConfirm()} pending={pending} tone="danger">
            {t.tournament_unpublish}
          </ModalConfirmButton>
        </>
      }
    >
      {tournamentName && (
        <p className="text-center text-sm font-semibold text-primary">{tournamentName}</p>
      )}
    </Modal>
  );
}

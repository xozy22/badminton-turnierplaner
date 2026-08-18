import type { Player } from "../../lib/types";
import Icon from "../../components/ui/Icon";
import { playerDisplayName } from "../../lib/types";
import { useT } from "../../lib/I18nContext";
import Modal, { ModalCancelButton, ModalConfirmButton } from "../ui/Modal";

interface RetirePlayerModalProps {
  retireTarget: { player: Player; partnerNote: string } | null;
  onClose: () => void;
  onConfirm: (playerId: number) => Promise<void>;
}

export default function RetirePlayerModal({
  retireTarget,
  onClose,
  onConfirm,
}: RetirePlayerModalProps) {
  const { t } = useT();

  return (
    <Modal
      open={retireTarget !== null}
      onClose={onClose}
      icon="🏥"
      title={t.retire_title}
      closeOnBackdrop={false}
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalConfirmButton
            onClick={() => {
              if (retireTarget) onConfirm(retireTarget.player.id);
              onClose();
            }}
            tone="danger"
          >
            <Icon name="medical" /> {t.retire_confirm}
          </ModalConfirmButton>
        </>
      }
    >
      {retireTarget && (
        <div className="text-center">
          <p className="text-sm text-secondary">
            <span className="font-semibold text-primary">
              {playerDisplayName(retireTarget.player)}
            </span>{" "}
            {t.retire_message.replace("{name}", "").trim()}
          </p>
          <p className="mt-2 text-xs text-muted">{t.retire_details}</p>
          {retireTarget.partnerNote && (
            <p className="mt-2 text-xs font-medium text-warning-text">
              <Icon name="alert" /> {retireTarget.partnerNote}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

// src/pages/TournamentView/components/modals/RestWarningModal.tsx
//
// Rendered when the TD tries to assign a match to a court but at least
// one player hasn't rested long enough since their last completed match
// (tournament.min_rest_minutes). Soft warning with bypass — user can
// click "Trotzdem zuweisen" to override; that's expected for tight
// schedules where the TD knows what they're doing.

import { useT } from "../../../../lib/I18nContext";
import Modal, { ModalCancelButton, ModalConfirmButton } from "../../../../components/ui/Modal";

export interface RestWarning {
  matchId: number;
  court: number;
  players: { id: number; name: string; minutesLeft: number }[];
}

export default function RestWarningModal({
  warning,
  onCancel,
  onConfirm,
}: {
  warning: RestWarning | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();

  return (
    <Modal
      open={warning !== null}
      onClose={onCancel}
      icon="⏱️"
      title={t.rest_warning_title}
      description={t.rest_warning_body}
      footer={
        <>
          <ModalCancelButton onClick={onCancel}>{t.rest_warning_cancel}</ModalCancelButton>
          <ModalConfirmButton onClick={onConfirm} tone="warning">
            {t.rest_warning_confirm}
          </ModalConfirmButton>
        </>
      }
    >
      <ul className="space-y-1.5 pl-1">
        {warning?.players.map((p) => (
          <li key={p.id} className="flex items-start gap-2 text-sm text-primary">
            <span className="text-warning-text">•</span>
            <span>
              {t.rest_warning_player_row
                .replace("{player}", p.name)
                .replace("{minutes}", String(p.minutesLeft))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

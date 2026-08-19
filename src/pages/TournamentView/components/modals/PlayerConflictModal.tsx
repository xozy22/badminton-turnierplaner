// src/pages/TournamentView/components/modals/PlayerConflictModal.tsx
//
// HARD-block dialog when the TD tries to assign a match while at least
// one of its players is currently active on another court. No bypass —
// two simultaneous matches with the same player physically can't both
// finish, so the conflict must be resolved (other match completes or
// gets unassigned) before the assignment is allowed.

import { useT } from "../../../../lib/I18nContext";
import Modal, { ModalConfirmButton } from "../../../../components/ui/Modal";

export interface PlayerConflict {
  matchId: number;
  players: { id: number; name: string; court: number }[];
}

export default function PlayerConflictModal({
  conflict,
  onClose,
}: {
  conflict: PlayerConflict | null;
  onClose: () => void;
}) {
  const { t } = useT();

  return (
    <Modal
      open={conflict !== null}
      onClose={onClose}
      icon="ban"
      title={t.player_conflict_title}
      description={t.player_conflict_body}
      footer={
        <ModalConfirmButton onClick={onClose} tone="danger">
          {t.common_close}
        </ModalConfirmButton>
      }
    >
      <ul className="space-y-1.5 pl-1">
        {conflict?.players.map((p) => (
          <li key={p.id} className="flex items-start gap-2 text-sm text-primary">
            <span className="text-danger-text" aria-hidden="true">
              •
            </span>
            <span>
              {t.player_conflict_row
                .replace("{player}", p.name)
                .replace("{court}", String(p.court))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

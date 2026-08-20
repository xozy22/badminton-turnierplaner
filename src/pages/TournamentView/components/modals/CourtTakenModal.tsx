// src/pages/TournamentView/components/modals/CourtTakenModal.tsx
//
// Refuses an assignment onto a court that is already in use.
//
// The dropdown disables occupied courts, but drag and drop went through:
// CourtOverview builds its occupancy from this tournament's match list, so
// a court held by a sibling tournament in the same session looked free.
// Two matches on one court is the mistake players notice from the hall.

import { useT } from "../../../../lib/I18nContext";
import { fill } from "../../../../lib/i18n/format";
import Modal, { ModalConfirmButton } from "../../../../components/ui/Modal";
import type { CourtTaken } from "../../lib/useTournamentDialogs";

export default function CourtTakenModal({
  taken,
  onClose,
}: {
  taken: CourtTaken | null;
  onClose: () => void;
}) {
  const { t } = useT();

  return (
    <Modal
      open={taken !== null}
      onClose={onClose}
      icon="ban"
      title={t.court_taken_title}
      description={
        taken
          ? taken.byTournament
            ? fill(t.court_taken_by_other_tournament, {
                court: String(taken.court),
                tournament: taken.byTournament,
              })
            : fill(t.court_taken_body, { court: String(taken.court) })
          : undefined
      }
      footer={
        <ModalConfirmButton onClick={onClose} tone="danger">
          {t.common_close}
        </ModalConfirmButton>
      }
    />
  );
}

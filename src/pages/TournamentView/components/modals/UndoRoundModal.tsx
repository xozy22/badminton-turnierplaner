// src/pages/TournamentView/components/modals/UndoRoundModal.tsx
//
// Rich-preview confirm dialog for the "Letzte Runde rückgängig" action.
// Shows exactly what will be deleted (round label, match count, completed
// count, set entries, matches still on courts) before the user commits.
// The confirm button switches from the warning tone to the danger tone
// when result data is about to be lost, raising the stakes visibly.
//
// The actual undo target is computed in TournamentView via getUndoTarget;
// this modal is purely presentational over that pre-built data.

import type { Round, TournamentPhase } from "../../../../lib/types";
import Icon from "../../../../components/ui/Icon";
import { useT } from "../../../../lib/I18nContext";
import Modal, { ModalCancelButton, ModalConfirmButton } from "../../../../components/ui/Modal";

export interface UndoTarget {
  rounds: Round[];
  label: string;
  matchCount: number;
  completedCount: number;
  activeOnCourtCount: number;
  setCount: number;
  resetStatusToDraft: boolean;
  isGroupKoBackToGroup: boolean;
  postUndoPhase?: TournamentPhase | null;
}

export default function UndoRoundModal({
  open,
  target,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  target: UndoTarget | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();

  const dangerous = !!target && (target.completedCount > 0 || target.activeOnCourtCount > 0);
  const phaseHint = target?.resetStatusToDraft
    ? t.tournament_view_undo_phase_to_draft
    : target?.isGroupKoBackToGroup
    ? t.tournament_view_undo_phase_to_group
    : null;

  return (
    <Modal
      open={open && target !== null}
      onClose={onCancel}
      icon="undo"
      title={t.tournament_view_undo_round_title}
      description={t.tournament_view_undo_target_label}
      closeOnBackdrop={!dangerous}
      footer={
        <>
          <ModalCancelButton onClick={onCancel} />
          <ModalConfirmButton onClick={onConfirm} tone={dangerous ? "danger" : "warning"}>
            {t.tournament_view_undo_confirm}
          </ModalConfirmButton>
        </>
      }
    >
      {target && (
        <>
          <div
            className={`rounded-md border-2 p-4 ${
              dangerous ? "border-warning bg-warning-subtle/50" : "border-line bg-surface"
            }`}
          >
            <div className="mb-2 font-semibold text-primary">{target.label}</div>
            <ul className="space-y-1 text-sm text-secondary">
              <li>• {t.tournament_view_undo_match_count.replace("{n}", String(target.matchCount))}</li>
              {target.completedCount > 0 && (
                <li className="font-medium text-warning-text">
                  • {t.tournament_view_undo_completed_count.replace("{n}", String(target.completedCount))}{" "}
                  <Icon name="alert" />
                </li>
              )}
              {target.setCount > 0 && (
                <li>• {t.tournament_view_undo_set_count.replace("{n}", String(target.setCount))}</li>
              )}
              {target.activeOnCourtCount > 0 && (
                <li className="font-medium text-warning-text">
                  • {t.tournament_view_undo_active_count.replace("{n}", String(target.activeOnCourtCount))}{" "}
                  <Icon name="alert" />
                </li>
              )}
            </ul>
          </div>

          {phaseHint && (
            <p className="mt-4 flex items-start gap-1.5 text-xs text-muted">
              <Icon name="alert" />
              <span>{phaseHint}</span>
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

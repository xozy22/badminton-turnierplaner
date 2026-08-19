// src/pages/TournamentView/components/TournamentModals.tsx
//
// Every dialog the tournament view can open, in one place.
//
// They used to sit at the bottom of index.tsx, a long way from the buttons
// that open them — which is how the confirmation in the settings nearly got
// lost during its own extraction (REVIEW-BACKLOG.md D5). Collecting the
// flags in one object is what made this extractable: as loose values the
// block needed about forty props (REVIEW-BACKLOG.md D1).

import PrintDialog from "../../../components/print/PrintDialog";
import EditTournamentModal from "./modals/EditTournamentModal";
import TemplateExportModal from "../../../components/tournament/TemplateExportModal";
import AttendanceCheckModal from "../../../components/tournament/AttendanceCheckModal";
import RetirePlayerModal from "../../../components/tournament/RetirePlayerModal";
import RemovePlayerModal from "../../../components/tournament/RemovePlayerModal";
import StartKoModal from "./modals/StartKoModal";
import ReopenConfirmModal from "./modals/ReopenConfirmModal";
import UnpublishModal from "../../../components/tournament/UnpublishModal";
import UndoRoundModal from "./modals/UndoRoundModal";
import RestWarningModal from "./modals/RestWarningModal";
import PlayerConflictModal from "./modals/PlayerConflictModal";
import CourtTakenModal from "./modals/CourtTakenModal";
import DeleteTournamentModal from "../../../components/tournament/DeleteTournamentModal";
import {
  deleteTournament,
  updateTournament,
  updateTournamentKoScoring,
} from "../../../lib/db";
import type { TournamentDialogs } from "../lib/useTournamentDialogs";
import type { UndoTarget } from "./modals/UndoRoundModal";
import type {
  Tournament,
  Player,
  Round,
  Match,
  GameSet,
  StandingEntry,
} from "../../../lib/types";
import type { ThemeColors } from "../../../lib/theme";

interface Props {
  dialogs: TournamentDialogs;
  tournament: Tournament;
  players: Player[];
  rounds: Round[];
  matchesByRound: Map<number, Match[]>;
  setsByMatch: Map<number, GameSet[]>;
  standings: StandingEntry[];
  activeRound: number | null;
  theme: ThemeColors;
  undoTarget: UndoTarget | null;
  onLoadAll: () => void | Promise<void>;
  onAdvanceFormat: () => void | Promise<void>;
  onCourtChange: (matchId: number, court: number | null, bypassRest?: boolean) => void;
  onRemovePlayerConfirm: (playerId: number) => Promise<void>;
  onPlayerRetire: (playerId: number) => Promise<void>;
  onAttendanceConfirm: (presentIds: Set<number>) => void;
  onReopenTournament: () => void | Promise<void>;
  onUnpublish: () => void | Promise<void>;
  onPerformUndo: () => void | Promise<void>;
  onNavigate: (to: string) => void;
  /** The shared confirm dialog element, rendered alongside. */
  confirmDialog: React.ReactNode;
}

export default function TournamentModals(props: Props) {
  const {
    dialogs,
    tournament,
    players,
    rounds,
    matchesByRound,
    setsByMatch,
    standings,
    activeRound,
    theme,
    undoTarget,
    onLoadAll,
    onAdvanceFormat,
    onCourtChange,
    onRemovePlayerConfirm,
    onPlayerRetire,
    onAttendanceConfirm,
    onReopenTournament,
    onUnpublish,
    onPerformUndo,
    onNavigate,
    confirmDialog,
  } = props;
  const {
    showPrint,
    setShowPrint,
    showEditModal,
    setShowEditModal,
    showDeleteConfirm,
    setShowDeleteConfirm,
    showTemplateExport,
    setShowTemplateExport,
    showAttendance,
    setShowAttendance,
    showStartKoModal,
    setShowStartKoModal,
    showReopenConfirm,
    setShowReopenConfirm,
    showUnpublishConfirm,
    setShowUnpublishConfirm,
    showUndoRound,
    setShowUndoRound,
    retireTarget,
    setRetireTarget,
    removeTarget,
    setRemoveTarget,
    restWarning,
    setRestWarning,
    playerConflict,
    setPlayerConflict,
  } = dialogs;
  return (
    <>
  {/* Print Dialog */}
  {showPrint && (
    <PrintDialog
      tournament={tournament}
      players={players}
      rounds={rounds}
      matchesByRound={matchesByRound}
      setsByMatch={setsByMatch}
      standings={standings}
      activeRoundId={activeRound}
      onClose={() => setShowPrint(false)}
    />
  )}

  {/* Edit Tournament Modal */}
  {showEditModal && tournament && (
    <EditTournamentModal
      tournament={tournament}
      theme={theme}
      onClose={() => setShowEditModal(false)}
      onSave={async (data) => {
        await updateTournament(
          tournament.id,
          data.name,
          data.mode,
          data.format,
          data.setsToWin,
          data.pointsPerSet,
          data.courts,
          data.numGroups,
          data.qualifyPerGroup,
          data.entryFeeSingle,
          data.entryFeeDouble,
          data.cap
        );
        setShowEditModal(false);
        onLoadAll();
      }}
    />
  )}

  {/* Delete Confirmation Modal */}
  {showDeleteConfirm && tournament && (
    <DeleteTournamentModal
      tournament={tournament}
      onClose={() => setShowDeleteConfirm(false)}
      onConfirm={async () => {
        await deleteTournament(tournament.id);
        onNavigate("/");
      }}
    />
  )}

  {/* Template Export Modal */}
  {showTemplateExport && tournament && (
    <TemplateExportModal
      tournament={tournament}
      players={players}
      theme={theme}
      onClose={() => setShowTemplateExport(false)}
    />
  )}

  {/* Attendance Check Modal */}
  {showAttendance && (
    <AttendanceCheckModal
      players={players}
      theme={theme}
      onConfirm={onAttendanceConfirm}
      onClose={() => setShowAttendance(false)}
    />
  )}

  {/* Retire/Injured Modal */}
  {retireTarget && (
    <RetirePlayerModal
      retireTarget={retireTarget}
      onClose={() => setRetireTarget(null)}
      onConfirm={onPlayerRetire}
    />
  )}

  {/* Remove-Player Confirm Modal (draft status only) */}
  {removeTarget && (
    <RemovePlayerModal
      target={removeTarget}
      onClose={() => setRemoveTarget(null)}
      onConfirm={onRemovePlayerConfirm}
    />
  )}

  {confirmDialog}

  <RestWarningModal
    warning={restWarning}
    onCancel={() => setRestWarning(null)}
    onConfirm={async () => {
      const w = restWarning;
      if (!w) return;
      setRestWarning(null);
      await onCourtChange(w.matchId, w.court, true);
    }}
  />

  <CourtTakenModal
    taken={dialogs.courtTaken}
    onClose={() => dialogs.setCourtTaken(null)}
  />

  <PlayerConflictModal
    conflict={playerConflict}
    onClose={() => setPlayerConflict(null)}
  />

  {/* Start KO Modal */}
  {showStartKoModal && tournament && (
    <StartKoModal
      tournament={tournament}
      theme={theme}
      onClose={() => setShowStartKoModal(false)}
      onConfirm={async (koPointsPerSet, koSetsToWin, koCap) => {
        await updateTournamentKoScoring(tournament.id, koPointsPerSet, koSetsToWin, koCap);
        await onLoadAll();
        setShowStartKoModal(false);
        await onAdvanceFormat();
      }}
    />
  )}

  <ReopenConfirmModal
    open={showReopenConfirm}
    onCancel={() => setShowReopenConfirm(false)}
    onConfirm={onReopenTournament}
  />

  <UnpublishModal
    open={showUnpublishConfirm}
    tournamentName={tournament.name}
    onClose={() => setShowUnpublishConfirm(false)}
    onConfirm={onUnpublish}
  />


  <UndoRoundModal
    open={showUndoRound}
    target={undoTarget}
    onCancel={() => setShowUndoRound(false)}
    onConfirm={onPerformUndo}
  />

    </>
  );
}

// src/pages/TournamentView/lib/useTournamentDialogs.ts
//
// Which dialog is open, in one object.
//
// Fourteen booleans and targets, scattered through index.tsx wherever the
// button that opens them happened to sit. Collecting them is what makes
// the dialog block extractable at all: as loose values it needed some
// forty props, as one object it needs a handful (REVIEW-BACKLOG.md D1).

import { useState } from "react";
import type { Player } from "../../../lib/types";
import type { DrawPreview } from "../components/modals/DrawPreviewModal";

/** The rest-time warning, which offers a bypass. */
export interface RestWarning {
  matchId: number;
  court: number;
  players: { id: number; name: string; minutesLeft: number }[];
}

/**
 * The hard player-overlap block: opens when a match is assigned whose
 * players are still on another court. No bypass — only "close".
 */
export interface PlayerConflict {
  matchId: number;
  players: { id: number; name: string; court: number }[];
}

/**
 * A court that is already taken. Shown instead of assigning: the dropdown
 * disables occupied courts, but drag and drop could still land on one held
 * by a sibling tournament in the same session.
 */
export interface CourtTaken {
  matchId: number;
  court: number;
  /** Set when another tournament in the session holds it. */
  byTournament: string | null;
}

/**
 * A match being closed without a result: retirement, no-show, the pair
 * that never turned up. The dialog asks which of them applies and, for
 * everything but "no match", which side is credited with the win
 * (FEATURE-BACKLOG.md D1).
 */
export interface OutcomeTarget {
  matchId: number;
  team1: string;
  team2: string;
}

export interface RetireTarget {
  player: Player;
  partnerNote: string;
}

export function useTournamentDialogs() {
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTemplateExport, setShowTemplateExport] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [showStartKoModal, setShowStartKoModal] = useState(false);
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
  const [showUndoRound, setShowUndoRound] = useState(false);
  const [retireTarget, setRetireTarget] = useState<RetireTarget | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Player | null>(null);
  const [restWarning, setRestWarning] = useState<RestWarning | null>(null);
  const [playerConflict, setPlayerConflict] = useState<PlayerConflict | null>(null);
  const [courtTaken, setCourtTaken] = useState<CourtTaken | null>(null);
  const [outcomeTarget, setOutcomeTarget] = useState<OutcomeTarget | null>(null);
  const [drawPreview, setDrawPreview] = useState<DrawPreview | null>(null);

  return {
    showAddPlayer,
    setShowAddPlayer,
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
    courtTaken,
    setCourtTaken,
    outcomeTarget,
    setOutcomeTarget,
    drawPreview,
    setDrawPreview,
  };
}

export type TournamentDialogs = ReturnType<typeof useTournamentDialogs>;

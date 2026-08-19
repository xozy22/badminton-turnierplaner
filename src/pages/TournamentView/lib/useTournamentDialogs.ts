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
  };
}

export type TournamentDialogs = ReturnType<typeof useTournamentDialogs>;

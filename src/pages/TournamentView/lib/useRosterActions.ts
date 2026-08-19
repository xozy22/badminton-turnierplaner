// src/pages/TournamentView/lib/useRosterActions.ts
//
// Who is in the tournament, and who dropped out.
//
// Adding and removing participants, marking a player as retired — which
// awards walkovers for their open matches — and taking that back. The
// partner rule runs through here too: in a fixed-pairing format a player
// cannot retire alone, so their partner goes with them (REVIEW-BACKLOG.md
// D1).

import { useCallback } from "react";
import {
  addPlayerToTournament,
  removePlayerFromTournament,
  retirePlayerFromTournament,
  unretirePlayerFromTournament,
  setMatchWalkover,
  setEntryStatus,
  promoteFromWaitingList,
  addFeeItem,
  setFeeItemPaid,
  deleteFeeItem,
  updateFeeDue,
} from "../../../lib/db";
import { engineFor } from "../../../lib/formats";
import { useT } from "../../../lib/I18nContext";
import { useToast } from "../../../lib/ToastContext";
import { fill } from "../../../lib/i18n/format";
import { playerDisplayName } from "../../../lib/types";
import type { ConfirmRequest } from "../../../components/ui/ConfirmDialog";
import type { TournamentDialogs } from "./useTournamentDialogs";
import type { EntryStatus, FeeDue, Match, Player, Tournament } from "../../../lib/types";

interface Args {
  tournamentId: number;
  tournament: Tournament | null;
  players: Player[];
  matchesByRound: Map<number, Match[]>;
  navTeams: [number, number][] | undefined;
  dialogs: TournamentDialogs;
  askConfirm: (request: ConfirmRequest) => Promise<boolean>;
  loadAll: () => void | Promise<void>;
}

export function useRosterActions({
  tournamentId,
  tournament,
  players,
  matchesByRound,
  navTeams,
  dialogs,
  askConfirm,
  loadAll,
}: Args) {
  const { t } = useT();
  const { showInfo, showSuccess } = useToast();
  const { setShowAddPlayer, setRemoveTarget } = dialogs;

  const handleAddPlayer = async (playerId: number) => {
    await addPlayerToTournament(tournamentId, playerId);
    setShowAddPlayer(false);
    loadAll();
  };

  /** Opens the confirmation modal; actual removal happens in `confirmRemovePlayer`. */
  const handleRemovePlayer = (playerId: number) => {
    const p = players.find((p) => p.id === playerId);
    if (!p) return;
    setRemoveTarget(p);
  };

  const confirmRemovePlayer = async (playerId: number) => {
    await removePlayerFromTournament(tournamentId, playerId);
    loadAll();
  };

  // Check if player has any pending (unfinished) matches
  const getPlayerPendingMatches = (playerId: number): Match[] => {
    const pending: Match[] = [];
    for (const [, matches] of matchesByRound) {
      for (const m of matches) {
        if (m.status === "completed") continue;
        const matchPlayers = [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2];
        if (matchPlayers.includes(playerId)) pending.push(m);
      }
    }
    return pending;
  };

  /**
   * The fixed partner of a player, read from the persisted team list.
   *
   * `team_config` is where the wizard stores the pairings, so it is the
   * only reliable source: scanning the match list for the first row that
   * mentions the player returns whoever they happened to play with in a
   * random-partner format, and in singles it returns an opponent
   * (REVIEW-BACKLOG.md B12). Returns null in singles and in formats where
   * partners change every round.
   */
  const getFixedPartner = useCallback(
    (playerId: number): number | null => {
      if (!tournament) return null;
      if (tournament.mode === "singles") return null;
      if (engineFor(tournament.format).display.reshufflesPartners) return null;

      for (const [a, b] of navTeams ?? []) {
        if (a === playerId) return b;
        if (b === playerId) return a;
      }
      return null;
    },
    [tournament, navTeams],
  );

  // Mark player as injured/retired for the entire tournament
  // - Persists in DB so future rounds exclude the player
  // - All open matches are awarded to the opponent as walkovers
  // - For fixed teams: the partner retires as well, the team is out
  const handlePlayerRetire = async (playerId: number) => {
    if (!tournament) return;

    const partner = getFixedPartner(playerId);
    const playersToRetire = partner !== null ? [playerId, partner] : [playerId];

    // Persist retired status in DB
    for (const pid of playersToRetire) {
      await retirePlayerFromTournament(tournamentId, pid);
    }

    // Award every open match to the opponent — as a walkover, not as an
    // invented 21:0 scoreline (REVIEW-BACKLOG.md B8).
    for (const pid of playersToRetire) {
      const pendingMatches = getPlayerPendingMatches(pid);
      for (const m of pendingMatches) {
        // Skip if already handled (e.g. through the partner's retirement)
        if (m.status === "completed") continue;
        // A bye has no opponent to award it to.
        if (m.team2_p1 === null) continue;

        const isTeam1 = m.team1_p1 === pid || m.team1_p2 === pid;
        await setMatchWalkover(m.id, isTeam1 ? 2 : 1);
      }
    }

    loadAll();
  };

  const handlePlayerUnretire = async (playerId: number) => {
    if (!tournament) return;

    // What happens to the walkovers already recorded is the part nobody
    // can guess: bringing a player back does not undo the matches their
    // absence decided. The sentence saying so was written and never
    // shown -- the action ran on a single click (REVIEW-BACKLOG.md H2).
    const ok = await askConfirm({
      title: t.retire_undo,
      message: t.retire_undo_message,
      icon: "medical",
      tone: "accent",
      confirmLabel: t.retire_undo_confirm,
    });
    if (!ok) return;

    // Same partner rule as retiring, so both directions stay symmetric.
    const partner = getFixedPartner(playerId);
    const playersToUnretire = partner !== null ? [playerId, partner] : [playerId];
    for (const pid of playersToUnretire) {
      await unretirePlayerFromTournament(tournamentId, pid);
    }
    loadAll();
  };
  /**
   * Moves somebody between entered, waiting and withdrawn.
   *
   * Withdrawing keeps the row, which is the point: the accounts still
   * need them, and with the fee due on entry they still owe it
   * (FEATURE-BACKLOG.md E2).
   */
  const handleEntryStatusChange = async (playerId: number, status: EntryStatus) => {
    // Somebody put on the waiting list may not be linked to the
    // tournament at all yet -- that is the usual case, since the queue is
    // for people who could not be fitted in. setEntryStatus updates a row;
    // it does not create one.
    await addPlayerToTournament(tournamentId, playerId);
    await setEntryStatus(tournamentId, playerId, status);
    loadAll();
  };

  /** Moves the first person on the waiting list up, and says who. */
  const handlePromoteWaiting = async () => {
    const moved = await promoteFromWaitingList(tournamentId);
    if (!moved) {
      showInfo(t.entry_list_nobody_waiting);
      return;
    }
    showSuccess(fill(t.entry_list_promoted, { name: playerDisplayName(moved) }));
    loadAll();
  };

  const handleFeeItemAdd = async (
    playerId: number | null,
    label: string,
    amount: number,
  ) => {
    await addFeeItem(tournamentId, playerId, label, amount);
    loadAll();
  };

  const handleFeeItemPaid = async (itemId: number, paid: boolean) => {
    await setFeeItemPaid(itemId, paid);
    loadAll();
  };

  const handleFeeItemDelete = async (itemId: number) => {
    await deleteFeeItem(itemId);
    loadAll();
  };

  const handleFeeDueChange = async (value: FeeDue) => {
    await updateFeeDue(tournamentId, value);
    loadAll();
  };

  return {
    handleAddPlayer,
    handleRemovePlayer,
    handleEntryStatusChange,
    handlePromoteWaiting,
    handleFeeItemAdd,
    handleFeeItemPaid,
    handleFeeItemDelete,
    handleFeeDueChange,
    confirmRemovePlayer,
    getPlayerPendingMatches,
    getFixedPartner,
    handlePlayerRetire,
    handlePlayerUnretire,
  };
}

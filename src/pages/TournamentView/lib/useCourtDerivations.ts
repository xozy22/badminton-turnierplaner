// src/pages/TournamentView/lib/useCourtDerivations.ts
//
// What the court view works out from the raw match list.
//
// Which courts are taken, who is already playing, which queued matches
// would double-book a player, how far each group has got, and which future
// rounds already have matches waiting. All computed, none of it stored —
// so it lives together rather than being interleaved with the state it
// reads (REVIEW-BACKLOG.md D1).
//
// For a tournament in a session, "taken" and "already playing" span the
// whole session: a player cannot be on two courts at once, whichever
// tournament each belongs to.

import { useMemo } from "react";
import { getMatchConflicts, getRunningPlayerCourts } from "../../../lib/courtConflicts";
import type { ConflictPlayer } from "../../../lib/courtConflicts";
import {
  getGroupProgress,
  getRemainingByGroup,
  getRoundToGroupMap,
} from "../../../lib/groupProgress";
import { engineFor } from "../../../lib/formats";
import type { useSessionContext } from "../../../lib/sessionContext";
import type {
  Match,
  Round,
  Tournament,
  TournamentPlayerInfo,
} from "../../../lib/types";

interface Args {
  tournament: Tournament | null;
  rounds: Round[];
  allMatches: Match[];
  matchesByRound: Map<number, Match[]>;
  paymentData: TournamentPlayerInfo[];
  activeRound: number | null;
  showAllGroups: boolean;
  sessionCtx: ReturnType<typeof useSessionContext>;
}

export function useCourtDerivations({
  tournament,
  rounds,
  allMatches,
  matchesByRound,
  paymentData,
  activeRound,
  showAllGroups,
  sessionCtx,
}: Args) {
  // Global occupied courts: across ALL rounds, not just active round.
  // For sessioned tournaments, we additionally include courts occupied by
  // OTHER tournaments in the same session, so the dropdown can disable them
  // and the queue can flag cross-tournament collisions.
  const globalOccupiedCourts = useMemo(() => {
    const occupied = new Set<number>();
    for (const [, matches] of matchesByRound) {
      for (const m of matches) {
        if (m.court && m.status !== "completed") {
          occupied.add(m.court);
        }
      }
    }
    // Cross-tournament: add courts from sibling tournaments. courtOccupancy
    // includes the current tournament's matches too — but those are already
    // in the local set above, so the union is idempotent.
    if (tournament?.session_id != null) {
      for (const courtNum of sessionCtx.courtOccupancy.keys()) {
        occupied.add(courtNum);
      }
    }
    return occupied;
  }, [matchesByRound, sessionCtx.courtOccupancy, tournament?.session_id]);

  // Player-court conflict map. Built from allMatches so it spans every round
  // currently in memory — important once early-drawn future rounds are also
  // visible in the queue. For sessioned tournaments, we extend with players
  // currently on courts in OTHER tournaments — physically a player can't be
  // in two places at once.
  const runningPlayerCourts = useMemo(() => {
    const map = getRunningPlayerCourts(allMatches);
    if (tournament?.session_id != null) {
      // Merge in cross-tournament players. First-seen wins (which means the
      // tournament-local entry is preserved over a sibling's claim, since
      // it was inserted first) — defensive against ghost entries.
      for (const [pid, loc] of sessionCtx.playerCourts) {
        if (loc.tournamentId === tournament.id) continue; // already counted
        if (map.has(pid)) continue;
        // The name travels with the entry so the message can say which
        // tournament is holding the player, not just a court number that
        // does not exist in this one.
        map.set(pid, {
          court: loc.court,
          matchId: loc.matchId,
          tournamentName: sessionCtx.tournaments.find((tt: { id: number }) => tt.id === loc.tournamentId)?.name,
        });
      }
    }
    return map;
    // Depends on the whole tournament rather than on two of its fields:
    // the compiler cannot preserve a memo whose declared dependencies are
    // narrower than what it infers, and a tournament object that changed
    // is a reason to recompute anyway.
  }, [allMatches, sessionCtx.playerCourts, sessionCtx.tournaments, tournament]);

  // Per-waiting-match list of player conflicts. Empty => match is safe to
  // assign. Used by the queue render (visual marker) and the MatchCard
  // dropdown (disable courts).
  const conflictedMatches = useMemo(() => {
    const map = new Map<number, ConflictPlayer[]>();
    for (const m of allMatches) {
      if (m.court !== null) continue;       // already assigned — skip
      if (m.status === "completed") continue;
      const conflicts = getMatchConflicts(m, runningPlayerCourts);
      if (conflicts.length > 0) map.set(m.id, conflicts);
    }
    return map;
  }, [allMatches, runningPlayerCourts]);


  // Bronze playoff round (phase = "third_place") if it exists. Filtered out
  // of the main bracket layout — rendered separately as <BronzeMatchPanel>.
  const thirdPlaceRound = useMemo(
    () => rounds.find((r) => r.phase === "third_place") ?? null,
    [rounds],
  );

  // Group-phase progress + smart-queue prerequisites. Active only during
  // the group phase of a `group_ko` tournament; everything else falls
  // back to the existing default behavior.
  const isGroupPhaseActive =
    !!tournament &&
    engineFor(tournament.format).display.hasGroupPhase &&
    tournament.current_phase === "group";

  // Computed for the WHOLE group_ko format, not just the active group
  // phase, so the bar can act as a history reference once KO has started
  // (everything 100% / all ✓). The smart-queue maps below stay scoped
  // to the active group phase — KO matches must not be reordered by
  // group remaining counts.
  const groupProgress = useMemo(
    () =>
      tournament && engineFor(tournament.format).display.hasGroupPhase
        ? getGroupProgress(rounds, matchesByRound)
        : [],
    [tournament, rounds, matchesByRound],
  );

  const remainingByGroup = useMemo(
    () => isGroupPhaseActive ? getRemainingByGroup(rounds, matchesByRound) : undefined,
    [isGroupPhaseActive, rounds, matchesByRound],
  );

  const roundToGroup = useMemo(
    () => isGroupPhaseActive ? getRoundToGroupMap(rounds) : undefined,
    [isGroupPhaseActive, rounds],
  );

  // Map<playerId, seedRank> derived from the persisted seed_rank column.
  // Consumed by GruppenTab + VerwaltungTab to render <SeedBadge>.
  const seedRankByPlayer = useMemo(() => {
    const map = new Map<number, number>();
    for (const pd of paymentData) {
      if (pd.seed_rank != null && pd.seed_rank > 0) {
        map.set(pd.player.id, pd.seed_rank);
      }
    }
    return map;
  }, [paymentData]);

  // Early draw: compute pending matches from rounds AFTER the currently viewed round.
  // Used to show next-round matches in the CourtOverview queue with a round label.
  const futureRoundQueues = useMemo(() => {
    if (!activeRound || showAllGroups) return undefined;
    const activeRoundObj = rounds.find((r) => r.id === activeRound);
    if (!activeRoundObj) return undefined;
    return rounds
      .filter((r) => r.round_number > activeRoundObj.round_number)
      .map((r) => ({ round: r, matches: matchesByRound.get(r.id) || [] }))
      .filter(({ matches }) => matches.some((m) => !m.court && m.status !== "completed"));
  }, [activeRound, showAllGroups, rounds, matchesByRound]);
  return {
    globalOccupiedCourts,
    runningPlayerCourts,
    conflictedMatches,
    thirdPlaceRound,
    groupProgress,
    remainingByGroup,
    roundToGroup,
    seedRankByPlayer,
    futureRoundQueues,
    isGroupPhaseActive,
  };
}

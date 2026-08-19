// src/lib/courtConflicts.ts
//
// Player-court conflict detection.
//
// When the next round is drawn early, matches from two rounds can sit in the
// queue at the same time. Without an additional guard, the same player could
// be assigned to two courts simultaneously — physically impossible.
//
// These helpers sit between the match list and the UI:
//   - getRunningPlayerCourts: index every player currently on a court.
//   - getMatchConflicts: report which players of a given match would clash
//     with that index.
//
// Both functions are pure and intentionally small so the caller can memoize
// them per render. Filter semantics mirror the court-occupation memo in
// TournamentView (`court != null && status != "completed"`), but indexed by
// player rather than by court.
//
// Used by:
//   - TournamentView.handleCourtChange (hard guard before updateMatchCourt)
//   - TournamentView render (visual blocked-state for queue cards)
//   - CourtOverview drag handlers + queue card render
//   - MatchCard court dropdown (disable options when the match has conflicts)
//
// Note: `team1_p2` and `team2_p2` may be `null` (singles) or `0` (BYE / TBD)
// in legacy data — both are filtered out via `pid > 0`.

import type { Match } from "./types";

/** A single player-overlap finding for a candidate match. */
export interface ConflictPlayer {
  /** Player who is double-booked. */
  playerId: number;
  /** Court the player is currently on (the conflict). */
  court: number;
  /** Match-id the player is currently in (the active one, NOT the candidate). */
  conflictingMatchId: number;
  /**
   * Set only when the blocking match belongs to a *different* tournament in
   * the same session. Without it the message names a court number that
   * means nothing in the tournament the user is looking at.
   */
  tournamentName?: string;
}

/** Internal record stored per running player. */
export interface RunningPlayerCourt {
  court: number;
  matchId: number;
  /** Name of the owning tournament, when it is not the current one. */
  tournamentName?: string;
}

/**
 * Build a map of `playerId -> {court, matchId}` for every player who is
 * currently on a court.
 *
 * "Currently on a court" mirrors the filter used by `globalOccupiedCourts`
 * in TournamentView: a match has `court != null` AND `status != "completed"`.
 * Pending or active matches both count — both occupy a court.
 *
 * Single pass over `matches`, O(n) in match count and constant-time lookups
 * during conflict checks.
 */
export function getRunningPlayerCourts(
  matches: Match[],
): Map<number, RunningPlayerCourt> {
  const out = new Map<number, RunningPlayerCourt>();
  for (const m of matches) {
    if (m.court === null) continue;
    if (m.status === "completed") continue;
    const pids = [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2];
    for (const pid of pids) {
      if (pid === null || pid === undefined || pid <= 0) continue;
      // First-write-wins: a player appearing in two running matches at once
      // is itself the bug we're trying to surface. The first occurrence is
      // enough to flag the second.
      if (!out.has(pid)) {
        out.set(pid, { court: m.court, matchId: m.id });
      }
    }
  }
  return out;
}

/**
 * For a candidate match, return the list of its players that are already
 * running on another court. Empty array = no conflict, safe to assign.
 *
 * The candidate's own match-id is excluded from the result, so re-assigning
 * a match that is already on a court (e.g. moving from court 1 to court 2)
 * does not flag itself as a conflict.
 */
export function getMatchConflicts(
  match: Match,
  runningPlayers: Map<number, RunningPlayerCourt>,
): ConflictPlayer[] {
  const conflicts: ConflictPlayer[] = [];
  const pids = [match.team1_p1, match.team1_p2, match.team2_p1, match.team2_p2];
  for (const pid of pids) {
    if (pid === null || pid === undefined || pid <= 0) continue;
    const running = runningPlayers.get(pid);
    if (!running) continue;
    if (running.matchId === match.id) continue; // self — not a conflict
    conflicts.push({
      playerId: pid,
      court: running.court,
      conflictingMatchId: running.matchId,
      ...(running.tournamentName ? { tournamentName: running.tournamentName } : {}),
    });
  }
  return conflicts;
}

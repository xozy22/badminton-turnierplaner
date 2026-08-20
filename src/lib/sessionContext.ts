// src/lib/sessionContext.ts
//
// Cross-tournament helpers for the multi-tournament-workspace ("Session")
// concept. Used by:
//   1. The Venue/Session Dashboard (a single bird's-eye view that needs
//      to know about every match across every tournament in the session)
//   2. Per-tournament views (TournamentView) for cross-tournament court
//      occupancy + player conflict detection
//
// All matches across the session-tournaments are loaded eagerly via
// getSessionMatches(); the resulting list can be fed into the existing
// `lib/courtConflicts.ts` helpers since they're shape-compatible (just
// Match[] in, Map<...> out). This keeps the integration footprint
// minimal — we don't fork the conflict logic, we just supply a wider
// match scope.
//
// Reactive variant `useSessionContext(sessionId)` polls every 5s
// (cheap — sessions rarely have hundreds of matches in flight, and
// polling is consistent with how the existing live publisher and TV
// mode operate).

import { useEffect, useState } from "react";
import { onDataChanged } from "./changeEvents";
import { usePolling } from "./usePolling";
import { getMatchesForTournaments } from "./db";
import { getSessionTournaments } from "./sessions";
import type { Match, Tournament, TournamentFormat } from "./types";

/**
 * A match annotated with the tournament metadata needed by the dashboard
 * + cross-conflict views. Avoids requiring callers to look up the parent
 * tournament for every match.
 */
export interface SessionMatch extends Match {
  tournament_id: number;
  tournament_name: string;
  tournament_format: TournamentFormat;
}

/**
 * Loads every match from every tournament currently attached to the
 * session, regardless of tournament status. Filtering by status (active /
 * completed / etc.) is the caller's job — the dashboard wants completed
 * matches in the "recent results" strip, while the conflict checks only
 * care about active+pending matches.
 */
export async function getSessionMatches(sessionId: number): Promise<SessionMatch[]> {
  const tournaments = await getSessionTournaments(sessionId);
  if (tournaments.length === 0) return [];

  // One query for the whole session instead of one per tournament — this
  // runs every five seconds while the dashboard is open
  // (REVIEW-BACKLOG.md E4).
  const byId = new Map(tournaments.map((t) => [t.id, t]));
  const matches = await getMatchesForTournaments(tournaments.map((t) => t.id));

  return matches.flatMap((m) => {
    const t = byId.get(m.tournament_id);
    if (!t) return [];
    return [{ ...m, tournament_id: t.id, tournament_name: t.name, tournament_format: t.format }];
  });
}

/**
 * Map<court, SessionMatch> for matches currently on a court (status not
 * "completed"). Court is the venue-global court number — sessioned
 * tournaments share the venue's court pool, so two matches with the
 * same `court` field across different tournaments would collide
 * physically. The map is the source of truth for "is court N busy?"
 * across the whole session.
 *
 * If multiple matches claim the same court (a bug — shouldn't happen
 * with cross-tournament conflict detection), the LATEST `court_assigned_at`
 * wins. Earlier ones are silently dropped, mirroring how the per-
 * tournament `getRunningPlayerCourts` resolves duplicate assignments.
 */
export function getSessionCourtOccupancy(matches: SessionMatch[]): Map<number, SessionMatch> {
  const map = new Map<number, SessionMatch>();
  for (const m of matches) {
    if (m.court == null) continue;
    if (m.status === "completed") continue;
    const existing = map.get(m.court);
    if (!existing) {
      map.set(m.court, m);
      continue;
    }
    // Tie-break: latest court_assigned_at wins.
    const a = m.court_assigned_at ?? "";
    const b = existing.court_assigned_at ?? "";
    if (a > b) map.set(m.court, m);
  }
  return map;
}

/** What a court card needs to say who has a court next door. */
export interface ForeignCourt {
  tournamentName: string;
  /** When that match started, so the card can show its clock. */
  startedAt: string | null;
}

/**
 * The courts held by every tournament in the session *except* this one.
 *
 * The court overview already refused a drop onto a court in use next
 * door, but drew it as free -- so the refusal arrived without a reason.
 * Separating the neighbours' courts from our own is what lets the card
 * name whoever has it.
 */
export function getForeignCourtOccupancy(
  occupancy: Map<number, SessionMatch>,
  ownTournamentId: number,
): Map<number, ForeignCourt> {
  const map = new Map<number, ForeignCourt>();
  for (const [court, match] of occupancy) {
    if (match.tournament_id === ownTournamentId) continue;
    map.set(court, {
      tournamentName: match.tournament_name,
      startedAt: match.started_at,
    });
  }
  return map;
}

/**
 * Map<playerId, { matchId, court, tournamentId }> for active/assigned
 * matches across the session. Used by the cross-tournament player
 * conflict modal: when assigning a match, if any of its players is
 * already in the session-wide map, the assignment is blocked.
 *
 * Shape-compatible with `lib/courtConflicts.ts` ConflictPlayer (id +
 * court), with the extra `tournamentId` field so the modal can label
 * "playing right now in Turnier X". A player playing in two tournaments
 * of the same session at the same time is physically impossible — that's
 * the whole reason this map exists.
 */
export interface SessionPlayerLocation {
  playerId: number;
  matchId: number;
  court: number;
  tournamentId: number;
  tournamentName: string;
}

export function getSessionPlayerCourts(
  matches: SessionMatch[],
): Map<number, SessionPlayerLocation> {
  const map = new Map<number, SessionPlayerLocation>();
  for (const m of matches) {
    if (m.court == null) continue;
    if (m.status === "completed") continue;
    const players = [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2].filter(
      (p): p is number => p != null && p > 0,
    );
    for (const pid of players) {
      // First-seen wins. With proper conflict detection upstream this
      // should never collide, but be defensive against legacy data.
      if (map.has(pid)) continue;
      map.set(pid, {
        playerId: pid,
        matchId: m.id,
        court: m.court,
        tournamentId: m.tournament_id,
        tournamentName: m.tournament_name,
      });
    }
  }
  return map;
}

// ---- Reactive hook ----

// Writes announce themselves (see changeEvents), so this is the safety
// net rather than the primary path (REVIEW-BACKLOG.md E3).
const SESSION_CONTEXT_POLL_MS = 30_000;

export interface SessionContextValue {
  matches: SessionMatch[];
  courtOccupancy: Map<number, SessionMatch>;
  playerCourts: Map<number, SessionPlayerLocation>;
  tournaments: Tournament[];
  loaded: boolean;
}

const EMPTY: SessionContextValue = {
  matches: [],
  courtOccupancy: new Map(),
  playerCourts: new Map(),
  tournaments: [],
  loaded: false,
};

/**
 * Polls the session every 5s and exposes the cross-tournament view as a
 * memoized object. Returns a stable EMPTY value when sessionId is null
 * so callers can use it unconditionally.
 *
 *   const ctx = useSessionContext(tournament.session_id);
 *   const blocked = ctx.courtOccupancy.has(targetCourt);
 *
 * The polling interval matches LivePublisherHost / TvMode for consistency.
 *
 * `paused` (v2.8.6): when true, the hook still does an initial fetch to
 * populate the value, but skips the recurring 5s tick. Used by the session
 * dashboard to stop polling when the session is non-active AND no
 * tournaments are still running — the data wouldn't change anyway, and
 * the visual "polling paused" indicator makes it explicit.
 */
export function useSessionContext(sessionId: number | null, paused = false): SessionContextValue {
  const [value, setValue] = useState<SessionContextValue>(EMPTY);

  // Bumping this restarts the poller, and usePolling always opens with an
  // immediate tick — so an announced write refreshes the view at once
  // instead of waiting for the interval (REVIEW-BACKLOG.md E3).
  const [changeTick, setChangeTick] = useState(0);
  useEffect(() => onDataChanged(() => setChangeTick((n) => n + 1)), []);

  usePolling(
    async (cancelled) => {
      if (sessionId == null) {
        setValue(EMPTY);
        return;
      }
      const [tournaments, matches] = await Promise.all([
        getSessionTournaments(sessionId),
        getSessionMatches(sessionId),
      ]);
      if (cancelled()) return;
      setValue({
        matches,
        courtOccupancy: getSessionCourtOccupancy(matches),
        playerCourts: getSessionPlayerCourts(matches),
        tournaments,
        loaded: true,
      });
    },
    {
      intervalMs: SESSION_CONTEXT_POLL_MS,
      // A paused poller still runs its first tick — which is what keeps the
      // dashboard showing the last known state, and what clears the value
      // when the session id goes away. `disabled` would skip that tick too.
      paused: paused || sessionId == null,
      label: `useSessionContext(${sessionId})`,
    },
    [sessionId, changeTick],
  );

  return value;
}

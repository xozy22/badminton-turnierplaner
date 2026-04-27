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
import { getAllMatchesByTournament } from "./db";
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
  const out: SessionMatch[] = [];
  for (const t of tournaments) {
    const matches = await getAllMatchesByTournament(t.id);
    for (const m of matches) {
      out.push({
        ...m,
        tournament_id: t.id,
        tournament_name: t.name,
        tournament_format: t.format,
      });
    }
  }
  return out;
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

const SESSION_CONTEXT_POLL_MS = 5_000;

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
 */
export function useSessionContext(sessionId: number | null): SessionContextValue {
  const [value, setValue] = useState<SessionContextValue>(EMPTY);

  useEffect(() => {
    if (sessionId == null) {
      setValue(EMPTY);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const [tournaments, matches] = await Promise.all([
          getSessionTournaments(sessionId),
          getSessionMatches(sessionId),
        ]);
        if (cancelled) return;
        setValue({
          matches,
          courtOccupancy: getSessionCourtOccupancy(matches),
          playerCourts: getSessionPlayerCourts(matches),
          tournaments,
          loaded: true,
        });
      } catch (err) {
        console.error(`useSessionContext(${sessionId}): poll failed:`, err);
      }
    };
    tick();
    const id = setInterval(tick, SESSION_CONTEXT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionId]);

  return value;
}

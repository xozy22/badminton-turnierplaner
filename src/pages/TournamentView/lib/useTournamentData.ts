// src/pages/TournamentView/lib/useTournamentData.ts
//
// Everything the tournament view loads, in one place.
//
// index.tsx held thirty-two useState calls; half of them were this — the
// tournament row, its participants, rounds, matches, sets, standings and
// the two pieces of per-format state that live outside the match tables.
// Together with the two queries that fetch them, that was 170 lines of the
// file before a single element was rendered (REVIEW-BACKLOG.md D1).
//
// A hook rather than a component: a component would take all of this
// through props, which is the same coupling moved somewhere harder to see.
// The caller destructures what it needs.

import { useCallback, useEffect, useState } from "react";
import {
  getTournament,
  getPlayers,
  getTournamentPlayers,
  getRounds,
  getAllMatchesByTournament,
  getAllSetsByTournament,
  getRetiredPlayerIds,
  getTournamentPlayersDetailed,
  getFeeItems,
  getGrandFinalRounds,
  getKingOfCourtQueue,
  getSportstaetten,
} from "../../../lib/db";
import { getSession } from "../../../lib/sessions";
import { calculateStandings } from "../../../lib/scoring";
import { engineFor } from "../../../lib/formats";
import type {
  Tournament,
  Player,
  Round,
  Match,
  GameSet,
  StandingEntry,
  Session,
  TournamentPlayerInfo,
  FeeItem,
} from "../../../lib/types";

/** Groups matches by their round, for the per-round views. */
export function groupMatchesByRound(matches: Match[]): Map<number, Match[]> {
  const byRound = new Map<number, Match[]>();
  for (const match of matches) {
    const arr = byRound.get(match.round_id);
    if (arr) arr.push(match);
    else byRound.set(match.round_id, [match]);
  }
  return byRound;
}

/** Groups sets by their match, for the score inputs. */
export function groupSetsByMatch(sets: GameSet[]): Map<number, GameSet[]> {
  const byMatch = new Map<number, GameSet[]>();
  for (const set of sets) {
    const arr = byMatch.get(set.match_id);
    if (arr) arr.push(set);
    else byMatch.set(set.match_id, [set]);
  }
  return byMatch;
}

export function useTournamentData(tournamentId: number) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [matchesByRound, setMatchesByRound] = useState<Map<number, Match[]>>(new Map());
  const [setsByMatch, setSetsByMatch] = useState<Map<number, GameSet[]>>(new Map());
  const [standings, setStandings] = useState<StandingEntry[]>([]);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [retiredPlayerIds, setRetiredPlayerIds] = useState<Set<number>>(new Set());
  const [paymentData, setPaymentData] = useState<TournamentPlayerInfo[]>([]);
  const [feeItems, setFeeItems] = useState<FeeItem[]>([]);
  const [activeRound, setActiveRound] = useState<number | null>(null);
  const [showAllGroups, setShowAllGroups] = useState(false);

  const [sessionMeta, setSessionMeta] = useState<Session | null>(null);
  // Round ids that hold a grand final. Stored per tournament because the
  // match itself lives in the winners bracket (B4).
  const [grandFinalRoundIds, setGrandFinalRoundIds] = useState<Set<number>>(new Set());
  // King of the Court keeps its waiting queue outside the match tables.
  const [kotcQueue, setKotcQueue] = useState<number[]>([]);
  // Lazy-loaded venue hall_config for the session's venue. Used to override
  // the tournament's local hall_config when participating in a session, so
  // every sibling sees the same physical court grid.
  const [sessionVenueHalls, setSessionVenueHalls] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // The reset happens inside the async body rather than before it: a
      // synchronous setState in an effect body triggers a second render
      // pass before the first has painted.
      if (tournament?.session_id == null) {
        if (!cancelled) {
          setSessionMeta(null);
          setSessionVenueHalls(null);
        }
        return;
      }
      const s = await getSession(tournament.session_id);
      if (cancelled) return;
      setSessionMeta(s);
      if (s?.venue_id != null) {
        const venues = await getSportstaetten();
        if (cancelled) return;
        const v = venues.find((vv) => vv.id === s.venue_id);
        setSessionVenueHalls(v?.halls ?? null);
      } else {
        setSessionVenueHalls(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournament?.session_id]);

  /**
   * Reloads only what a score entry or a court assignment can change:
   * matches, sets and the standings that follow from them.
   *
   * Entering a result used to go through loadAll, which also fetched every
   * player in the database, the participant list, the payment table and the
   * tournament row — none of which a score can touch. That is the single
   * most frequent action in a running tournament, several times per match
   * (REVIEW-BACKLOG.md D7).
   *
   * The roster is read from state rather than refetched; whatever changes
   * it goes through loadAll and re-creates this callback.
   */
  const refreshScores = useCallback(async () => {
    if (!tournament) return;

    const [allMatches, allSets] = await Promise.all([
      getAllMatchesByTournament(tournamentId),
      getAllSetsByTournament(tournamentId),
    ]);

    const sbm = groupSetsByMatch(allSets);
    setMatchesByRound(groupMatchesByRound(allMatches));
    setSetsByMatch(sbm);
    setAllMatches(allMatches);

    const swissLike = engineFor(tournament.format).display.usesBuchholz;
    setStandings(
      calculateStandings(
        players,
        allMatches,
        sbm,
        swissLike ? { byesCountAsWins: true, withBuchholz: true } : {},
      ),
    );
  }, [tournamentId, tournament, players]);

  const loadAll = useCallback(async () => {
    // Structural reload: everything the view shows. None of these eight
    // queries depends on another, so they go out together instead of one
    // after the next — over Tauri's IPC each one is a serialise/
    // deserialise hop (REVIEW-BACKLOG.md D7).
    let td: Tournament;
    try {
      td = await getTournament(tournamentId);
    } catch {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);

    const [ap, p, r, allMatches, allSets, retiredIds, pd, fi] = await Promise.all([
      getPlayers(),
      getTournamentPlayers(tournamentId),
      getRounds(tournamentId),
      getAllMatchesByTournament(tournamentId),
      getAllSetsByTournament(tournamentId),
      getRetiredPlayerIds(tournamentId),
      getTournamentPlayersDetailed(tournamentId),
      getFeeItems(tournamentId),
    ]);

    setTournament(td);
    setAllPlayers(ap);
    setPlayers(p);
    setRounds(r);

    const mbr = groupMatchesByRound(allMatches);
    const sbm = groupSetsByMatch(allSets);

    setMatchesByRound(mbr);
    setSetsByMatch(sbm);
    setAllMatches(allMatches);

    // These two need td.format, so they cannot join the batch above.
    const display = engineFor(td.format).display;
    if (display.usesGrandFinal) {
      setGrandFinalRoundIds(new Set(await getGrandFinalRounds(tournamentId)));
    }
    if (display.usesQueue) {
      setKotcQueue(await getKingOfCourtQueue(tournamentId));
    }

    setRetiredPlayerIds(new Set(retiredIds));
    setPaymentData(pd);
    setFeeItems(fi);

    // Swiss and Monrad award byes as wins and rank by Buchholz.
    const swissLike = display.usesBuchholz;
    const s = calculateStandings(p, allMatches, sbm, swissLike ? { byesCountAsWins: true, withBuchholz: true } : {});
    setStandings(s);

    if (r.length > 0) {
      if (display.hasGroupPhase && r.some((rr) => rr.phase === "group")) {
        const koRs = r.filter((rr) => rr.phase === "ko");
        if (koRs.length > 0) {
          // KO rounds exist: preserve current round if still valid, otherwise auto-select first KO round
          setActiveRound((prev) => {
            const stillValid = prev !== null && r.some((rr) => rr.id === prev);
            return stillValid ? prev : koRs[0].id;
          });
          setShowAllGroups(false);
        } else {
          // Still in group phase: the unassigned-queue spans all groups
          // anyway (smart-queue), so the per-round buttons are now purely
          // a status display. Force the cross-group view permanently —
          // no per-round drill-down during the group phase.
          setShowAllGroups(true);
          setActiveRound(null);
        }
      } else {
        setActiveRound((prev) => prev ?? r[0].id);
      }
    }
     
  }, [tournamentId]);

  useEffect(() => {
    // An async load is what an effect is for; the rule cannot see that
    // through the useCallback and reports the setState inside loadAll.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll();
  }, [loadAll]);
  return {
    tournament,
    setTournament,
    loadFailed,
    players,
    setPlayers,
    allPlayers,
    rounds,
    matchesByRound,
    setMatchesByRound,
    setsByMatch,
    setSetsByMatch,
    standings,
    allMatches,
    retiredPlayerIds,
    paymentData,
    feeItems,
    setFeeItems,
    setPaymentData,
    activeRound,
    setActiveRound,
    showAllGroups,
    setShowAllGroups,
    sessionMeta,
    grandFinalRoundIds,
    setGrandFinalRoundIds,
    kotcQueue,
    setKotcQueue,
    sessionVenueHalls,
    loadAll,
    refreshScores,
  };
}

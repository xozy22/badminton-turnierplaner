import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import PrintDialog from "../../components/print/PrintDialog";
import { useTheme } from "../../lib/ThemeContext";
import TemplateExportModal from "../../components/tournament/TemplateExportModal";
import DeleteTournamentModal from "../../components/tournament/DeleteTournamentModal";
import RetirePlayerModal from "../../components/tournament/RetirePlayerModal";
import RemovePlayerModal from "../../components/tournament/RemovePlayerModal";
import AttendanceCheckModal from "../../components/tournament/AttendanceCheckModal";
import UnpublishModal from "../../components/tournament/UnpublishModal";
import RanglisteTab from "../../components/tournament/RanglisteTab";
import GruppenTab from "../../components/tournament/GruppenTab";
import GroupProgressBar from "../../components/tournament/GroupProgressBar";
import VerwaltungTab from "../../components/tournament/VerwaltungTab";
import CourtOverview from "../../components/courts/CourtOverview";
import BracketView from "../../components/bracket/BracketView";
import BronzeMatchPanel from "../../components/bracket/BronzeMatchPanel";
import { getRestingPlayers } from "../../lib/restTime";
import {
  getRunningPlayerCourts,
  getMatchConflicts,
  type ConflictPlayer,
} from "../../lib/courtConflicts";
import {
  getGroupProgress,
  getRemainingByGroup,
  getRoundToGroupMap,
} from "../../lib/groupProgress";
import {
  getTournament,
  getTournamentPlayers,
  getPlayers,
  getRounds,
  getAllMatchesByTournament,
  getAllSetsByTournament,
  createRound,
  createMatch,
  upsertSet,
  updateMatchResult,
  updateMatchCourt,
  clearMatchCourt,
  reopenMatch,
  updateTournament,
  updateTournamentStatus,
  updateTournamentPhase,
  deleteTournament,
  addPlayerToTournament,
  removePlayerFromTournament,
  retirePlayerFromTournament,
  unretirePlayerFromTournament,
  deleteRound,
  getRetiredPlayerIds,
  getTournamentPlayersDetailed,
  isTauri,
  updateTournamentKoScoring,
} from "../../lib/db";
import {
  generateRoundRobinSingles,
  generateRoundRobinDoubles,
  generateRandomDoublesRound,
  generateMixedDoublesRound,
  generateEliminationBracket,
  generateEliminationBracketDoubles,
  splitIntoGroups,
  formFixedDoubleTeams,
  formFixedMixedTeams,
  splitTeamsIntoGroups,
  getPreviousPairings,
  getPreviousPairingCounts,
  generateSwissFirstRound,
  generateSwissFirstRoundDoubles,
  generateSwissRound,
  generateSwissRoundDoubles,
  generateMonradRound,
  generateMonradRoundDoubles,
  generateKingOfCourtMatch,
  generateWaterfallRound,
  advanceWaterfall,
  shufflePlayers,
} from "../../lib/draw";
import {
  calculateStandings,
  calculateTeamStandings,
  determineMatchWinner,
  getMaxScore,
  autoFillOpponentScore,
  getScoringDescription,
} from "../../lib/scoring";
import type {
  Tournament,
  Player,
  Round,
  Match,
  GameSet,
  StandingEntry,
  TournamentPlayerInfo,
} from "../../lib/types";
import { parseHallConfig, playerDisplayName } from "../../lib/types";
import type { LivePublishConfig } from "../../lib/types";
import {
  LIVE_PUBLISH_SETTING_KEY,
  pushDelete,
  isTournamentLive,
  setTournamentLive,
  isTournamentPaused,
  setTournamentPaused,
} from "../../lib/livePublish";
import { triggerImmediatePush, usePushStatus } from "../../lib/useLivePublisher";
import { getAppSetting, getSportstaetten } from "../../lib/db";
import { useT } from "../../lib/I18nContext";
import { useToast } from "../../lib/ToastContext";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import MatchCard from "./components/MatchCard";
import CompletedMatchesSection from "./components/CompletedMatchesSection";
import StartKoModal from "./components/modals/StartKoModal";
import EditTournamentModal from "./components/modals/EditTournamentModal";
import RestWarningModal from "./components/modals/RestWarningModal";
import PlayerConflictModal from "./components/modals/PlayerConflictModal";
import ReopenConfirmModal from "./components/modals/ReopenConfirmModal";
import UndoRoundModal from "./components/modals/UndoRoundModal";
import { getEffectiveScoring } from "./lib/effectiveScoring";
import { getUndoTarget } from "./lib/undoTarget";
import { useSessionContext } from "../../lib/sessionContext";
import { getSession } from "../../lib/sessions";
import type { Session } from "../../lib/types";


export default function TournamentView() {
  const { theme } = useTheme();
  const { t } = useT();
  const { showSuccess, showError } = useToast();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const navSeeds = (location.state as any)?.seeds as number[] | undefined;
  const navTeamsFromState = (location.state as any)?.teams as [number, number][] | undefined;
  const navSavedSuccess = !!(location.state as any)?.savedSuccess;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  useDocumentTitle(tournament?.name ?? t.nav_tournaments);
  const navTeams = useMemo(() => {
    if (navTeamsFromState && navTeamsFromState.length > 0) return navTeamsFromState;
    if (tournament?.team_config) {
      try { return JSON.parse(tournament.team_config) as [number, number][]; } catch (err) { console.error("TournamentView: failed to parse team_config JSON:", err); }
    }
    return undefined;
  }, [navTeamsFromState, tournament?.team_config]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [matchesByRound, setMatchesByRound] = useState<
    Map<number, Match[]>
  >(new Map());
  const [setsByMatch, setSetsByMatch] = useState<Map<number, GameSet[]>>(
    new Map()
  );
  const [standings, setStandings] = useState<StandingEntry[]>([]);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [retiredPlayerIds, setRetiredPlayerIds] = useState<Set<number>>(new Set());
  const [activeRound, setActiveRound] = useState<number | null>(null);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [paymentData, setPaymentData] = useState<TournamentPlayerInfo[]>([]);
  const [collapsedClubs, setCollapsedClubs] = useState<Set<string>>(new Set());
  const [showTemplateExport, setShowTemplateExport] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [viewTab, setViewTab] = useState<"spiele" | "gruppen" | "bracket" | "rangliste" | "verwaltung">("spiele");
  const [retireTarget, setRetireTarget] = useState<{ player: Player; partnerNote: string } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Player | null>(null);
  const [recentlyCompleted, setRecentlyCompleted] = useState<Set<number>>(new Set());
  const [editingMatchIds, setEditingMatchIds] = useState<Set<number>>(new Set());
  const [showStartKoModal, setShowStartKoModal] = useState(false);
  const [restWarning, setRestWarning] = useState<{
    matchId: number;
    court: number;
    players: { id: number; name: string; minutesLeft: number }[];
  } | null>(null);
  // Hard player-overlap block: opens when the user tries to assign a match
  // whose players are still on another court. No bypass — only "close".
  const [playerConflict, setPlayerConflict] = useState<{
    matchId: number;
    players: { id: number; name: string; court: number }[];
  } | null>(null);
  const recentlyCompletedRef = React.useRef(recentlyCompleted)
  recentlyCompletedRef.current = recentlyCompleted;
  const activeRoundRef = React.useRef(activeRound);
  activeRoundRef.current = activeRound;

  const tournamentId = Number(id);

  // ---- Multi-tournament-workspace integration ----
  // When tournament.session_id is set, we participate in a session with
  // shared court pool + cross-tournament conflict detection. The hook
  // returns EMPTY for null session_id, so we can wire it unconditionally.
  const sessionCtx = useSessionContext(tournament?.session_id ?? null);
  const [sessionMeta, setSessionMeta] = useState<Session | null>(null);
  // Lazy-loaded venue hall_config for the session's venue. Used to override
  // the tournament's local hall_config when participating in a session, so
  // every sibling sees the same physical court grid.
  const [sessionVenueHalls, setSessionVenueHalls] = useState<string | null>(null);
  useEffect(() => {
    if (tournament?.session_id == null) { setSessionMeta(null); setSessionVenueHalls(null); return; }
    let cancelled = false;
    (async () => {
      const s = await getSession(tournament.session_id!);
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
    return () => { cancelled = true; };
  }, [tournament?.session_id]);

  // Phase-aware scoring: derive effective scoring based on the active round's phase
  const activeRoundPhase = rounds.find((r) => r.id === activeRound)?.phase ?? null;
  const effectiveScoring = tournament
    ? getEffectiveScoring(tournament, activeRoundPhase)
    : { pointsPerSet: 21, setsToWin: 2, cap: 30 };

  const loadAll = useCallback(async () => {
    const td = await getTournament(tournamentId);
    setTournament(td);

    const ap = await getPlayers();
    setAllPlayers(ap);

    const p = await getTournamentPlayers(tournamentId);
    setPlayers(p);

    const r = await getRounds(tournamentId);
    setRounds(r);

    // Bulk-load all matches and sets in 2 queries instead of N+1
    const allMatches = await getAllMatchesByTournament(tournamentId);
    const allSets = await getAllSetsByTournament(tournamentId);

    // Group matches by round
    const mbr = new Map<number, Match[]>();
    for (const match of allMatches) {
      const arr = mbr.get(match.round_id);
      if (arr) arr.push(match);
      else mbr.set(match.round_id, [match]);
    }

    // Group sets by match
    const sbm = new Map<number, GameSet[]>();
    for (const set of allSets) {
      const arr = sbm.get(set.match_id);
      if (arr) arr.push(set);
      else sbm.set(set.match_id, [set]);
    }

    setMatchesByRound(mbr);
    setSetsByMatch(sbm);
    setAllMatches(allMatches);

    const retiredIds = await getRetiredPlayerIds(tournamentId);
    setRetiredPlayerIds(new Set(retiredIds));

    const pd = await getTournamentPlayersDetailed(tournamentId);
    setPaymentData(pd);

    const s = calculateStandings(p, allMatches, sbm);
    setStandings(s);

    if (r.length > 0) {
      if (td.format === "group_ko" && r.some((rr) => rr.phase === "group")) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Show save-success toast when arriving from edit wizard; clear nav state so refresh doesn't re-trigger.
  const savedSuccessShownRef = React.useRef(false);
  useEffect(() => {
    if (!navSavedSuccess || savedSuccessShownRef.current) return;
    savedSuccessShownRef.current = true;
    window.history.replaceState({}, document.title);
    showSuccess(t.edit_tournament_saved);
  }, [navSavedSuccess, showSuccess, t.edit_tournament_saved]);

  const playerName = (playerId: number | null): string => {
    if (playerId === null || playerId === undefined) return "-";
    const p = players.find((p) => p.id === playerId);
    return p ? playerDisplayName(p) : "?";
  };

  const handleStartTournament = async (playersOverride?: Player[]) => {
    if (!tournament) return;

    // Use override (from attendance check) or fall back to current state
    const ep = playersOverride ?? players;

    await updateTournamentStatus(tournamentId, "active");

    const numCourts = tournament.courts || 1;
    // Bei mehreren Feldern: kein Court vorbelegen, Timer startet erst bei manueller Zuweisung
    // Bei 1 Feld: automatisch Feld 1 zuweisen (kein Drag&Drop noetig)
    const autoAssign = numCourts === 1;

    if (tournament.format === "round_robin" && tournament.mode === "singles") {
      const allRounds = generateRoundRobinSingles(ep);
      for (let i = 0; i < allRounds.length; i++) {
        const roundId = await createRound(tournamentId, i + 1);
        for (let mi = 0; mi < allRounds[i].length; mi++) {
          const m = allRounds[i][mi];
          const court = autoAssign ? 1 : null;
          await createMatch(roundId, m.team1_p1, null, m.team2_p1, null, court);
        }
      }
    } else if (tournament.format === "elimination" && tournament.mode === "singles") {
      const matches = generateEliminationBracket(ep, navSeeds);
      const roundId = await createRound(tournamentId, 1);
      for (const m of matches) {
        if (m.team2_p1 !== -1) {
          const court = autoAssign ? 1 : null;
          await createMatch(roundId, m.team1_p1, null, m.team2_p1, null, court);
        }
      }
    } else if (tournament.format === "elimination" && tournament.mode !== "singles") {
      // Doppel/Mixed KO: Manuelle Teams oder automatisch bilden
      const teams = navTeams && navTeams.length > 0
        ? navTeams
        : tournament.mode === "mixed"
          ? formFixedMixedTeams(ep)
          : formFixedDoubleTeams(ep);
      const matches = generateEliminationBracketDoubles(teams);
      const roundId = await createRound(tournamentId, 1);
      for (const m of matches) {
        const court = autoAssign ? 1 : null;
        await createMatch(roundId, m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2, court);
      }
    } else if (tournament.format === "group_ko") {
      // Gruppenphase starten
      await updateTournamentPhase(tournamentId, "group");
      const groups = splitIntoGroups(ep, tournament.num_groups || 2, navSeeds);
      let roundCounter = 1;

      if (tournament.mode === "singles") {
        // Einzel: Round-Robin innerhalb jeder Gruppe
        for (let g = 0; g < groups.length; g++) {
          const groupPlayers = groups[g];
          if (groupPlayers.length < 2) continue;
          const groupRounds = generateRoundRobinSingles(groupPlayers);
          for (let r = 0; r < groupRounds.length; r++) {
            const roundId = await createRound(tournamentId, roundCounter++, "group", g + 1);
            for (const m of groupRounds[r]) {
              const court = autoAssign ? 1 : null;
              await createMatch(roundId, m.team1_p1, null, m.team2_p1, null, court);
            }
          }
        }
      } else {
        // Doppel/Mixed: Feste Teams, Round-Robin innerhalb jeder Gruppe
        // Erst Teams bilden, dann in Gruppen aufteilen
        const allTeams = navTeams && navTeams.length > 0
          ? navTeams
          : tournament.mode === "mixed"
            ? formFixedMixedTeams(ep)
            : formFixedDoubleTeams(ep);
        const teamGroups = splitTeamsIntoGroups(allTeams, tournament.num_groups || 2);

        for (let g = 0; g < teamGroups.length; g++) {
          const groupTeams = teamGroups[g];
          if (groupTeams.length < 2) continue;
          const groupRounds = generateRoundRobinDoubles(groupTeams);
          for (let r = 0; r < groupRounds.length; r++) {
            const roundId = await createRound(tournamentId, roundCounter++, "group", g + 1);
            for (const m of groupRounds[r]) {
              const court = autoAssign ? 1 : null;
              await createMatch(roundId, m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2, court);
            }
          }
        }
      }
    } else if (tournament.format === "round_robin" && tournament.mode !== "singles") {
      // Doppel/Mixed Round-Robin: Feste Teams
      const teams = navTeams && navTeams.length > 0
        ? navTeams
        : tournament.mode === "mixed"
          ? formFixedMixedTeams(ep)
          : formFixedDoubleTeams(ep);
      const allRounds = generateRoundRobinDoubles(teams);
      for (let i = 0; i < allRounds.length; i++) {
        const roundId = await createRound(tournamentId, i + 1);
        for (const m of allRounds[i]) {
          const court = autoAssign ? 1 : null;
          await createMatch(roundId, m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2, court);
        }
      }
    } else if (tournament.format === "random_doubles") {
      await generateNextRound();
    } else if (tournament.format === "swiss") {
      await updateTournamentPhase(tournamentId, "swiss");
      if (tournament.mode === "singles") {
        const matches = generateSwissFirstRound(ep);
        const roundId = await createRound(tournamentId, 1, "swiss");
        for (const m of matches) {
          const court = autoAssign ? 1 : null;
          await createMatch(roundId, m.team1_p1, null, m.team2_p1, null, court);
        }
      } else {
        const teams = navTeams && navTeams.length > 0
          ? navTeams
          : tournament.mode === "mixed"
            ? formFixedMixedTeams(ep)
            : formFixedDoubleTeams(ep);
        const matches = generateSwissFirstRoundDoubles(teams);
        const roundId = await createRound(tournamentId, 1, "swiss");
        for (const m of matches) {
          const court = autoAssign ? 1 : null;
          await createMatch(roundId, m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2, court);
        }
      }
    } else if (tournament.format === "monrad") {
      // Monrad: reuse Swiss infrastructure with random first round
      await updateTournamentPhase(tournamentId, "swiss");
      if (tournament.mode === "singles") {
        const matches = generateSwissFirstRound(ep);
        const roundId = await createRound(tournamentId, 1, "swiss");
        for (const m of matches) {
          const court = autoAssign ? 1 : null;
          await createMatch(roundId, m.team1_p1, null, m.team2_p1, null, court);
        }
      } else {
        const teams = navTeams && navTeams.length > 0
          ? navTeams
          : tournament.mode === "mixed"
            ? formFixedMixedTeams(ep)
            : formFixedDoubleTeams(ep);
        const matches = generateSwissFirstRoundDoubles(teams);
        const roundId = await createRound(tournamentId, 1, "swiss");
        for (const m of matches) {
          const court = autoAssign ? 1 : null;
          await createMatch(roundId, m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2, court);
        }
      }
    } else if (tournament.format === "king_of_court") {
      // King of the Court: shuffle players, generate first match
      const shuffled = shufflePlayers(ep.map((p) => p.id));
      if (shuffled.length < 2) return;
      const { team1_p1, team2_p1 } = generateKingOfCourtMatch(shuffled);
      const roundId = await createRound(tournamentId, 1);
      const court = autoAssign ? 1 : null;
      await createMatch(roundId, team1_p1, null, team2_p1, null, court);
    } else if (tournament.format === "waterfall") {
      // Waterfall: shuffle players, assign to courts, generate first round
      const shuffled = shufflePlayers(ep.map((p) => p.id));
      const waterfallMatches = generateWaterfallRound(shuffled);
      const roundId = await createRound(tournamentId, 1);
      for (const m of waterfallMatches) {
        await createMatch(roundId, m.team1_p1, null, m.team2_p1, null, m.court);
      }
    } else if (tournament.format === "double_elimination") {
      await updateTournamentPhase(tournamentId, "winners");
      if (tournament.mode === "singles") {
        const matches = generateEliminationBracket(ep, navSeeds);
        const roundId = await createRound(tournamentId, 1, "winners");
        for (const m of matches) {
          if (m.team2_p1 !== -1) {
            const court = autoAssign ? 1 : null;
            await createMatch(roundId, m.team1_p1, null, m.team2_p1, null, court);
          }
        }
      } else {
        const teams = navTeams && navTeams.length > 0
          ? navTeams
          : tournament.mode === "mixed"
            ? formFixedMixedTeams(ep)
            : formFixedDoubleTeams(ep);
        const matches = generateEliminationBracketDoubles(teams);
        const roundId = await createRound(tournamentId, 1, "winners");
        for (const m of matches) {
          const court = autoAssign ? 1 : null;
          await createMatch(roundId, m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2, court);
        }
      }
    }

    loadAll();
  };

  const handleAttendanceConfirm = async (presentIds: Set<number>) => {
    setShowAttendance(false);
    // Remove absent players from the tournament before starting
    const absentIds = players.filter((p) => !presentIds.has(p.id)).map((p) => p.id);
    for (const id of absentIds) {
      await removePlayerFromTournament(tournamentId, id);
    }
    // Reload fresh player list and start with it
    const freshPlayers = await getTournamentPlayers(tournamentId);
    setPlayers(freshPlayers);
    await handleStartTournament(freshPlayers);
  };

  const generateNextRound = async () => {
    if (!tournament) return;

    // Remember if the current last round was fully complete BEFORE creating the new one.
    // If it was, we switch to the new round's tab automatically (existing behaviour).
    // If not (early draw), we stay on the current tab so ongoing matches stay visible.
    const lastRoundId = rounds.length > 0 ? rounds[rounds.length - 1].id : null;
    const wasFullyComplete = lastRoundId ? allRoundMatchesCompleted(lastRoundId) : true;

    const allMatchesLocal: Match[] = [];
    for (const [, matches] of matchesByRound) {
      allMatchesLocal.push(...matches);
    }
    const prevPairings = getPreviousPairings(allMatchesLocal);
    const pairingCounts = getPreviousPairingCounts(allMatchesLocal);
    const nextRoundNum = rounds.length + 1;

    // Filter out retired players for new round generation
    const activePlayers = players.filter((p) => !retiredPlayerIds.has(p.id));

    // Calculate match counts per player for fair bye rotation
    const matchCounts = new Map<number, number>();
    for (const m of allMatchesLocal) {
      for (const pid of [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2]) {
        if (pid !== null) {
          matchCounts.set(pid, (matchCounts.get(pid) ?? 0) + 1);
        }
      }
    }

    let newMatches: {
      team1_p1: number;
      team1_p2: number;
      team2_p1: number;
      team2_p2: number;
    }[] = [];

    if (tournament.mode === "mixed") {
      newMatches = generateMixedDoublesRound(activePlayers, prevPairings);
    } else {
      newMatches = generateRandomDoublesRound(activePlayers, prevPairings, matchCounts, pairingCounts);
    }

    if (newMatches.length === 0) return;

    const numCourts = tournament.courts || 1;
    const autoAssign = numCourts === 1;
    const roundId = await createRound(tournamentId, nextRoundNum);
    for (let mi = 0; mi < newMatches.length; mi++) {
      const m = newMatches[mi];
      const court = autoAssign ? 1 : null;
      await createMatch(roundId, m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2, court);
    }

    // Only auto-navigate to the new round tab if the previous round was already complete.
    // For early draws the user stays on the current round to keep ongoing matches visible.
    if (wasFullyComplete) {
      setActiveRound(roundId);
    }
    loadAll();
  };

  const generateNextSwissRound = async () => {
    if (!tournament || tournament.format !== "swiss") return;

    const swissRounds = rounds.filter((r) => r.phase === "swiss");
    const allSwissMatches: Match[] = [];
    const allSwissSets = new Map<number, GameSet[]>();
    for (const r of swissRounds) {
      const ms = matchesByRound.get(r.id) || [];
      allSwissMatches.push(...ms);
      for (const m of ms) allSwissSets.set(m.id, setsByMatch.get(m.id) || []);
    }

    // Build previousMatchups set
    const previousMatchups = new Set<string>();
    for (const m of allSwissMatches) {
      if (tournament.mode === "singles") {
        const ids = [m.team1_p1, m.team2_p1].sort((a, b) => a - b);
        previousMatchups.add(`${ids[0]}-${ids[1]}`);
      } else {
        const t1Key = [m.team1_p1, m.team1_p2!].sort((a, b) => a - b).join("-");
        const t2Key = [m.team2_p1, m.team2_p2!].sort((a, b) => a - b).join("-");
        const parts = [t1Key, t2Key].sort();
        previousMatchups.add(`${parts[0]}-${parts[1]}`);
      }
    }

    const activePlayers = players.filter((p) => !retiredPlayerIds.has(p.id));
    const numCourts = tournament.courts || 1;
    const autoAssign = numCourts === 1;
    const nextRoundNum = rounds.length + 1;

    if (tournament.mode === "singles") {
      const swissStandings = calculateStandings(activePlayers, allSwissMatches, allSwissSets);
      const newMatches = generateSwissRound(swissStandings, previousMatchups);
      if (newMatches.length === 0) return;
      const roundId = await createRound(tournamentId, nextRoundNum, "swiss");
      for (const m of newMatches) {
        const court = autoAssign ? 1 : null;
        await createMatch(roundId, m.team1_p1, null, m.team2_p1, null, court);
      }
    } else {
      const teamStandings = calculateTeamStandings(activePlayers, allSwissMatches, allSwissSets);
      const newMatches = generateSwissRoundDoubles(teamStandings, previousMatchups);
      if (newMatches.length === 0) return;
      const roundId = await createRound(tournamentId, nextRoundNum, "swiss");
      for (const m of newMatches) {
        const court = autoAssign ? 1 : null;
        await createMatch(roundId, m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2, court);
      }
    }

    loadAll();
  };

  const generateNextMonradRound = async () => {
    if (!tournament || tournament.format !== "monrad") return;

    const swissRoundsLocal = rounds.filter((r) => r.phase === "swiss");
    const allMonradMatches: Match[] = [];
    const allMonradSets = new Map<number, GameSet[]>();
    for (const r of swissRoundsLocal) {
      const ms = matchesByRound.get(r.id) || [];
      allMonradMatches.push(...ms);
      for (const m of ms) allMonradSets.set(m.id, setsByMatch.get(m.id) || []);
    }

    const activePlayers = players.filter((p) => !retiredPlayerIds.has(p.id));
    const numCourts = tournament.courts || 1;
    const autoAssign = numCourts === 1;
    const nextRoundNum = rounds.length + 1;

    if (tournament.mode === "singles") {
      const monradStandings = calculateStandings(activePlayers, allMonradMatches, allMonradSets);
      const newMatches = generateMonradRound(monradStandings);
      if (newMatches.length === 0) return;
      const roundId = await createRound(tournamentId, nextRoundNum, "swiss");
      for (const m of newMatches) {
        const court = autoAssign ? 1 : null;
        await createMatch(roundId, m.team1_p1, null, m.team2_p1, null, court);
      }
    } else {
      const teamStandings = calculateTeamStandings(activePlayers, allMonradMatches, allMonradSets);
      const newMatches = generateMonradRoundDoubles(teamStandings);
      if (newMatches.length === 0) return;
      const roundId = await createRound(tournamentId, nextRoundNum, "swiss");
      for (const m of newMatches) {
        const court = autoAssign ? 1 : null;
        await createMatch(roundId, m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2, court);
      }
    }

    loadAll();
  };

  const generateNextKingOfCourtMatch = async () => {
    if (!tournament || tournament.format !== "king_of_court") return;

    // Build queue from match history: winner stays (front), loser goes to back
    const allMatchesLocal: Match[] = [];
    for (const [, matches] of matchesByRound) {
      allMatchesLocal.push(...matches);
    }

    // Get the last completed match to determine new queue order
    const completedMatches = allMatchesLocal
      .filter((m) => m.status === "completed" && m.winner_team)
      .sort((a, b) => b.id - a.id); // most recent first

    if (completedMatches.length === 0) return;

    const lastMatch = completedMatches[0];
    const winner = lastMatch.winner_team === 1 ? lastMatch.team1_p1 : lastMatch.team2_p1;
    const loser = lastMatch.winner_team === 1 ? lastMatch.team2_p1 : lastMatch.team1_p1;

    // Build queue: winner first, then all other players who aren't winner/loser, then loser at back
    const allPlayerIds = players.filter((p) => !retiredPlayerIds.has(p.id)).map((p) => p.id);
    const inMatch = new Set([winner, loser]);
    const others = allPlayerIds.filter((id) => !inMatch.has(id));

    // Reconstruct remaining queue from previous state
    // The queue order is: winner (stays), then others in previous order, then loser at back
    const newQueue = [winner, ...others, loser];

    if (newQueue.length < 2) return;

    const { team1_p1, team2_p1 } = generateKingOfCourtMatch(newQueue);
    const numCourts = tournament.courts || 1;
    const autoAssign = numCourts === 1;
    const nextRoundNum = rounds.length + 1;
    const roundId = await createRound(tournamentId, nextRoundNum);
    const court = autoAssign ? 1 : null;
    await createMatch(roundId, team1_p1, null, team2_p1, null, court);

    loadAll();
  };

  const generateNextWaterfallRound = async () => {
    if (!tournament || tournament.format !== "waterfall") return;

    // Get the last round's matches to determine results
    const lastRound = rounds[rounds.length - 1];
    if (!lastRound) return;
    const lastMatches = matchesByRound.get(lastRound.id) || [];

    // Build results from last round
    const results: { court: number; winner: number; loser: number }[] = [];
    for (const m of lastMatches) {
      if (!m.winner_team || !m.court) continue;
      results.push({
        court: m.court,
        winner: m.winner_team === 1 ? m.team1_p1 : m.team2_p1,
        loser: m.winner_team === 1 ? m.team2_p1 : m.team1_p1,
      });
    }

    if (results.length === 0) return;

    // Reconstruct current court assignments from last round
    const currentAssignments: number[] = [];
    const sortedMatches = [...lastMatches].sort((a, b) => (a.court || 0) - (b.court || 0));
    for (const m of sortedMatches) {
      currentAssignments.push(m.team1_p1);
      currentAssignments.push(m.team2_p1);
    }
    // Add any sitting-out players
    const inMatch = new Set(currentAssignments);
    for (const p of players) {
      if (!inMatch.has(p.id) && !retiredPlayerIds.has(p.id)) {
        currentAssignments.push(p.id);
      }
    }

    // Advance
    const newAssignments = advanceWaterfall(currentAssignments, results);
    const waterfallMatches = generateWaterfallRound(newAssignments);

    const nextRoundNum = rounds.length + 1;
    const roundId = await createRound(tournamentId, nextRoundNum);
    for (const m of waterfallMatches) {
      await createMatch(roundId, m.team1_p1, null, m.team2_p1, null, m.court);
    }

    loadAll();
  };

  // Helper: collect matches/sets for a group
  const getGroupData = (groupNum: number) => {
    const gRounds = rounds.filter((r) => r.phase === "group" && r.group_number === groupNum);
    const gMatches: Match[] = [];
    const gSets = new Map<number, GameSet[]>();
    for (const r of gRounds) {
      const ms = matchesByRound.get(r.id) || [];
      gMatches.push(...ms);
      for (const m of ms) gSets.set(m.id, setsByMatch.get(m.id) || []);
    }
    const pIds = new Set<number>();
    for (const m of gMatches) {
      pIds.add(m.team1_p1); if (m.team1_p2) pIds.add(m.team1_p2);
      pIds.add(m.team2_p1); if (m.team2_p2) pIds.add(m.team2_p2);
    }
    return { gMatches, gSets, pIds };
  };

  // Start KO phase after group phase is complete
  // Helper: next power of 2 (e.g. 6 → 8, 5 → 8, 8 → 8)
  const nextPowerOf2 = (n: number): number => {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  };

  const startKoPhase = async () => {
    if (!tournament || tournament.format !== "group_ko") return;

    const numGroups = tournament.num_groups || 2;
    const isDoubles = tournament.mode !== "singles";
    // qualify_per_group now stores the total KO size (power of 2), e.g. 8
    // Fall back to old behavior: if value is small (1-4), it's the old "per group" count
    const rawQualify = tournament.qualify_per_group || 2;
    const koSize = rawQualify >= 4 && (rawQualify & (rawQualify - 1)) === 0
      ? rawQualify  // power of 2 → new format (total KO size)
      : rawQualify * numGroups; // old format (per group) → calculate total
    const qualifyPerGroup = Math.floor(koSize / numGroups);

    await updateTournamentPhase(tournamentId, "ko");

    const numCourts = tournament.courts || 1;
    const autoAssign = numCourts === 1;
    const koRoundId = await createRound(tournamentId, rounds.length + 1, "ko", null);

    if (isDoubles) {
      // Doppel/Mixed: Qualifizierte TEAMS sammeln
      const qualifiedTeams: [number, number][] = [];
      const runnersUp: { team: [number, number]; wins: number; losses: number; setsWon: number; setsLost: number; pointsWon: number; pointsLost: number }[] = [];

      for (let g = 1; g <= numGroups; g++) {
        const { gMatches, gSets, pIds } = getGroupData(g);
        const gPlayers = players.filter((p) => pIds.has(p.id));
        const teamStandings = calculateTeamStandings(gPlayers, gMatches, gSets);
        for (let i = 0; i < teamStandings.length; i++) {
          const ts = teamStandings[i];
          if (i < qualifyPerGroup) {
            qualifiedTeams.push([ts.player1.id, ts.player2.id]);
          } else {
            runnersUp.push({
              team: [ts.player1.id, ts.player2.id],
              wins: ts.wins, losses: ts.losses, setsWon: ts.setsWon, setsLost: ts.setsLost,
              pointsWon: ts.pointsWon, pointsLost: ts.pointsLost,
            });
          }
        }
      }

      // Fill up with best runners-up, sorted by percentage-based criteria
      const target = koSize > qualifiedTeams.length ? koSize : nextPowerOf2(qualifiedTeams.length);
      if (qualifiedTeams.length < target && runnersUp.length > 0) {
        runnersUp.sort((a, b) => {
          // 1. Match win percentage (wins / total matches)
          const matchPctA = (a.wins + a.losses) > 0 ? a.wins / (a.wins + a.losses) : 0;
          const matchPctB = (b.wins + b.losses) > 0 ? b.wins / (b.wins + b.losses) : 0;
          if (matchPctB !== matchPctA) return matchPctB - matchPctA;
          // 2. Set win percentage (setsWon / total sets)
          const setPctA = (a.setsWon + a.setsLost) > 0 ? a.setsWon / (a.setsWon + a.setsLost) : 0;
          const setPctB = (b.setsWon + b.setsLost) > 0 ? b.setsWon / (b.setsWon + b.setsLost) : 0;
          if (setPctB !== setPctA) return setPctB - setPctA;
          // 3. Point win percentage (pointsWon / total points)
          const ptPctA = (a.pointsWon + a.pointsLost) > 0 ? a.pointsWon / (a.pointsWon + a.pointsLost) : 0;
          const ptPctB = (b.pointsWon + b.pointsLost) > 0 ? b.pointsWon / (b.pointsWon + b.pointsLost) : 0;
          return ptPctB - ptPctA;
        });
        const needed = target - qualifiedTeams.length;
        for (let i = 0; i < Math.min(needed, runnersUp.length); i++) {
          qualifiedTeams.push(runnersUp[i].team);
        }
      }

      if (qualifiedTeams.length < 2) return;
      const koMatches = generateEliminationBracketDoubles(qualifiedTeams);
      for (const m of koMatches) {
        const court = autoAssign ? 1 : null;
        await createMatch(koRoundId, m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2, court);
      }
    } else {
      // Einzel: Qualifizierte SPIELER sammeln
      const qualified: number[] = [];
      const runnersUp: { playerId: number; wins: number; losses: number; setsWon: number; setsLost: number; pointsWon: number; pointsLost: number }[] = [];

      for (let g = 1; g <= numGroups; g++) {
        const { gMatches, gSets, pIds } = getGroupData(g);
        const gPlayers = players.filter((p) => pIds.has(p.id));
        const gStandings = calculateStandings(gPlayers, gMatches, gSets);
        for (let i = 0; i < gStandings.length; i++) {
          if (i < qualifyPerGroup) {
            qualified.push(gStandings[i].player.id);
          } else {
            const s = gStandings[i];
            runnersUp.push({
              playerId: s.player.id,
              wins: s.wins, losses: s.losses, setsWon: s.setsWon, setsLost: s.setsLost,
              pointsWon: s.pointsWon, pointsLost: s.pointsLost,
            });
          }
        }
      }

      // Fill up with best runners-up, sorted by percentage-based criteria
      const target = koSize > qualified.length ? koSize : nextPowerOf2(qualified.length);
      if (qualified.length < target && runnersUp.length > 0) {
        runnersUp.sort((a, b) => {
          // 1. Match win percentage
          const matchPctA = (a.wins + a.losses) > 0 ? a.wins / (a.wins + a.losses) : 0;
          const matchPctB = (b.wins + b.losses) > 0 ? b.wins / (b.wins + b.losses) : 0;
          if (matchPctB !== matchPctA) return matchPctB - matchPctA;
          // 2. Set win percentage
          const setPctA = (a.setsWon + a.setsLost) > 0 ? a.setsWon / (a.setsWon + a.setsLost) : 0;
          const setPctB = (b.setsWon + b.setsLost) > 0 ? b.setsWon / (b.setsWon + b.setsLost) : 0;
          if (setPctB !== setPctA) return setPctB - setPctA;
          // 3. Point win percentage
          const ptPctA = (a.pointsWon + a.pointsLost) > 0 ? a.pointsWon / (a.pointsWon + a.pointsLost) : 0;
          const ptPctB = (b.pointsWon + b.pointsLost) > 0 ? b.pointsWon / (b.pointsWon + b.pointsLost) : 0;
          return ptPctB - ptPctA;
        });
        const needed = target - qualified.length;
        for (let i = 0; i < Math.min(needed, runnersUp.length); i++) {
          qualified.push(runnersUp[i].playerId);
        }
      }

      if (qualified.length < 2) return;
      const qualifiedPlayers = qualified
        .map((id) => players.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => !!p);
      const koMatches = generateEliminationBracket(qualifiedPlayers);
      for (const m of koMatches) {
        if (m.team2_p1 !== -1) {
          const court = autoAssign ? 1 : null;
          await createMatch(koRoundId, m.team1_p1, null, m.team2_p1, null, court);
        }
      }
    }

    setActiveRound(koRoundId);
    loadAll();
  };

  const advanceDoubleElimination = async () => {
    if (!tournament || tournament.format !== "double_elimination") return;

    const winnersRounds = rounds.filter((r) => r.phase === "winners");
    const losersRounds = rounds.filter((r) => r.phase === "losers");

    const numCourts = tournament.courts || 1;
    const autoAssign = numCourts === 1;
    const nextRoundNum = rounds.length + 1;

    // Find last completed round in each bracket
    const lastCompletedWinners = [...winnersRounds].reverse().find((r) => allRoundMatchesCompleted(r.id));
    const lastCompletedLosers = [...losersRounds].reverse().find((r) => allRoundMatchesCompleted(r.id));

    // Check if we already created the next round for each bracket
    const lastWinnersRound = winnersRounds[winnersRounds.length - 1];
    const lastLosersRound = losersRounds.length > 0 ? losersRounds[losersRounds.length - 1] : null;

    // Process completed winners round: winners go to next winners round, losers drop to losers bracket
    if (lastCompletedWinners && lastCompletedWinners === lastWinnersRound) {
      const wMatches = matchesByRound.get(lastCompletedWinners.id) || [];

      const winners: { p1: number; p2: number | null }[] = [];
      const losers: { p1: number; p2: number | null }[] = [];

      for (const m of wMatches) {
        if (!m.winner_team) continue;
        if (m.winner_team === 1) {
          winners.push({ p1: m.team1_p1, p2: m.team1_p2 });
          losers.push({ p1: m.team2_p1, p2: m.team2_p2 });
        } else {
          winners.push({ p1: m.team2_p1, p2: m.team2_p2 });
          losers.push({ p1: m.team1_p1, p2: m.team1_p2 });
        }
      }

      // Create next winners round (if more than 1 winner)
      if (winners.length >= 2) {
        const wRoundId = await createRound(tournamentId, nextRoundNum, "winners");
        for (let i = 0; i < winners.length - 1; i += 2) {
          const w1 = winners[i];
          const w2 = winners[i + 1];
          const court = autoAssign ? 1 : null;
          await createMatch(wRoundId, w1.p1, w1.p2, w2.p1, w2.p2, court);
        }
      }

      // Create losers bracket round from dropped players
      if (losers.length >= 2) {
        // If losers bracket already has players waiting, combine them
        // For simplicity: losers from winners bracket form new losers round
        const lRoundId = await createRound(tournamentId, nextRoundNum + 1, "losers");
        for (let i = 0; i < losers.length - 1; i += 2) {
          const l1 = losers[i];
          const l2 = losers[i + 1];
          const court = autoAssign ? 1 : null;
          await createMatch(lRoundId, l1.p1, l1.p2, l2.p1, l2.p2, court);
        }
      } else if (losers.length === 1 && winners.length === 1) {
        // Grand Final: last winner vs last loser bracket winner (or this loser)
        // Check if losers bracket has a remaining player
        const lastLosersMatches = lastLosersRound ? matchesByRound.get(lastLosersRound.id) || [] : [];
        const losersComplete = lastLosersRound ? allRoundMatchesCompleted(lastLosersRound.id) : true;
        let losersChampion: { p1: number; p2: number | null } | null = null;

        if (losersComplete && lastLosersMatches.length === 1 && lastLosersMatches[0].winner_team) {
          const lm = lastLosersMatches[0];
          losersChampion = lm.winner_team === 1
            ? { p1: lm.team1_p1, p2: lm.team1_p2 }
            : { p1: lm.team2_p1, p2: lm.team2_p2 };
        }

        if (losersChampion) {
          // Grand Final
          const gfRoundId = await createRound(tournamentId, nextRoundNum, "winners");
          const court = autoAssign ? 1 : null;
          await createMatch(gfRoundId, winners[0].p1, winners[0].p2, losersChampion.p1, losersChampion.p2, court);
        }
      }
    }

    // Process completed losers round: winners advance, losers eliminated
    if (lastCompletedLosers && lastCompletedLosers === lastLosersRound) {
      const lMatches = matchesByRound.get(lastCompletedLosers.id) || [];

      const losersWinners: { p1: number; p2: number | null }[] = [];
      for (const m of lMatches) {
        if (!m.winner_team) continue;
        if (m.winner_team === 1) {
          losersWinners.push({ p1: m.team1_p1, p2: m.team1_p2 });
        } else {
          losersWinners.push({ p1: m.team2_p1, p2: m.team2_p2 });
        }
      }

      if (losersWinners.length >= 2) {
        const lRoundId = await createRound(tournamentId, nextRoundNum, "losers");
        for (let i = 0; i < losersWinners.length - 1; i += 2) {
          const w1 = losersWinners[i];
          const w2 = losersWinners[i + 1];
          const court = autoAssign ? 1 : null;
          await createMatch(lRoundId, w1.p1, w1.p2, w2.p1, w2.p2, court);
        }
      } else if (losersWinners.length === 1) {
        // Check if winners bracket also has 1 remaining player for Grand Final
        const lastWinnersMatches = lastWinnersRound ? matchesByRound.get(lastWinnersRound.id) || [] : [];
        const winnersComplete = lastWinnersRound ? allRoundMatchesCompleted(lastWinnersRound.id) : false;

        if (winnersComplete && lastWinnersMatches.length === 1 && lastWinnersMatches[0].winner_team) {
          // Bronze playoff (only if toggle enabled and an LB-semifinal exists):
          // pair LB-final-loser with LB-semifinal-loser, played alongside the GF.
          if (tournament.enable_third_place === 1) {
            // LB-final-loser: from the just-completed lMatches (reuse from above scope)
            let lbFinalLoser: { p1: number; p2: number | null } | null = null;
            for (const m of lMatches) {
              if (!m.winner_team) continue;
              lbFinalLoser = m.winner_team === 1
                ? { p1: m.team2_p1, p2: m.team2_p2 }
                : { p1: m.team1_p1, p2: m.team1_p2 };
              break;
            }
            // LB-semifinal-loser: from the previous LB round (if any)
            const lbRounds = rounds.filter((r) => r.phase === "losers");
            const lbSemiRound = lbRounds.length >= 2 ? lbRounds[lbRounds.length - 2] : null;
            const lbSemiMatches = lbSemiRound ? matchesByRound.get(lbSemiRound.id) || [] : [];
            let lbSemiLoser: { p1: number; p2: number | null } | null = null;
            for (const m of lbSemiMatches) {
              if (!m.winner_team) continue;
              lbSemiLoser = m.winner_team === 1
                ? { p1: m.team2_p1, p2: m.team2_p2 }
                : { p1: m.team1_p1, p2: m.team1_p2 };
              break;
            }
            if (lbFinalLoser && lbSemiLoser) {
              const bronzeRoundId = await createRound(tournamentId, nextRoundNum, "third_place", null);
              const court = autoAssign ? 1 : null;
              await createMatch(
                bronzeRoundId,
                lbFinalLoser.p1, lbFinalLoser.p2,
                lbSemiLoser.p1, lbSemiLoser.p2,
                court,
              );
            }
          }

          const wm = lastWinnersMatches[0];
          const winnersChampion = wm.winner_team === 1
            ? { p1: wm.team1_p1, p2: wm.team1_p2 }
            : { p1: wm.team2_p1, p2: wm.team2_p2 };

          // Grand Final
          const gfRoundId = await createRound(tournamentId, nextRoundNum, "winners");
          const court = autoAssign ? 1 : null;
          await createMatch(gfRoundId, winnersChampion.p1, winnersChampion.p2, losersWinners[0].p1, losersWinners[0].p2, court);
        }
      }
    }

    loadAll();
  };

  // onChange: Nur den eingegebenen Wert speichern, KEIN Auto-Fill
  const handleScoreChange = async (
    matchId: number,
    setNumber: number,
    team: 1 | 2,
    value: number
  ) => {
    if (!tournament) return;
    const currentSets = setsByMatch.get(matchId) || [];
    const existing = currentSets.find((s) => s.set_number === setNumber);

    const t1 = team === 1 ? value : existing?.team1_score ?? 0;
    const t2 = team === 2 ? value : existing?.team2_score ?? 0;

    const maxScore = getMaxScore(effectiveScoring.pointsPerSet, effectiveScoring.cap);
    const clampedT1 = Math.min(Math.max(t1, 0), maxScore);
    const clampedT2 = Math.min(Math.max(t2, 0), maxScore);

    // Optimistically update the local sets-by-match state so the controlled
    // input value reflects the keystroke immediately, without round-tripping
    // through DB write + full loadAll. This avoids a re-render storm on
    // every keystroke and prevents controlled-value clobbering races during
    // rapid typing (typing "12" quickly used to settle to "2" because two
    // overlapping loadAll cycles could re-set the input value to the
    // previous-keystroke read of the DB while the user kept typing).
    setSetsByMatch((prev) => {
      const next = new Map(prev);
      const sets = [...(next.get(matchId) ?? [])];
      const idx = sets.findIndex((s) => s.set_number === setNumber);
      if (idx >= 0) {
        sets[idx] = { ...sets[idx], team1_score: clampedT1, team2_score: clampedT2 };
      } else {
        sets.push({
          id: 0,
          match_id: matchId,
          set_number: setNumber,
          team1_score: clampedT1,
          team2_score: clampedT2,
        });
      }
      next.set(matchId, sets);
      return next;
    });

    // Persist to DB in the background. handleScoreBlur fires the full
    // loadAll() once the user leaves the field — that's when winner
    // detection, auto-fill, and standings recompute happen anyway.
    await upsertSet(matchId, setNumber, clampedT1, clampedT2);
  };

  // onBlur: Auto-Fill (auf Tab/Click). Winner-Detection ist hier
  // bewusst NICHT mehr drin — das passiert nur noch auf explizites
  // Enter via handleScoreCommit (siehe unten). So kann der TD durch
  // mehrere Sets tabben und Auto-Fill-Vorschläge sehen / korrigieren,
  // ohne dass das Match versehentlich abgeschlossen wird.
  const handleScoreBlur = async (
    matchId: number,
    setNumber: number,
    team: 1 | 2
  ) => {
    if (!tournament) return;
    const currentSets = setsByMatch.get(matchId) || [];
    const existing = currentSets.find((s) => s.set_number === setNumber);
    if (!existing) return;

    let t1 = existing.team1_score;
    let t2 = existing.team2_score;

    // Auto-Fill: Gegner-Score automatisch setzen.
    // Logic UNVERÄNDERT — gleiche autoFillOpponentScore-Aufrufe und
    // gleiche Bedingungen wie zuvor. Punktemodus-Vorschläge (21-Ext-30,
    // 2-Punkte-Vorsprung, Caps etc.) funktionieren genau wie bisher.
    const enteredScore = team === 1 ? t1 : t2;
    const currentOther = team === 1 ? t2 : t1;
    if (enteredScore > 0 && currentOther === 0) {
      const autoScore = autoFillOpponentScore(
        enteredScore,
        effectiveScoring.pointsPerSet,
        effectiveScoring.cap,
        true
      );
      if (autoScore !== null) {
        if (team === 1) t2 = autoScore;
        else t1 = autoScore;
        await upsertSet(matchId, setNumber, t1, t2);
      }
    }

    loadAll();
  };

  // onKeyDown=Enter: Auto-Fill (gleicher Code wie in handleScoreBlur)
  // gefolgt von Winner-Detection. Wird nur bei explizitem Enter
  // gerufen — der unmittelbar folgende native Blur (durch goNext in
  // MatchCard) feuert handleScoreBlur, das loadAll() macht. Kein
  // eigenes loadAll hier um Doppel-Reloads zu vermeiden.
  const handleScoreCommit = async (
    matchId: number,
    setNumber: number,
    team: 1 | 2
  ) => {
    if (!tournament) return;
    const currentSets = setsByMatch.get(matchId) || [];
    const existing = currentSets.find((s) => s.set_number === setNumber);
    if (!existing) return;

    let t1 = existing.team1_score;
    let t2 = existing.team2_score;

    // Auto-Fill (idempotent — wenn Tab schon gefüllt hat, currentOther !== 0 → no-op)
    const enteredScore = team === 1 ? t1 : t2;
    const currentOther = team === 1 ? t2 : t1;
    if (enteredScore > 0 && currentOther === 0) {
      const autoScore = autoFillOpponentScore(
        enteredScore,
        effectiveScoring.pointsPerSet,
        effectiveScoring.cap,
        true
      );
      if (autoScore !== null) {
        if (team === 1) t2 = autoScore;
        else t1 = autoScore;
        await upsertSet(matchId, setNumber, t1, t2);
      }
    }

    // Winner-Detection — exakt der Block, der vorher in handleScoreBlur stand.
    const updatedSets = [...currentSets.filter((s) => s.set_number !== setNumber)];
    updatedSets.push({
      id: existing.id ?? 0,
      match_id: matchId,
      set_number: setNumber,
      team1_score: t1,
      team2_score: t2,
    });
    updatedSets.sort((a, b) => a.set_number - b.set_number);

    const winner = determineMatchWinner(
      updatedSets,
      effectiveScoring.setsToWin,
      effectiveScoring.pointsPerSet,
      effectiveScoring.cap
    );
    const currentMatch = allMatches.find(m => m.id === matchId);
    if (winner) {
      await updateMatchResult(matchId, winner);
      const wasEditing = editingMatchIds.has(matchId);
      setEditingMatchIds((prev) => {
        const next = new Set(prev);
        next.delete(matchId);
        return next;
      });
      // 3s delay only for fresh completions, not for re-edited matches
      if (!wasEditing) {
        setRecentlyCompleted((prev) => new Set(prev).add(matchId));
        setTimeout(() => {
          setRecentlyCompleted((prev) => {
            const next = new Set(prev);
            next.delete(matchId);
            return next;
          });
        }, 3000);
      }
    } else if (currentMatch && currentMatch.winner_team !== null) {
      // Match was completed but scores were changed so no winner anymore — reset
      await updateMatchResult(matchId, null);
    }
    // Kein loadAll: der durch goNext()-Fokuswechsel ausgelöste Blur
    // ruft handleScoreBlur, das loadAll() macht. So passiert genau
    // ein Reload pro Enter, nicht zwei.
  };

  const handleCourtChange = async (matchId: number, court: number | null, bypassRestCheck = false) => {
    // Player-overlap check — HARD block, no bypass. A player who is currently
    // running on another court cannot be on a second court at the same time.
    // Runs even when `bypassRestCheck=true` (the rest-warning "assign anyway"
    // path must NOT also bypass this physical impossibility).
    if (court !== null) {
      const targetMatch = allMatches.find((m) => m.id === matchId);
      if (targetMatch) {
        const conflicts = getMatchConflicts(targetMatch, runningPlayerCourts);
        if (conflicts.length > 0) {
          setPlayerConflict({
            matchId,
            players: conflicts.map((c) => ({
              id: c.playerId,
              name: playerName(c.playerId),
              court: c.court,
            })),
          });
          return;
        }
      }
    }

    // Rest-time check: only when assigning (not clearing) and tournament has min_rest configured
    if (!bypassRestCheck && court !== null && tournament && tournament.min_rest_minutes > 0) {
      const targetMatch = allMatches.find((m) => m.id === matchId);
      if (targetMatch) {
        const restingMap = getRestingPlayers(
          allMatches,
          tournament.min_rest_minutes,
          Date.now(),
          matchId,
        );
        const playerIds = [
          targetMatch.team1_p1,
          targetMatch.team1_p2,
          targetMatch.team2_p1,
          targetMatch.team2_p2,
        ].filter((pid): pid is number => pid !== null && pid !== undefined && pid > 0);

        const resting: { id: number; name: string; minutesLeft: number }[] = [];
        for (const pid of playerIds) {
          const s = restingMap.get(pid);
          if (s) {
            resting.push({ id: pid, name: playerName(pid), minutesLeft: s.minutesLeft });
          }
        }

        if (resting.length > 0) {
          setRestWarning({ matchId, court, players: resting });
          return;
        }
      }
    }

    await updateMatchCourt(matchId, court);
    loadAll();
  };

  const handleAnnounce = (court: number, team1: string, team2: string) => {
    try {
      const bc = new BroadcastChannel(`tournament-${tournamentId}`);
      bc.postMessage({ type: "announce", court, team1, team2 });
      bc.close();
    } catch (err) {
      console.error("TournamentView: failed to send announcement via BroadcastChannel:", err);
    }
  };

  const handleReopenMatch = async (matchId: number) => {
    setEditingMatchIds((prev) => new Set(prev).add(matchId));
    // Clear court (but keep court_assigned_at) so it doesn't show on a field
    await clearMatchCourt(matchId);
    await reopenMatch(matchId);
    loadAll();
  };

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

  // Mark player as injured/retired for the entire tournament
  // - Persists in DB so future rounds exclude the player
  // - All pending matches become walkovers for the opponent
  // - For fixed teams (not random_doubles): partner is also retired
  const handlePlayerRetire = async (playerId: number) => {
    if (!tournament) return;

    // Determine players to retire
    const playersToRetire: number[] = [playerId];

    // For fixed-team modes (not random_doubles), also retire the partner
    if (tournament.format !== "random_doubles") {
      // Find partner from any match
      for (const m of allMatches) {
        if (m.team1_p1 === playerId && m.team1_p2) {
          if (!playersToRetire.includes(m.team1_p2)) playersToRetire.push(m.team1_p2);
          break;
        }
        if (m.team1_p2 === playerId) {
          if (!playersToRetire.includes(m.team1_p1)) playersToRetire.push(m.team1_p1);
          break;
        }
        if (m.team2_p1 === playerId && m.team2_p2) {
          if (!playersToRetire.includes(m.team2_p2)) playersToRetire.push(m.team2_p2);
          break;
        }
        if (m.team2_p2 === playerId) {
          if (!playersToRetire.includes(m.team2_p1)) playersToRetire.push(m.team2_p1);
          break;
        }
      }
    }

    // Persist retired status in DB
    for (const pid of playersToRetire) {
      await retirePlayerFromTournament(tournamentId, pid);
    }

    // Walk over all pending matches involving any retired player
    for (const pid of playersToRetire) {
      const pendingMatches = getPlayerPendingMatches(pid);
      for (const m of pendingMatches) {
        // Skip if already completed (may have been handled by partner retirement)
        if (m.status === "completed") continue;

        const isTeam1 = m.team1_p1 === pid || m.team1_p2 === pid;
        const winnerTeam: 1 | 2 = isTeam1 ? 2 : 1;

        const maxSets = effectiveScoring.setsToWin;
        for (let s = 1; s <= maxSets; s++) {
          await upsertSet(
            m.id, s,
            isTeam1 ? 0 : effectiveScoring.pointsPerSet,
            isTeam1 ? effectiveScoring.pointsPerSet : 0
          );
        }
        await updateMatchResult(m.id, winnerTeam);
      }
    }

    loadAll();
  };

  const handlePlayerUnretire = async (playerId: number) => {
    if (!tournament) return;
    // Unretire the player (and partner for fixed teams)
    const playersToUnretire: number[] = [playerId];
    if (tournament.format !== "random_doubles" && tournament.mode !== "singles") {
      for (const m of allMatches) {
        if (m.team1_p1 === playerId && m.team1_p2) { playersToUnretire.push(m.team1_p2); break; }
        if (m.team1_p2 === playerId) { playersToUnretire.push(m.team1_p1); break; }
        if (m.team2_p1 === playerId && m.team2_p2) { playersToUnretire.push(m.team2_p2); break; }
        if (m.team2_p2 === playerId) { playersToUnretire.push(m.team2_p1); break; }
      }
    }
    for (const pid of playersToUnretire) {
      await unretirePlayerFromTournament(tournamentId, pid);
    }
    loadAll();
  };

  const handleCompleteTournament = async () => {
    await updateTournamentStatus(tournamentId, "completed");
    loadAll();
  };

  const [showReopenConfirm, setShowReopenConfirm] = useState(false);
  const handleReopenTournament = async () => {
    await updateTournamentStatus(tournamentId, "active");
    setShowReopenConfirm(false);
    loadAll();
  };

  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
  // Whether THIS tournament is currently opted into live publishing.
  // Default off — only flips on when user clicks "Live aktivieren".
  const [liveActive, setLiveActive] = useState(false);
  // Whether THIS tournament is currently paused (opt-in still in place,
  // pushes suppressed). Mutually exclusive UI-wise with the inactive state.
  const [livePaused, setLivePaused] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  // Live push status (lastPushAt, lastError, backoff state) for the inline
  // indicator next to the Live button. Updates in-place when the global
  // publisher pushes / fails.
  const livePushStatus = usePushStatus(tournamentId);
  // Tick once per second so the inline "Push 12s ago" / "Fehler vor X Min"
  // text refreshes without waiting for an actual push event.
  const [liveStatusNow, setLiveStatusNow] = useState(() => Date.now());
  useEffect(() => {
    if (!liveActive) return;
    const id = setInterval(() => setLiveStatusNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [liveActive]);
  // Load opt-in state on mount + whenever the tournament id changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [on, paused] = await Promise.all([
          isTournamentLive(tournamentId),
          isTournamentPaused(tournamentId),
        ]);
        if (cancelled) return;
        setLiveActive(on);
        setLivePaused(paused);
      } catch (err) {
        console.error("isTournamentLive/Paused failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  const [showUndoRound, setShowUndoRound] = useState(false);

  /**
   * Memoized "what does the next undo step delete?" computation. Returns
   * null when there's nothing to undo. The result is used both to disable
   * the Undo button (no target → no click) and to drive the rich confirm
   * modal (preview of what will be lost).
   *
   * Strategy:
   *   1. Pick the round with the largest id — that's the most-recently
   *      created one in DB-insertion order.
   *   2. Bronze + Final pairing: when the head is a `third_place` round,
   *      look for the Final/winners round with the same `round_number`
   *      and bundle them. Same the other way around. Both get deleted in
   *      one logical undo step.
   *   3. Aggregate stats over the involved rounds so the modal can show
   *      what data the user is about to lose.
   *   4. Predict the post-undo phase transition (full reset / back-to-
   *      group / no change) — see decision matrix in plan.
   */
  const undoTarget = useMemo(
    () => getUndoTarget(tournament, rounds, matchesByRound, setsByMatch, t),
    [tournament, rounds, matchesByRound, setsByMatch, t],
  );

  /**
   * Execute the undo step previewed by the modal. Idempotent against
   * stale clicks (re-reads `undoTarget` at call time; if it's null,
   * silently no-ops). Cleanup order: delete rounds first (FK cascades to
   * matches/sets), then apply phase transition, then reload + toast.
   */
  const performUndo = async () => {
    const target = undoTarget;
    if (!target) {
      setShowUndoRound(false);
      return;
    }

    // Delete by descending id so the youngest-inserted round goes first.
    // Order doesn't matter for correctness (FK cascade handles dependents)
    // but it keeps the DB state predictable during the operation.
    for (const r of [...target.rounds].sort((a, b) => b.id - a.id)) {
      await deleteRound(r.id);
    }

    if (target.resetStatusToDraft) {
      await updateTournamentStatus(tournamentId, "draft");
      await updateTournamentPhase(tournamentId, "ready");
    } else if (target.isGroupKoBackToGroup) {
      await updateTournamentPhase(tournamentId, "group");
      await updateTournamentKoScoring(tournamentId, null, null, null);
    }

    setShowUndoRound(false);
    showSuccess(
      t.tournament_view_undo_done
        .replace("{label}", target.label)
        .replace("{matches}", String(target.matchCount))
        .replace("{sets}", String(target.setCount)),
    );
    loadAll();
  };

  const allRoundMatchesCompleted = (roundId: number): boolean => {
    const matches = matchesByRound.get(roundId) || [];
    return matches.length > 0 && matches.every((m) => m.status === "completed");
  };

  const atLeastOneMatchCompleted = (roundId: number): boolean => {
    const matches = matchesByRound.get(roundId) || [];
    return matches.some((m) => m.status === "completed");
  };

  // Global occupied courts: across ALL rounds, not just active round.
  // For sessioned tournaments, we additionally include courts occupied by
  // OTHER tournaments in the same session, so the dropdown can disable them
  // and the queue can flag cross-tournament collisions.
  const globalOccupiedCourts = React.useMemo(() => {
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
        map.set(pid, { court: loc.court, matchId: loc.matchId });
      }
    }
    return map;
  }, [allMatches, sessionCtx.playerCourts, tournament?.session_id, tournament?.id]);

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
    tournament?.format === "group_ko" &&
    tournament?.current_phase === "group";

  // Computed for the WHOLE group_ko format, not just the active group
  // phase, so the bar can act as a history reference once KO has started
  // (everything 100% / all ✓). The smart-queue maps below stay scoped
  // to the active group phase — KO matches must not be reordered by
  // group remaining counts.
  const groupProgress = useMemo(
    () => tournament?.format === "group_ko" ? getGroupProgress(rounds, matchesByRound) : [],
    [tournament?.format, rounds, matchesByRound],
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
  const futureRoundQueues = React.useMemo(() => {
    if (!activeRound || showAllGroups) return undefined;
    const activeRoundObj = rounds.find((r) => r.id === activeRound);
    if (!activeRoundObj) return undefined;
    return rounds
      .filter((r) => r.round_number > activeRoundObj.round_number)
      .map((r) => ({ round: r, matches: matchesByRound.get(r.id) || [] }))
      .filter(({ matches }) => matches.some((m) => !m.court && m.status !== "completed"));
  }, [activeRound, showAllGroups, rounds, matchesByRound]);

  const canGenerateNextRound =
    tournament?.status === "active" &&
    tournament.format !== "group_ko" &&
    tournament.format !== "elimination" &&
    tournament.format !== "swiss" &&
    tournament.format !== "monrad" &&
    tournament.format !== "king_of_court" &&
    tournament.format !== "waterfall" &&
    tournament.format !== "double_elimination" &&
    (tournament.format === "random_doubles" ||
      (tournament.format === "round_robin" && tournament.mode !== "singles")) &&
    rounds.length > 0 &&
    atLeastOneMatchCompleted(rounds[rounds.length - 1].id);

  // KO: Check if current KO round is complete and more rounds needed
  // third_place rounds are excluded so the bronze playoff doesn't influence
  // SF detection, "next round needed" logic, or bracket layout columns.
  const isElimination = tournament?.format === "elimination";
  const koRoundsForBracket = isElimination
    ? rounds.filter((r) => r.phase !== "third_place")
    : rounds.filter((r) => r.phase === "ko");
  const lastKoRound = koRoundsForBracket.length > 0 ? koRoundsForBracket[koRoundsForBracket.length - 1] : null;
  const lastKoMatches = lastKoRound ? matchesByRound.get(lastKoRound.id) || [] : [];
  const lastKoRoundComplete = lastKoRound ? allRoundMatchesCompleted(lastKoRound.id) : false;
  const needsNextKoRound = lastKoRoundComplete && lastKoMatches.length > 1;

  const generateNextKoRound = async () => {
    if (!tournament || !lastKoRound || !needsNextKoRound) return;

    // Collect winners from last KO round
    const winners: { p1: number; p2: number | null }[] = [];
    for (const m of lastKoMatches) {
      if (!m.winner_team) continue;
      if (m.winner_team === 1) {
        winners.push({ p1: m.team1_p1, p2: m.team1_p2 });
      } else {
        winners.push({ p1: m.team2_p1, p2: m.team2_p2 });
      }
    }

    if (winners.length < 2) return;

    const numCourts = tournament.courts || 1;
    const autoAssign = numCourts === 1;
    const nextRoundNum = rounds.length + 1;
    const phase = isElimination ? null : "ko";

    // SF -> Final transition: if the just-completed KO round had exactly 2
    // matches (i.e. the semi-finals) and the per-tournament toggle is
    // enabled, create the bronze playoff alongside the Final.
    const isSfToFinal = lastKoMatches.length === 2;
    const wantsBronze = tournament.enable_third_place === 1 && isSfToFinal;
    if (wantsBronze) {
      const sfLosers: { p1: number; p2: number | null }[] = [];
      for (const m of lastKoMatches) {
        if (!m.winner_team) continue;
        if (m.winner_team === 1) {
          sfLosers.push({ p1: m.team2_p1, p2: m.team2_p2 });
        } else {
          sfLosers.push({ p1: m.team1_p1, p2: m.team1_p2 });
        }
      }
      if (sfLosers.length === 2) {
        const bronzeRoundId = await createRound(tournamentId, nextRoundNum, "third_place", null);
        const court = autoAssign ? 1 : null;
        await createMatch(
          bronzeRoundId,
          sfLosers[0].p1, sfLosers[0].p2,
          sfLosers[1].p1, sfLosers[1].p2,
          court,
        );
      }
    }

    const roundId = await createRound(tournamentId, nextRoundNum, phase, null);

    // Pair winners: 1v2, 3v4, etc.
    for (let i = 0; i < winners.length - 1; i += 2) {
      const w1 = winners[i];
      const w2 = winners[i + 1];
      const court = autoAssign ? 1 : null;
      await createMatch(roundId, w1.p1, w1.p2, w2.p1, w2.p2, court);
    }

    setActiveRound(roundId);
    loadAll();
  };

  // Group-KO: Check if group phase is complete and KO can start
  const isGroupKo = tournament?.format === "group_ko";
  const groupRounds = rounds.filter((r) => r.phase === "group");
  const koRounds = rounds.filter((r) => r.phase === "ko");
  const groupPhaseComplete = isGroupKo && groupRounds.length > 0 &&
    groupRounds.every((r) => allRoundMatchesCompleted(r.id));
  const canStartKo = isGroupKo &&
    tournament?.status === "active" &&
    tournament?.current_phase === "group" &&
    groupPhaseComplete &&
    koRounds.length === 0;

  // Swiss: Check if next round can be generated
  const isSwiss = tournament?.format === "swiss";
  const swissRounds = rounds.filter((r) => r.phase === "swiss");
  const swissMaxRounds = tournament?.num_groups || 5; // num_groups stores swiss round count
  const lastSwissRound = swissRounds.length > 0 ? swissRounds[swissRounds.length - 1] : null;
  const lastSwissRoundComplete = lastSwissRound ? allRoundMatchesCompleted(lastSwissRound.id) : false;
  const canGenerateNextSwissRound = isSwiss &&
    tournament?.status === "active" &&
    swissRounds.length > 0 &&
    lastSwissRoundComplete &&
    swissRounds.length < swissMaxRounds;

  // Monrad: Check if next round can be generated (reuses swiss phase)
  const isMonrad = tournament?.format === "monrad";
  const monradRounds = isMonrad ? rounds.filter((r) => r.phase === "swiss") : [];
  const monradMaxRounds = isMonrad ? (tournament?.num_groups || 5) : 0;
  const lastMonradRound = monradRounds.length > 0 ? monradRounds[monradRounds.length - 1] : null;
  const lastMonradRoundComplete = lastMonradRound ? allRoundMatchesCompleted(lastMonradRound.id) : false;
  const canGenerateNextMonradRound = isMonrad &&
    tournament?.status === "active" &&
    monradRounds.length > 0 &&
    lastMonradRoundComplete &&
    monradRounds.length < monradMaxRounds;

  // King of the Court: Check if next match can be generated
  const isKingOfCourt = tournament?.format === "king_of_court";
  const lastKotcRound = isKingOfCourt && rounds.length > 0 ? rounds[rounds.length - 1] : null;
  const lastKotcMatches = lastKotcRound ? matchesByRound.get(lastKotcRound.id) || [] : [];
  const lastKotcComplete = lastKotcRound ? allRoundMatchesCompleted(lastKotcRound.id) : false;
  const canGenerateNextKotcMatch = isKingOfCourt &&
    tournament?.status === "active" &&
    rounds.length > 0 &&
    lastKotcComplete &&
    lastKotcMatches.length > 0;

  // Waterfall: Check if next round can be generated
  const isWaterfall = tournament?.format === "waterfall";
  const waterfallMaxRounds = isWaterfall ? (tournament?.num_groups || 5) : 0;
  const lastWaterfallRound = isWaterfall && rounds.length > 0 ? rounds[rounds.length - 1] : null;
  const lastWaterfallComplete = lastWaterfallRound ? allRoundMatchesCompleted(lastWaterfallRound.id) : false;
  const canGenerateNextWaterfallRound = isWaterfall &&
    tournament?.status === "active" &&
    rounds.length > 0 &&
    lastWaterfallComplete &&
    rounds.length < waterfallMaxRounds;

  // Double Elimination: Check if bracket can be advanced
  const isDoubleElimination = tournament?.format === "double_elimination";
  const winnersRounds = rounds.filter((r) => r.phase === "winners");
  const losersRounds = rounds.filter((r) => r.phase === "losers");
  const canAdvanceDoubleElimination = (() => {
    if (!isDoubleElimination || tournament?.status !== "active" || rounds.length === 0) return false;
    const lastWR = winnersRounds.length > 0 ? winnersRounds[winnersRounds.length - 1] : null;
    const lastLR = losersRounds.length > 0 ? losersRounds[losersRounds.length - 1] : null;
    const winnersComplete = lastWR ? allRoundMatchesCompleted(lastWR.id) : false;
    const losersComplete = lastLR ? allRoundMatchesCompleted(lastLR.id) : false;
    const lastWMatches = lastWR ? matchesByRound.get(lastWR.id) || [] : [];
    const lastLMatches = lastLR ? matchesByRound.get(lastLR.id) || [] : [];
    // Can advance if winners bracket last round is complete and has more than final match
    // or losers bracket last round is complete and has more than one match
    if (winnersComplete && lastWMatches.length > 1) return true;
    if (winnersComplete && losersRounds.length === 0 && lastWMatches.length >= 1) return true; // need to create losers bracket
    if (losersComplete && lastLMatches.length >= 1) return true;
    return false;
  })();

  // Pruefe ob noch offene Spiele existieren (ueber alle Runden)
  const hasOpenMatches = (() => {
    for (const [, matches] of matchesByRound) {
      if (matches.some((m) => m.status !== "completed")) return true;
    }
    return false;
  })();

  // Session pill + switcher data — must be computed before any early
  // return so the hook count stays stable between the loading-state render
  // and the loaded render (otherwise: hooks-order violation → white screen).
  const sessionSiblings = useMemo(() => {
    if (!tournament?.session_id) return [];
    return sessionCtx.tournaments.filter((tt) => tt.id !== tournament.id);
  }, [sessionCtx.tournaments, tournament?.session_id, tournament?.id]);

  if (!tournament) return <div>{t.common_loading}</div>;

  const handleArchive = async () => {
    await updateTournamentStatus(tournamentId, "archived");
    loadAll();
  };

  /**
   * Opt this tournament into live publishing. Just registers intent in
   * app_settings — the global LivePublisherHost picks it up on its next
   * 30s discovery tick and starts pushing snapshots. Errors out with a
   * helpful message if no connection is configured yet.
   */
  const handleEnableLive = async () => {
    setLiveBusy(true);
    try {
      const raw = await getAppSetting(LIVE_PUBLISH_SETTING_KEY);
      if (!raw) {
        showError(t.tournament_live_publish_no_config);
        return;
      }
      const config = JSON.parse(raw) as LivePublishConfig;
      if (!config.endpoint || !config.secret) {
        showError(t.tournament_live_publish_no_config);
        return;
      }
      await setTournamentLive(tournamentId, true);
      setLiveActive(true);
      showSuccess(t.tournament_live_publish_enabled);
    } catch (err) {
      showError(String(err));
    } finally {
      setLiveBusy(false);
    }
  };

  /**
   * Pause / resume live publishing for this tournament. Pause keeps the
   * opt-in in place so the user can quickly resume without re-enabling
   * from scratch. The publisher's discovery loop (~30s) drops paused
   * tournaments from its active set, so the next push happens on resume.
   */
  const handleTogglePause = async () => {
    setLiveBusy(true);
    try {
      const next = !livePaused;
      await setTournamentPaused(tournamentId, next);
      setLivePaused(next);
    } catch (err) {
      showError(String(err));
    } finally {
      setLiveBusy(false);
    }
  };

  /**
   * Force an immediate push regardless of debounce / heartbeat / backoff.
   * No-op when no Publisher is currently running (tournament not active+
   * opted-in+unpaused, or discovery hasn't picked it up yet).
   */
  const handlePushNow = () => {
    const triggered = triggerImmediatePush(tournamentId);
    if (triggered) {
      showSuccess(t.tournament_live_publish_pushed_now);
    }
  };

  /**
   * Stop publishing this tournament: remove it from the opt-in set AND
   * send a delete-request so the WP page also drops the snapshot. Local
   * data is untouched. The confirm step is owned by `<UnpublishModal />`.
   */
  const handleUnpublish = async () => {
    try {
      // Always drop from opt-in first — even if the WP delete fails, the
      // user clearly wants this tournament off, and we don't want the
      // publisher to keep pushing. Clear paused state too so re-enabling
      // later doesn't carry over a stale pause.
      await setTournamentLive(tournamentId, false);
      await setTournamentPaused(tournamentId, false);
      setLiveActive(false);
      setLivePaused(false);

      const raw = await getAppSetting(LIVE_PUBLISH_SETTING_KEY);
      if (!raw) {
        // No connection saved — nothing to delete remotely. Still counts
        // as "off" locally, no error shown.
        showSuccess(t.tournament_unpublish_done);
        return;
      }
      const config = JSON.parse(raw) as LivePublishConfig;
      if (!config.endpoint || !config.secret) {
        showSuccess(t.tournament_unpublish_done);
        return;
      }
      const result = await pushDelete(config, tournamentId);
      if (result.ok) {
        showSuccess(t.tournament_unpublish_done);
      } else {
        showError(t.tournament_unpublish_failed.replace("{error}", result.error));
      }
    } catch (err) {
      showError(t.tournament_unpublish_failed.replace("{error}", String(err)));
    }
  };

  const statusStyle =
    tournament.status === "active"
      ? `${theme.activeBadgeBg} ${theme.activeBadgeText}`
      : tournament.status === "completed"
      ? "bg-gray-100 text-gray-500"
      : tournament.status === "archived"
      ? "bg-violet-100 text-violet-600"
      : "bg-amber-100 text-amber-700";

  return (
    <div>
      {/* Session bar — only when this tournament is part of a session */}
      {tournament.session_id != null && sessionMeta && (
        <div className={`mb-3 ${theme.cardBg} border ${theme.cardBorder} rounded-2xl px-4 py-2 flex items-center justify-between flex-wrap gap-2 shadow-sm`}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wide bg-violet-100 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">
              🔗 {t.session_pill_label}
            </span>
            <span className={`text-sm font-semibold ${theme.textPrimary}`}>
              {sessionMeta.name}
            </span>
            <span className={`text-xs ${theme.textMuted}`}>
              · {sessionCtx.tournaments.length} 🏆
            </span>
            {sessionSiblings.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap ml-2">
                <span className={`text-[10px] uppercase tracking-wide ${theme.textMuted} mr-1`}>
                  {t.session_switcher_label}:
                </span>
                {sessionSiblings.map((sib) => (
                  <button
                    key={sib.id}
                    onClick={() => navigate(`/tournaments/${sib.id}`)}
                    className={`text-xs font-medium border ${theme.inputBorder} ${theme.cardHoverBorder} ${theme.textSecondary} px-2 py-0.5 rounded-full transition-all`}
                    title={sib.name}
                  >
                    {sib.name.length > 18 ? sib.name.slice(0, 18) + "…" : sib.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => navigate(`/sessions/${tournament.session_id}/live`)}
            className={`${theme.primaryBg} ${theme.primaryHoverBg} ${theme.primaryText} text-xs font-semibold px-3 py-1.5 rounded-lg transition-all`}
          >
            📺 {t.session_pill_open_dashboard} →
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className={`text-2xl font-extrabold ${theme.textPrimary} tracking-tight`}>
            {tournament.name}
          </h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-xs font-medium ${theme.cardBg} ${theme.textSecondary} border ${theme.cardBorder} px-2.5 py-1 rounded-full`}>
              {({singles: t.mode_singles, doubles: t.mode_doubles, mixed: t.mode_mixed} as Record<string, string>)[tournament.mode]}
            </span>
            <span className={`text-xs font-medium ${theme.cardBg} ${theme.textSecondary} border ${theme.cardBorder} px-2.5 py-1 rounded-full`}>
              {({round_robin: t.format_round_robin, elimination: t.format_elimination, random_doubles: t.format_random_doubles, group_ko: t.format_group_ko, swiss: t.format_swiss, double_elimination: t.format_double_elimination, monrad: t.format_monrad, king_of_court: t.format_king_of_court, waterfall: t.format_waterfall} as Record<string, string>)[tournament.format]}
            </span>
            <span className={`text-xs font-medium ${theme.cardBg} ${theme.textSecondary} border ${theme.cardBorder} px-2.5 py-1 rounded-full`}>
              {isGroupKo && tournament.ko_points_per_set != null
                ? `${t.ko_modal_group_phase_scoring}: ${getScoringDescription(tournament.points_per_set, tournament.cap)}`
                : getScoringDescription(tournament.points_per_set, tournament.cap)}
            </span>
            {isGroupKo && tournament.ko_points_per_set != null && (
              <span className={`text-xs font-medium bg-violet-100 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-full`}>
                KO: {getScoringDescription(tournament.ko_points_per_set, tournament.ko_cap)}
              </span>
            )}
            {tournament.courts > 1 && (
              <span className="text-xs font-medium bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full">
                {tournament.courts} {t.common_fields}
              </span>
            )}
            {isGroupKo && (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                tournament.current_phase === "ko"
                  ? "bg-violet-100 text-violet-700"
                  : `${theme.activeBadgeBg} ${theme.activeBadgeText}`
              }`}>
                {tournament.current_phase === "ko" ? t.tournament_view_ko_phase : t.tournament_view_groups_label.replace("{count}", String(tournament.num_groups))}
              </span>
            )}
            {isSwiss && swissRounds.length > 0 && (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${theme.activeBadgeBg} ${theme.activeBadgeText}`}>
                {t.tournament_view_swiss_round_counter.replace("{current}", String(swissRounds.length)).replace("{total}", String(swissMaxRounds))}
              </span>
            )}
            {isMonrad && monradRounds.length > 0 && (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${theme.activeBadgeBg} ${theme.activeBadgeText}`}>
                {t.tournament_view_monrad_round_counter.replace("{current}", String(monradRounds.length)).replace("{total}", String(monradMaxRounds))}
              </span>
            )}
            {isWaterfall && rounds.length > 0 && (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${theme.activeBadgeBg} ${theme.activeBadgeText}`}>
                {t.tournament_view_waterfall_round_counter.replace("{current}", String(rounds.length)).replace("{total}", String(waterfallMaxRounds))}
              </span>
            )}
            {isDoubleElimination && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">
                {t.format_double_elimination}
              </span>
            )}
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusStyle}`}
            >
              {({draft: t.status_draft, active: t.status_active, completed: t.status_completed, archived: t.status_archived} as Record<string, string>)[tournament.status]}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {tournament.status === "draft" && (
            <>
              <button
                onClick={() => navigate(`/tournaments/${tournament.id}/edit`)}
                className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-4 py-2.5 rounded-xl ${theme.cardHoverBorder} transition-all text-sm font-medium`}
              >
                ✏️ {t.tournament_view_edit}
              </button>
              <button
                onClick={() => setShowTemplateExport(true)}
                className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-4 py-2.5 rounded-xl ${theme.cardHoverBorder} transition-all text-sm font-medium`}
              >
                📋 {t.tournament_view_template}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-4 py-2.5 rounded-xl hover:border-rose-300 hover:text-rose-600 transition-all text-sm font-medium`}
              >
                🗑️ {t.tournament_view_delete}
              </button>
              <button
                onClick={() => setShowAttendance(true)}
                disabled={tournament.current_phase !== "ready"}
                title={tournament.current_phase !== "ready" ? t.tournament_view_not_started_hint : t.tournament_view_start}
                className={`${theme.primaryBg} ${theme.primaryText} px-5 py-2.5 rounded-xl ${theme.primaryHoverBg} shadow-sm hover:shadow-md transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none`}
              >
                🚀 {t.tournament_view_start}
              </button>
            </>
          )}
          {canGenerateNextRound && (
            <button
              onClick={generateNextRound}
              className="bg-amber-500 text-white px-5 py-2.5 rounded-xl hover:bg-amber-600 shadow-sm hover:shadow-md transition-all text-sm font-medium"
            >
              🎲 {t.tournament_view_next_round}
            </button>
          )}
          {canStartKo && (
            <button
              onClick={() => setShowStartKoModal(true)}
              className="bg-violet-600 text-white px-5 py-2.5 rounded-xl hover:bg-violet-700 shadow-sm hover:shadow-md transition-all text-sm font-medium"
            >
              🏆 {t.tournament_view_start_ko}
            </button>
          )}
          {needsNextKoRound && tournament.status === "active" && (
            <button
              onClick={generateNextKoRound}
              className="bg-violet-600 text-white px-5 py-2.5 rounded-xl hover:bg-violet-700 shadow-sm hover:shadow-md transition-all text-sm font-medium"
            >
              ➡️ {t.tournament_view_next_ko_round}
            </button>
          )}
          {canGenerateNextSwissRound && (
            <button
              onClick={generateNextSwissRound}
              className="bg-amber-500 text-white px-5 py-2.5 rounded-xl hover:bg-amber-600 shadow-sm hover:shadow-md transition-all text-sm font-medium"
            >
              🔄 {t.tournament_view_next_swiss_round}
            </button>
          )}
          {canGenerateNextMonradRound && (
            <button
              onClick={generateNextMonradRound}
              className="bg-amber-500 text-white px-5 py-2.5 rounded-xl hover:bg-amber-600 shadow-sm hover:shadow-md transition-all text-sm font-medium"
            >
              🔄 {t.tournament_view_next_monrad_round}
            </button>
          )}
          {canGenerateNextKotcMatch && (
            <button
              onClick={generateNextKingOfCourtMatch}
              className="bg-amber-500 text-white px-5 py-2.5 rounded-xl hover:bg-amber-600 shadow-sm hover:shadow-md transition-all text-sm font-medium"
            >
              🎯 {t.tournament_view_next_kotc_match}
            </button>
          )}
          {canGenerateNextWaterfallRound && (
            <button
              onClick={generateNextWaterfallRound}
              className="bg-amber-500 text-white px-5 py-2.5 rounded-xl hover:bg-amber-600 shadow-sm hover:shadow-md transition-all text-sm font-medium"
            >
              🔄 {t.tournament_view_next_waterfall_round}
            </button>
          )}
          {canAdvanceDoubleElimination && (
            <button
              onClick={advanceDoubleElimination}
              className="bg-violet-600 text-white px-5 py-2.5 rounded-xl hover:bg-violet-700 shadow-sm hover:shadow-md transition-all text-sm font-medium"
            >
              ➡️ {t.tournament_view_advance_bracket}
            </button>
          )}
          {tournament.status === "active" && rounds.length > 0 && (
            <button
              onClick={() => setShowUndoRound(true)}
              disabled={!undoTarget}
              className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-4 py-2.5 rounded-xl hover:border-amber-300 hover:text-amber-600 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              ↩️ {t.tournament_view_undo_round}
            </button>
          )}
          {tournament.status === "active" && (
            <button
              onClick={handleCompleteTournament}
              disabled={hasOpenMatches}
              title={hasOpenMatches ? t.tournament_view_has_open_matches : t.tournament_view_end}
              className={`px-4 py-2.5 rounded-xl transition-all text-sm font-medium ${
                hasOpenMatches
                  ? `${theme.cardBg} border ${theme.cardBorder} ${theme.textMuted} cursor-not-allowed opacity-50`
                  : `${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} hover:border-rose-300 hover:text-rose-600`
              }`}
            >
              {t.tournament_view_end}
            </button>
          )}
          {tournament.status === "completed" && (
            <button
              onClick={() => setShowReopenConfirm(true)}
              className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-4 py-2.5 rounded-xl hover:border-emerald-300 hover:text-emerald-600 transition-all text-sm font-medium`}
            >
              🔓 {t.tournament_view_reopen}
            </button>
          )}
          {tournament.status === "completed" && (
            <button
              onClick={handleArchive}
              className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-4 py-2.5 rounded-xl hover:border-violet-300 hover:text-violet-600 transition-all text-sm font-medium`}
            >
              📦 {t.tournament_view_archive}
            </button>
          )}
          {rounds.length > 0 && (
            <button
              onClick={() => setShowPrint(true)}
              className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-4 py-2.5 rounded-xl ${theme.cardHoverBorder} transition-all text-sm font-medium`}
            >
              🖨️ {t.tournament_view_print}
            </button>
          )}
          {/* Per-tournament Live publishing controls. Three UI states:
                - Inactive: "Live aktivieren" (disabled while tournament is a draft)
                - Active:   "Live aktiv" + Pause + "Push jetzt" buttons + inline status
                - Paused:   "Live pausiert" + Resume + Stop, no push activity
              The active-state button stays clickable on drafts (rare reopen
              scenario) so a stale opt-in can still be cleared. */}
          {liveActive ? (() => {
            // Compact button group: the main pill carries the label + ID;
            // the two secondary actions (pause/resume and push-now) are
            // attached as 32×32 icon squares to keep horizontal space tight.
            // The status text wraps below on narrow viewports.
            const statusText = (() => {
              if (livePaused) return t.tournament_live_status_paused_hint;
              const fmtRel = (iso: string | null): string | null => {
                if (!iso) return null;
                const diffSec = Math.max(0, Math.floor((liveStatusNow - new Date(iso).getTime()) / 1000));
                if (diffSec < 60) return `${diffSec}s`;
                const m = Math.floor(diffSec / 60);
                if (m < 60) return `${m} min`;
                const h = Math.floor(m / 60);
                return `${h} h`;
              };
              if (livePushStatus?.backoffUntil && livePushStatus.backoffUntil > liveStatusNow) {
                return t.tournament_live_status_backoff;
              }
              if (livePushStatus?.lastError) {
                const rel = fmtRel(livePushStatus.lastPushAt);
                return t.tournament_live_status_error_ago.replace("{time}", rel ?? "?");
              }
              if (livePushStatus?.lastPushAt) {
                const rel = fmtRel(livePushStatus.lastPushAt);
                return rel ? t.tournament_live_status_pushed_ago.replace("{time}", rel) : "";
              }
              return t.tournament_live_status_never_pushed;
            })();
            return (
              <div className="inline-flex items-center gap-1 flex-wrap">
                {/* Main pill — opens UnpublishModal on click */}
                <button
                  onClick={() => setShowUnpublishConfirm(true)}
                  title={t.tournament_live_publish_id_hint.replace("{id}", String(tournamentId))}
                  disabled={liveBusy}
                  className={`${
                    livePaused
                      ? "bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                      : "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                  } border px-4 py-2.5 rounded-xl transition-all text-sm font-medium disabled:opacity-50`}
                >
                  📡 {livePaused ? t.tournament_live_publish_paused_label : t.tournament_live_publish_active}
                  <span className={`ml-2 px-1.5 py-0.5 rounded-md ${livePaused ? "bg-amber-100 dark:bg-amber-800/40 border-amber-200 dark:border-amber-700/50" : "bg-emerald-100 dark:bg-emerald-800/40 border-emerald-200 dark:border-emerald-700/50"} border text-[11px] font-mono opacity-90`}>
                    ID: {tournamentId}
                  </span>
                </button>
                {/* Compact icon controls — tooltips carry the action label */}
                <button
                  onClick={handleTogglePause}
                  disabled={liveBusy}
                  title={livePaused ? t.tournament_live_publish_resume : t.tournament_live_publish_pause}
                  aria-label={livePaused ? t.tournament_live_publish_resume : t.tournament_live_publish_pause}
                  className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} w-8 h-8 flex items-center justify-center rounded-lg hover:border-amber-300 hover:text-amber-600 transition-all text-sm disabled:opacity-50`}
                >
                  {livePaused ? "▶️" : "⏸️"}
                </button>
                {!livePaused && (
                  <button
                    onClick={handlePushNow}
                    disabled={liveBusy}
                    title={t.tournament_live_publish_push_now}
                    aria-label={t.tournament_live_publish_push_now}
                    className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} w-8 h-8 flex items-center justify-center rounded-lg hover:border-emerald-300 hover:text-emerald-600 transition-all text-sm disabled:opacity-50`}
                  >
                    🔄
                  </button>
                )}
                {/* Status — small, muted, follows the buttons */}
                <span className={`text-[10px] ${theme.textMuted} self-center ml-1.5 whitespace-nowrap`}>
                  {statusText}
                </span>
              </div>
            );
          })() : (() => {
            const isDraft = tournament.status === "draft";
            const tooltip = isDraft
              ? t.tournament_live_publish_disabled_draft
              : t.tournament_live_publish_id_hint.replace("{id}", String(tournamentId));
            return (
              <button
                onClick={handleEnableLive}
                title={tooltip}
                disabled={liveBusy || isDraft}
                className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-4 py-2.5 rounded-xl hover:border-emerald-300 hover:text-emerald-600 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                📡 {t.tournament_live_publish_enable}
                <span className={`ml-2 px-1.5 py-0.5 rounded-md ${theme.inputBg} border ${theme.inputBorder} text-[11px] font-mono opacity-80`}>
                  ID: {tournamentId}
                </span>
              </button>
            );
          })()}
          {tournament.status === "active" && (
            <button
              onClick={async () => {
                if (isTauri()) {
                  try {
                    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
                    const tvWin = new WebviewWindow(`tv-${tournamentId}`, {
                      url: `/tv/${tournamentId}`,
                      title: `${t.tournament_view_tv_mode}: ${tournament.name}`,
                      width: 1920,
                      height: 1080,
                      fullscreen: false,
                      maximized: true,
                      decorations: true,
                      dragDropEnabled: false,
                    });
                    tvWin.once("tauri://error", (e) => {
                      console.error("TV window error:", e);
                    });
                  } catch (err) {
                    console.error("Failed to open TV window:", err);
                  }
                } else {
                  const url = `${window.location.origin}/tv/${tournamentId}`;
                  window.open(url, `tv-${tournamentId}`, "width=1920,height=1080,menubar=no,toolbar=no");
                }
              }}
              className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-4 py-2.5 rounded-xl ${theme.cardHoverBorder} transition-all text-sm font-medium`}
            >
              📺 {t.tournament_view_tv_mode}
            </button>
          )}
        </div>
      </div>

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
            loadAll();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && tournament && (
        <DeleteTournamentModal
          tournament={tournament}
          theme={theme}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={async () => {
            await deleteTournament(tournament.id);
            navigate("/");
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
          onConfirm={handleAttendanceConfirm}
          onClose={() => setShowAttendance(false)}
        />
      )}

      {/* Retire/Injured Modal */}
      {retireTarget && (
        <RetirePlayerModal
          retireTarget={retireTarget}
          theme={theme}
          onClose={() => setRetireTarget(null)}
          onConfirm={handlePlayerRetire}
        />
      )}

      {/* Remove-Player Confirm Modal (draft status only) */}
      {removeTarget && (
        <RemovePlayerModal
          target={removeTarget}
          theme={theme}
          onClose={() => setRemoveTarget(null)}
          onConfirm={confirmRemovePlayer}
        />
      )}

      <RestWarningModal
        warning={restWarning}
        theme={theme}
        onCancel={() => setRestWarning(null)}
        onConfirm={async () => {
          const w = restWarning;
          if (!w) return;
          setRestWarning(null);
          await handleCourtChange(w.matchId, w.court, true);
        }}
      />

      <PlayerConflictModal
        conflict={playerConflict}
        theme={theme}
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
            await loadAll();
            setShowStartKoModal(false);
            await startKoPhase();
          }}
        />
      )}

      <ReopenConfirmModal
        open={showReopenConfirm}
        theme={theme}
        onCancel={() => setShowReopenConfirm(false)}
        onConfirm={handleReopenTournament}
      />

      <UnpublishModal
        open={showUnpublishConfirm}
        tournamentName={tournament.name}
        theme={theme}
        onClose={() => setShowUnpublishConfirm(false)}
        onConfirm={handleUnpublish}
      />


      <UndoRoundModal
        open={showUndoRound}
        target={undoTarget}
        theme={theme}
        onCancel={() => setShowUndoRound(false)}
        onConfirm={performUndo}
      />

      {/* Round Tabs - above everything */}
      {rounds.length === 0 && tournament.status === "draft" && (
        <div className={`${theme.cardBg} rounded-2xl shadow-sm border ${theme.cardBorder} p-8 mb-6`}>
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🏸</div>
            <div className={`text-lg font-semibold ${theme.textPrimary}`}>
              {t.tournament_view_not_started}
            </div>
            <div className={`text-sm ${theme.textMuted} mt-1`}>
              {t.tournament_view_not_started_hint}
            </div>
          </div>

          {/* Tournament Summary */}
          <div className={`${theme.inputBg} rounded-xl p-5 border ${theme.inputBorder}`}>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className={`${theme.textMuted} text-xs uppercase tracking-wide`}>{t.tournament_mode}</span>
                <div className={`font-medium ${theme.textPrimary} mt-0.5`}>
                  {{ singles: t.mode_singles, doubles: t.mode_doubles, mixed: t.mode_mixed }[tournament.mode]}
                </div>
              </div>
              <div>
                <span className={`${theme.textMuted} text-xs uppercase tracking-wide`}>{t.tournament_format}</span>
                <div className={`font-medium ${theme.textPrimary} mt-0.5`}>
                  {{ round_robin: t.format_round_robin, elimination: t.format_elimination, random_doubles: t.format_random_doubles, group_ko: t.format_group_ko, swiss: t.format_swiss, double_elimination: t.format_double_elimination, monrad: t.format_monrad, king_of_court: t.format_king_of_court, waterfall: t.format_waterfall }[tournament.format]}
                </div>
              </div>
              <div>
                <span className={`${theme.textMuted} text-xs uppercase tracking-wide`}>{t.tournament_sets_to_win}</span>
                <div className={`font-medium ${theme.textPrimary} mt-0.5`}>Best of {tournament.sets_to_win * 2 - 1}</div>
              </div>
              <div>
                <span className={`${theme.textMuted} text-xs uppercase tracking-wide`}>{t.tournament_points_per_set}</span>
                <div className={`font-medium ${theme.textPrimary} mt-0.5`}>{tournament.points_per_set}</div>
              </div>
              <div>
                <span className={`${theme.textMuted} text-xs uppercase tracking-wide`}>{t.common_courts}</span>
                <div className={`font-medium ${theme.textPrimary} mt-0.5`}>{tournament.courts}</div>
              </div>
              <div>
                <span className={`${theme.textMuted} text-xs uppercase tracking-wide`}>{t.stats_player}</span>
                <div className={`font-medium ${theme.textPrimary} mt-0.5`}>{players.length}</div>
              </div>
            </div>
            {players.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                <span className={`${theme.textMuted} text-xs uppercase tracking-wide`}>{t.management_participants.replace("{count}", String(players.length))}</span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {players.map(p => (
                    <span key={p.id} className={`text-xs px-2 py-0.5 rounded-full ${
                      p.gender === "m" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
                    }`}>
                      {playerDisplayName(p)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* View Tabs */}
      {rounds.length > 0 && (
        <div className={`flex border-b-2 ${theme.inputBorder} mb-5`}>
          {(() => {
            const hasBracket = koRoundsForBracket.length > 0 && (isElimination || (isGroupKo && tournament.current_phase === "ko"));
            const hasDoubleElimBracket = isDoubleElimination && (winnersRounds.length > 0 || losersRounds.length > 0);
            const showRangliste = !isGroupKo || koRounds.length > 0;
            const viewTabs = [
              { key: "spiele" as const, label: t.tournament_view_tab_matches, icon: "🏸" },
              ...(isGroupKo && groupRounds.length > 0 ? [{ key: "gruppen" as const, label: t.tournament_view_tab_groups, icon: "📋" }] : []),
              ...(hasBracket || hasDoubleElimBracket ? [{ key: "bracket" as const, label: t.tournament_view_tab_bracket, icon: "🏆" }] : []),
              ...(showRangliste ? [{ key: "rangliste" as const, label: t.tournament_view_tab_standings, icon: "📊" }] : []),
              { key: "verwaltung" as const, label: t.tournament_view_tab_management, icon: "👥" },
            ];
            return viewTabs;
          })().map((tab) => (
            <button
              key={tab.key}
              onClick={() => setViewTab(tab.key)}
              className={`px-6 py-3 text-sm font-semibold transition-all duration-200 relative rounded-t-lg ${
                viewTab === tab.key
                  ? `${theme.textPrimary}`
                  : `${theme.textMuted} hover:${theme.textPrimary} hover:bg-black/[0.03]`
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
              {viewTab === tab.key ? (
                <span className={`absolute bottom-0 left-0 right-0 h-[3px] ${theme.primaryBg} rounded-t-full`} />
              ) : (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-transparent group-hover:bg-gray-200 rounded-t-full transition-all" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Tab: Spiele */}
      {viewTab === "spiele" && (
        <div>
          {/* Per-group progress with embedded round-status pills.
              Visible whenever there are group rounds — during the
              active group phase (live) AND afterwards (history). */}
          {groupProgress.length > 0 && (
            <GroupProgressBar progress={groupProgress} />
          )}

          {rounds.length > 0 && (
            <div className="mb-4 space-y-2">
              {/* Per-group round status is now embedded inside the
                  GroupProgressBar above (round pills next to the bar)
                  — no separate read-only G1/G2/G3 rows here. */}
              {/* KO rounds */}
              {koRounds.length > 0 && (
                <div className="flex gap-2 flex-wrap items-center">
                  <span className="text-xs font-bold text-violet-400 uppercase tracking-wide w-8">KO</span>
                  {koRounds.map((r) => {
                    const colorClass = activeRound === r.id
                      ? "bg-violet-600 text-white shadow-md"
                      : `${theme.cardBg} text-violet-600 hover:bg-violet-500/10 border border-violet-500/30 hover:border-violet-400`;
                    return (
                      <button
                        key={r.id}
                        onClick={() => { setActiveRound(r.id); setShowAllGroups(false); }}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${colorClass}`}
                      >
                        R{koRounds.indexOf(r) + 1}
                        {allRoundMatchesCompleted(r.id) && <span className="ml-1.5">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Double Elimination rounds (winners + losers) */}
              {isDoubleElimination && (
                <>
                  {winnersRounds.length > 0 && (
                    <div className="flex gap-2 flex-wrap items-center">
                      <span className="text-xs font-bold text-emerald-500 uppercase tracking-wide w-8">W</span>
                      {winnersRounds.map((r, idx) => {
                        const colorClass = activeRound === r.id
                          ? "bg-emerald-600 text-white shadow-md"
                          : `${theme.cardBg} text-emerald-600 hover:bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-400`;
                        return (
                          <button
                            key={r.id}
                            onClick={() => { setActiveRound(r.id); setShowAllGroups(false); }}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${colorClass}`}
                          >
                            R{idx + 1}
                            {allRoundMatchesCompleted(r.id) && <span className="ml-1.5">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {losersRounds.length > 0 && (
                    <div className="flex gap-2 flex-wrap items-center">
                      <span className="text-xs font-bold text-rose-400 uppercase tracking-wide w-8">L</span>
                      {losersRounds.map((r, idx) => {
                        const colorClass = activeRound === r.id
                          ? "bg-rose-600 text-white shadow-md"
                          : `${theme.cardBg} text-rose-600 hover:bg-rose-500/10 border border-rose-500/30 hover:border-rose-400`;
                        return (
                          <button
                            key={r.id}
                            onClick={() => { setActiveRound(r.id); setShowAllGroups(false); }}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${colorClass}`}
                          >
                            R{idx + 1}
                            {allRoundMatchesCompleted(r.id) && <span className="ml-1.5">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
              {/* Normal rounds (non group_ko, non double_elimination).
                  third_place rounds are excluded here and rendered as a
                  dedicated bronze button below so they don't read as a
                  generic "Runde N" alongside the Final. */}
              {!isGroupKo && !isDoubleElimination && (
                <div className="flex gap-2 flex-wrap">
              {rounds.filter((r) => r.phase !== "third_place").map((r) => {
                const label = t.tournament_view_round_label.replace("{n}", String(r.round_number));
                const colorClass = activeRound === r.id
                  ? `${theme.roundActiveBg} ${theme.roundActiveText} shadow-md`
                  : `${theme.cardBg} ${theme.textSecondary} hover:opacity-80 border ${theme.cardBorder} ${theme.cardHoverBorder}`;

                return (
                  <button
                    key={r.id}
                    onClick={() => { setActiveRound(r.id); setShowAllGroups(false); }}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${colorClass}`}
                  >
                      {label}
                      {allRoundMatchesCompleted(r.id) && (
                        <span className="ml-1.5">✓</span>
                      )}
                    </button>
                );
              })}
                </div>
              )}
              {/* Dedicated bronze playoff button (any KO format) */}
              {thirdPlaceRound && (
                <div className="flex gap-2 flex-wrap items-center">
                  <span className="text-xs font-bold text-orange-500 uppercase tracking-wide w-8" aria-hidden="true">🥉</span>
                  <button
                    onClick={() => { setActiveRound(thirdPlaceRound.id); setShowAllGroups(false); }}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                      activeRound === thirdPlaceRound.id
                        ? "bg-orange-600 text-white shadow-md"
                        : `${theme.cardBg} text-orange-600 hover:bg-orange-500/10 border border-orange-500/30 hover:border-orange-400`
                    }`}
                  >
                    {t.bracket_third_place_short}
                    {allRoundMatchesCompleted(thirdPlaceRound.id) && (
                      <span className="ml-1.5">✓</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Court Overview */}
          {rounds.length > 0 && (activeRound || showAllGroups) && tournament.status === "active" && (
            <CourtOverview
              courts={Math.max(tournament.courts || 1, 1)}
              matches={allMatches}
              // During an active group phase the unassigned-queue ALWAYS spans
              // every group's pending matches — even when the user has clicked
              // a single-round button — so the smart-queue can promote the
              // lagging group's matches above the others. Without this, the
              // queue would only ever show the round you're currently viewing
              // and the smart-sort would have nothing to reorder.
              activeRoundMatches={(isGroupPhaseActive || showAllGroups)
                ? groupRounds.flatMap((r) => matchesByRound.get(r.id) || [])
                : activeRound ? matchesByRound.get(activeRound) : undefined}
              futureRoundQueues={futureRoundQueues}
              playerName={playerName}
              hallConfig={
                // For sessioned tournaments at a venue, the venue's hall_config
                // is the canonical source of truth. The tournament's local
                // hall_config (which may be a stale copy) is bypassed so all
                // sibling tournaments share one consistent court grid.
                (tournament.session_id != null && sessionVenueHalls)
                  ? parseHallConfig(sessionVenueHalls)
                  : (tournament.hall_config ? parseHallConfig(tournament.hall_config) : undefined)
              }
              minRestMinutes={tournament.min_rest_minutes}
              tournamentStatus={tournament.status}
              conflictedMatches={conflictedMatches}
              remainingByGroup={remainingByGroup}
              roundToGroup={roundToGroup}
              onDrop={(matchId, court) => handleCourtChange(matchId, court)}
              onMatchClick={(matchId) => {
                const match = allMatches.find((m) => m.id === matchId);
                if (!match) return;
                // When the next round has already been drawn, the target match
                // may live in a round tab that isn't currently rendered. Switch
                // to that tab first so the DOM node exists when we try to scroll.
                const renderedInCurrentTab = showAllGroups
                  ? groupRounds.some((r) => r.id === match.round_id)
                  : match.round_id === activeRound;
                if (!renderedInCurrentTab) {
                  setActiveRound(match.round_id);
                  setShowAllGroups(false);
                }
                const scrollAndFocus = () => {
                  const el = document.querySelector(`[data-match-id="${matchId}"]`);
                  if (!el) return;
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  el.classList.add("ring-2", "ring-amber-400");
                  setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 2000);
                  setTimeout(() => {
                    const input = el.querySelector('input[type="number"]:not(:disabled)') as HTMLInputElement | null;
                    if (input) input.focus();
                  }, 400);
                };
                if (renderedInCurrentTab) {
                  scrollAndFocus();
                } else {
                  // Defer until React has committed the round switch and the
                  // MatchCard for this id is mounted.
                  setTimeout(scrollAndFocus, 100);
                }
              }}
            />
          )}

          {rounds.length > 0 && (
            <div>
              {/* Matches - sorted: on court → open → completed */}
              {(activeRound || showAllGroups) &&
                (() => {
                  const raw = showAllGroups
                    ? groupRounds.flatMap((r) => matchesByRound.get(r.id) || [])
                    : matchesByRound.get(activeRound!) || [];
                  // Recently completed matches stay in their original section for 3s
                  const isRecent = (m: Match) => recentlyCompleted.has(m.id);
                  const isEditing = (m: Match) => editingMatchIds.has(m.id);
                  const onCourt = raw.filter((m) =>
                    ((m.court && m.status !== "completed") || (isRecent(m) && m.court)) && !isEditing(m)
                  );
                  const completed = raw.filter((m) =>
                    (m.status === "completed" && !isRecent(m)) || isEditing(m)
                  );
                  return (
                    <>
                      {onCourt.length > 0 && (
                        <div className={`text-xs font-bold ${theme.textMuted} uppercase tracking-wider mb-2`}>
                          {t.tournament_view_on_court.replace("{count}", String(onCourt.length))}
                        </div>
                      )}
                      {onCourt.map((match) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          sets={setsByMatch.get(match.id) || []}
                          setsToWin={effectiveScoring.setsToWin}
                          pointsPerSet={effectiveScoring.pointsPerSet}
                          cap={effectiveScoring.cap}
                          courts={tournament.courts || 1}
                          occupiedCourts={globalOccupiedCourts}
                          conflictedMatches={conflictedMatches}
                          playerName={playerName}
                          onScoreChange={handleScoreChange}
                          onScoreBlur={handleScoreBlur}
                          onScoreCommit={handleScoreCommit}
                          onCourtChange={handleCourtChange}
                          onAnnounce={handleAnnounce}
                          onReset={handleReopenMatch}
                          isActive={tournament.status === "active"}
                          theme={theme}
                          allMatches={allMatches}
                          minRestMinutes={tournament.min_rest_minutes}
                        />
                      ))}

                      {completed.length > 0 && (
                        <CompletedMatchesSection
                          matches={completed}
                          setsByMatch={setsByMatch}
                          setsToWin={effectiveScoring.setsToWin}
                          pointsPerSet={effectiveScoring.pointsPerSet}
                          cap={effectiveScoring.cap}
                          courts={tournament.courts || 1}
                          occupiedCourts={globalOccupiedCourts}
                          conflictedMatches={conflictedMatches}
                          playerName={playerName}
                          onScoreChange={handleScoreChange}
                          onScoreBlur={handleScoreBlur}
                          onScoreCommit={handleScoreCommit}
                          onCourtChange={handleCourtChange}
                          onAnnounce={handleAnnounce}
                          onReset={handleReopenMatch}
                          isActive={tournament.status === "active"}
                          theme={theme}
                          hasOtherMatches={onCourt.length > 0}
                          editingMatchIds={editingMatchIds}
                          allMatches={allMatches}
                          minRestMinutes={tournament.min_rest_minutes}
                          roundToGroup={roundToGroup}
                        />
                      )}
                    </>
                  );
                })()}
            </div>
          )}
        </div>
      )}

      {/* Tab: Gruppen */}
      {viewTab === "gruppen" && isGroupKo && (
        <GruppenTab
          tournament={tournament}
          players={players}
          theme={theme}
          rounds={rounds}
          getGroupData={getGroupData}
          seedRankByPlayer={seedRankByPlayer}
        />
      )}

      {/* Tab: Bracket */}
      {viewTab === "bracket" && koRoundsForBracket.length > 0 && (isElimination || (isGroupKo && tournament.current_phase === "ko")) && (
        <>
          <BracketView
            rounds={koRoundsForBracket}
            matchesByRound={matchesByRound}
            setsByMatch={setsByMatch}
            playerName={playerName}
            pointsPerSet={isGroupKo && tournament.ko_points_per_set != null ? tournament.ko_points_per_set : tournament.points_per_set}
            cap={isGroupKo && tournament.ko_points_per_set != null ? tournament.ko_cap : tournament.cap}
            allMatches={allMatches}
            minRestMinutes={tournament.min_rest_minutes}
            tournamentStatus={tournament.status}
          />
          {thirdPlaceRound && (
            <BronzeMatchPanel
              bronzeRound={thirdPlaceRound}
              matches={matchesByRound.get(thirdPlaceRound.id) || []}
              setsByMatch={setsByMatch}
              playerName={playerName}
              pointsPerSet={isGroupKo && tournament.ko_points_per_set != null ? tournament.ko_points_per_set : tournament.points_per_set}
              cap={isGroupKo && tournament.ko_points_per_set != null ? tournament.ko_cap : tournament.cap}
              allMatches={allMatches}
              minRestMinutes={tournament.min_rest_minutes}
              tournamentStatus={tournament.status}
            />
          )}
        </>
      )}

      {/* Tab: Bracket (Double Elimination) */}
      {viewTab === "bracket" && isDoubleElimination && (winnersRounds.length > 0 || losersRounds.length > 0) && (
        <div>
          {winnersRounds.length > 0 && (
            <>
              <h3 className={`text-lg font-bold ${theme.textPrimary} mb-3`}>{t.bracket_winners_bracket}</h3>
              <BracketView
                rounds={winnersRounds}
                matchesByRound={matchesByRound}
                setsByMatch={setsByMatch}
                playerName={playerName}
                pointsPerSet={tournament.points_per_set}
                cap={tournament.cap}
                allMatches={allMatches}
                minRestMinutes={tournament.min_rest_minutes}
                tournamentStatus={tournament.status}
              />
            </>
          )}
          {losersRounds.length > 0 && (
            <>
              <h3 className={`text-lg font-bold ${theme.textPrimary} mb-3 mt-6`}>{t.bracket_losers_bracket}</h3>
              <BracketView
                rounds={losersRounds}
                matchesByRound={matchesByRound}
                setsByMatch={setsByMatch}
                playerName={playerName}
                pointsPerSet={tournament.points_per_set}
                cap={tournament.cap}
                allMatches={allMatches}
                minRestMinutes={tournament.min_rest_minutes}
                tournamentStatus={tournament.status}
              />
            </>
          )}
          {thirdPlaceRound && (
            <BronzeMatchPanel
              bronzeRound={thirdPlaceRound}
              matches={matchesByRound.get(thirdPlaceRound.id) || []}
              setsByMatch={setsByMatch}
              playerName={playerName}
              pointsPerSet={tournament.points_per_set}
              cap={tournament.cap}
              allMatches={allMatches}
              minRestMinutes={tournament.min_rest_minutes}
              tournamentStatus={tournament.status}
            />
          )}
        </div>
      )}

      {/* Tab: Rangliste */}
      {viewTab === "rangliste" && (
        <RanglisteTab
          tournament={tournament}
          players={players}
          standings={standings}
          theme={theme}
        />
      )}

      {/* Tab: Verwaltung (Teilnehmer + Startgeld kombiniert) */}
      {viewTab === "verwaltung" && tournament && (
        <VerwaltungTab
          tournament={tournament}
          players={players}
          allPlayers={allPlayers}
          paymentData={paymentData}
          theme={theme}
          collapsedClubs={collapsedClubs}
          showAddPlayer={showAddPlayer}
          allMatches={allMatches}
          setShowAddPlayer={setShowAddPlayer}
          handleAddPlayer={handleAddPlayer}
          handleRemovePlayer={handleRemovePlayer}
          setPaymentData={setPaymentData}
          setCollapsedClubs={setCollapsedClubs}
          setRetireTarget={setRetireTarget}
          onUnretire={handlePlayerUnretire}
          playerName={playerName}
        />
      )}
    </div>
  );
}

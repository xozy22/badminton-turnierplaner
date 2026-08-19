import React, { useEffect, useState, useCallback, useMemo } from "react";
import Icon from "../../components/ui/Icon";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import PrintDialog from "../../components/print/PrintDialog";
import OverflowMenu from "../../components/ui/OverflowMenu";
import NextStepBar from "../../components/tournament/NextStepBar";
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
  upsertSet,
  updateMatchResult,
  updateMatchCourt,
  clearMatchCourt,
  reopenMatch,
  updateTournament,
  updateTournamentStatus,
  deleteTournament,
  addPlayerToTournament,
  removePlayerFromTournament,
  retirePlayerFromTournament,
  unretirePlayerFromTournament,
  getRetiredPlayerIds,
  getTournamentPlayersDetailed,
  isTauri,
  updateTournamentKoScoring,
  createSchedule,
  setMatchWalkover,
  getKingOfCourtQueue,
  setKingOfCourtQueue,
  deleteRoundsAtomically,
} from "../../lib/db";
import {
  calculateStandings,
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
import { engineFor } from "../../lib/formats";
import type { FormatContext, FormatPlan } from "../../lib/formats";
import { getGrandFinalRounds, markGrandFinalRounds } from "../../lib/db";
import {
  matchesToCsv,
  standingsToCsv,
  paymentsToCsv,
  toJsonExport,
  exportFileName,
} from "../../lib/resultExport";
import { useSessionContext } from "../../lib/sessionContext";
import { getSession } from "../../lib/sessions";
import type { Session } from "../../lib/types";


export default function TournamentView() {
  const { theme } = useTheme();
  const { t } = useT();
  const { showSuccess, showError, showInfo } = useToast();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // What the wizard may hand over when navigating here. Seeds are only a
  // fallback these days — the draw reads them from the database (A4).
  const navState = (location.state ?? null) as {
    seeds?: number[];
    teams?: [number, number][];
    savedSuccess?: boolean;
  } | null;
  const navSeeds = navState?.seeds;
  const navTeamsFromState = navState?.teams;
  const navSavedSuccess = !!navState?.savedSuccess;
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

  /** Groups matches by their round, for the per-round views. */
  const groupMatchesByRound = (matches: Match[]): Map<number, Match[]> => {
    const byRound = new Map<number, Match[]>();
    for (const match of matches) {
      const arr = byRound.get(match.round_id);
      if (arr) arr.push(match);
      else byRound.set(match.round_id, [match]);
    }
    return byRound;
  };

  /** Groups sets by their match, for the score inputs. */
  const groupSetsByMatch = (sets: GameSet[]): Map<number, GameSet[]> => {
    const byMatch = new Map<number, GameSet[]>();
    for (const set of sets) {
      const arr = byMatch.get(set.match_id);
      if (arr) arr.push(set);
      else byMatch.set(set.match_id, [set]);
    }
    return byMatch;
  };

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

    const swissLike = tournament.format === "swiss" || tournament.format === "monrad";
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
    const [td, ap, p, r, allMatches, allSets, retiredIds, pd] = await Promise.all([
      getTournament(tournamentId),
      getPlayers(),
      getTournamentPlayers(tournamentId),
      getRounds(tournamentId),
      getAllMatchesByTournament(tournamentId),
      getAllSetsByTournament(tournamentId),
      getRetiredPlayerIds(tournamentId),
      getTournamentPlayersDetailed(tournamentId),
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
    if (td.format === "double_elimination") {
      setGrandFinalRoundIds(new Set(await getGrandFinalRounds(tournamentId)));
    }
    if (td.format === "king_of_court") {
      setKotcQueue(await getKingOfCourtQueue(tournamentId));
    }

    setRetiredPlayerIds(new Set(retiredIds));
    setPaymentData(pd);

    // Swiss and Monrad award byes as wins and rank by Buchholz.
    const swissLike = td.format === "swiss" || td.format === "monrad";
    const s = calculateStandings(p, allMatches, sbm, swissLike ? { byesCountAsWins: true, withBuchholz: true } : {});
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

  /**
   * Seed order for draws, taken from the persisted `seed_rank` column.
   *
   * The wizard writes seeds via setTournamentSeeds, so they survive a
   * reload, a restart, or starting the tournament days later. The router
   * state (`navSeeds`) used to be the only source, which silently dropped
   * the seeding whenever the tournament was not started straight out of
   * the wizard (REVIEW-BACKLOG.md A4) — it now only fills in before the
   * first load of `paymentData` has arrived.
   */
  const seedOrder = useMemo(() => {
    const persisted = paymentData
      .filter((pd) => pd.seed_rank != null && pd.seed_rank > 0)
      .sort((a, b) => (a.seed_rank ?? 0) - (b.seed_rank ?? 0))
      .map((pd) => pd.player.id);
    return persisted.length > 0 ? persisted : navSeeds ?? [];
  }, [paymentData, navSeeds]);

  /**
   * Everything the format engines need to decide what comes next. Built
   * fresh on every render from the loaded state — cheap, and it keeps the
   * engines free of React and database concerns (REVIEW-BACKLOG.md D2).
   */
  const buildFormatContext = useCallback(
    (playersOverride?: Player[]): FormatContext | null => {
      if (!tournament) return null;
      const active = (playersOverride ?? players).filter((p) => !retiredPlayerIds.has(p.id));
      return {
        tournament,
        players: active,
        rounds,
        matchesByRound,
        setsByMatch,
        allMatches,
        seedOrder,
        teams: navTeams ?? [],
        // One court: assign it right away, no drag and drop needed.
        courtForNewMatch: (tournament.courts || 1) === 1 ? 1 : null,
        formatState: { kotcQueue, grandFinalRoundIds: [...grandFinalRoundIds] },
      };
    },
    [tournament, players, retiredPlayerIds, rounds, matchesByRound, setsByMatch, allMatches, seedOrder, navTeams, kotcQueue, grandFinalRoundIds],
  );

  /**
   * Writes a plan: schedule, status and phase in one transaction, then the
   * per-format state, then a reload. Shared by "start" and "next round".
   */
  const applyFormatPlan = async (plan: FormatPlan): Promise<boolean> => {
    if (plan.rounds.length === 0) return false;

    let createdIds: number[];
    try {
      createdIds = await createSchedule(tournamentId, plan.rounds, {
        ...(plan.status !== undefined ? { status: plan.status } : {}),
        ...(plan.phase !== undefined ? { phase: plan.phase } : {}),
      });
    } catch (err) {
      console.error("applyFormatPlan: schedule creation failed:", err);
      showError(t.tournament_view_start_failed);
      return false;
    }

    // Grand finals are stored as winners rounds; remember which ones.
    const grandFinals = plan.rounds
      .map((spec, index) => (spec.isGrandFinal ? createdIds[index] : null))
      .filter((id): id is number => id !== null);
    if (grandFinals.length > 0) {
      const merged = [...grandFinalRoundIds, ...grandFinals];
      await markGrandFinalRounds(tournamentId, merged);
      setGrandFinalRoundIds(new Set(merged));
    }

    if (plan.stateUpdates?.kotcQueue) {
      await setKingOfCourtQueue(tournamentId, plan.stateUpdates.kotcQueue);
      setKotcQueue(plan.stateUpdates.kotcQueue);
    }

    if (plan.byePlayers && plan.byePlayers.length > 0) {
      showInfo(
        t.tournament_view_round_byes.replace(
          "{players}",
          plan.byePlayers.map((pid) => playerName(pid)).join(", "),
        ),
      );
    }

    if (plan.activateLastRound && createdIds.length > 0) {
      setActiveRound(createdIds[createdIds.length - 1]);
    }

    loadAll();
    return true;
  };

  const handleStartTournament = async (playersOverride?: Player[]) => {
    const ctx = buildFormatContext(playersOverride);
    if (!ctx) return;

    const plan = engineFor(ctx.tournament.format).start(ctx);
    if (!plan) {
      showError(t.tournament_view_start_failed);
      return;
    }
    await applyFormatPlan(plan);
  };

  /**
   * Absent players are removed before the draw, so the bracket is built
   * from who is actually there.
   */
  const handleAttendanceConfirm = async (presentIds: Set<number>) => {
    setShowAttendance(false);
    const absent = players.filter((p) => !presentIds.has(p.id)).map((p) => p.id);
    for (const id of absent) {
      await removePlayerFromTournament(tournamentId, id);
    }
    const fresh = await getTournamentPlayers(tournamentId);
    setPlayers(fresh);
    await handleStartTournament(fresh);
  };

  /** Draws whatever the format has queued up next. */
  /** Opens the TV display in its own window (Tauri) or tab (browser). */
  const openTvWindow = async () => {
    if (isTauri()) {
      try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const tvWin = new WebviewWindow(`tv-${tournamentId}`, {
          url: `/tv/${tournamentId}`,
          title: `${t.tournament_view_tv_mode}: ${tournament?.name ?? ""}`,
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
  };

  const advanceFormat = async () => {
    const ctx = buildFormatContext();
    if (!ctx) return;

    const plan = engineFor(ctx.tournament.format).advance(ctx);
    if (!plan) return;

    // Keep the current tab when the previous round is still running, so
    // ongoing matches stay visible on an early draw.
    const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
    const wasComplete = lastRound ? allRoundMatchesCompleted(lastRound.id) : true;
    await applyFormatPlan({ ...plan, activateLastRound: plan.activateLastRound ?? wasComplete });
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

    refreshScores();
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
    refreshScores();
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
    refreshScores();
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
      if (tournament.format === "random_doubles") return null;

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
    // Same partner rule as retiring, so both directions stay symmetric.
    const partner = getFixedPartner(playerId);
    const playersToUnretire = partner !== null ? [playerId, partner] : [playerId];
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

    // Deletes and the follow-up state change go together: a half-applied
    // undo would leave the tournament in a phase that no longer matches its
    // rounds (REVIEW-BACKLOG.md A6). Descending id keeps the order
    // predictable while the transaction runs.
    const roundIds = [...target.rounds].sort((a, b) => b.id - a.id).map((r) => r.id);
    try {
      await deleteRoundsAtomically(
        tournamentId,
        roundIds,
        target.resetStatusToDraft
          ? { status: "draft", phase: "ready" }
          : target.isGroupKoBackToGroup
            ? { phase: "group", clearKoScoring: true }
            : {},
      );
    } catch (err) {
      console.error("performUndo: failed:", err);
      showError(String(err));
      setShowUndoRound(false);
      return;
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

  /**
   * Matches, sets and participants of one group — for the group tables in
   * the UI. The draw itself no longer needs this; the group_ko engine has
   * its own copy of the logic (REVIEW-BACKLOG.md D2).
   */
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
      if (m.team2_p1) pIds.add(m.team2_p1); if (m.team2_p2) pIds.add(m.team2_p2);
    }
    return { gMatches, gSets, pIds };
  };

  const allRoundMatchesCompleted = (roundId: number): boolean => {
    const matches = matchesByRound.get(roundId) || [];
    return matches.length > 0 && matches.every((m) => m.status === "completed");
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

  // One question, one answer — the engine decides whether anything can be
  // drawn right now. Nine per-format flags used to do this by hand.
  const formatContext = buildFormatContext();
  const engine = tournament ? engineFor(tournament.format) : null;
  const canAdvanceFormat = !!(engine && formatContext && engine.canAdvance(formatContext));
  const formatProgress =
    engine?.progress && formatContext ? engine.progress(formatContext) : null;

  // Group phase still needs its own button because starting the KO opens a
  // modal for the (optional) different KO scoring first.
  const isGroupKo = tournament?.format === "group_ko";
  const koRounds = rounds.filter((r) => r.phase === "ko");
  const canStartKo = isGroupKo && canAdvanceFormat && koRounds.length === 0;
  const canAdvanceOther = canAdvanceFormat && !canStartKo;

  /** Label and colour of the single advance button, per format. */
  const advanceButtonLabel = (() => {
    switch (tournament?.format) {
      case "elimination":
      case "group_ko":
        return `➡️ ${t.tournament_view_next_ko_round}`;
      case "double_elimination":
        return `➡️ ${t.tournament_view_advance_bracket}`;
      case "swiss":
        return `🔄 ${t.tournament_view_next_swiss_round}`;
      case "monrad":
        return `🔄 ${t.tournament_view_next_monrad_round}`;
      case "king_of_court":
        return `🎯 ${t.tournament_view_next_kotc_match}`;
      case "waterfall":
        return `🔄 ${t.tournament_view_next_waterfall_round}`;
      default:
        return `🎲 ${t.tournament_view_next_round}`;
    }
  })();
  const advanceButtonStyle =
    tournament?.format === "elimination" ||
    tournament?.format === "group_ko" ||
    tournament?.format === "double_elimination"
      ? "bg-phase hover:bg-phase"
      : "bg-warning hover:bg-warning";

  const isElimination = tournament?.format === "elimination";
  const isDoubleElimination = tournament?.format === "double_elimination";
  const winnersRounds = rounds.filter((r) => r.phase === "winners");
  const losersRounds = rounds.filter((r) => r.phase === "losers");
  const groupRounds = rounds.filter((r) => r.phase === "group");
  const koRoundsForBracket = isElimination
    ? rounds.filter((r) => r.phase !== "third_place")
    : koRounds;

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

  /**
   * Writes one of the export files. In the packaged app a native save
   * dialog picks the location; in the browser the file is downloaded
   * (REVIEW-BACKLOG.md C9).
   */
  const handleExport = async (kind: "matches" | "standings" | "payments" | "json") => {
    if (!tournament) return;

    const allSets: GameSet[] = [];
    for (const list of setsByMatch.values()) allSets.push(...list);

    const input = {
      tournament,
      players,
      rounds,
      matches: allMatches,
      sets: allSets,
      standings,
      paymentData,
      locale: undefined,
    };

    const isJson = kind === "json";
    const content = isJson
      ? toJsonExport(input)
      : kind === "matches"
        ? matchesToCsv(input)
        : kind === "standings"
          ? standingsToCsv(input)
          : paymentsToCsv(input);
    const fileName = exportFileName(tournament, kind, isJson ? "json" : "csv");

    try {
      if (isTauri()) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        const path = await save({
          defaultPath: fileName,
          filters: [{ name: isJson ? "JSON" : "CSV", extensions: [isJson ? "json" : "csv"] }],
        });
        if (!path) return;
        // BOM so Excel opens the file as UTF-8 instead of mangling umlauts.
        await writeTextFile(path, isJson ? content : `\ufeff${content}`);
      } else {
        const blob = new Blob([isJson ? content : `\ufeff${content}`], {
          type: isJson ? "application/json" : "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
      }
      showSuccess(t.export_done.replace("{file}", fileName));
    } catch (err) {
      showError(t.export_failed.replace("{error}", String(err)));
    }
  };

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
      ? "bg-surface-sunken text-muted"
      : tournament.status === "archived"
      ? "bg-phase-subtle text-phase-text"
      : "bg-warning-subtle text-warning-text";

  return (
    <div>
      {/* Session bar — only when this tournament is part of a session.
          Pill style adapts to session.status so the user can tell at a
          glance whether the workspace is still live (violet) or wound
          down (grey). The bar itself is always shown — even ended
          sessions retain the cross-tournament context for live matches. */}
      {tournament.session_id != null && sessionMeta && (() => {
        const isActive = sessionMeta.status === "active";
        const pillClass = isActive
          ? "bg-phase-subtle text-phase-text border-phase"
          : "bg-surface-sunken text-secondary border-line-strong";
        const statusSuffix = sessionMeta.status === "ended" ? ` ${t.session_pill_ended_suffix}`
          : sessionMeta.status === "archived" ? ` ${t.session_pill_archived_suffix}`
            : "";
        return (
        <div className={`mb-3 ${theme.cardBg} border ${theme.cardBorder} rounded-lg px-4 py-2 flex items-center justify-between flex-wrap gap-2 shadow-sm`}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs font-bold uppercase tracking-wide border px-2 py-0.5 rounded-full ${pillClass}`}>
              <Icon name="link" /> {t.session_pill_label}{statusSuffix}
            </span>
            <span className={`text-sm font-semibold ${theme.textPrimary}`}>
              {sessionMeta.name}
            </span>
            <span className={`text-xs ${theme.textMuted}`}>
              · {sessionCtx.tournaments.length} <Icon name="trophy" />
            </span>
            {sessionSiblings.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap ml-2">
                <span className={`text-2xs uppercase tracking-wide ${theme.textMuted} mr-1`}>
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
            className={`${theme.primaryBg} ${theme.primaryHoverBg} ${theme.primaryText} text-xs font-semibold px-3 py-1.5 rounded-sm transition-all`}
          >
            <Icon name="monitor" /> {t.session_pill_open_dashboard} →
          </button>
        </div>
        );
      })()}

      {/* Header */}
      {/* The title block and the action row share a line while there is
          room; below that the actions wrap underneath and get the full
          width, instead of being squeezed into whatever the title leaves
          (REVIEW-BACKLOG.md F3). */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-y-3">
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
                ? `${t.ko_modal_group_phase_scoring}: ${getScoringDescription(tournament.points_per_set, tournament.cap, { ext: t.scoring_description_ext, hard: t.scoring_description_hard })}`
                : getScoringDescription(tournament.points_per_set, tournament.cap, { ext: t.scoring_description_ext, hard: t.scoring_description_hard })}
            </span>
            {isGroupKo && tournament.ko_points_per_set != null && (
              <span className={`text-xs font-medium bg-phase-subtle text-phase-text border border-phase px-2.5 py-1 rounded-full`}>
                KO: {getScoringDescription(tournament.ko_points_per_set, tournament.ko_cap, { ext: t.scoring_description_ext, hard: t.scoring_description_hard })}
              </span>
            )}
            {tournament.courts > 1 && (
              <span className="text-xs font-medium bg-warning-subtle text-warning-text px-2.5 py-1 rounded-full">
                {tournament.courts} {t.common_fields}
              </span>
            )}
            {isGroupKo && (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                tournament.current_phase === "ko"
                  ? "bg-phase-subtle text-phase-text"
                  : `${theme.activeBadgeBg} ${theme.activeBadgeText}`
              }`}>
                {tournament.current_phase === "ko" ? t.tournament_view_ko_phase : t.tournament_view_groups_label.replace("{count}", String(tournament.num_groups))}
              </span>
            )}
            {formatProgress && (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${theme.activeBadgeBg} ${theme.activeBadgeText}`}>
                {t.tournament_view_round_counter
                  .replace("{current}", String(formatProgress.current))
                  .replace("{total}", String(formatProgress.total))}
              </span>
            )}
            {isDoubleElimination && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-phase-subtle text-phase-text">
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
        {/* `shrink-0` and `whitespace-nowrap` on the buttons: without them
            flex squeezed every label onto three lines and grew the header to
            228 px. `flex-wrap` lets the row break between buttons instead of
            inside them (REVIEW-BACKLOG.md F3). */}
        <div className="flex grow flex-wrap items-start justify-end gap-2 [&>button]:shrink-0 [&>button]:whitespace-nowrap [&>div>button]:whitespace-nowrap">
          {/* Draft: only the action that moves the tournament forward stays
              in the row. Edit, template and delete sit in the ⋯ menu
              (REVIEW-BACKLOG.md F3). */}
          {tournament.status === "draft" && (
            <>
              <button
                onClick={() => setShowAttendance(true)}
                disabled={tournament.current_phase !== "ready"}
                title={tournament.current_phase !== "ready" ? t.tournament_view_not_started_hint : t.tournament_view_start}
                className={`${theme.primaryBg} ${theme.primaryText} px-5 py-2.5 rounded-md ${theme.primaryHoverBg} shadow-sm hover:shadow-sm transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none`}
              >
                <Icon name="play" /> {t.tournament_view_start}
              </button>
            </>
          )}
          {/* One advance button for every format — the engine knows what
              the next step is and the label follows from the format. The
              group phase keeps its own button because starting the KO opens
              a scoring dialog first (REVIEW-BACKLOG.md D2). */}
          {canStartKo && (
            <button
              onClick={() => setShowStartKoModal(true)}
              className="bg-phase text-white px-5 py-2.5 rounded-md hover:bg-phase shadow-sm hover:shadow-sm transition-all text-sm font-medium"
            >
              <Icon name="trophy" /> {t.tournament_view_start_ko}
            </button>
          )}
          {canAdvanceOther && (
            <button
              onClick={advanceFormat}
              className={`${advanceButtonStyle} text-white px-5 py-2.5 rounded-md shadow-sm hover:shadow-sm transition-all text-sm font-medium`}
            >
              {advanceButtonLabel}
            </button>
          )}
          {tournament.status === "active" && rounds.length > 0 && (
            <button
              onClick={() => setShowUndoRound(true)}
              disabled={!undoTarget}
              className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-4 py-2.5 rounded-md hover:border-warning hover:text-warning-text transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Icon name="undo" /> {t.tournament_view_undo_round}
            </button>
          )}
          {tournament.status === "active" && (
            <button
              onClick={handleCompleteTournament}
              disabled={hasOpenMatches}
              title={hasOpenMatches ? t.tournament_view_has_open_matches : t.tournament_view_end}
              className={`px-4 py-2.5 rounded-md transition-all text-sm font-medium ${
                hasOpenMatches
                  ? `${theme.cardBg} border ${theme.cardBorder} ${theme.textMuted} cursor-not-allowed opacity-50`
                  : `${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} hover:border-danger hover:text-danger-text`
              }`}
            >
              {t.tournament_view_end}
            </button>
          )}
          {tournament.status === "completed" && (
            <button
              onClick={() => setShowReopenConfirm(true)}
              className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-4 py-2.5 rounded-md hover:border-emerald-300 hover:text-emerald-600 transition-all text-sm font-medium`}
            >
              <Icon name="unlock" /> {t.tournament_view_reopen}
            </button>
          )}
          {tournament.status === "completed" && (
            <button
              onClick={handleArchive}
              className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-4 py-2.5 rounded-md hover:border-phase hover:text-phase-text transition-all text-sm font-medium`}
            >
              <Icon name="archive" /> {t.tournament_view_archive}
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
                      ? "bg-warning-subtle dark:bg-warning-subtle/30 border-warning dark:border-warning text-warning-text dark:text-warning-text hover:bg-warning-subtle dark:hover:bg-warning-subtle/50"
                      : "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-success-subtle dark:hover:bg-emerald-900/50"
                  } border px-4 py-2.5 rounded-md transition-all text-sm font-medium disabled:opacity-50`}
                >
                  <Icon name="radio" /> {livePaused ? t.tournament_live_publish_paused_label : t.tournament_live_publish_active}
                  <span className={`ml-2 px-1.5 py-0.5 rounded-sm ${livePaused ? "bg-warning-subtle dark:bg-warning-subtle border-warning dark:border-warning/50" : "bg-success-subtle dark:bg-success-subtle border-success dark:border-success"} border text-2xs font-mono opacity-90`}>
                    ID: {tournamentId}
                  </span>
                </button>
                {/* Compact icon controls — tooltips carry the action label */}
                <button
                  onClick={handleTogglePause}
                  disabled={liveBusy}
                  title={livePaused ? t.tournament_live_publish_resume : t.tournament_live_publish_pause}
                  aria-label={livePaused ? t.tournament_live_publish_resume : t.tournament_live_publish_pause}
                  className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} w-8 h-8 flex items-center justify-center rounded-sm hover:border-warning hover:text-warning-text transition-all text-sm disabled:opacity-50`}
                >
                  {livePaused ? "▶️" : "⏸️"}
                </button>
                {!livePaused && (
                  <button
                    onClick={handlePushNow}
                    disabled={liveBusy}
                    title={t.tournament_live_publish_push_now}
                    aria-label={t.tournament_live_publish_push_now}
                    className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} w-8 h-8 flex items-center justify-center rounded-sm hover:border-emerald-300 hover:text-emerald-600 transition-all text-sm disabled:opacity-50`}
                  >
                    <span aria-hidden="true"><Icon name="refresh" /></span>
                  </button>
                )}
                {/* Status — small, muted, follows the buttons */}
                <span className={`text-2xs ${theme.textMuted} self-center ml-1.5 whitespace-nowrap`}>
                  {statusText}
                </span>
              </div>
            );
          })() : null}
          {/* Switching live publishing on is a one-off; only its running
              states above stay in the row, where they carry status. */}
          {/* Everything that is not what the tournament state is about
              lives behind the ⋯ menu, so the row keeps a readable width and
              a visible hierarchy (REVIEW-BACKLOG.md F3). */}
          <OverflowMenu
            items={[
              ...(rounds.length > 0
                ? [
                    { icon: "🖨️", label: t.tournament_view_print, onClick: () => setShowPrint(true) },
                    // The export dropdown used to be a button of its own with
                    // its own menu; four entries here cost less width and one
                    // interaction less (REVIEW-BACKLOG.md F3).
                    { icon: "⬇️", label: t.export_matches_csv, onClick: () => handleExport("matches") },
                    { icon: "⬇️", label: t.export_standings_csv, onClick: () => handleExport("standings") },
                    { icon: "⬇️", label: t.export_payments_csv, onClick: () => handleExport("payments") },
                    { icon: "⬇️", label: t.export_json, onClick: () => handleExport("json") },
                  ]
                : []),
              ...(tournament.status === "active"
                ? [{ icon: "📺", label: t.tournament_view_tv_mode, onClick: openTvWindow }]
                : []),
              ...(!liveActive
                ? [
                    {
                      icon: "📡",
                      label: t.tournament_live_publish_enable,
                      onClick: handleEnableLive,
                      disabled: liveBusy || tournament.status === "draft",
                      title:
                        tournament.status === "draft"
                          ? t.tournament_live_publish_disabled_draft
                          : t.tournament_live_publish_id_hint.replace("{id}", String(tournamentId)),
                    },
                  ]
                : []),
              ...(tournament.status === "draft"
                ? [
                    {
                      icon: "✏️",
                      label: t.tournament_view_edit,
                      onClick: () => navigate(`/tournaments/${tournament.id}/edit`),
                    },
                    {
                      icon: "📋",
                      label: t.tournament_view_template,
                      onClick: () => setShowTemplateExport(true),
                    },
                    {
                      icon: "🗑️",
                      label: t.tournament_view_delete,
                      onClick: () => setShowDeleteConfirm(true),
                      destructive: true,
                    },
                  ]
                : []),
            ]}
          />
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
          onClose={() => setRetireTarget(null)}
          onConfirm={handlePlayerRetire}
        />
      )}

      {/* Remove-Player Confirm Modal (draft status only) */}
      {removeTarget && (
        <RemovePlayerModal
          target={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onConfirm={confirmRemovePlayer}
        />
      )}

      <RestWarningModal
        warning={restWarning}
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
            await advanceFormat();
          }}
        />
      )}

      <ReopenConfirmModal
        open={showReopenConfirm}
        onCancel={() => setShowReopenConfirm(false)}
        onConfirm={handleReopenTournament}
      />

      <UnpublishModal
        open={showUnpublishConfirm}
        tournamentName={tournament.name}
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
        <div className={`${theme.cardBg} rounded-lg shadow-sm border ${theme.cardBorder} p-8 mb-6`}>
          <div className="text-center mb-6">
            <div className="text-4xl mb-3" aria-hidden="true">🏸</div>
            <div className={`text-lg font-semibold ${theme.textPrimary}`}>
              {t.tournament_view_not_started}
            </div>
            <div className={`text-sm ${theme.textMuted} mt-1`}>
              {t.tournament_view_not_started_hint}
            </div>
          </div>

          {/* Tournament Summary */}
          <div className={`${theme.inputBg} rounded-md p-5 border ${theme.inputBorder}`}>
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
                <div className={`font-medium ${theme.textPrimary} mt-0.5`}>{t.tournaments_best_of.replace("{count}", String(tournament.sets_to_win * 2 - 1))}</div>
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
              <div className="mt-4 pt-3 border-t border-line-strong dark:border-line-strong">
                <span className={`${theme.textMuted} text-xs uppercase tracking-wide`}>{t.management_participants.replace("{count}", String(players.length))}</span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {players.map(p => (
                    <span key={p.id} className={`text-xs px-2 py-0.5 rounded-full ${
                      p.gender === "m" ? "bg-info-subtle text-info-text" : "bg-pink-100 text-pink-700"
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

      {/* One sentence naming what to do next (REVIEW-BACKLOG.md F9). */}
      <NextStepBar
        status={tournament.status}
        roundCount={rounds.length}
        plannedRounds={tournament.planned_rounds}
        openMatches={allMatches.filter((m) => m.status !== "completed" && m.court !== null).length}
        matchesWithoutCourt={
          allMatches.filter((m) => m.status !== "completed" && m.court === null && m.team2_p1 !== null).length
        }
        freeCourts={Math.max(
          (tournament.courts || 1) -
            allMatches.filter((m) => m.status !== "completed" && m.court !== null).length,
          0,
        )}
        canAdvance={canAdvanceFormat}
        advanceLabel={advanceButtonLabel}
      />

      {/* View Tabs */}
      {rounds.length > 0 && (
        <div className={`flex border-b-2 ${theme.inputBorder} mb-5`}>
          {(() => {
            const hasBracket = koRoundsForBracket.length > 0 && (isElimination || (isGroupKo && tournament.current_phase === "ko"));
            const hasDoubleElimBracket = isDoubleElimination && (winnersRounds.length > 0 || losersRounds.length > 0);
            const showRangliste = !isGroupKo || koRounds.length > 0;
            const viewTabs = [
              { key: "spiele" as const, label: t.tournament_view_tab_matches, icon: "target" as const },
              ...(isGroupKo && groupRounds.length > 0 ? [{ key: "gruppen" as const, label: t.tournament_view_tab_groups, icon: "clipboard" as const }] : []),
              ...(hasBracket || hasDoubleElimBracket ? [{ key: "bracket" as const, label: t.tournament_view_tab_bracket, icon: "trophy" as const }] : []),
              ...(showRangliste ? [{ key: "rangliste" as const, label: t.tournament_view_tab_standings, icon: "chart" as const }] : []),
              { key: "verwaltung" as const, label: t.tournament_view_tab_management, icon: "users" as const },
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
              <Icon name={tab.icon} className="mr-1.5" />
              {tab.label}
              {viewTab === tab.key ? (
                <span className={`absolute bottom-0 left-0 right-0 h-[3px] ${theme.primaryBg} rounded-t-full`} />
              ) : (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-transparent group-hover:bg-line-strong rounded-t-full transition-all" />
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
                  <span className="text-xs font-bold text-phase-text uppercase tracking-wide w-8">KO</span>
                  {koRounds.map((r) => {
                    const colorClass = activeRound === r.id
                      ? "bg-phase text-white shadow-sm"
                      : `${theme.cardBg} text-phase-text hover:bg-phase/10 border border-phase/30 hover:border-phase`;
                    return (
                      <button
                        key={r.id}
                        onClick={() => { setActiveRound(r.id); setShowAllGroups(false); }}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${colorClass}`}
                      >
                        R{koRounds.indexOf(r) + 1}
                        {allRoundMatchesCompleted(r.id) && <span className="ml-1.5"><Icon name="check" /></span>}
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
                          ? "bg-emerald-600 text-white shadow-sm"
                          : `${theme.cardBg} text-emerald-600 hover:bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-400`;
                        return (
                          <button
                            key={r.id}
                            onClick={() => { setActiveRound(r.id); setShowAllGroups(false); }}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${colorClass}`}
                          >
                            R{idx + 1}
                            {allRoundMatchesCompleted(r.id) && <span className="ml-1.5"><Icon name="check" /></span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {losersRounds.length > 0 && (
                    <div className="flex gap-2 flex-wrap items-center">
                      <span className="text-xs font-bold text-danger-text uppercase tracking-wide w-8">L</span>
                      {losersRounds.map((r, idx) => {
                        const colorClass = activeRound === r.id
                          ? "bg-danger text-white shadow-sm"
                          : `${theme.cardBg} text-danger-text hover:bg-danger/10 border border-rose-500/30 hover:border-rose-400`;
                        return (
                          <button
                            key={r.id}
                            onClick={() => { setActiveRound(r.id); setShowAllGroups(false); }}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${colorClass}`}
                          >
                            R{idx + 1}
                            {allRoundMatchesCompleted(r.id) && <span className="ml-1.5"><Icon name="check" /></span>}
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
                  ? `${theme.roundActiveBg} ${theme.roundActiveText} shadow-sm`
                  : `${theme.cardBg} ${theme.textSecondary} hover:opacity-80 border ${theme.cardBorder} ${theme.cardHoverBorder}`;

                return (
                  <button
                    key={r.id}
                    onClick={() => { setActiveRound(r.id); setShowAllGroups(false); }}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${colorClass}`}
                  >
                      {label}
                      {allRoundMatchesCompleted(r.id) && (
                        <span className="ml-1.5"><Icon name="check" /></span>
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
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                      activeRound === thirdPlaceRound.id
                        ? "bg-orange-600 text-white shadow-sm"
                        : `${theme.cardBg} text-orange-600 hover:bg-orange-500/10 border border-orange-500/30 hover:border-orange-400`
                    }`}
                  >
                    {t.bracket_third_place_short}
                    {allRoundMatchesCompleted(thirdPlaceRound.id) && (
                      <span className="ml-1.5"><Icon name="check" /></span>
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
              onUnassign={(matchId) => {
                // Right-click → "Return match to queue". Same code path
                // as the MatchCard dropdown's empty option (court=null
                // → updateMatchCourt clears the field → loadAll).
                handleCourtChange(matchId, null);
                showSuccess(t.court_context_menu_unassign_done);
              }}
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

// src/pages/TvMode.tsx
//
// Read-only fullscreen display for spectators / hall projector. Shows
// what's happening on each court, what's next in the queue, and recent
// results. Synced with the main window via 5s polling + a BroadcastChannel
// for live "go to court" announcements.
//
// Visual focus: large type, distance-readable, no interaction (besides
// F11 fullscreen + ESC close). Re-uses the same data helpers as the main
// view so the smart-queue, group progress, seed badges, bronze playoff,
// and multi-hall layout all stay in sync without re-implementing logic.

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { formatLabel, modeLabel } from "../lib/i18n/labels";
import Icon from "../components/ui/Icon";
import { onDataChanged } from "../lib/changeEvents";
import { usePolling } from "../lib/usePolling";
import { useParams } from "react-router-dom";
import {
  getTournament,
  getTournamentPlayersDetailed,
  getRounds,
  getAllMatchesByTournament,
  getAllSetsByTournament,
  isTauri,
} from "../lib/db";
import { isSetComplete } from "../lib/scoring";
import type {
  Tournament,
  Player,
  Round,
  Match,
  GameSet,
  TournamentPlayerInfo,
  HallConfig,
} from "../lib/types";
import {
  playerDisplayName,
  parseHallConfig,
  getCourtHallLabel,
} from "../lib/types";
import {
  getGroupProgress,
  getRemainingByGroup,
  getRoundToGroupMap,
  type GroupProgress,
} from "../lib/groupProgress";
import {
  getRunningPlayerCourts,
  getMatchConflicts,
  type ConflictPlayer,
} from "../lib/courtConflicts";
import { useT, useLocale } from "../lib/I18nContext";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import RestIndicator from "../components/players/RestIndicator";
import { getCustomLogo } from "./settings/LogoSettings";

interface Announcement {
  id: number;
  court: number;
  team1: string;
  team2: string;
  timestamp: number;
}

/**
 * One accent set for the TV display, built from the design tokens.
 *
 * This was a table of four — the same arrangement that F1 removed from the
 * app — so a theme added here had to be added there too. `--accent-bright`
 * is the light accent each theme defines for dark surfaces, which is
 * exactly what a projector needs: 10.5:1 (green), 7.9:1 (blue) and 8.9:1
 * (orange) against the background, all above AAA at viewing distance
 * (REVIEW-BACKLOG.md F2, G3).
 */
const TV_ACCENT = {
  primary: "text-accent-bright",
  primaryBg: "bg-accent",
  headerBorder: "border-accent-bright/30",
  courtBorder: "border-accent-bright/50",
  courtBg: "bg-accent-bright/10",
  winText: "text-accent-bright",
  barFill: "bg-accent-bright",
};

// Bronze (3rd-place) match accent — fixed regardless of theme so spectators
// always recognize the gold-silver-bronze convention.
const BRONZE_BORDER = "border-orange-400/60";
const BRONZE_BG = "bg-orange-900/20";

// Inline SVG badminton court — drawn behind each court card for visual depth.
const COURT_BG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 134" fill="none" opacity="0.12"><rect x="2" y="2" width="256" height="130" rx="2" stroke="#9CA3AF" stroke-width="1.5"/><line x1="130" y1="2" x2="130" y2="132" stroke="#9CA3AF" stroke-width="2"/><rect x="2" y="17" width="256" height="100" rx="1" stroke="#9CA3AF" stroke-width="1"/><line x1="46" y1="17" x2="46" y2="117" stroke="#9CA3AF" stroke-width="1"/><line x1="214" y1="17" x2="214" y2="117" stroke="#9CA3AF" stroke-width="1"/><line x1="46" y1="67" x2="214" y2="67" stroke="#9CA3AF" stroke-width="1"/><line x1="236" y1="2" x2="236" y2="132" stroke="#9CA3AF" stroke-width="1" stroke-dasharray="4 3"/><line x1="24" y1="2" x2="24" y2="132" stroke="#9CA3AF" stroke-width="1" stroke-dasharray="4 3"/></svg>`)}`;

export default function TvMode() {
  const { t } = useT();
  const locale = useLocale();
  // The accent no longer depends on the theme id — the tokens carry it.
  const tv = TV_ACCENT;
  const { id } = useParams<{ id: string }>();
  const tournamentId = Number(id);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  useDocumentTitle(tournament ? `TV — ${tournament.name}` : "TV");
  const [playerInfos, setPlayerInfos] = useState<TournamentPlayerInfo[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [matchesByRound, setMatchesByRound] = useState<Map<number, Match[]>>(new Map());
  const [setsByMatch, setSetsByMatch] = useState<Map<number, GameSet[]>>(new Map());
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [now, setNow] = useState(Date.now());
  const announcementIdRef = useRef(0);

  // Tick every second for timers
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts: Escape = close, F11 = toggle fullscreen
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isTauri()) {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          getCurrentWindow().close();
        } else {
          window.close();
        }
      } else if (e.key === "F11") {
        e.preventDefault();
        if (isTauri()) {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const win = getCurrentWindow();
          const isFs = await win.isFullscreen();
          await win.setFullscreen(!isFs);
        } else {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
          } else {
            document.exitFullscreen();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const t = await getTournament(tournamentId);
      setTournament(t);
      // Detailed player rows include seed_rank for SeedBadge rendering.
      const pd = await getTournamentPlayersDetailed(tournamentId);
      setPlayerInfos(pd);
      const r = await getRounds(tournamentId);
      setRounds(r);

      // Bulk-load all matches and sets in 2 queries instead of N+1
      const allMatches = await getAllMatchesByTournament(tournamentId);
      const allSets = await getAllSetsByTournament(tournamentId);

      const mbr = new Map<number, Match[]>();
      for (const match of allMatches) {
        const arr = mbr.get(match.round_id);
        if (arr) arr.push(match);
        else mbr.set(match.round_id, [match]);
      }
      const sbm = new Map<number, GameSet[]>();
      for (const set of allSets) {
        const arr = sbm.get(set.match_id);
        if (arr) arr.push(set);
        else sbm.set(set.match_id, [set]);
      }
      setMatchesByRound(mbr);
      setSetsByMatch(sbm);
    } catch (err) {
      console.error("TvMode: failed to load tournament data:", err);
    }
  }, [tournamentId]);

  // A result reaches the wall as soon as it is entered: the write announces
  // itself across windows, and this listens. Polling stays as a safety net
  // for anything that changes without an announcement — a database edited
  // from elsewhere, or a notification lost with a closed window — but at
  // 30s instead of 5s, since it is no longer the primary path
  // (REVIEW-BACKLOG.md E3).
  useEffect(() => onDataChanged(() => void loadAll()), [loadAll]);

  usePolling(() => loadAll(), { intervalMs: 30_000, label: "TvMode" }, [loadAll]);

  // Listen for announcements from main window
  useEffect(() => {
    const bc = new BroadcastChannel(`tournament-${tournamentId}`);
    bc.onmessage = (e) => {
      if (e.data.type === "announce") {
        const a: Announcement = {
          id: ++announcementIdRef.current,
          court: e.data.court,
          team1: e.data.team1,
          team2: e.data.team2,
          timestamp: Date.now(),
        };
        setAnnouncements((prev) => [a, ...prev.slice(0, 2)]); // Keep max 3
        setTimeout(() => {
          setAnnouncements((prev) => prev.filter((ann) => ann.id !== a.id));
        }, 30000);
      }
    };
    return () => bc.close();
  }, [tournamentId]);

  // ---------- Derived data ----------

  const players: Player[] = useMemo(
    () => playerInfos.map((d) => d.player),
    [playerInfos],
  );

  const seedRankByPlayer = useMemo(() => {
    const map = new Map<number, number>();
    for (const pd of playerInfos) {
      if (pd.seed_rank != null && pd.seed_rank > 0) {
        map.set(pd.player.id, pd.seed_rank);
      }
    }
    return map;
  }, [playerInfos]);

  // Flat list of every match across rounds — used by RestIndicator and
  // by court/queue/recent splitters below.
  const allMatches = useMemo(() => {
    const out: Match[] = [];
    for (const r of rounds) {
      const ms = matchesByRound.get(r.id) || [];
      for (const m of ms) out.push(m);
    }
    return out;
  }, [rounds, matchesByRound]);

  const isGroupPhaseActive =
    tournament?.format === "group_ko" &&
    tournament?.current_phase === "group";

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
  const hallConfig = useMemo<HallConfig[] | null>(
    () => tournament?.hall_config ? parseHallConfig(tournament.hall_config) : null,
    [tournament?.hall_config],
  );
  const roundById = useMemo(() => {
    const m = new Map<number, Round>();
    for (const r of rounds) m.set(r.id, r);
    return m;
  }, [rounds]);

  // Map<groupNumber, Round[]> sorted by round_number — used to label
  // group rounds as "G{n} · R{idx+1}" on cards.
  const groupRoundIndex = useMemo(() => {
    const idx = new Map<number, number>(); // roundId → 1-based index in group
    const byGroup = new Map<number, Round[]>();
    for (const r of rounds) {
      if (r.phase !== "group" || r.group_number == null) continue;
      const arr = byGroup.get(r.group_number) ?? [];
      arr.push(r);
      byGroup.set(r.group_number, arr);
    }
    for (const [, gRounds] of byGroup) {
      const sorted = [...gRounds].sort((a, b) => a.round_number - b.round_number);
      sorted.forEach((r, i) => idx.set(r.id, i + 1));
    }
    return idx;
  }, [rounds]);

  // KO-stage label inference: "Final" / "Semifinal" / "Quarterfinal" /
  // "R16" derived from the position of the round within all KO-phase
  // rounds. Mirrors BracketView's logic.
  const koStageLabel = useMemo(() => {
    const map = new Map<number, string>();
    const isElim = tournament?.format === "elimination";
    const koRounds = isElim
      ? rounds.filter((r) => r.phase !== "third_place")
      : rounds.filter((r) => r.phase === "ko");
    if (koRounds.length === 0) return map;
    const firstRound = koRounds[0];
    const firstMatchCount = (matchesByRound.get(firstRound.id) || []).length || 1;
    const expectedTotal = Math.ceil(Math.log2(firstMatchCount * 2));
    koRounds.forEach((r, idx) => {
      const remaining = expectedTotal - idx;
      let label: string;
      if (remaining === 1) label = t.bracket_final;
      else if (remaining === 2) label = t.bracket_semifinal;
      else if (remaining === 3) label = t.bracket_quarterfinal;
      else if (remaining === 4) label = t.bracket_round_of_16;
      else label = t.bracket_round.replace("{n}", String(idx + 1));
      map.set(r.id, label);
    });
    return map;
  }, [rounds, matchesByRound, tournament?.format, t]);

  // Per-match contextual label rendered above team names on cards.
  // Examples: "G1 · R3", "Halbfinale", "🥉 Spiel um Platz 3", "R5".
  const matchContextLabel = (m: Match): string => {
    const r = roundById.get(m.round_id);
    if (!r) return "";
    if (r.phase === "third_place") return t.bracket_third_place_short;
    if (r.phase === "group" && r.group_number != null) {
      const idx = groupRoundIndex.get(r.id) ?? r.round_number;
      return `G${r.group_number} · R${idx}`;
    }
    if (r.phase === "winners") return `W · R${r.round_number}`;
    if (r.phase === "losers") return `L · R${r.round_number}`;
    const ko = koStageLabel.get(r.id);
    if (ko) return ko;
    return t.bracket_round.replace("{n}", String(r.round_number));
  };

  // Player conflict map (read-only, shown as 🚫 badge on queue cards)
  const runningPlayerCourts = useMemo(
    () => getRunningPlayerCourts(allMatches),
    [allMatches],
  );
  const conflictedMatches = useMemo(() => {
    const map = new Map<number, ConflictPlayer[]>();
    for (const m of allMatches) {
      if (m.court !== null) continue;
      if (m.status === "completed") continue;
      const conflicts = getMatchConflicts(m, runningPlayerCourts);
      if (conflicts.length > 0) map.set(m.id, conflicts);
    }
    return map;
  }, [allMatches, runningPlayerCourts]);

  // Court assignments / waiting / completed splits
  const courtMatches = useMemo(
    () => allMatches.filter((m) => m.court && m.status !== "completed"),
    [allMatches],
  );
  const waitingMatches = useMemo(
    () => allMatches.filter((m) => !m.court && m.status !== "completed"),
    [allMatches],
  );
  const completedMatches = useMemo(
    () => allMatches.filter((m) => m.status === "completed").slice(-12),
    [allMatches],
  );

  // ---------- Helpers used by sub-renderers ----------

  const playerName = (playerId: number | null): string => {
    if (playerId === null || playerId === undefined) return "-";
    const p = players.find((p) => p.id === playerId);
    return p ? playerDisplayName(p) : "?";
  };

  const matchTeams = (m: Match) => {
    const t1 = m.team1_p2
      ? `${playerName(m.team1_p1)} / ${playerName(m.team1_p2)}`
      : playerName(m.team1_p1);
    const t2 = m.team2_p2
      ? `${playerName(m.team2_p1)} / ${playerName(m.team2_p2)}`
      : playerName(m.team2_p1);
    return { t1, t2 };
  };

  const formatTimer = (assignedAt: string | null): string => {
    if (!assignedAt) return "00:00";
    const elapsed = Math.floor((now - new Date(assignedAt).getTime()) / 1000);
    if (elapsed < 0) return "00:00";
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const minRestMinutes = tournament?.min_rest_minutes ?? 0;
  const showRestIcons =
    tournament?.status === "active" && minRestMinutes > 0;

  // Render a player name with optional ⏱ rest-indicator and S{n} seed badge.
  const renderPlayerName = (pid: number, m: Match, withRest: boolean) => {
    const seed = seedRankByPlayer.get(pid);
    return (
      <>
        <span>{playerName(pid)}</span>
        {seed != null && (
          <span
            className="ml-1 px-1 py-0 rounded text-2xs font-bold bg-warning/20 text-warning-text border border-warning/40 align-middle"
            title={t.seed_badge_tooltip.replace("{n}", String(seed))}
          >
            {t.seed_badge_short.replace("{n}", String(seed))}
          </span>
        )}
        {withRest && (
          <RestIndicator
            playerId={pid}
            matches={allMatches}
            minRestMinutes={minRestMinutes}
            excludeMatchId={m.id}
          />
        )}
      </>
    );
  };

  const renderTeam = (p1: number | null, p2: number | null, m: Match) => {
    if (p1 === null) return <span className="italic text-white/60">{t.common_bye}</span>;
    const wantIcons = showRestIcons && m.status !== "completed";
    return (
      <>
        {renderPlayerName(p1, m, wantIcons)}
        {p2 != null && (
          <>
            <span className="mx-1 text-white/50">/</span>
            {renderPlayerName(p2, m, wantIcons)}
          </>
        )}
      </>
    );
  };

  // Phase label for the header. "Gruppenphase" / "KO-Phase" / "Beendet".
  const phaseLabel = useMemo(() => {
    if (!tournament) return "";
    if (tournament.status === "completed") return t.tv_phase_completed;
    if (tournament.format === "group_ko") {
      return tournament.current_phase === "ko" ? t.tv_phase_ko : t.tv_phase_group;
    }
    return ""; // other formats: empty (round-count is shown next to it)
  }, [tournament, t]);

  // Hall sections for the multi-hall court area. Computed BEFORE the
  // early-return guard below so React's hook order stays stable even on
  // the first render where `tournament` is still null.
  const courtSections = useMemo(() => {
    if (!hallConfig || hallConfig.length <= 1) return null;
    const sections: { name: string; start: number; count: number }[] = [];
    let offset = 0;
    for (const hall of hallConfig) {
      sections.push({ name: hall.name, start: offset + 1, count: hall.courts });
      offset += hall.courts;
    }
    return sections;
  }, [hallConfig]);

  // Queue: grouped + smart-queue ordered + bronze section appended at end.
  const queueSections = useMemo(() => {
    const bronze: Match[] = [];
    const others: Match[] = [];
    for (const m of waitingMatches) {
      if (roundById.get(m.round_id)?.phase === "third_place") bronze.push(m);
      else others.push(m);
    }

    let mainSections: { key: string; label: string; matches: Match[]; remaining?: number; behind?: boolean }[] = [];

    if (remainingByGroup && roundToGroup && others.length > 0) {
      // Smart-queue grouped path
      const byGroup = new Map<number, Match[]>();
      for (const m of others) {
        const g = roundToGroup.get(m.round_id);
        if (g == null) continue;
        const arr = byGroup.get(g) ?? [];
        arr.push(m);
        byGroup.set(g, arr);
      }
      const completedCounts = groupProgress.map((p) => p.completed).sort((a, b) => a - b);
      const median = completedCounts.length > 0
        ? completedCounts[Math.floor(completedCounts.length / 2)]
        : 0;
      const completedByGroup = new Map<number, number>();
      for (const p of groupProgress) completedByGroup.set(p.group, p.completed);
      mainSections = Array.from(byGroup.entries())
        .map(([group, ms]) => {
          const remaining = remainingByGroup.get(group) ?? 0;
          const completed = completedByGroup.get(group) ?? 0;
          return {
            key: `g${group}`,
            label: t.group_progress_label.replace("{n}", String(group)),
            matches: ms.sort((a, b) => a.id - b.id),
            remaining,
            behind: remaining > 0 && median - completed >= 2,
          };
        })
        .sort((a, b) => (b.remaining! - a.remaining!) || a.key.localeCompare(b.key));
    } else if (others.length > 0) {
      mainSections = [{
        key: "flat",
        label: "",
        matches: [...others].sort((a, b) => a.id - b.id),
      }];
    }

    if (bronze.length > 0) {
      mainSections.push({
        key: "bronze",
        label: t.bracket_third_place,
        matches: bronze.sort((a, b) => a.id - b.id),
      });
    }
    return mainSections;
  }, [waitingMatches, roundById, remainingByGroup, roundToGroup, groupProgress, t]);

  // Recent results grouped by group_number when in active group phase,
  // else null (flat fallback in the render path).
  const recentGrouped = useMemo(() => {
    if (!isGroupPhaseActive || !roundToGroup) return null;
    const byGroup = new Map<number, Match[]>();
    for (const m of completedMatches) {
      const g = roundToGroup.get(m.round_id);
      if (g == null) continue;
      const arr = byGroup.get(g) ?? [];
      arr.push(m);
      byGroup.set(g, arr);
    }
    if (byGroup.size === 0) return null;
    return Array.from(byGroup.entries())
      .map(([group, ms]) => ({
        group,
        matches: ms.slice().reverse().slice(0, 4),   // most recent first
      }))
      .sort((a, b) => a.group - b.group);
  }, [completedMatches, isGroupPhaseActive, roundToGroup]);

  if (!tournament) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-white text-2xl">{t.common_loading}</div>
      </div>
    );
  }

  const numCourts = tournament.courts || 1;

  // ---------- Court layout (multi-hall aware) ----------

  // Build a Court[] list with hall context. When hall_config has more than
  // one hall, we render per-hall sections; otherwise a single grid.
  const renderCourtCard = (courtNum: number) => {
    const match = courtMatches.find((m) => m.court === courtNum);
    const isFree = !match;
    const courtLabel = hallConfig && hallConfig.length > 1
      ? t.tv_court_label.replace("{n}", String(getCourtHallLabel(courtNum, hallConfig).localCourt))
      : t.tv_court_label.replace("{n}", String(courtNum));

    if (isFree) {
      return (
        <div
          key={courtNum}
          className="rounded-lg border-2 border-dashed border-line-strong bg-gray-900/50 p-4 flex flex-col items-center justify-center min-h-[140px]"
          style={{ backgroundImage: `url("${COURT_BG}")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundSize: 'auto 85%' }}
        >
          <span className="text-xs font-bold text-amber-700 bg-warning-subtle/50 px-2.5 py-0.5 rounded-sm mb-2">
            {courtLabel}
          </span>
          <div className="text-gray-600 text-sm">{t.tv_free}</div>
        </div>
      );
    }

    const sets = setsByMatch.get(match.id) || [];
    let t1Sets = 0, t2Sets = 0;
    for (const s of sets) {
      if (isSetComplete(s, tournament.points_per_set, tournament.cap)) {
        if (s.team1_score > s.team2_score) t1Sets++;
        else t2Sets++;
      }
    }
    const isBronze = roundById.get(match.round_id)?.phase === "third_place";
    const ctxLabel = matchContextLabel(match);

    return (
      <div
        key={courtNum}
        className={`rounded-lg border-2 ${isBronze ? BRONZE_BORDER : tv.courtBorder} ${isBronze ? BRONZE_BG : tv.courtBg} p-4 min-h-[140px] flex flex-col relative overflow-hidden`}
        style={{ backgroundImage: `url("${COURT_BG}")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundSize: 'auto 85%' }}
      >
        {/* Court header: court label · context (Group/Round) · timer */}
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-700 bg-warning-subtle/50 px-2.5 py-0.5 rounded-sm">
              {courtLabel}
            </span>
            {ctxLabel && (
              <span className={`text-2xs font-bold uppercase tracking-wide ${isBronze ? "text-orange-300" : tv.primary}`}>
                {ctxLabel}
              </span>
            )}
          </div>
          <span className="text-sm font-mono font-bold text-warning-text">
            <Icon name="clock" /> {formatTimer(match.court_assigned_at)}
          </span>
        </div>

        {/* Teams */}
        <div className="flex-1 flex flex-col justify-center min-h-0">
          <div className="text-base font-bold text-white leading-tight truncate">
            {renderTeam(match.team1_p1, match.team1_p2, match)}
          </div>
          <div className="text-white/50 text-xs my-0.5">{t.common_vs}</div>
          <div className="text-base font-bold text-white leading-tight truncate">
            {renderTeam(match.team2_p1, match.team2_p2, match)}
          </div>
        </div>

        {/* Score */}
        <div className="flex items-center gap-3 mt-2">
          <div className="text-2xl font-extrabold font-mono text-center bg-black/30 rounded-md px-4 py-2 flex-1">
            <span className={t1Sets > t2Sets ? tv.winText : "text-white"}>{t1Sets}</span>
            <span className="text-gray-600 mx-2">:</span>
            <span className={t2Sets > t1Sets ? tv.winText : "text-white"}>{t2Sets}</span>
          </div>
          {sets.length > 0 && (
            <div className="text-xs font-mono text-white/60 leading-tight">
              {sets
                .filter((s) => s.team1_score > 0 || s.team2_score > 0)
                .map((s) => (
                  <div key={s.set_number}>{s.team1_score}:{s.team2_score}</div>
                ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderQueueCard = (m: Match, isFirst: boolean) => {
    const conflicts = conflictedMatches.get(m.id);
    const blocked = !!conflicts && conflicts.length > 0;
    const ctxLabel = matchContextLabel(m);
    const isBronze = roundById.get(m.round_id)?.phase === "third_place";
    return (
      <div
        key={m.id}
        className={`rounded-md px-3 py-2 border transition-all ${
          isBronze
            ? "bg-orange-900/20 border-orange-400/40"
            : blocked
              ? "bg-rose-900/20 border-rose-500/40"
              : isFirst
                ? "bg-warning/10 border-warning/30"
                : "bg-black/20 border-line"
        }`}
      >
        <div className="flex items-center justify-between mb-1 text-2xs font-bold uppercase tracking-widest">
          {isFirst && !blocked && !isBronze && (
            <span className="text-warning-text">{t.tv_next_up}</span>
          )}
          {ctxLabel && <span className="text-white/60 ml-auto">{ctxLabel}</span>}
        </div>
        <div className="text-sm">
          <div className="font-semibold text-white">
            {renderTeam(m.team1_p1, m.team1_p2, m)}
          </div>
          <div className="text-white/50 text-xs my-0.5">{t.common_vs}</div>
          <div className="font-semibold text-white">
            {renderTeam(m.team2_p1, m.team2_p2, m)}
          </div>
        </div>
        {blocked && (
          <div className="mt-1 text-2xs font-bold text-danger-text flex items-center gap-1">
            <span><Icon name="ban" /></span><span>{t.match_blocked_short}</span>
          </div>
        )}
      </div>
    );
  };

  // Per-section visible cap so the queue stays on-screen.
  const QUEUE_PER_SECTION_CAP = 5;

  const renderRecentCard = (m: Match) => {
    const { t1, t2 } = matchTeams(m);
    const sets = setsByMatch.get(m.id) || [];
    let t1Sets = 0, t2Sets = 0;
    for (const s of sets) {
      if (s.team1_score > s.team2_score) t1Sets++;
      else if (s.team2_score > s.team1_score) t2Sets++;
    }
    const ctx = matchContextLabel(m);
    return (
      <div key={m.id} className="bg-black/20 rounded-md px-4 py-2.5 text-sm">
        {ctx && (
          <div className="text-2xs font-bold uppercase tracking-widest text-white/50 mb-1">
            {ctx}
          </div>
        )}
        <div className="flex items-center justify-between mb-1">
          <span className={`font-semibold truncate ${m.winner_team === 1 ? tv.winText : "text-white/50"}`}>{t1}</span>
          <span className={`font-mono font-bold text-lg ml-2 ${m.winner_team === 1 ? tv.winText : "text-white/50"}`}>{t1Sets}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className={`font-semibold truncate ${m.winner_team === 2 ? tv.winText : "text-white/50"}`}>{t2}</span>
          <span className={`font-mono font-bold text-lg ml-2 ${m.winner_team === 2 ? tv.winText : "text-white/50"}`}>{t2Sets}</span>
        </div>
      </div>
    );
  };

  // ---------- Group strip ----------

  const renderGroupStrip = (progress: GroupProgress[]) => {
    if (progress.length === 0) return null;
    const completedCounts = progress.map((p) => p.completed).sort((a, b) => a - b);
    const median = completedCounts[Math.floor(completedCounts.length / 2)];
    const isBehind = (p: GroupProgress) => p.remaining > 0 && median - p.completed >= 2;
    return (
      <div className="px-8 py-2 bg-black/20 border-b border-line/50 flex items-center gap-6 overflow-x-auto">
        <span className="text-2xs font-bold text-white/50 uppercase tracking-widest shrink-0">
          {t.tv_groups_strip_header}
        </span>
        {progress.map((p) => {
          const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
          const behind = isBehind(p);
          const done = p.remaining === 0 && p.total > 0;
          return (
            <div key={p.group} className="flex items-center gap-2 shrink-0 min-w-[160px]">
              <span className={`text-sm font-bold shrink-0 ${behind ? "text-danger-text" : "text-white"}`}>
                G{p.group}
              </span>
              <div className="flex-1 h-2 rounded-full overflow-hidden bg-surface-raised border border-line-strong">
                <div
                  className={`h-full ${done ? "bg-success" : behind ? "bg-danger" : tv.barFill}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-mono text-white/60 shrink-0">
                {p.completed}/{p.total}
              </span>
              {behind && <span className="text-danger-text shrink-0"><Icon name="alert" /></span>}
              {done && <span className="text-emerald-400 shrink-0"><Icon name="check" /></span>}
            </div>
          );
        })}
      </div>
    );
  };

  // ---------- Render ----------

  return (
    <div className="min-h-screen bg-tv text-white overflow-hidden flex flex-col">
      {/* Header */}
      <div className={`bg-black/30 backdrop-blur-sm border-b ${tv.headerBorder} px-8 py-4 flex justify-between items-center shrink-0`}>
        <div className="flex items-center gap-4">
          <img src={getCustomLogo() || "/logo.webp"} alt="Logo" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{tournament.name}</h1>
            <div className={`${tv.primary} text-sm font-medium`}>
              {modeLabel(t, tournament.mode)} &middot; {formatLabel(t, tournament.format)}
              {phaseLabel && (
                <span className="ml-2 px-2 py-0.5 rounded-sm bg-black/30 text-white text-xs font-bold uppercase tracking-wider">
                  {phaseLabel}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-3xl font-mono font-bold ${tv.primary}`}>
            {new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="text-white/60 text-sm">
            {t.tv_players_round.replace("{players}", String(players.length)).replace("{round}", String(rounds.length))}
          </div>
        </div>
      </div>

      {/* Announcement Banner */}
      {announcements.length > 0 && (
        <div className="bg-warning text-gray-950 shrink-0">
          {announcements.map((a) => (
            <div
              key={a.id}
              className="px-8 py-3 flex items-center gap-4 text-lg font-bold animate-pulse border-b border-warning last:border-0"
            >
              <span className="text-2xl"><Icon name="megaphone" /></span>
              <span>{t.tv_court_label.replace("{n}", String(a.court))}:</span>
              <span className="flex-1">
                {a.team1} <span className="font-normal mx-2">{t.common_vs}</span> {a.team2}
              </span>
              <span className="text-amber-800 text-sm font-normal">{t.tv_please_go_to_court}</span>
            </div>
          ))}
        </div>
      )}

      {/* Group progress strip — only during active group phase */}
      {isGroupPhaseActive && groupProgress.length >= 1 && renderGroupStrip(groupProgress)}

      {/* Main grid: courts + queue */}
      <div className="p-6 grid grid-cols-3 gap-6 flex-1 min-h-0">
        {/* LEFT 2/3: Courts + Recent results */}
        <div className="col-span-2 flex flex-col gap-4 min-h-0">
          <h2 className={`text-lg font-bold ${tv.primary} uppercase tracking-wider`}>{t.tv_courts}</h2>

          {courtSections ? (
            <div className="space-y-4">
              {courtSections.map((section) => (
                <div key={section.name}>
                  <div className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">
                    {section.name}
                  </div>
                  <div
                    className="grid gap-3"
                    style={{ gridTemplateColumns: `repeat(${Math.min(section.count, 3)}, 1fr)` }}
                  >
                    {Array.from({ length: section.count }, (_, i) => section.start + i).map(renderCourtCard)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${Math.min(numCourts, 3)}, 1fr)` }}
            >
              {Array.from({ length: numCourts }, (_, i) => i + 1).map(renderCourtCard)}
            </div>
          )}

          {/* Recent results */}
          {completedMatches.length > 0 && (
            <div className="mt-2">
              <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-2">
                {t.tv_recent_results}
              </h3>
              {recentGrouped ? (
                <div className="space-y-3">
                  {recentGrouped.map(({ group, matches }) => (
                    <div key={group}>
                      <div className="text-2xs font-bold uppercase tracking-widest text-phase-text mb-1">
                        {t.group_progress_label.replace("{n}", String(group))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {matches.map(renderRecentCard)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {completedMatches.slice().reverse().slice(0, 6).map(renderRecentCard)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT 1/3: Queue */}
        <div className="flex flex-col min-h-0">
          <h2 className="text-lg font-bold text-warning-text uppercase tracking-wider mb-3 shrink-0">
            {t.tv_queue}
          </h2>

          {queueSections.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-gray-600 text-lg text-center">
                <div className="text-4xl mb-2"><Icon name="check" /></div>
                {t.tv_no_waiting}
              </div>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              {queueSections.map((section, sectionIdx) => {
                const visible = section.matches.slice(0, QUEUE_PER_SECTION_CAP);
                const hidden = section.matches.length - visible.length;
                const isBronze = section.key === "bronze";
                return (
                  <div key={section.key}>
                    {section.label && (
                      <div className={`flex items-center gap-2 mb-1.5 text-2xs font-bold uppercase tracking-widest ${
                        isBronze ? "text-orange-300" : section.behind ? "text-danger-text" : "text-phase-text"
                      }`}>
                        {isBronze && <Icon name="medal" className="text-orange-300" />}
                        <span>{section.label}</span>
                        {section.matches.length > 0 && (
                          <span className="font-mono font-normal text-white/60">
                            {t.court_waiting_count.replace("{count}", String(section.matches.length))}
                          </span>
                        )}
                        {section.behind && <span><Icon name="alert" /></span>}
                      </div>
                    )}
                    <div className="space-y-2">
                      {visible.map((m, i) => renderQueueCard(m, sectionIdx === 0 && i === 0 && !isBronze))}
                    </div>
                    {hidden > 0 && (
                      <div className="text-center text-gray-600 text-xs py-1">
                        {t.tv_more.replace("{count}", String(hidden))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Keyboard hint */}
      <div className="fixed bottom-2 right-3 text-2xs text-gray-600 opacity-60">
        {t.tv_keyboard_hint}
      </div>
    </div>
  );
}

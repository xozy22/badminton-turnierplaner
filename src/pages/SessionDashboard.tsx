// src/pages/SessionDashboard.tsx
//
// Bird's-eye view for a multi-tournament workspace ("Session").
// Renders three sections:
//   1. Courts grid — every physical court at the venue, with the live
//      occupancy across ALL tournaments in the session. Per-hall grouping
//      uses the venue's hall_config (the source of truth for sessioned
//      tournaments).
//   2. Queue — pending+active-but-uncourted matches, grouped by tournament
//      with filter pills.
//   3. Recent — the last completed matches across the session.
//
// Polling cadence is 5s via useSessionContext, matching the per-tournament
// view and TV mode. The dashboard renders without sidebar (Fullscreen via
// /sessions/:id/live route, parallel to /tv/:id).

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getSession } from "../lib/sessions";
import { getSportstaetten, getPlayers } from "../lib/db";
import { useSessionContext } from "../lib/sessionContext";
import type { Session, Sportstaette, Player } from "../lib/types";
import { parseHallConfig, hallConfigTotalCourts, getCourtHallLabel, playerDisplayName } from "../lib/types";
import { useTheme } from "../lib/ThemeContext";
import { useT } from "../lib/I18nContext";
import { useToast } from "../lib/ToastContext";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { CourtTimer } from "../components/courts/CourtTimer";

export default function SessionDashboard() {
  const { theme } = useTheme();
  const { t } = useT();
  const { showError } = useToast();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const sessionId = params.id ? Number(params.id) : null;

  const [session, setSession] = useState<Session | null>(null);
  const [venue, setVenue] = useState<Sportstaette | null>(null);
  const [players, setPlayers] = useState<Map<number, Player>>(new Map());
  const [tournamentFilter, setTournamentFilter] = useState<number | "all">("all");
  const [now, setNow] = useState(Date.now());

  // Smart-pause polling once the session is non-active AND no attached
  // tournament is still running. The data won't change, so we save the
  // 5s tick load and surface a "polling paused" badge in the header.
  // Single useSessionContext call: shouldPause is derived from the
  // existing ctx state; when it flips to true the hook's useEffect
  // re-runs (paused is in its deps array) and the interval clears.
  // The hook always does an initial tick before pausing, so the static
  // view is correctly populated.
  const [shouldPause, setShouldPause] = useState(false);
  const ctx = useSessionContext(sessionId, shouldPause);
  useEffect(() => {
    if (!session) { setShouldPause(false); return; }
    if (session.status === "active") { setShouldPause(false); return; }
    setShouldPause(!ctx.tournaments.some((tt) => tt.status === "active"));
  }, [session, ctx.tournaments]);

  useDocumentTitle(session?.name ?? t.session_dashboard_title);

  // Live clock for header
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Initial loads (session metadata, venue, players)
  useEffect(() => {
    if (sessionId == null) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await getSession(sessionId);
        if (!s) {
          showError("Session not found");
          navigate("/sessions");
          return;
        }
        if (cancelled) return;
        setSession(s);
        if (s.venue_id != null) {
          const venues = await getSportstaetten();
          if (cancelled) return;
          setVenue(venues.find((v) => v.id === s.venue_id) ?? null);
        }
        const ps = await getPlayers();
        if (cancelled) return;
        const map = new Map<number, Player>();
        for (const p of ps) map.set(p.id, p);
        setPlayers(map);
      } catch (err) {
        console.error("SessionDashboard load failed:", err);
        showError(String(err));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Derive halls + total courts from venue (hall_config-based)
  const halls = useMemo(() => {
    if (!venue) return [];
    return parseHallConfig(venue.halls);
  }, [venue]);
  const totalCourts = useMemo(() => hallConfigTotalCourts(halls), [halls]);

  // Compose each court's "what's running here" view from the cross-
  // tournament occupancy map.
  const courtSlots = useMemo(() => {
    const slots: { courtNum: number; hallName: string; localCourt: number }[] = [];
    if (totalCourts === 0) return slots;
    for (let n = 1; n <= totalCourts; n++) {
      const label = getCourtHallLabel(n, halls);
      slots.push({ courtNum: n, hallName: label.hallName, localCourt: label.localCourt });
    }
    return slots;
  }, [halls, totalCourts]);

  // Group courts by hall for rendering
  const courtsByHall = useMemo(() => {
    const grouped = new Map<string, typeof courtSlots>();
    for (const slot of courtSlots) {
      const arr = grouped.get(slot.hallName) ?? [];
      arr.push(slot);
      grouped.set(slot.hallName, arr);
    }
    return grouped;
  }, [courtSlots]);

  // Queue: matches across the session that are *not* currently on a court
  // and *not* completed. Filtered by tournament pill if active.
  const queue = useMemo(() => {
    return ctx.matches.filter((m) => {
      if (m.status === "completed") return false;
      if (m.court != null) return false; // already on a court
      if (tournamentFilter !== "all" && m.tournament_id !== tournamentFilter) return false;
      return true;
    });
  }, [ctx.matches, tournamentFilter]);

  // Group queue by tournament for the section
  const queueByTournament = useMemo(() => {
    const grouped = new Map<number, typeof queue>();
    for (const m of queue) {
      const arr = grouped.get(m.tournament_id) ?? [];
      arr.push(m);
      grouped.set(m.tournament_id, arr);
    }
    return grouped;
  }, [queue]);

  // Recent (last 10 completed matches across the session)
  const recent = useMemo(() => {
    return ctx.matches
      .filter((m) => m.status === "completed" && m.completed_at)
      .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
      .slice(0, 10);
  }, [ctx.matches]);

  const playerName = (id: number | null): string => {
    if (id == null) return "—";
    const p = players.get(id);
    return p ? playerDisplayName(p) : `#${id}`;
  };

  const matchPlayersLabel = (m: typeof ctx.matches[number]): string => {
    const t1 = [m.team1_p1, m.team1_p2].filter((x): x is number => x != null && x > 0).map(playerName).join(" / ");
    const t2 = [m.team2_p1, m.team2_p2].filter((x): x is number => x != null && x > 0).map(playerName).join(" / ");
    return `${t1} ${t.common_vs} ${t2}`;
  };

  const handleCourtClick = (m: typeof ctx.matches[number]) => {
    // Jump into the parent tournament's view, scrolling to the match
    navigate(`/tournaments/${m.tournament_id}#match-${m.id}`);
  };

  const handleQueueClick = (m: typeof ctx.matches[number]) => {
    navigate(`/tournaments/${m.tournament_id}#match-${m.id}`);
  };

  if (sessionId == null) {
    return null;
  }

  if (!session) {
    return (
      <div className={`min-h-screen ${theme.cardBg} flex items-center justify-center`}>
        <p className={theme.textSecondary}>{t.common_loading}</p>
      </div>
    );
  }

  // Helper for the ended-banner timestamp formatting.
  const formatTimestamp = (iso: string | null): string => {
    if (!iso) return "—";
    try {
      const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
      return d.toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className={`min-h-screen ${theme.cardBg}`}>
      {/* Status banner — shown when session is ended or archived. Sits
          above the header so it's the first thing the TD sees. Distinct
          color per status: amber for ended (recent winding-down), grey
          for archived (historical). */}
      {session.status === "ended" && (
        <div className="bg-amber-100 text-amber-900 border-b border-amber-200 px-6 py-2 text-sm font-medium flex items-center justify-center gap-2">
          ⏹ {t.session_dashboard_ended_banner.replace("{date}", formatTimestamp(session.ended_at))}
        </div>
      )}
      {session.status === "archived" && (
        <div className="bg-gray-100 text-gray-700 border-b border-gray-200 px-6 py-2 text-sm font-medium flex items-center justify-center gap-2">
          📦 {t.session_dashboard_archived_banner}
        </div>
      )}

      {/* Header */}
      <header className={`${theme.sidebarBg} text-white px-6 py-4 flex items-center justify-between flex-wrap gap-3`}>
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              to={`/sessions/${session.id}`}
              className="text-white/80 hover:text-white text-sm"
            >
              ← {t.session_dashboard_back_to_session}
            </Link>
          </div>
          <h1 className="text-xl font-extrabold tracking-tight mt-1">
            🔗 {session.name}
          </h1>
          <p className="text-sm text-white/80">
            🏟️ {venue?.name ?? "—"} · {ctx.tournaments.length} {t.tournaments_title.toLowerCase()}
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl font-extrabold tabular-nums">
            {new Date(now).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <div className="text-xs text-white/70 mt-0.5">
            {shouldPause
              ? `⏸ ${t.session_dashboard_polling_paused}`
              : ctx.loaded
                ? t.tournament_live_publish_active.replace("{count}", "")
                : t.common_loading}
          </div>
        </div>
      </header>

      <main className="p-6 space-y-8">
        {/* --- COURTS --- */}
        <section>
          <h2 className={`text-lg font-bold ${theme.textPrimary} mb-3`}>
            🟩 {t.session_dashboard_courts_section} ({totalCourts})
          </h2>
          {totalCourts === 0 ? (
            <p className={`text-sm ${theme.textMuted} italic`}>
              {t.session_dashboard_no_courts}
            </p>
          ) : (
            <div className="space-y-4">
              {Array.from(courtsByHall.entries()).map(([hallName, slots]) => (
                <div key={hallName}>
                  {hallName && (
                    <h3 className={`text-xs font-bold uppercase tracking-wide ${theme.textMuted} mb-2`}>
                      {hallName}
                    </h3>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                    {slots.map(({ courtNum, localCourt }) => {
                      const m = ctx.courtOccupancy.get(courtNum);
                      const free = !m;
                      return (
                        <div
                          key={courtNum}
                          onClick={m ? () => handleCourtClick(m) : undefined}
                          className={`rounded-2xl border p-3 transition-all ${
                            free
                              ? `${theme.cardBg} ${theme.inputBorder} text-center`
                              : `${theme.cardBg} ${theme.cardHoverBorder} cursor-pointer shadow-sm hover:shadow`
                          } border`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`font-bold text-sm ${theme.textPrimary}`}>
                              #{localCourt}
                            </span>
                            {m && (
                              <CourtTimer assignedAt={m.court_assigned_at} />
                            )}
                          </div>
                          {free ? (
                            <p className={`text-xs ${theme.textMuted} italic py-2`}>
                              {t.common_free}
                            </p>
                          ) : (
                            <>
                              <p className={`text-[10px] uppercase tracking-wide ${theme.textMuted} truncate`}>
                                {m.tournament_name}
                              </p>
                              <p className={`text-xs font-medium ${theme.textPrimary} mt-0.5 leading-tight`}>
                                {matchPlayersLabel(m)}
                              </p>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* --- QUEUE --- */}
        <section>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 className={`text-lg font-bold ${theme.textPrimary}`}>
              ⏳ {t.session_dashboard_queue_section} ({queue.length})
            </h2>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setTournamentFilter("all")}
                className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                  tournamentFilter === "all"
                    ? `${theme.primaryBg} ${theme.primaryText} border-transparent`
                    : `${theme.cardBg} ${theme.textSecondary} ${theme.inputBorder} ${theme.cardHoverBorder}`
                }`}
              >
                {t.session_dashboard_filter_all_tournaments}
              </button>
              {ctx.tournaments.map((tt) => (
                <button
                  key={tt.id}
                  onClick={() => setTournamentFilter(tt.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                    tournamentFilter === tt.id
                      ? `${theme.primaryBg} ${theme.primaryText} border-transparent`
                      : `${theme.cardBg} ${theme.textSecondary} ${theme.inputBorder} ${theme.cardHoverBorder}`
                  }`}
                  title={tt.name}
                >
                  {tt.name.length > 18 ? tt.name.slice(0, 18) + "…" : tt.name}
                </button>
              ))}
            </div>
          </div>

          {queue.length === 0 ? (
            <p className={`text-sm ${theme.textMuted} italic`}>
              {t.session_dashboard_no_queue}
            </p>
          ) : (
            <div className="space-y-3">
              {Array.from(queueByTournament.entries()).map(([tid, ms]) => {
                const tName = ctx.tournaments.find((tt) => tt.id === tid)?.name ?? `#${tid}`;
                return (
                  <div
                    key={tid}
                    className={`${theme.cardBg} rounded-2xl border ${theme.cardBorder} p-3`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className={`font-semibold text-sm ${theme.textPrimary}`}>
                        🏆 {tName}
                      </h3>
                      <span className={`text-xs ${theme.textMuted}`}>
                        {ms.length} wartend
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {ms.slice(0, 9).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => handleQueueClick(m)}
                          className={`text-left text-xs px-3 py-2 border ${theme.inputBorder} rounded-lg ${theme.cardHoverBorder} transition-all`}
                          title={t.session_dashboard_jump_to_tournament}
                        >
                          <p className={`${theme.textPrimary} truncate`}>
                            {matchPlayersLabel(m)}
                          </p>
                        </button>
                      ))}
                      {ms.length > 9 && (
                        <Link
                          to={`/tournaments/${tid}`}
                          className={`text-xs ${theme.textSecondary} px-3 py-2 italic hover:underline self-center`}
                        >
                          + {ms.length - 9} {t.tv_more}
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* --- RECENT --- */}
        <section>
          <h2 className={`text-lg font-bold ${theme.textPrimary} mb-3`}>
            ✓ {t.session_dashboard_recent_section}
          </h2>
          {recent.length === 0 ? (
            <p className={`text-sm ${theme.textMuted} italic`}>
              {t.session_dashboard_no_recent}
            </p>
          ) : (
            <div className={`${theme.cardBg} rounded-2xl border ${theme.cardBorder} divide-y ${theme.inputBorder}`}>
              {recent.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleQueueClick(m)}
                  className={`w-full text-left px-4 py-2 flex items-center gap-3 hover:bg-gray-50 transition-colors`}
                >
                  <span className={`text-[10px] uppercase tracking-wide ${theme.textMuted} shrink-0`}>
                    {m.tournament_name}
                  </span>
                  <span className={`text-xs ${theme.textPrimary} flex-1 truncate`}>
                    {matchPlayersLabel(m)}
                  </span>
                  {m.winner_team && (
                    <span className="text-xs font-bold text-emerald-700 shrink-0">
                      🏅 Team {m.winner_team}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

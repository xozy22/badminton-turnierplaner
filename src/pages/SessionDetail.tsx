// src/pages/SessionDetail.tsx
//
// Manage a single session: rename, transition status, attach/detach
// tournaments. Linked from Sessions list ("Manage" button).
//
// The page is intentionally simple — it does *not* try to be the live
// dashboard. For the bird's-eye view, the user opens
// /sessions/:id/live (SessionDashboard).

import { useEffect, useMemo, useState } from "react";
import { formatDateTime } from "../lib/datetime";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getSession,
  getSessionTournaments,
  updateSession,
  updateSessionStatus,
  attachTournamentToSession,
  detachTournamentFromSession,
  getSessionEndStats,
} from "../lib/sessions";
import type { SessionEndStats } from "../lib/sessions";
import { getSportstaetten, getTournaments } from "../lib/db";
import type { Session, Sportstaette, Tournament, SessionStatus } from "../lib/types";
import { useTheme } from "../lib/ThemeContext";
import { useT } from "../lib/I18nContext";
import { useToast } from "../lib/ToastContext";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { useDocumentTitle } from "../lib/useDocumentTitle";

export default function SessionDetail() {
  const { theme } = useTheme();
  const { t } = useT();
  const { showError, showSuccess } = useToast();
  const [confirmDialog, ask] = useConfirm();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const sessionId = params.id ? Number(params.id) : null;

  const [session, setSession] = useState<Session | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [allTournaments, setAllTournaments] = useState<Tournament[]>([]);
  const [venues, setVenues] = useState<Sportstaette[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [showAttach, setShowAttach] = useState(false);
  const [attachQuery, setAttachQuery] = useState("");
  // Confirm dialog for the End-session transition. Replaces the native
  // browser confirm() so the look matches the rest of the app. v2.8.6
  // enriched with active-tournament + on-court counts.
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [endStats, setEndStats] = useState<SessionEndStats | null>(null);

  useDocumentTitle(session?.name ?? t.session_detail_title);

  const load = async () => {
    if (sessionId == null) return;
    try {
      const [s, atts, allT, vs] = await Promise.all([
        getSession(sessionId),
        getSessionTournaments(sessionId),
        getTournaments(),
        getSportstaetten(),
      ]);
      if (!s) {
        showError("Session not found");
        navigate("/sessions");
        return;
      }
      setSession(s);
      setNameDraft(s.name);
      setTournaments(atts);
      setAllTournaments(allT);
      setVenues(vs);
    } catch (err) {
      console.error("SessionDetail load failed:", err);
      showError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const venueName = (id: number | null): string => {
    if (id == null) return "—";
    return venues.find((v) => v.id === id)?.name ?? `#${id}`;
  };

  // Tournaments that can still be attached: same venue (or no venue),
  // not part of any session, not completed/archived.
  const attachCandidates = useMemo(() => {
    if (!session) return [];
    const q = attachQuery.trim().toLowerCase();
    return allTournaments.filter((tt) => {
      if (tt.session_id != null) return false;
      if (tt.status === "completed" || tt.status === "archived") return false;
      // Venue: if session has a venue, the tournament must match it (or have none).
      if (session.venue_id != null) {
        if (tt.venue_id != null && tt.venue_id !== session.venue_id) return false;
      }
      if (q && !tt.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allTournaments, session, attachQuery]);

  const handleNameSave = async () => {
    if (!session || !nameDraft.trim()) return;
    try {
      await updateSession(session.id, nameDraft.trim());
      setEditingName(false);
      await load();
    } catch (err) {
      showError(String(err));
    }
  };

  const handleStatusChange = async (status: SessionStatus) => {
    if (!session) return;
    // The "ended" transition gets a styled confirm modal (see render block);
    // every other status change applies immediately.
    if (status === "ended") {
      setShowEndConfirm(true);
      setEndStats(null);
      // Fetch live stats in the background so the modal can render the
      // "still N tournaments active" warning.
      getSessionEndStats(session.id)
        .then((stats) => setEndStats(stats))
        .catch((err) => console.error("getSessionEndStats failed:", err));
      return;
    }
    try {
      await updateSessionStatus(session.id, status);
      await load();
    } catch (err) {
      showError(String(err));
    }
  };

  const confirmEnd = async () => {
    if (!session) return;
    try {
      await updateSessionStatus(session.id, "ended");
      setShowEndConfirm(false);
      setEndStats(null);
      await load();
    } catch (err) {
      showError(String(err));
    }
  };

  const handleAttach = async (tournamentId: number) => {
    if (!session) return;
    try {
      await attachTournamentToSession(tournamentId, session.id);
      await load();
    } catch (err) {
      showError(String(err));
    }
  };

  const handleDetach = async (tournamentId: number) => {
    // Was a native confirm(): unthemed, and it blocks the whole window
    // (REVIEW-BACKLOG.md F4).
    const ok = await ask({
      title: t.session_detail_detach,
      message: t.session_detail_detach_confirm,
      icon: "🔗",
      tone: "danger",
      confirmLabel: t.session_detail_detach,
    });
    if (!ok) return;
    try {
      await detachTournamentFromSession(tournamentId);
      showSuccess(t.session_detail_detach + " ✓");
      await load();
    } catch (err) {
      showError(String(err));
    }
  };

  const formatTimestamp = (iso: string | null): string => {
    if (!iso) return "—";
    try {
      return formatDateTime(iso);
    } catch {
      return iso;
    }
  };

  const tournamentStatusBadge = (s: Tournament["status"]): string => {
    switch (s) {
      case "active": return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "draft": return "bg-info-subtle text-info-text border-info";
      case "completed": return "bg-surface-sunken text-secondary border-line-strong";
      case "archived": return "bg-surface-sunken text-muted border-line-strong";
    }
  };

  if (loading || !session) {
    return (
      <div className={`${theme.textSecondary} text-center py-10`}>
        {t.common_loading}
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb / back */}
      <div className="mb-4">
        <Link
          to="/sessions"
          className={`text-sm ${theme.textSecondary} hover:underline`}
        >
          ← {t.sessions_title}
        </Link>
      </div>

      {/* Header */}
      <div className="flex justify-between items-start gap-4 mb-6 flex-wrap">
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNameSave();
                  else if (e.key === "Escape") {
                    setNameDraft(session.name);
                    setEditingName(false);
                  }
                }}
                maxLength={120}
                className={`text-2xl font-extrabold ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-3 py-1 ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none`}
              />
              <button
                onClick={handleNameSave}
                className={`${theme.primaryBg} ${theme.primaryHoverBg} ${theme.primaryText} px-3 py-1.5 rounded-lg text-sm font-medium`}
              >
                {t.common_save}
              </button>
              <button
                onClick={() => { setNameDraft(session.name); setEditingName(false); }}
                className={`text-sm ${theme.textMuted} hover:underline`}
              >
                {t.common_cancel}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className={`text-2xl font-extrabold ${theme.textPrimary} tracking-tight`}>
                <span aria-hidden="true">🔗</span> {session.name}
              </h1>
              <button
                onClick={() => setEditingName(true)}
                className={`text-xs ${theme.textMuted} hover:${theme.textPrimary} px-2 py-1 border ${theme.inputBorder} rounded-lg ${theme.cardHoverBorder} transition-all`}
              >
                <span aria-hidden="true">✏️</span> {t.common_edit}
              </button>
            </div>
          )}
          <p className={`text-sm ${theme.textSecondary} mt-1`}>
            <span aria-hidden="true">🏟️</span> {venueName(session.venue_id)} · {t.session_started_at}: {formatTimestamp(session.started_at)}
            {session.ended_at && ` · ${t.session_ended_at}: ${formatTimestamp(session.ended_at)}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to={`/sessions/${session.id}/live`}
            className={`${theme.primaryBg} ${theme.primaryHoverBg} ${theme.primaryText} px-4 py-2 rounded-xl text-sm font-semibold transition-all`}
          >
            <span aria-hidden="true">📺</span> {t.sessions_open_dashboard}
          </Link>
          {session.status === "active" && (
            <button
              onClick={() => handleStatusChange("ended")}
              className="border border-warning text-warning-text hover:bg-warning-subtle px-4 py-2 rounded-xl text-sm font-medium transition-all"
            >
              {t.sessions_end}
            </button>
          )}
          {session.status === "ended" && (
            <>
              <button
                onClick={() => handleStatusChange("active")}
                className="border border-emerald-200 text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-xl text-sm font-medium transition-all"
              >
                {t.sessions_reactivate}
              </button>
              <button
                onClick={() => handleStatusChange("archived")}
                className={`border ${theme.inputBorder} ${theme.textMuted} ${theme.cardHoverBorder} px-4 py-2 rounded-xl text-sm font-medium transition-all`}
              >
                {t.sessions_archive}
              </button>
            </>
          )}
          {session.status === "archived" && (
            <button
              onClick={() => handleStatusChange("active")}
              className={`border ${theme.inputBorder} ${theme.textMuted} ${theme.cardHoverBorder} px-4 py-2 rounded-xl text-sm font-medium transition-all`}
            >
              {t.sessions_unarchive}
            </button>
          )}
        </div>
      </div>

      {/* Tournaments */}
      <div className={`${theme.cardBg} rounded-2xl border ${theme.cardBorder} p-5 shadow-sm`}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className={`font-bold ${theme.textPrimary}`}>
              {t.session_detail_attached}
            </h2>
            <p className={`text-xs ${theme.textMuted}`}>
              {t.session_detail_attached_count.replace("{count}", String(tournaments.length))}
            </p>
          </div>
          <button
            onClick={() => setShowAttach(true)}
            disabled={session.status !== "active"}
            title={session.status !== "active" ? t.session_attach_blocked_status_hint : undefined}
            className={`${theme.primaryBg} ${theme.primaryHoverBg} ${theme.primaryText} px-3 py-1.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            + {t.session_detail_attach_button}
          </button>
        </div>
        {session.status !== "active" && (
          <p className={`text-xs ${theme.textMuted} italic mb-3 -mt-2`}>
            {t.session_attach_blocked_status_hint}
          </p>
        )}

        {tournaments.length === 0 ? (
          <p className={`text-sm ${theme.textMuted} italic py-6 text-center`}>
            {t.session_detail_no_tournaments}
          </p>
        ) : (
          <div className="space-y-2">
            {tournaments.map((tt) => (
              <div
                key={tt.id}
                className={`flex items-center gap-3 px-3 py-2 border ${theme.inputBorder} rounded-xl ${theme.cardHoverBorder} transition-all`}
              >
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/tournaments/${tt.id}`}
                    className={`font-medium ${theme.textPrimary} hover:underline truncate block`}
                  >
                    {tt.name}
                  </Link>
                  <p className={`text-xs ${theme.textMuted}`}>
                    {t.tournament_mode}: {tt.mode} · {t.tournament_format}: {tt.format}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${tournamentStatusBadge(tt.status)}`}
                >
                  {tt.status}
                </span>
                <Link
                  to={`/tournaments/${tt.id}`}
                  className={`text-xs ${theme.textSecondary} hover:underline px-2`}
                >
                  {t.session_detail_open_tournament} →
                </Link>
                <button
                  onClick={() => handleDetach(tt.id)}
                  className={`text-xs ${theme.textMuted} hover:text-danger-text px-2 transition-colors`}
                  title={t.session_detail_detach}
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attach dialog */}
      {showAttach && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className={`${theme.cardBg} rounded-2xl shadow-xl border ${theme.cardBorder} max-w-lg w-full max-h-[80vh] overflow-y-auto`}>
            <div className="p-5">
              <h2 className={`text-lg font-bold ${theme.textPrimary} mb-1`}>
                {t.session_detail_attach_dialog_title}
              </h2>
              <p className={`text-xs ${theme.textMuted} mb-4`}>
                {t.session_detail_attach_dialog_hint}
              </p>

              <input
                type="text"
                value={attachQuery}
                onChange={(e) => setAttachQuery(e.target.value)}
                placeholder={t.common_search}
                className={`w-full mb-3 ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-4 py-2 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
              />

              {attachCandidates.length === 0 ? (
                <p className={`text-sm ${theme.textMuted} italic py-6 text-center`}>
                  {t.session_detail_attach_no_candidates}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {attachCandidates.map((tt) => (
                    <button
                      key={tt.id}
                      onClick={async () => {
                        await handleAttach(tt.id);
                        // Stay open so the user can attach more in one go
                      }}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2 border ${theme.inputBorder} rounded-xl ${theme.cardHoverBorder} transition-all`}
                    >
                      <span className={`flex-1 ${theme.textPrimary} truncate text-sm`}>
                        {tt.name}
                      </span>
                      <span className={`text-[10px] uppercase tracking-wide ${theme.textMuted}`}>
                        {tt.status}
                      </span>
                      <span className={`text-xs ${theme.textSecondary}`}>+ {t.common_add}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex justify-end pt-4">
                <button
                  onClick={() => { setShowAttach(false); setAttachQuery(""); }}
                  className={`${theme.cardBg} border ${theme.inputBorder} ${theme.textSecondary} ${theme.cardHoverBorder} px-4 py-2 rounded-xl text-sm font-medium transition-all`}
                >
                  {t.common_close}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* End session confirm — replaces the native browser confirm() so
          the look matches the rest of the app. Non-destructive transition,
          so the primary button uses amber rather than rose. v2.8.6 adds
          a stats block (active tournaments + matches on court) — empty
          state ("nothing running") gets an emerald confirmation. */}
      {showEndConfirm && session && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className={`${theme.cardBg} rounded-2xl shadow-xl border ${theme.cardBorder} max-w-md w-full p-5`}>
            <h2 className={`text-lg font-bold ${theme.textPrimary} mb-2`}>
              ⏹ {t.sessions_end}
            </h2>
            <p className={`text-sm ${theme.textSecondary} mb-3`}>
              <strong>{session.name}</strong>
              <br />
              {t.sessions_end_confirm}
            </p>

            {endStats === null ? (
              <p className={`text-xs ${theme.textMuted} italic mb-4`}>
                {t.sessions_end_loading_stats}
              </p>
            ) : endStats.activeTournaments.length === 0 ? (
              <div className="border border-emerald-200 bg-emerald-50 rounded-xl px-3 py-2 mb-4 text-xs text-emerald-700">
                <span aria-hidden="true">✓</span> {t.sessions_end_stats_none}
              </div>
            ) : (
              <div className="border border-warning bg-warning-subtle rounded-xl px-3 py-2 mb-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-warning-text mb-1">
                  <span aria-hidden="true">⚠</span> {t.sessions_end_stats_title}
                </div>
                <ul className="text-xs text-warning-text space-y-0.5 pl-1">
                  <li>
                    <span aria-hidden="true">🏆</span> {t.sessions_end_stats_active_tournaments.replace("{count}", String(endStats.activeTournaments.length))}
                  </li>
                  <li>
                    <span aria-hidden="true">🟩</span> {t.sessions_end_stats_on_court.replace("{count}", String(endStats.matchesOnCourt))}
                  </li>
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowEndConfirm(false); setEndStats(null); }}
                className={`${theme.cardBg} border ${theme.inputBorder} ${theme.textSecondary} px-4 py-2 rounded-xl ${theme.cardHoverBorder} transition-all text-sm font-medium`}
              >
                {t.common_cancel}
              </button>
              <button
                onClick={confirmEnd}
                className="bg-warning hover:bg-warning text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all"
              >
                {t.sessions_end}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}

// src/pages/Sessions.tsx
//
// Sessions list view — bird's-eye view over all multi-tournament workspaces.
// A session is an opt-in bundle of tournaments running in parallel at the
// same venue. Tournaments outside any session keep their pre-v2.8 behavior;
// this page never touches them.
//
// Three filter pills (Active / Ended / Archived) let the TD focus on what's
// running right now vs. historic data. The "New session" button opens the
// inline create form (name + venue + optional auto-attach of running
// tournaments at that venue). Each row links to manage + dashboard.

import { useEffect, useMemo, useState } from "react";
import Icon from "../components/ui/Icon";
import { formatDateTime } from "../lib/datetime";
import { Link, useNavigate } from "react-router-dom";
import { getSessions, createSession, updateSessionStatus, deleteSession, attachTournamentToSession, getSessionEndStats } from "../lib/sessions";
import type { SessionEndStats } from "../lib/sessions";
import { getSportstaetten, getTournaments } from "../lib/db";
import type { Session, SessionStatus, Sportstaette, Tournament } from "../lib/types";
import { useTheme } from "../lib/ThemeContext";
import { useT } from "../lib/I18nContext";
import { useToast } from "../lib/ToastContext";
import { useDocumentTitle } from "../lib/useDocumentTitle";

type Filter = SessionStatus | "all";

export default function Sessions() {
  const { theme } = useTheme();
  const { t } = useT();
  const { showError, showSuccess } = useToast();
  useDocumentTitle(t.nav_sessions);
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [venues, setVenues] = useState<Sportstaette[]>([]);
  const [tournamentCounts, setTournamentCounts] = useState<Map<number, number>>(new Map());
  const [filter, setFilter] = useState<Filter>("active");
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newName, setNewName] = useState("");
  const [newVenueId, setNewVenueId] = useState<number | "none">("none");
  const [newAttachIds, setNewAttachIds] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);

  // Delete target
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  // End-session confirm target. Same modal pattern as deleteTarget so the
  // confirm flow stays consistent with the rest of the app — replaces the
  // pre-v2.8.3 native browser confirm() dialog. v2.8.6 adds a stats block
  // showing how many tournaments are still active + how many matches are
  // on court so the TD knows what they're signing off on.
  const [endTarget, setEndTarget] = useState<Session | null>(null);
  const [endStats, setEndStats] = useState<SessionEndStats | null>(null);

  const load = async () => {
    try {
      const [s, t2, v] = await Promise.all([
        getSessions(),
        getTournaments(),
        getSportstaetten(),
      ]);
      setSessions(s);
      setTournaments(t2);
      setVenues(v);
      // Count tournaments per session for the cards
      const counts = new Map<number, number>();
      for (const tour of t2) {
        if (tour.session_id != null) {
          counts.set(tour.session_id, (counts.get(tour.session_id) ?? 0) + 1);
        }
      }
      setTournamentCounts(counts);
    } catch (err) {
      console.error("Sessions load failed:", err);
      showError(String(err));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredSessions = useMemo(() => {
    if (filter === "all") return sessions;
    return sessions.filter((s) => s.status === filter);
  }, [sessions, filter]);

  const counts = useMemo(() => {
    const c = { active: 0, ended: 0, archived: 0 };
    for (const s of sessions) c[s.status]++;
    return c;
  }, [sessions]);

  // Tournaments attachable in the create form: same venue (or no venue),
  // not draft only — anything not yet in another session.
  const attachCandidates = useMemo(() => {
    return tournaments.filter((tt) => {
      if (tt.session_id != null) return false;
      if (tt.status === "completed" || tt.status === "archived") return false;
      // Match venue (when picked) or accept tournaments without a venue
      if (newVenueId === "none") return true;
      return tt.venue_id === newVenueId;
    });
  }, [tournaments, newVenueId]);

  const venueName = (id: number | null): string => {
    if (id == null) return "—";
    return venues.find((v) => v.id === id)?.name ?? `#${id}`;
  };

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const venueArg = newVenueId === "none" ? null : newVenueId;
      const id = await createSession(newName.trim(), venueArg);
      // Attach selected tournaments
      for (const tid of newAttachIds) {
        await attachTournamentToSession(tid, id);
      }
      showSuccess(t.session_create_button);
      setShowCreate(false);
      setNewName("");
      setNewVenueId("none");
      setNewAttachIds(new Set());
      await load();
      navigate(`/sessions/${id}`);
    } catch (err) {
      console.error("createSession failed:", err);
      showError(String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleEnd = (s: Session) => {
    // Open modal with placeholder stats (loading state), then fetch
    // real numbers in the background so the modal renders instantly.
    setEndTarget(s);
    setEndStats(null);
    getSessionEndStats(s.id)
      .then((stats) => setEndStats(stats))
      .catch((err) => {
        console.error("getSessionEndStats failed:", err);
        // Keep stats null — modal still works, just without enrichment.
      });
  };

  const confirmEnd = async () => {
    if (!endTarget) return;
    try {
      await updateSessionStatus(endTarget.id, "ended");
      setEndTarget(null);
      setEndStats(null);
      await load();
    } catch (err) {
      showError(String(err));
    }
  };

  const handleReactivate = async (s: Session) => {
    try {
      await updateSessionStatus(s.id, "active");
      await load();
    } catch (err) {
      showError(String(err));
    }
  };

  const handleArchive = async (s: Session) => {
    try {
      await updateSessionStatus(s.id, "archived");
      await load();
    } catch (err) {
      showError(String(err));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSession(deleteTarget.id);
      setDeleteTarget(null);
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

  const statusLabel = (s: SessionStatus): string =>
    s === "active" ? t.session_status_active
      : s === "ended" ? t.session_status_ended
        : t.session_status_archived;

  const statusBadgeClass = (s: SessionStatus): string =>
    s === "active" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : s === "ended" ? "bg-warning-subtle text-warning-text border-warning"
        : "bg-surface-sunken text-secondary border-line-strong";

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className={`text-2xl font-extrabold ${theme.textPrimary} tracking-tight`}>
            <Icon name="link" /> {t.sessions_title}
          </h1>
          <p className={`text-sm ${theme.textSecondary} mt-0.5`}>
            {t.sessions_subtitle}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className={`${theme.primaryBg} ${theme.primaryHoverBg} ${theme.primaryText} px-4 py-2 rounded-xl shadow-sm transition-all text-sm font-semibold`}
        >
          + {t.sessions_new}
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {([
          ["active", t.sessions_filter_active, counts.active],
          ["ended", t.sessions_filter_ended, counts.ended],
          ["archived", t.sessions_filter_archived, counts.archived],
          ["all", t.sessions_filter_all, sessions.length],
        ] as const).map(([key, label, n]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              filter === key
                ? `${theme.primaryBg} ${theme.primaryText} border-transparent`
                : `${theme.cardBg} ${theme.textSecondary} ${theme.inputBorder} ${theme.cardHoverBorder}`
            }`}
          >
            {label} ({n})
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filteredSessions.length === 0 && (
        <div className={`${theme.cardBg} rounded-2xl border ${theme.cardBorder} p-10 text-center`}>
          <div className="text-4xl mb-3 opacity-50"><Icon name="link" /></div>
          <p className={`text-sm ${theme.textSecondary}`}>
            {filter === "active"
              ? t.sessions_no_active
              : sessions.length === 0
                ? t.sessions_none_yet
                : "—"}
          </p>
        </div>
      )}

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSessions.map((s) => {
          const tCount = tournamentCounts.get(s.id) ?? 0;
          return (
            <div
              key={s.id}
              className={`${theme.cardBg} rounded-2xl border ${theme.cardBorder} p-4 ${theme.cardHoverBorder} transition-all shadow-sm hover:shadow`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className={`font-bold ${theme.textPrimary} truncate`}>
                    {s.name}
                  </h3>
                  <p className={`text-xs ${theme.textMuted} truncate`}>
                    <Icon name="building" /> {venueName(s.venue_id)}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${statusBadgeClass(s.status)}`}
                >
                  {statusLabel(s.status)}
                </span>
              </div>

              <div className={`text-xs ${theme.textSecondary} space-y-0.5 mb-3`}>
                <div>
                  {t.session_started_at}: {formatTimestamp(s.started_at)}
                </div>
                {s.ended_at && (
                  <div>
                    {t.session_ended_at}: {formatTimestamp(s.ended_at)}
                  </div>
                )}
                <div>
                  <Icon name="trophy" /> {t.session_detail_attached_count.replace("{count}", String(tCount))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  to={`/sessions/${s.id}/live`}
                  className={`${theme.primaryBg} ${theme.primaryHoverBg} ${theme.primaryText} px-3 py-1.5 rounded-lg text-xs font-semibold transition-all`}
                >
                  <Icon name="monitor" /> {t.sessions_open_dashboard}
                </Link>
                <Link
                  to={`/sessions/${s.id}`}
                  className={`${theme.cardBg} border ${theme.inputBorder} ${theme.textSecondary} ${theme.cardHoverBorder} px-3 py-1.5 rounded-lg text-xs font-medium transition-all`}
                >
                  <Icon name="settings" /> {t.sessions_manage}
                </Link>
                {s.status === "active" && (
                  <button
                    onClick={() => handleEnd(s)}
                    className={`${theme.cardBg} border border-warning text-warning-text hover:bg-warning-subtle px-3 py-1.5 rounded-lg text-xs font-medium transition-all`}
                  >
                    {t.sessions_end}
                  </button>
                )}
                {s.status === "ended" && (
                  <>
                    <button
                      onClick={() => handleReactivate(s)}
                      className={`${theme.cardBg} border border-emerald-200 text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-lg text-xs font-medium transition-all`}
                    >
                      {t.sessions_reactivate}
                    </button>
                    <button
                      onClick={() => handleArchive(s)}
                      className={`${theme.cardBg} border ${theme.inputBorder} ${theme.textMuted} ${theme.cardHoverBorder} px-3 py-1.5 rounded-lg text-xs font-medium transition-all`}
                    >
                      {t.sessions_archive}
                    </button>
                  </>
                )}
                {s.status === "archived" && (
                  <button
                    onClick={() => handleReactivate(s)}
                    className={`${theme.cardBg} border ${theme.inputBorder} ${theme.textMuted} ${theme.cardHoverBorder} px-3 py-1.5 rounded-lg text-xs font-medium transition-all`}
                  >
                    {t.sessions_unarchive}
                  </button>
                )}
                <button
                  onClick={() => setDeleteTarget(s)}
                  className={`text-xs ${theme.textMuted} hover:text-danger-text px-2 py-1.5 transition-colors ml-auto`}
                  title={t.sessions_delete}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className={`${theme.cardBg} rounded-2xl shadow-xl border ${theme.cardBorder} max-w-lg w-full max-h-[90vh] overflow-y-auto`}>
            <div className="p-5">
              <h2 className={`text-lg font-bold ${theme.textPrimary} mb-4`}>
                {t.session_create_title}
              </h2>

              {/* Name */}
              <div className="mb-4">
                <label className={`block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
                  {t.session_name_label}
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={120}
                  className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-4 py-2 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                  placeholder={t.session_name_placeholder}
                />
              </div>

              {/* Venue */}
              <div className="mb-4">
                <label className={`block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
                  {t.session_venue_label}
                </label>
                <select
                  value={String(newVenueId)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setNewVenueId(v === "none" ? "none" : Number(v));
                    setNewAttachIds(new Set()); // reset selection when venue changes
                  }}
                  className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-4 py-2 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                >
                  <option value="none">{t.session_venue_none}</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}{v.city ? ` (${v.city})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Attach existing tournaments */}
              <div className="mb-4">
                <label className={`block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
                  {t.session_attach_active_tournaments}
                </label>
                <p className={`text-xs ${theme.textMuted} mb-2`}>
                  {t.session_attach_active_hint}
                </p>
                {attachCandidates.length === 0 ? (
                  <p className={`text-xs ${theme.textMuted} italic px-2 py-3`}>
                    {t.session_attach_no_candidates}
                  </p>
                ) : (
                  <div className={`max-h-48 overflow-y-auto border ${theme.inputBorder} rounded-xl`}>
                    {attachCandidates.map((tt) => (
                      <label
                        key={tt.id}
                        className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-surface-sunken`}
                      >
                        <input
                          type="checkbox"
                          checked={newAttachIds.has(tt.id)}
                          onChange={(e) => {
                            const next = new Set(newAttachIds);
                            if (e.target.checked) next.add(tt.id);
                            else next.delete(tt.id);
                            setNewAttachIds(next);
                          }}
                        />
                        <span className={`text-sm ${theme.textPrimary} flex-1 truncate`}>
                          {tt.name}
                        </span>
                        <span className={`text-[10px] uppercase tracking-wide ${theme.textMuted}`}>
                          {tt.status}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowCreate(false);
                    setNewName("");
                    setNewVenueId("none");
                    setNewAttachIds(new Set());
                  }}
                  className={`${theme.cardBg} border ${theme.inputBorder} ${theme.textSecondary} px-4 py-2 rounded-xl ${theme.cardHoverBorder} transition-all text-sm font-medium`}
                >
                  {t.common_cancel}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || creating}
                  className={`${theme.primaryBg} ${theme.primaryHoverBg} ${theme.primaryText} px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all`}
                >
                  {t.session_create_button}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className={`${theme.cardBg} rounded-2xl shadow-xl border ${theme.cardBorder} max-w-md w-full p-5`}>
            <h2 className={`text-lg font-bold ${theme.textPrimary} mb-2`}>
              {t.sessions_delete_confirm_title}
            </h2>
            <p className={`text-sm ${theme.textSecondary} mb-4`}>
              <strong>{deleteTarget.name}</strong>
              <br />
              {t.sessions_delete_confirm_message}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className={`${theme.cardBg} border ${theme.inputBorder} ${theme.textSecondary} px-4 py-2 rounded-xl ${theme.cardHoverBorder} transition-all text-sm font-medium`}
              >
                {t.common_cancel}
              </button>
              <button
                onClick={handleDelete}
                className="bg-danger hover:bg-danger text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all"
              >
                {t.sessions_delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End session confirm — same modal pattern as the delete-confirm
          above, but the action is non-destructive (status transition only),
          so the primary button uses the amber accent instead of rose.
          v2.8.6: stats block shows how many tournaments are still active
          and how many matches are on court — empty state ("ready to end")
          gets an emerald confirmation instead. */}
      {endTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className={`${theme.cardBg} rounded-2xl shadow-xl border ${theme.cardBorder} max-w-md w-full p-5`}>
            <h2 className={`text-lg font-bold ${theme.textPrimary} mb-2`}>
              ⏹ {t.sessions_end}
            </h2>
            <p className={`text-sm ${theme.textSecondary} mb-3`}>
              <strong>{endTarget.name}</strong>
              <br />
              {t.sessions_end_confirm}
            </p>

            {/* Stats block — three render paths: loading / has activity /
                clean. The clean state uses an emerald border to signal
                "no surprises here, safe to end". */}
            {endStats === null ? (
              <p className={`text-xs ${theme.textMuted} italic mb-4`}>
                {t.sessions_end_loading_stats}
              </p>
            ) : endStats.activeTournaments.length === 0 ? (
              <div className="border border-emerald-200 bg-emerald-50 rounded-xl px-3 py-2 mb-4 text-xs text-emerald-700">
                <Icon name="check" /> {t.sessions_end_stats_none}
              </div>
            ) : (
              <div className="border border-warning bg-warning-subtle rounded-xl px-3 py-2 mb-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-warning-text mb-1">
                  <Icon name="alert" /> {t.sessions_end_stats_title}
                </div>
                <ul className="text-xs text-warning-text space-y-0.5 pl-1">
                  <li>
                    <Icon name="trophy" /> {t.sessions_end_stats_active_tournaments.replace("{count}", String(endStats.activeTournaments.length))}
                  </li>
                  <li>
                    <span aria-hidden="true"><Icon name="dot" /></span> {t.sessions_end_stats_on_court.replace("{count}", String(endStats.matchesOnCourt))}
                  </li>
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setEndTarget(null); setEndStats(null); }}
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
    </div>
  );
}

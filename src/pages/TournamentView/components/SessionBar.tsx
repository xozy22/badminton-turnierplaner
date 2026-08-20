// src/pages/TournamentView/components/SessionBar.tsx
//
// The strip above the header when a tournament is part of a session:
// which workspace it belongs to, how many tournaments share it, a one-click
// switch to any of them, and the way into the shared dashboard.
//
// Shown even for ended sessions — the cross-tournament context still
// matters for matches that are running (REVIEW-BACKLOG.md D1).

import { useNavigate } from "react-router-dom";
import Icon from "../../../components/ui/Icon";
import { useT } from "../../../lib/I18nContext";
import { useTheme } from "../../../lib/ThemeContext";
import type { Session, Tournament } from "../../../lib/types";

interface Props {
  tournament: Tournament;
  sessionMeta: Session | null;
  /** Tournaments in the same session, this one excluded. */
  sessionSiblings: Tournament[];
  /** How many tournaments the session holds in total. */
  sessionTournamentCount: number;
}

export default function SessionBar({
  tournament,
  sessionMeta,
  sessionSiblings,
  sessionTournamentCount,
}: Props) {
  const { t } = useT();
  const { theme } = useTheme();
  const navigate = useNavigate();

  return (
    <>
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
          · {sessionTournamentCount} <Icon name="trophy" />
        </span>
        {sessionSiblings.length > 0 && (
          <div className="ml-2 flex flex-wrap items-center gap-1.5">
            <span className={`mr-1 text-2xs uppercase tracking-wide ${theme.textMuted}`}>
              {t.session_switcher_label}:
            </span>
            {sessionSiblings.map((sib) => (
              <button
                key={sib.id}
                onClick={() => navigate(`/tournaments/${sib.id}`)}
                // Was px-2 py-0.5 with the name cut at 18 characters: two
                // pixels of height to aim at, and two tournaments from the
                // same evening often differ only past the cut.
                className={`flex max-w-56 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${theme.inputBorder} ${theme.cardHoverBorder} ${theme.textSecondary} hover:bg-surface-sunken`}
                title={sib.name}
              >
                <span aria-hidden="true" className="shrink-0 text-muted">
                  <Icon name="trophy" size={11} />
                </span>
                <span className="truncate">{sib.name}</span>
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

    </>
  );
}

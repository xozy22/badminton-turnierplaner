// src/pages/TournamentView/components/TournamentHeader.tsx
//
// The title, the badges that describe how this tournament is played, and
// the row of actions: advance a round, complete, undo, the live-publishing
// controls, and everything else behind the overflow menu.
//
// Twenty props, which is what it costs once the dialog flags and the live
// controls each travel as one object rather than as fifteen loose values
// (REVIEW-BACKLOG.md D1).

import Icon, { type IconName } from "../../../components/ui/Icon";
import OverflowMenu from "../../../components/ui/OverflowMenu";
import { useT } from "../../../lib/I18nContext";
import { useTheme } from "../../../lib/ThemeContext";
import { formatLabel, modeLabel } from "../../../lib/i18n/labels";
import type { FormatEngine } from "../../../lib/formats";
import type { TournamentDialogs } from "../lib/useTournamentDialogs";
import type { UndoTarget } from "./modals/UndoRoundModal";
import { getScoringDescription } from "../../../lib/scoring";
import type { Round, Tournament } from "../../../lib/types";

/** Everything the live-publishing controls need, from useLiveControls. */
export interface LiveControls {
  liveActive: boolean;
  livePaused: boolean;
  liveBusy: boolean;
  liveStatusNow: number;
  livePushStatus: ReturnType<typeof import("../../../lib/useLivePublisher").usePushStatus>;
  handleEnableLive: () => void | Promise<void>;
  handleTogglePause: () => void | Promise<void>;
  handlePushNow: () => void;
}

interface Props {
  tournament: Tournament;
  tournamentId: number;
  rounds: Round[];
  dialogs: TournamentDialogs;
  live: LiveControls;
  engine: FormatEngine | null;
  formatProgress: { current: number; total: number } | null;
  advanceButton: { icon: IconName; label: string };
  advanceButtonStyle: string;
  canAdvanceOther: boolean;
  canStartKo: boolean;
  isGroupKo: boolean;
  isDoubleElimination: boolean;
  hasOpenMatches: boolean;
  undoTarget: UndoTarget | null;
  onAdvanceFormat: () => void | Promise<void>;
  onCompleteTournament: () => void | Promise<void>;
  onOpenTvWindow: () => void;
  onArchive: () => void | Promise<void>;
  onExport: (kind: "matches" | "standings" | "payments" | "json") => void | Promise<void>;
  onNavigate: (to: string) => void;
}

export default function TournamentHeader({
  tournament,
  tournamentId,
  rounds,
  dialogs,
  live,
  formatProgress,
  advanceButton,
  advanceButtonStyle,
  canAdvanceOther,
  canStartKo,
  isGroupKo,
  isDoubleElimination,
  hasOpenMatches,
  undoTarget,
  onAdvanceFormat: advanceFormat,
  onCompleteTournament: handleCompleteTournament,
  onOpenTvWindow: openTvWindow,
  onArchive: handleArchive,
  onExport: handleExport,
  onNavigate: navigate,
}: Props) {
  const { t } = useT();
  const { theme } = useTheme();

  // Derived from the tournament alone, so it lives with the badge it
  // colours rather than being handed in.
  const statusStyle =
    tournament.status === "active"
      ? `${theme.activeBadgeBg} ${theme.activeBadgeText}`
      : tournament.status === "completed"
        ? "bg-surface-sunken text-muted"
        : tournament.status === "archived"
          ? "bg-phase-subtle text-phase-text"
          : "bg-warning-subtle text-warning-text";

  return (
    <>
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
          {modeLabel(t, tournament.mode)}
        </span>
        <span className={`text-xs font-medium ${theme.cardBg} ${theme.textSecondary} border ${theme.cardBorder} px-2.5 py-1 rounded-full`}>
          {formatLabel(t, tournament.format)}
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
            onClick={() => dialogs.setShowAttendance(true)}
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
          onClick={() => dialogs.setShowStartKoModal(true)}
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
          <Icon name={advanceButton.icon} /> {advanceButton.label}
        </button>
      )}
      {tournament.status === "active" && rounds.length > 0 && (
        <button
          onClick={() => dialogs.setShowUndoRound(true)}
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
          onClick={() => dialogs.setShowReopenConfirm(true)}
          className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-4 py-2.5 rounded-md hover:border-success hover:text-success-text transition-all text-sm font-medium`}
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
      {live.liveActive ? (() => {
        // Compact button group: the main pill carries the label + ID;
        // the two secondary actions (pause/resume and push-now) are
        // attached as 32×32 icon squares to keep horizontal space tight.
        // The status text wraps below on narrow viewports.
        const statusText = (() => {
          if (live.livePaused) return t.tournament_live_status_paused_hint;
          const fmtRel = (iso: string | null): string | null => {
            if (!iso) return null;
            const diffSec = Math.max(0, Math.floor((live.liveStatusNow - new Date(iso).getTime()) / 1000));
            if (diffSec < 60) return `${diffSec}s`;
            const m = Math.floor(diffSec / 60);
            if (m < 60) return `${m} min`;
            const h = Math.floor(m / 60);
            return `${h} h`;
          };
          if (live.livePushStatus?.backoffUntil && live.livePushStatus.backoffUntil > live.liveStatusNow) {
            return t.tournament_live_status_backoff;
          }
          if (live.livePushStatus?.lastError) {
            const rel = fmtRel(live.livePushStatus.lastPushAt);
            return t.tournament_live_status_error_ago.replace("{time}", rel ?? "?");
          }
          if (live.livePushStatus?.lastPushAt) {
            const rel = fmtRel(live.livePushStatus.lastPushAt);
            return rel ? t.tournament_live_status_pushed_ago.replace("{time}", rel) : "";
          }
          return t.tournament_live_status_never_pushed;
        })();
        return (
          <div className="inline-flex items-center gap-1 flex-wrap">
            {/* Main pill — opens UnpublishModal on click */}
            <button
              onClick={() => dialogs.setShowUnpublishConfirm(true)}
              title={t.tournament_live_publish_id_hint.replace("{id}", String(tournamentId))}
              disabled={live.liveBusy}
              className={`${
                live.livePaused
                  ? "bg-warning-subtle border-warning text-warning-text hover:bg-warning-subtle/70"
                  : "bg-success-subtle border-success text-success-text hover:bg-success-subtle/70"
              } border px-4 py-2.5 rounded-md transition-all text-sm font-medium disabled:opacity-50`}
            >
              <Icon name="radio" /> {live.livePaused ? t.tournament_live_publish_paused_label : t.tournament_live_publish_active}
              <span className={`ml-2 px-1.5 py-0.5 rounded-sm ${live.livePaused ? "bg-warning-subtle border-warning" : "bg-success-subtle border-success"} border text-2xs font-mono opacity-90`}>
                ID: {tournamentId}
              </span>
            </button>
            {/* Compact icon controls — tooltips carry the action label */}
            <button
              onClick={live.handleTogglePause}
              disabled={live.liveBusy}
              title={live.livePaused ? t.tournament_live_publish_resume : t.tournament_live_publish_pause}
              aria-label={live.livePaused ? t.tournament_live_publish_resume : t.tournament_live_publish_pause}
              className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} w-8 h-8 flex items-center justify-center rounded-sm hover:border-warning hover:text-warning-text transition-all text-sm disabled:opacity-50`}
            >
              <Icon name={live.livePaused ? "play" : "ban"} />
            </button>
            {!live.livePaused && (
              <button
                onClick={live.handlePushNow}
                disabled={live.liveBusy}
                title={t.tournament_live_publish_push_now}
                aria-label={t.tournament_live_publish_push_now}
                className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} w-8 h-8 flex items-center justify-center rounded-sm hover:border-success hover:text-success-text transition-all text-sm disabled:opacity-50`}
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
                { icon: "printer" as const, label: t.tournament_view_print, onClick: () => dialogs.setShowPrint(true) },
                // The export dropdown used to be a button of its own with
                // its own menu; four entries here cost less width and one
                // interaction less (REVIEW-BACKLOG.md F3).
                { icon: "download" as const, label: t.export_matches_csv, onClick: () => handleExport("matches") },
                { icon: "download" as const, label: t.export_standings_csv, onClick: () => handleExport("standings") },
                { icon: "download" as const, label: t.export_payments_csv, onClick: () => handleExport("payments") },
                { icon: "download" as const, label: t.export_json, onClick: () => handleExport("json") },
              ]
            : []),
          ...(tournament.status === "active"
            ? [{ icon: "monitor" as const, label: t.tournament_view_tv_mode, onClick: openTvWindow }]
            : []),
          ...(!live.liveActive
            ? [
                {
                  icon: "megaphone" as const,
                  label: t.tournament_live_publish_enable,
                  onClick: live.handleEnableLive,
                  disabled: live.liveBusy || tournament.status === "draft",
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
                  icon: "pencil" as const,
                  label: t.tournament_view_edit,
                  onClick: () => navigate(`/tournaments/${tournament.id}/edit`),
                },
                {
                  icon: "clipboard" as const,
                  label: t.tournament_view_template,
                  onClick: () => dialogs.setShowTemplateExport(true),
                },
                {
                  icon: "trash" as const,
                  label: t.tournament_view_delete,
                  onClick: () => dialogs.setShowDeleteConfirm(true),
                  destructive: true,
                },
              ]
            : []),
        ]}
      />
    </div>
  </div>

    </>
  );
}

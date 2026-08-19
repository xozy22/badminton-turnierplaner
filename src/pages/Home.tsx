import { useEffect, useState } from "react";
import Icon from "../components/ui/Icon";
import { Link, useNavigate } from "react-router-dom";
import { getTournaments, getPlayers, createTournament, getSportstaetten } from "../lib/db";
import type { Tournament, Player } from "../lib/types";
import { formatLabel, modeLabel, statusLabel } from "../lib/i18n/labels";
import { useTheme } from "../lib/ThemeContext";
import { useT } from "../lib/I18nContext";
import { useToast } from "../lib/ToastContext";
import { useDocumentTitle } from "../lib/useDocumentTitle";

export default function Home() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { t } = useT();
  const { showError } = useToast();
  useDocumentTitle(t.nav_home);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    getTournaments().then(setTournaments);
    getPlayers().then(setPlayers);
  }, []);

  const activeTournaments = tournaments.filter((t) => t.status === "active");
  const visibleTournaments = tournaments.filter((t) => t.status !== "archived");

  return (
    <div>
      {/* Hero */}
      <div className="mb-8">
        <h1 className={`text-3xl font-extrabold ${theme.textPrimary} tracking-tight`}>
          {t.home_welcome} <span aria-hidden="true">🏸</span>
        </h1>
        <p className={`${theme.textSecondary} mt-1`}>
          {t.home_subtitle}
        </p>
      </div>

      {/* The figures sat on saturated gradients, which put every number on a
          colour field and made the three compete with each other. The colour
          moves to an edge marker: it still identifies the card, without
          fighting the value for attention. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {[
          { value: players.length, label: t.home_players_registered, accent: "bg-accent" },
          { value: activeTournaments.length, label: t.home_active_tournaments, accent: "bg-warning" },
          { value: visibleTournaments.length, label: t.home_total_tournaments, accent: "bg-phase" },
        ].map((tile) => (
          <div
            key={tile.label}
            className="relative overflow-hidden rounded-md border border-line bg-surface p-5 shadow-sm"
          >
            <span className={`absolute inset-y-0 left-0 w-1 ${tile.accent}`} aria-hidden="true" />
            <div className="text-4xl font-bold tabular-nums text-primary">{tile.value}</div>
            <div className="mt-1 text-sm font-medium text-muted">{tile.label}</div>
          </div>
        ))}
      </div>

      {/* Active Tournaments */}
      {activeTournaments.length > 0 && (
        <div className="mb-8">
          <h2 className={`text-lg font-bold ${theme.textPrimary} mb-3`}>
            {t.home_running_tournaments}
          </h2>
          <div className="space-y-2">
            {activeTournaments.map((tr) => (
              <Link
                key={tr.id}
                to={`/tournaments/${tr.id}`}
                className={`block ${theme.cardBg} rounded-md shadow-sm border ${theme.cardBorder} p-4 hover:shadow-sm ${theme.cardHoverBorder} transition-all duration-200`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className={`font-semibold ${theme.textPrimary}`}>
                      {tr.name}
                    </div>
                    <div className={`text-sm ${theme.textSecondary} mt-0.5`}>
                      {modeLabel(t, tr.mode)} &middot;{" "}
                      {formatLabel(t, tr.format)}
                    </div>
                  </div>
                  <span className={`text-xs font-medium ${theme.activeBadgeBg} ${theme.activeBadgeText} px-3 py-1 rounded-full`}>
                    {statusLabel(t, tr.status)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Link
          to="/players"
          className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textPrimary} px-5 py-2.5 rounded-md ${theme.cardHoverBorder} hover:shadow-sm transition-all duration-200 text-sm font-medium`}
        >
          <Icon name="users" /> {t.home_manage_players}
        </Link>
        <button
          onClick={async () => {
            if (creating) return;
            setCreating(true);
            try {
              // Hard guard: venue is mandatory since v2.8.2.
              const venues = await getSportstaetten();
              if (venues.length === 0) {
                showError(t.tournament_venue_no_venues_message);
                navigate("/sportstaetten");
                setCreating(false);
                return;
              }
              const now = new Date();
              const d = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
              // enableThirdPlace=true so the bronze-toggle is pre-checked once the
              // user later switches the format to a KO variant in the wizard.
              const id = await createTournament(`${d} - ${t.mode_doubles} - ${t.format_random_doubles}`, "doubles", "random_doubles", 2, 21, 2, 0, 0, 0, 0, null, 0, true);
              navigate(`/tournaments/${id}/edit`);
            } catch (err) { console.error(err); setCreating(false); }
          }}
          disabled={creating}
          className={`${theme.primaryBg} ${theme.primaryText} px-5 py-2.5 rounded-md ${theme.primaryHoverBg} shadow-sm hover:shadow-sm transition-all duration-200 text-sm font-medium disabled:opacity-50`}
        >
          <Icon name="trophy" /> {t.home_new_tournament}
        </button>
      </div>
    </div>
  );
}

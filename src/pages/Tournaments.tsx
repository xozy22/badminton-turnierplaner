import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getTournaments, deleteTournament, updateTournamentStatus, createTournament, createPlayer, getPlayers, addPlayerToTournament, updateTeamConfig, updateHallConfig, isTauri, getSportstaetten } from "../lib/db";
import { getSessions } from "../lib/sessions";
import type { Tournament, Gender, Session } from "../lib/types";
import { getScoringModeId } from "../lib/scoring";
import { useTheme } from "../lib/ThemeContext";
import { useT } from "../lib/I18nContext";
import { useToast } from "../lib/ToastContext";
import { useDocumentTitle } from "../lib/useDocumentTitle";

export default function Tournaments() {
  const { theme } = useTheme();
  const { t } = useT();
  const { showError } = useToast();
  useDocumentTitle(t.nav_tournaments);
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  // Session lookup so the card row can render a "🔗 Session: …" pill when
  // a tournament is part of a multi-tournament-workspace. Loaded alongside
  // tournaments — sessions are typically a handful, lookup overhead is nil.
  const [sessionsById, setSessionsById] = useState<Map<number, Session>>(new Map());
  const [showArchive, setShowArchive] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleNewTournament = async () => {
    if (creating) return;
    setCreating(true);
    try {
      // Hard guard: a venue is mandatory since v2.8.2. Without one the
      // wizard's halls/courts step is undefined and sessions can't function.
      // Send the user straight to the venue manager with an explanatory toast.
      const venues = await getSportstaetten();
      if (venues.length === 0) {
        showError(t.tournament_venue_no_venues_message);
        navigate("/sportstaetten");
        setCreating(false);
        return;
      }
      const now = new Date();
      const d = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
      const defaultName = `${d} - ${t.mode_doubles} - ${t.format_random_doubles}`;
      // enableThirdPlace=true so the bronze-toggle is pre-checked once the
      // user later switches the format to a KO variant in the wizard.
      const id = await createTournament(defaultName, "doubles", "random_doubles", 2, 21, 2, 0, 0, 0, 0, null, 0, true);
      navigate(`/tournaments/${id}/edit`);
    } catch (err) {
      console.error("Error creating tournament:", err);
      setCreating(false);
    }
  };
  const [deleteTarget, setDeleteTarget] = useState<Tournament | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const applyTemplate = async (tpl: Record<string, unknown>) => {
    const mode = (tpl.mode as string) || "doubles";
    const format = (tpl.format as string) || "random_doubles";
    const name = (tpl.name as string) || "";
    const setsToWin = (tpl.sets_to_win as number) || 2;
    const pointsPerSet = (tpl.points_per_set as number) || 21;
    const courts = (tpl.courts as number) || 2;
    const numGroups = (tpl.num_groups as number) || 0;
    const qualifyPerGroup = (tpl.qualify_per_group as number) || 0;
    const entryFeeSingle = (tpl.entry_fee_single as number) || 0;
    const entryFeeDouble = (tpl.entry_fee_double as number) || 0;
    const cap = (typeof tpl.cap === "number" ? tpl.cap : null);
    const minRestMinutes = (tpl.min_rest_minutes as number) || 0;
    // Bronze toggle: read from template if present, otherwise default to ON
    // for KO formats (matches the wizard's default-on behavior).
    const enableThirdPlace = typeof tpl.enable_third_place === "number"
      ? tpl.enable_third_place === 1
      : (format === "elimination" || format === "group_ko" || format === "double_elimination");

    const id = await createTournament(
      name,
      mode as any,
      format as any,
      setsToWin,
      pointsPerSet,
      courts,
      numGroups,
      qualifyPerGroup,
      entryFeeSingle,
      entryFeeDouble,
      cap,
      minRestMinutes,
      enableThirdPlace
    );

    // --- Robust player import: auto-create missing, build id-map ---
    if (tpl.players && Array.isArray(tpl.players)) {
      const norm = (s: unknown) => String(s || "").trim().toLowerCase();

      // Normalize template player records (support v1 name-only + v2 first/last)
      type TplPlayer = {
        tplId: number;
        first_name: string;
        last_name: string;
        gender: Gender;
        birth_date: string | null;
        club: string | null;
      };
      const tplPlayers: TplPlayer[] = (tpl.players as any[])
        .map((tp: any): TplPlayer | null => {
          const gender: Gender = (tp.gender === "f" || tp.gender === "m") ? tp.gender : "m";
          if (typeof tp.first_name === "string" || typeof tp.last_name === "string") {
            const fn = String(tp.first_name || "").trim();
            const ln = String(tp.last_name || "").trim();
            if (!fn && !ln) return null;
            return {
              tplId: Number(tp.id),
              first_name: fn,
              last_name: ln,
              gender,
              birth_date: tp.birth_date ?? null,
              club: tp.club ?? null,
            };
          }
          // v1 legacy: split full name on last space
          const full = String(tp.name || "").trim();
          if (!full) return null;
          const idx = full.lastIndexOf(" ");
          return {
            tplId: Number(tp.id),
            first_name: idx > 0 ? full.slice(0, idx) : full,
            last_name: idx > 0 ? full.slice(idx + 1) : "",
            gender,
            birth_date: null,
            club: null,
          };
        })
        .filter((p: TplPlayer | null): p is TplPlayer => p !== null);

      // Snapshot current local players
      let localPlayers = await getPlayers();
      const findLocal = (fp: TplPlayer) =>
        localPlayers.find((lp) =>
          norm(lp.first_name) === norm(fp.first_name) &&
          norm(lp.last_name) === norm(fp.last_name) &&
          lp.gender === fp.gender
        );

      // Create missing players
      let createdCount = 0;
      for (const fp of tplPlayers) {
        if (findLocal(fp)) continue;
        try {
          await createPlayer(fp.first_name, fp.last_name, fp.gender, fp.birth_date, fp.club);
          createdCount++;
        } catch (err) {
          console.error("Template import: createPlayer failed for", fp, err);
        }
      }

      // Refresh local player list so newly created ones are visible
      if (createdCount > 0) {
        localPlayers = await getPlayers();
      }

      // Build id-map (template id → local id) and attach all matched players to the new tournament
      const idMap = new Map<number, number>();
      for (const fp of tplPlayers) {
        const match = findLocal(fp);
        if (match) {
          idMap.set(fp.tplId, match.id);
          try {
            await addPlayerToTournament(id, match.id);
          } catch (err) {
            console.error("Template import: addPlayerToTournament failed for", match, err);
          }
        }
      }

      // Remap team pairings through the id-map
      if (tpl.team_config && Array.isArray(tpl.team_config)) {
        const remapped: [number, number][] = [];
        for (const pair of tpl.team_config) {
          if (!Array.isArray(pair) || pair.length < 2) continue;
          const n1 = idMap.get(Number(pair[0]));
          const n2 = idMap.get(Number(pair[1]));
          if (n1 !== undefined && n2 !== undefined) remapped.push([n1, n2]);
        }
        if (remapped.length > 0) await updateTeamConfig(id, remapped);
      }
    }

    if (tpl.hall_config) {
      await updateHallConfig(id, tpl.hall_config as any);
    }

    navigate(`/tournaments/${id}/edit`);
  };

  const handleImportTemplate = async () => {
    if (isTauri()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const { readTextFile } = await import("@tauri-apps/plugin-fs");
        const path = await open({
          filters: [{ name: "JSON-Vorlage (*.json)", extensions: ["json"] }],
          multiple: false,
        });
        if (!path) return;
        const text = await readTextFile(path as string);
        const tpl = JSON.parse(text);
        await applyTemplate(tpl);
        return;
      } catch (err) {
        console.error("Tauri import failed:", err);
        showError(`${t.tournaments_import_error}\n\n${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }
    importFileRef.current?.click();
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const text = await file.text();
      const tpl = JSON.parse(text);
      await applyTemplate(tpl);
    } catch (err) {
      console.error("Import failed:", err);
      alert(`${t.tournaments_import_error}\n\n${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const load = async () => {
    const [ts, ss] = await Promise.all([getTournaments(), getSessions()]);
    setTournaments(ts);
    setSessionsById(new Map(ss.map((s) => [s.id, s])));
  };

  useEffect(() => {
    load();
  }, []);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteTournament(deleteTarget.id);
    setDeleteTarget(null);
    load();
  };

  const handleArchive = async (id: number) => {
    await updateTournamentStatus(id, "archived");
    load();
  };

  const handleUnarchive = async (id: number) => {
    await updateTournamentStatus(id, "completed");
    load();
  };

  const activeTournaments = tournaments.filter(
    (tr) => tr.status !== "archived"
  );
  const archivedTournaments = tournaments.filter(
    (tr) => tr.status === "archived"
  );

  const statusStyle = (status: string) => {
    switch (status) {
      case "active":
        return `${theme.activeBadgeBg} ${theme.activeBadgeText}`;
      case "completed":
        return `${theme.cardBg} ${theme.textMuted} border ${theme.cardBorder}`;
      case "archived":
        return "bg-violet-100 text-violet-600";
      default:
        return "bg-amber-100 text-amber-700";
    }
  };

  const renderTournamentCard = (tr: Tournament, isArchived: boolean) => (
    <div
      key={tr.id}
      className={`${theme.cardBg} rounded-2xl shadow-sm border ${theme.cardBorder} p-5 flex justify-between items-center hover:shadow-md transition-all duration-200 ${
        isArchived ? "opacity-70 hover:opacity-100" : theme.cardHoverBorder
      }`}
    >
      <Link to={`/tournaments/${tr.id}`} className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-semibold ${theme.textPrimary}`}>{tr.name}</span>
          {/* Session pill: visible when tournament is bound to a workspace.
              Bare span (not a Link) — the card itself is wrapped in a Link
              and nesting <a> inside <a> is invalid HTML. Click on the pill
              still navigates because the parent Link picks it up. */}
          {tr.session_id != null && sessionsById.has(tr.session_id) && (
            <span
              className="text-[10px] font-bold uppercase tracking-wide bg-violet-100 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full"
              title={sessionsById.get(tr.session_id)!.name}
            >
              🔗 {sessionsById.get(tr.session_id)!.name}
            </span>
          )}
        </div>
        <div className={`text-sm ${theme.textSecondary} mt-0.5`}>
          {{ singles: t.mode_singles, doubles: t.mode_doubles, mixed: t.mode_mixed }[tr.mode]} &middot; {{ round_robin: t.format_round_robin, elimination: t.format_elimination, random_doubles: t.format_random_doubles, group_ko: t.format_group_ko, swiss: t.format_swiss, double_elimination: t.format_double_elimination, monrad: t.format_monrad, king_of_court: t.format_king_of_court, waterfall: t.format_waterfall }[tr.format]} &middot;{" "}
          {t[`scoring_mode_${getScoringModeId(tr.points_per_set, tr.cap)}` as keyof typeof t] as string}
        </div>
      </Link>
      <div className="flex items-center gap-3">
        <span
          className={`text-xs font-medium px-3 py-1 rounded-full ${statusStyle(tr.status)}`}
        >
          {{ draft: t.status_draft, active: t.status_active, completed: t.status_completed, archived: t.status_archived }[tr.status]}
        </span>
        {tr.status === "completed" && (
          <button
            onClick={() => handleArchive(tr.id)}
            className="text-gray-400 hover:text-violet-600 text-sm transition-colors"
            title={t.tournaments_archive_button}
          >
            📦 {t.tournaments_archive_button}
          </button>
        )}
        {tr.status === "archived" && (
          <button
            onClick={() => handleUnarchive(tr.id)}
            className="text-gray-400 hover:text-emerald-600 text-sm transition-colors"
            title={t.tournaments_unarchive}
          >
            ↩ {t.tournaments_unarchive}
          </button>
        )}
        <button
          onClick={() => setDeleteTarget(tr)}
          className="text-gray-400 hover:text-rose-600 text-sm transition-colors"
          title={t.tournaments_delete_title}
        >
          🗑
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className={`text-2xl font-extrabold ${theme.textPrimary} tracking-tight`}>
            {t.tournaments_title}
          </h1>
          <p className={`text-sm ${theme.textSecondary} mt-0.5`}>
            {t.tournaments_active_count.replace("{count}", String(activeTournaments.length))}
            {archivedTournaments.length > 0 && (
              <span> &middot; {t.tournaments_archived_count.replace("{count}", String(archivedTournaments.length))}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {archivedTournaments.length > 0 && (
            <button
              onClick={() => setShowArchive(!showArchive)}
              className={`border px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                showArchive
                  ? "bg-violet-50 border-violet-200 text-violet-700"
                  : `${theme.cardBg} ${theme.cardBorder} ${theme.textSecondary} hover:border-violet-200`
              }`}
            >
              📦 {t.tournaments_archive} ({archivedTournaments.length})
            </button>
          )}
          <input
            ref={importFileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportFileChange}
          />
          <button
            onClick={handleImportTemplate}
            className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-4 py-2.5 rounded-xl ${theme.cardHoverBorder} hover:shadow-sm transition-all text-sm font-medium`}
          >
            📋 {t.tournaments_import}
          </button>
          <button
            onClick={handleNewTournament}
            disabled={creating}
            className={`${theme.primaryBg} text-white px-5 py-2.5 rounded-xl ${theme.primaryHoverBg} shadow-sm hover:shadow-md transition-all text-sm font-medium disabled:opacity-50`}
          >
            🏆 {t.tournaments_new}
          </button>
        </div>
      </div>

      {/* Active Tournaments */}
      {activeTournaments.length === 0 && !showArchive ? (
        <div className={`${theme.cardBg} rounded-2xl shadow-sm border ${theme.cardBorder} p-12 text-center`}>
          <div className="text-4xl mb-3">🏸</div>
          <div className="text-gray-400">{t.tournaments_none_yet}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {activeTournaments.map((tr) => renderTournamentCard(tr, false))}
        </div>
      )}

      {/* Archive Section */}
      {showArchive && archivedTournaments.length > 0 && (
        <div className="mt-8">
          <h2 className={`text-lg font-bold ${theme.textPrimary} mb-3 flex items-center gap-2`}>
            📦 {t.tournaments_archive}
          </h2>
          <div className="space-y-3">
            {archivedTournaments.map((tr) => renderTournamentCard(tr, true))}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`${theme.cardBg} rounded-2xl shadow-2xl w-full max-w-sm p-6 border ${theme.cardBorder} text-center`}>
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className={`text-lg font-bold ${theme.textPrimary} mb-2`}>
              {t.tournaments_delete_title}
            </h3>
            <p className={`text-sm ${theme.textSecondary} mb-5`}>
              <span className={`font-semibold ${theme.textPrimary}`}>"{deleteTarget.name}"</span>{" "}
              {t.tournaments_delete_message.replace(`"{name}"`, "").trim()}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className={`flex-1 ${theme.cardBg} border ${theme.inputBorder} ${theme.textSecondary} px-4 py-2.5 rounded-xl hover:opacity-80 transition-all text-sm font-medium`}
              >
                {t.common_cancel}
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 bg-rose-600 text-white px-4 py-2.5 rounded-xl hover:bg-rose-700 transition-all text-sm font-medium"
              >
                {t.common_delete_permanently}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

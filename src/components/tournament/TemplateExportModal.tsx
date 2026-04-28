import { useEffect, useState } from "react";
import type { ThemeColors } from "../../lib/theme";
import type { Tournament, Player, Sportstaette, HallConfig } from "../../lib/types";
import { playerDisplayName, parseHallConfig, hallConfigTotalCourts } from "../../lib/types";
import { useT } from "../../lib/I18nContext";
import { isTauri, getSportstaetten } from "../../lib/db";

// What we serialize into the template's `venue` block.
interface ExportedVenue {
  name: string;
  address: string | null;
  zip: string | null;
  city: string | null;
  halls: HallConfig[];
}

interface TemplateExportModalProps {
  tournament: Tournament;
  players: Player[];
  theme: ThemeColors;
  onClose: () => void;
}

export default function TemplateExportModal({
  tournament,
  players,
  theme,
  onClose,
}: TemplateExportModalProps) {
  const { t } = useT();
  const [templateInclude, setTemplateInclude] = useState({ settings: true, players: true, teams: true });

  // Resolve the venue block once on mount so the modal can both preview
  // the venue name and embed it on save without an extra roundtrip.
  // Resolution order:
  //   1. Tournament's bound venue (post-v2.8.2 default — every tournament
  //      has one)
  //   2. Synthesized fallback from tournament.hall_config + tournament.name
  //      so legacy or detached tournaments still produce a usable venue
  //      block. v2.8.8 makes the venue export unconditional — every v3
  //      template carries one.
  const [exportVenue, setExportVenue] = useState<ExportedVenue | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let resolved: ExportedVenue | null = null;
        if (tournament.venue_id != null) {
          const venues: Sportstaette[] = await getSportstaetten();
          const v = venues.find((vv) => vv.id === tournament.venue_id);
          if (v) {
            resolved = {
              name: v.name,
              address: v.address,
              zip: v.zip,
              city: v.city,
              halls: v.halls ? parseHallConfig(v.halls) : [],
            };
          }
        }
        if (!resolved && tournament.hall_config) {
          // Fallback synthesis from local hall_config — name derived from
          // the tournament so a re-import on a fresh DB produces a sensibly
          // labeled venue even without the venue_id link.
          const halls = parseHallConfig(tournament.hall_config);
          if (halls.length > 0) {
            resolved = {
              name: `${tournament.name} - Sportstaette`,
              address: null,
              zip: null,
              city: null,
              halls,
            };
          }
        }
        if (!cancelled) setExportVenue(resolved);
      } catch (err) {
        console.error("TemplateExportModal: failed to resolve venue:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [tournament.venue_id, tournament.hall_config, tournament.name]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className={`${theme.cardBg} rounded-2xl shadow-2xl w-full max-w-md p-6 border ${theme.cardBorder}`}>
        <h3 className={`text-lg font-bold ${theme.textPrimary} mb-4`}>📋 {t.template_export_title}</h3>
        <p className={`text-sm ${theme.textSecondary} mb-4`}>{t.template_export_description}</p>
        <div className="space-y-3 mb-5">
          <label className={`flex items-center gap-3 p-3 rounded-xl border ${theme.cardBorder} ${templateInclude.settings ? theme.selectedBg : ''} cursor-pointer`}>
            <input type="checkbox" checked={templateInclude.settings} onChange={(e) => setTemplateInclude((p) => ({ ...p, settings: e.target.checked }))} className="rounded accent-emerald-600" />
            <div>
              <div className={`text-sm font-medium ${theme.textPrimary}`}>⚙️ {t.template_settings}</div>
              <div className={`text-xs ${theme.textMuted}`}>{t.template_settings_desc}</div>
            </div>
          </label>
          <label className={`flex items-center gap-3 p-3 rounded-xl border ${theme.cardBorder} ${templateInclude.players ? theme.selectedBg : ''} cursor-pointer`}>
            <input type="checkbox" checked={templateInclude.players} onChange={(e) => setTemplateInclude((p) => ({ ...p, players: e.target.checked, teams: e.target.checked ? p.teams : false }))} className="rounded accent-emerald-600" />
            <div>
              <div className={`text-sm font-medium ${theme.textPrimary}`}>👥 {t.template_players.replace("{count}", String(players.length))}</div>
              <div className={`text-xs ${theme.textMuted}`}>{t.template_players_desc}</div>
            </div>
          </label>
          {tournament.team_config && (
            <label className={`flex items-center gap-3 p-3 rounded-xl border ${theme.cardBorder} ${templateInclude.teams ? theme.selectedBg : ''} cursor-pointer ${!templateInclude.players ? 'opacity-40 pointer-events-none' : ''}`}>
              <input type="checkbox" checked={templateInclude.teams} disabled={!templateInclude.players} onChange={(e) => setTemplateInclude((p) => ({ ...p, teams: e.target.checked }))} className="rounded accent-emerald-600" />
              <div>
                <div className={`text-sm font-medium ${theme.textPrimary}`}>🤝 {t.template_teams}</div>
                <div className={`text-xs ${theme.textMuted}`}>{t.template_teams_desc}</div>
              </div>
            </label>
          )}
        </div>

        {/* Venue preview — surfaces what venue gets baked into the
            template so the user knows what the importer will see on the
            other side. Always rendered when settings are exported (v2.8.8
            guarantees a venue block). */}
        {templateInclude.settings && exportVenue && (
          <div className={`mb-5 px-3 py-2 rounded-xl border border-violet-200 bg-violet-50`}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-violet-700 mb-0.5">
              🏟 {t.template_export_venue_label}
            </div>
            <div className="text-sm font-medium text-violet-900 truncate">
              {exportVenue.name}
            </div>
            <div className="text-xs text-violet-700/80">
              {exportVenue.halls.length} {exportVenue.halls.length === 1 ? t.venues_hall_singular : t.venues_hall_plural}
              {" · "}
              {hallConfigTotalCourts(exportVenue.halls)} {t.common_fields}
              {exportVenue.city ? ` · ${exportVenue.city}` : ""}
            </div>
          </div>
        )}
        {templateInclude.settings && !exportVenue && (
          <div className={`mb-5 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800`}>
            ⚠ {t.template_export_venue_missing}
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className={`flex-1 ${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-4 py-2.5 rounded-xl hover:opacity-80 transition-all text-sm font-medium`}
          >
            {t.common_cancel}
          </button>
          <button
            onClick={async () => {
              // v3 template format adds a `venue` block so the importer can
              // reconstruct (or pick up) the venue without the user having
              // to set it up by hand. v2 readers ignore unknown fields, so
              // forward-compat is fine — the file still parses for them.
              const template: Record<string, unknown> = { version: 3 };
              if (templateInclude.settings) {
                template.name = tournament.name;
                template.mode = tournament.mode;
                template.format = tournament.format;
                template.sets_to_win = tournament.sets_to_win;
                template.points_per_set = tournament.points_per_set;
                template.cap = tournament.cap;
                template.courts = tournament.courts;
                template.num_groups = tournament.num_groups;
                template.qualify_per_group = tournament.qualify_per_group;
                template.entry_fee_single = tournament.entry_fee_single;
                template.entry_fee_double = tournament.entry_fee_double;
                template.min_rest_minutes = tournament.min_rest_minutes;
                template.enable_third_place = tournament.enable_third_place;
                if (tournament.hall_config) {
                  // Kept for v2-reader backward compat; the v3 importer
                  // prefers `venue.halls` when both are present.
                  try { template.hall_config = JSON.parse(tournament.hall_config); } catch (err) { console.error("TemplateExport: failed to parse hall_config JSON:", err); }
                }
                // Venue block — v2.8.8: unconditional. Either resolved from
                // the tournament's bound venue or synthesized from the
                // local hall_config in the useEffect above. The importer
                // matches by name case-insensitively, so a re-import onto
                // the same DB picks up the existing venue cleanly.
                if (exportVenue) {
                  template.venue = {
                    name: exportVenue.name,
                    address: exportVenue.address,
                    zip: exportVenue.zip,
                    city: exportVenue.city,
                    halls: exportVenue.halls,
                  };
                  // Also mirror halls into hall_config in case venue.halls
                  // is empty in some legacy edge case.
                  if (!template.hall_config && exportVenue.halls.length > 0) {
                    template.hall_config = exportVenue.halls;
                  }
                }
              }
              if (templateInclude.players) {
                template.players = players.map((p) => ({
                  id: p.id,
                  first_name: p.first_name,
                  last_name: p.last_name,
                  name: playerDisplayName(p), // legacy fallback field for v1 readers
                  gender: p.gender,
                  birth_date: p.birth_date,
                  club: p.club,
                }));
              }
              if (templateInclude.teams && tournament.team_config) {
                try { template.team_config = JSON.parse(tournament.team_config); } catch (err) { console.error("TemplateExport: failed to parse team_config JSON:", err); }
              }
              const json = JSON.stringify(template, null, 2);
              const fileName = `${(tournament.name || "vorlage").replace(/[^a-zA-Z0-9äöüÄÖÜß\-_ .]/g, "")}.json`;

              if (isTauri()) {
                try {
                  const { save } = await import("@tauri-apps/plugin-dialog");
                  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
                  const path = await save({
                    defaultPath: fileName,
                    filters: [{ name: "JSON-Vorlage (*.json)", extensions: ["json"] }],
                  });
                  if (path) {
                    await writeTextFile(path, json);
                  }
                  onClose();
                  return;
                } catch (err) {
                  console.error("Tauri save failed, falling back to browser download", err);
                }
              }

              // Browser fallback
              const blob = new Blob([json], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = fileName;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              onClose();
            }}
            className={`flex-1 ${theme.primaryBg} text-white px-4 py-2.5 rounded-xl ${theme.primaryHoverBg} shadow-sm transition-all text-sm font-medium`}
          >
            📥 {t.template_export_button}
          </button>
        </div>
      </div>
    </div>
  );
}

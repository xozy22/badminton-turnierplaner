// src/pages/TournamentView/components/modals/EditTournamentModal.tsx
//
// Quick-edit form for a draft tournament — name, mode, format, scoring,
// courts, group/swiss settings, entry fees. Saves via onSave callback;
// the parent (TournamentView) wires that to updateTournament + reload.
//
// Only used while the tournament is in draft state — once started, the
// settings are locked.

import { useEffect, useState } from "react";
import Icon from "../../../../components/ui/Icon";
import {
  SCORING_MODES,
  getScoringModeId,
  type ScoringModeId,
} from "../../../../lib/scoring";
import type {
  Tournament,
  TournamentMode,
  TournamentFormat,
} from "../../../../lib/types";
import type { ThemeColors } from "../../../../lib/theme";
import { useT } from "../../../../lib/I18nContext";

const VALID_FORMATS: Record<TournamentMode, TournamentFormat[]> = {
  singles: ["round_robin", "elimination", "group_ko", "swiss", "monrad", "king_of_court", "waterfall", "double_elimination"],
  doubles: ["round_robin", "elimination", "random_doubles", "group_ko", "swiss", "monrad", "king_of_court", "waterfall", "double_elimination"],
  mixed:   ["round_robin", "elimination", "random_doubles", "group_ko", "swiss", "monrad", "king_of_court", "waterfall", "double_elimination"],
};

export default function EditTournamentModal({
  tournament,
  theme,
  onClose,
  onSave,
}: {
  tournament: Tournament;
  theme: ThemeColors;
  onClose: () => void;
  onSave: (data: {
    name: string;
    mode: TournamentMode;
    format: TournamentFormat;
    setsToWin: number;
    pointsPerSet: number;
    cap: number | null;
    courts: number;
    numGroups: number;
    qualifyPerGroup: number;
    entryFeeSingle: number;
    entryFeeDouble: number;
  }) => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(tournament.name);
  const [mode, setMode] = useState<TournamentMode>(tournament.mode);
  const [format, setFormat] = useState<TournamentFormat>(tournament.format);
  const [scoringMode, setScoringMode] = useState<ScoringModeId>(
    getScoringModeId(tournament.points_per_set, tournament.cap),
  );
  const scoringPreset = SCORING_MODES.find((m) => m.id === scoringMode)!;
  const pointsPerSet = scoringPreset.points_per_set;
  const cap = scoringPreset.cap;
  const [setsToWin, setSetsToWin] = useState<number>(tournament.sets_to_win);
  const [courts, setCourts] = useState(tournament.courts);
  const [numGroups, setNumGroups] = useState(tournament.num_groups || 2);
  const [qualifyPerGroup, setQualifyPerGroup] = useState(tournament.qualify_per_group || 2);
  const [entryFeeSingle, setEntryFeeSingle] = useState(String(tournament.entry_fee_single || 0));
  const [entryFeeDouble, setEntryFeeDouble] = useState(String(tournament.entry_fee_double || 0));

  useEffect(() => {
    if (!VALID_FORMATS[mode].includes(format)) {
      setFormat(VALID_FORMATS[mode][0]);
    }
  }, [mode, format]);

  const inputClass = `w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-md px-4 py-2.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`;
  const labelClass = `block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className={`${theme.cardBg} rounded-lg shadow-lg w-full max-w-lg p-6 border ${theme.cardBorder}`}>
        <div className="flex justify-between items-center mb-5">
          <h3 className={`text-lg font-bold ${theme.textPrimary}`}>
            <Icon name="pencil" /> {t.edit_tournament_title}
          </h3>
          <button
            onClick={onClose} aria-label={t.common_close}
            className={`${theme.textMuted} text-xl leading-none w-8 h-8 flex items-center justify-center rounded-sm transition-colors`}
          >
            <Icon name="x" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>{t.tournament_name}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t.tournament_mode}</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as TournamentMode)} className={inputClass}>
                {Object.entries({ singles: t.mode_singles, doubles: t.mode_doubles, mixed: t.mode_mixed }).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{t.tournament_format}</label>
              <select value={format} onChange={(e) => setFormat(e.target.value as TournamentFormat)} className={inputClass}>
                {VALID_FORMATS[mode].map((f) => {
                  const fmtLabels: Record<string, string> = { round_robin: t.format_round_robin, elimination: t.format_elimination, random_doubles: t.format_random_doubles, group_ko: t.format_group_ko, swiss: t.format_swiss, double_elimination: t.format_double_elimination, monrad: t.format_monrad, king_of_court: t.format_king_of_court, waterfall: t.format_waterfall };
                  return <option key={f} value={f}>{fmtLabels[f]}</option>;
                })}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t.scoring_mode}</label>
              <select value={scoringMode} onChange={(e) => setScoringMode(e.target.value as ScoringModeId)} className={inputClass}>
                {SCORING_MODES.map((m) => (
                  <option key={m.id} value={m.id}>{t[`scoring_mode_${m.id}` as keyof typeof t] as string}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{t.scoring_sets_to_win}</label>
              <select value={setsToWin} onChange={(e) => setSetsToWin(Number(e.target.value))} className={inputClass}>
                <option value={1}>{t.best_of_1}</option>
                <option value={2}>{t.best_of_3}</option>
                <option value={3}>{t.best_of_5}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t.edit_tournament_courts_label}</label>
              <select value={courts} onChange={(e) => setCourts(Number(e.target.value))} className={inputClass}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>{n} {n === 1 ? t.common_field : t.common_fields}</option>
                ))}
              </select>
            </div>
          </div>

          {format === "group_ko" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{t.edit_tournament_groups_count}</label>
                <select value={numGroups} onChange={(e) => setNumGroups(Number(e.target.value))} className={inputClass}>
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>{t.groups_count.replace("{count}", String(n))}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>{t.tournament_ko_size}</label>
                <select value={qualifyPerGroup} onChange={(e) => setQualifyPerGroup(Number(e.target.value))} className={inputClass}>
                  {[4, 8, 16, 32].map((n) => (
                    <option key={n} value={n}>{t.tournament_qualify_ko_count.replace("{count}", String(n))}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {(format === "swiss" || format === "monrad" || format === "waterfall") && (
            <div>
              <label className={labelClass}>{t.tournament_swiss_rounds}</label>
              <select value={numGroups} onChange={(e) => setNumGroups(Number(e.target.value))} className={inputClass}>
                {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n} {t.tournament_view_tab_matches.toLowerCase()}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t.edit_tournament_fee_single}</label>
              <input type="number" value={entryFeeSingle} onChange={(e) => setEntryFeeSingle(e.target.value)} className={inputClass} min={0} step="0.5" />
            </div>
            <div>
              <label className={labelClass}>{t.edit_tournament_fee_double}</label>
              <input type="number" value={entryFeeDouble} onChange={(e) => setEntryFeeDouble(e.target.value)} className={inputClass} min={0} step="0.5" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className={`flex-1 ${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-4 py-2.5 rounded-md hover:opacity-80 transition-all text-sm font-medium`}
          >
            {t.common_cancel}
          </button>
          <button
            onClick={() => onSave({ name, mode, format, setsToWin, pointsPerSet, cap, courts, numGroups, qualifyPerGroup, entryFeeSingle: Number(entryFeeSingle) || 0, entryFeeDouble: Number(entryFeeDouble) || 0 })}
            className={`flex-1 ${theme.primaryBg} text-white px-4 py-2.5 rounded-md ${theme.primaryHoverBg} shadow-sm transition-all text-sm font-medium`}
          >
            {t.common_save}
          </button>
        </div>
      </div>
    </div>
  );
}

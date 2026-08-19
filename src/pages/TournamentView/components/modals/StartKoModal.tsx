// src/pages/TournamentView/components/modals/StartKoModal.tsx
//
// Modal that opens when the user clicks "🏆 KO starten" — lets the TD
// optionally override the scoring (points per set, sets to win) for the
// KO phase, separate from what the group phase used. Returns the chosen
// values via onConfirm; the parent (TournamentView) persists them via
// updateTournamentKoScoring + then runs startKoPhase.

import { useState } from "react";
import {
  SCORING_MODES,
  getScoringModeId,
  type ScoringModeId,
} from "../../../../lib/scoring";
import type { Tournament } from "../../../../lib/types";
import type { ThemeColors } from "../../../../lib/theme";
import { useT } from "../../../../lib/I18nContext";
import Modal, { ModalCancelButton, ModalConfirmButton } from "../../../../components/ui/Modal";

export default function StartKoModal({
  tournament,
  theme,
  onClose,
  onConfirm,
}: {
  tournament: Tournament;
  theme: ThemeColors;
  onClose: () => void;
  onConfirm: (koPointsPerSet: number | null, koSetsToWin: number | null, koCap: number | null) => void;
}) {
  const { t } = useT();
  const [useDifferent, setUseDifferent] = useState(false);
  const [scoringMode, setScoringMode] = useState<ScoringModeId>(
    getScoringModeId(tournament.points_per_set, tournament.cap),
  );
  const [setsToWin, setSetsToWin] = useState<number>(tournament.sets_to_win);
  const scoringPreset = SCORING_MODES.find((m) => m.id === scoringMode)!;

  const inputClass = `w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-md px-4 py-2.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`;
  const labelClass = `block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`;

  const groupScoringLabel = `${t[`scoring_mode_${getScoringModeId(tournament.points_per_set, tournament.cap)}` as keyof typeof t] as string} · ${tournament.sets_to_win === 1 ? t.best_of_1 : tournament.sets_to_win === 2 ? t.best_of_3 : t.best_of_5}`;

  return (
    <Modal
      open
      onClose={onClose}
      icon="trophy"
      title={t.ko_modal_title}
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalConfirmButton
            onClick={() =>
              onConfirm(
                useDifferent ? scoringPreset.points_per_set : null,
                useDifferent ? setsToWin : null,
                useDifferent ? scoringPreset.cap : null,
              )
            }
            tone="phase"
          >
            {t.ko_modal_start_button}
          </ModalConfirmButton>
        </>
      }
    >
      <div>

        {/* Group phase scoring info */}
        <div className={`rounded-md p-3 mb-4 border ${theme.cardBorder} ${theme.cardBg} bg-opacity-50`}>
          <div className={`text-xs font-medium ${theme.textMuted} uppercase tracking-wide mb-1`}>
            {t.ko_modal_group_phase_scoring}
          </div>
          <div className={`text-sm font-medium ${theme.textPrimary}`}>
            {groupScoringLabel}
          </div>
        </div>

        {/* Toggle for different KO scoring */}
        <label className="flex items-center gap-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={useDifferent}
            onChange={(e) => setUseDifferent(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <span className={`text-sm ${theme.textSecondary}`}>{t.ko_modal_use_different}</span>
        </label>

        {/* KO scoring dropdowns */}
        {useDifferent && (
          <div className="space-y-4">
            <div className={`text-xs font-medium ${theme.textMuted} uppercase tracking-wide`}>
              {t.ko_modal_ko_scoring}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{t.scoring_mode}</label>
                <select
                  value={scoringMode}
                  onChange={(e) => setScoringMode(e.target.value as ScoringModeId)}
                  className={inputClass}
                >
                  {SCORING_MODES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {t[`scoring_mode_${m.id}` as keyof typeof t] as string}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>{t.scoring_sets_to_win}</label>
                <select
                  value={setsToWin}
                  onChange={(e) => setSetsToWin(Number(e.target.value))}
                  className={inputClass}
                >
                  <option value={1}>{t.best_of_1}</option>
                  <option value={2}>{t.best_of_3}</option>
                  <option value={3}>{t.best_of_5}</option>
                </select>
              </div>
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
}

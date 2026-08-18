import type { ThemeColors } from "../../lib/theme";
import type { Player } from "../../lib/types";
import { playerDisplayName } from "../../lib/types";
import { useT } from "../../lib/I18nContext";

interface RetirePlayerModalProps {
  retireTarget: { player: Player; partnerNote: string } | null;
  theme: ThemeColors;
  onClose: () => void;
  onConfirm: (playerId: number) => Promise<void>;
}

export default function RetirePlayerModal({
  retireTarget,
  theme,
  onClose,
  onConfirm,
}: RetirePlayerModalProps) {
  const { t } = useT();
  if (!retireTarget) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className={`${theme.cardBg} rounded-2xl shadow-2xl w-full max-w-md p-6 border ${theme.cardBorder}`}>
        <div className="text-center mb-5">
          <div className="text-4xl mb-3">🏥</div>
          <h3 className={`text-lg font-bold ${theme.textPrimary}`}>
            {t.retire_title}
          </h3>
          <p className={`text-sm ${theme.textSecondary} mt-2`}>
            <span className={`font-semibold ${theme.textPrimary}`}>{playerDisplayName(retireTarget.player)}</span>{" "}
            {t.retire_message.replace("{name}", "").trim()}
          </p>
          <p className={`text-xs ${theme.textMuted} mt-2`}>
            {t.retire_details}
          </p>
          {retireTarget.partnerNote && (
            <p className="text-xs text-warning-text mt-2 font-medium">
              ⚠️ {retireTarget.partnerNote}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className={`flex-1 ${theme.cardBg} border ${theme.inputBorder} ${theme.textSecondary} px-4 py-2.5 rounded-xl hover:opacity-80 transition-all text-sm font-medium`}
          >
            {t.common_cancel}
          </button>
          <button
            onClick={() => {
              onConfirm(retireTarget.player.id);
              onClose();
            }}
            className="flex-1 bg-danger text-white px-4 py-2.5 rounded-xl hover:bg-danger transition-all text-sm font-medium"
          >
            🏥 {t.retire_confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

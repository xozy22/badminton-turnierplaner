import type { ThemeColors } from "../../lib/theme";
import type { Player } from "../../lib/types";
import { playerDisplayName } from "../../lib/types";
import { useT } from "../../lib/I18nContext";
import { useAsyncAction } from "../../lib/useAsyncAction";

interface RemovePlayerModalProps {
  target: Player | null;
  theme: ThemeColors;
  onClose: () => void;
  onConfirm: (playerId: number) => void | Promise<void>;
}

/**
 * Confirm modal for removing a player from a tournament (draft status).
 * Used instead of a plain onClick to prevent accidental removals — styled
 * similarly to RetirePlayerModal for UI consistency.
 */
export default function RemovePlayerModal({
  target,
  theme,
  onClose,
  onConfirm,
}: RemovePlayerModalProps) {
  const { t } = useT();
  const [doConfirm, pending] = useAsyncAction(async (playerId: number) => {
    await onConfirm(playerId);
    onClose();
  });
  if (!target) return null;

  const displayName = playerDisplayName(target);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div
        className={`${theme.cardBg} rounded-2xl shadow-2xl w-full max-w-md p-6 border ${theme.cardBorder}`}
      >
        <div className="text-center mb-5">
          <div className="text-4xl mb-3">⚠️</div>
          <h3 className={`text-lg font-bold ${theme.textPrimary}`}>
            {t.management_remove_confirm_title}
          </h3>
          <p className={`text-sm ${theme.textSecondary} mt-2`}>
            {t.management_remove_confirm_message.replace("{name}", "").trim()}
            {" "}
            <span className={`font-semibold ${theme.textPrimary}`}>{displayName}</span>
          </p>
          <p className={`text-xs ${theme.textMuted} mt-2`}>
            {t.management_remove_confirm_hint}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={pending}
            className={`flex-1 ${theme.cardBg} border ${theme.inputBorder} ${theme.textSecondary} px-4 py-2.5 rounded-xl hover:opacity-80 transition-all text-sm font-medium disabled:opacity-50`}
          >
            {t.common_cancel}
          </button>
          <button
            onClick={() => doConfirm(target.id)}
            disabled={pending}
            className="flex-1 bg-danger text-white px-4 py-2.5 rounded-xl hover:bg-danger transition-all text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pending ? `⏳ ${t.common_loading}` : t.management_remove_confirm_action}
          </button>
        </div>
      </div>
    </div>
  );
}

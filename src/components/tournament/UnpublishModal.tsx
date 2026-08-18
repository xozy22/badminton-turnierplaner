import type { ThemeColors } from "../../lib/theme";
import { useT } from "../../lib/I18nContext";
import { useAsyncAction } from "../../lib/useAsyncAction";

interface UnpublishModalProps {
  open: boolean;
  tournamentName: string;
  theme: ThemeColors;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

/**
 * Confirm modal for stopping live publishing of a tournament. Sends a
 * delete-request to the configured WP endpoint so the public website
 * stops showing this tournament. Local data is untouched.
 *
 * Styled to match RemovePlayerModal / RetirePlayerModal so all destructive
 * tournament actions feel consistent.
 */
export default function UnpublishModal({
  open,
  tournamentName,
  theme,
  onClose,
  onConfirm,
}: UnpublishModalProps) {
  const { t } = useT();
  const [doConfirm, pending] = useAsyncAction(async () => {
    await onConfirm();
    onClose();
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div
        className={`${theme.cardBg} rounded-2xl shadow-2xl w-full max-w-md p-6 border ${theme.cardBorder}`}
      >
        <div className="text-center mb-5">
          <div className="text-4xl mb-3">📡</div>
          <h3 className={`text-lg font-bold ${theme.textPrimary}`}>
            {t.tournament_unpublish}
          </h3>
          <p className={`text-sm ${theme.textSecondary} mt-2`}>
            {t.tournament_unpublish_confirm}
          </p>
          {tournamentName && (
            <p className={`text-sm font-semibold ${theme.textPrimary} mt-2`}>
              {tournamentName}
            </p>
          )}
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
            onClick={() => doConfirm()}
            disabled={pending}
            className="flex-1 bg-danger text-white px-4 py-2.5 rounded-xl hover:bg-danger transition-all text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pending ? `⏳ ${t.common_loading}` : t.tournament_unpublish}
          </button>
        </div>
      </div>
    </div>
  );
}

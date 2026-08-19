import type { ThemeColors } from "../../lib/theme";
import Icon from "../../components/ui/Icon";
import type { Tournament } from "../../lib/types";
import { useT } from "../../lib/I18nContext";
import { useAsyncAction } from "../../lib/useAsyncAction";

interface DeleteTournamentModalProps {
  tournament: Tournament;
  theme: ThemeColors;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function DeleteTournamentModal({
  tournament,
  theme,
  onClose,
  onConfirm,
}: DeleteTournamentModalProps) {
  const { t } = useT();
  const [doConfirm, deleting] = useAsyncAction(onConfirm);
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className={`${theme.cardBg} rounded-lg shadow-lg w-full max-w-md p-6 border ${theme.cardBorder}`}>
        <div className="text-center mb-5">
          <div className="text-4xl mb-3"><Icon name="trash" /></div>
          <h3 className={`text-lg font-bold ${theme.textPrimary}`}>
            {t.delete_tournament_title}
          </h3>
          <p className={`text-sm ${theme.textSecondary} mt-2`}>
            <span className={`font-semibold ${theme.textPrimary}`}>{tournament.name}</span>{" "}
            {t.delete_tournament_message.replace("{name}", "").trim()}
          </p>
          <p className={`text-xs ${theme.textMuted} mt-2`}>
            {t.delete_tournament_details}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={deleting}
            className={`flex-1 ${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-4 py-2.5 rounded-md hover:opacity-80 transition-all text-sm font-medium disabled:opacity-50`}
          >
            {t.common_cancel}
          </button>
          <button
            onClick={doConfirm}
            disabled={deleting}
            className="flex-1 bg-danger text-white px-4 py-2.5 rounded-md hover:bg-danger shadow-sm transition-all text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {deleting ? (
            <>
              <Icon name="hourglass" /> {t.common_loading}
            </>
          ) : (
            t.common_delete_permanently
          )}
          </button>
        </div>
      </div>
    </div>
  );
}

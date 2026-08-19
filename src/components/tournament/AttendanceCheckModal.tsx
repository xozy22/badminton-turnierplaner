import { useState, useMemo } from "react";
import Icon from "../../components/ui/Icon";
import type { Player } from "../../lib/types";
import { playerDisplayName } from "../../lib/types";
import type { ThemeColors } from "../../lib/theme";
import { useT } from "../../lib/I18nContext";

interface AttendanceCheckModalProps {
  players: Player[];
  theme: ThemeColors;
  minPlayers?: number;
  onConfirm: (presentIds: Set<number>) => void;
  onClose: () => void;
}

export default function AttendanceCheckModal({
  players,
  theme,
  minPlayers = 2,
  onConfirm,
  onClose,
}: AttendanceCheckModalProps) {
  const { t } = useT();

  const [presentIds, setPresentIds] = useState<Set<number>>(
    () => new Set(players.map((p) => p.id))
  );
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) =>
      playerDisplayName(p).toLowerCase().includes(q)
    );
  }, [players, search]);

  const presentCount = presentIds.size;
  const canStart = presentCount >= minPlayers;

  const togglePlayer = (id: number) => {
    setPresentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const setAll = (present: boolean) => {
    if (present) {
      setPresentIds(new Set(players.map((p) => p.id)));
    } else {
      setPresentIds(new Set());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div
        className={`${theme.cardBg} rounded-lg shadow-lg w-full max-w-md max-h-[80vh] flex flex-col border ${theme.cardBorder} overflow-hidden`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b flex justify-between items-center">
          <div>
            <h2 className={`font-semibold text-lg ${theme.textPrimary}`}>
              <Icon name="check" /> {t.attendance_title}
            </h2>
            <p className={`text-xs mt-0.5 ${theme.textMuted}`}>
              {t.attendance_subtitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className={`${theme.textMuted} hover:opacity-80 text-xl leading-none`}
          >
            ×
          </button>
        </div>

        {/* Counter + quick buttons */}
        <div className={`px-5 py-3 border-b ${theme.cardBorder} ${theme.headerGradient} flex items-center justify-between gap-3`}>
          <span className={`text-sm font-medium ${canStart ? theme.activeBadgeText : "text-danger-text"}`}>
            {t.attendance_present_count
              .replace("{count}", String(presentCount))
              .replace("{total}", String(players.length))}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setAll(true)}
              className={`text-xs px-3 py-1 rounded-full border ${theme.cardBorder} ${theme.textSecondary} hover:opacity-80 transition-colors`}
            >
              {t.attendance_all_present}
            </button>
            <button
              onClick={() => setAll(false)}
              className={`text-xs px-3 py-1 rounded-full border ${theme.cardBorder} ${theme.textSecondary} hover:opacity-80 transition-colors`}
            >
              {t.attendance_none_present}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className={`px-5 py-2 border-b ${theme.cardBorder}`}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.common_search}
            className={`w-full border rounded-sm px-3 py-1.5 text-sm ${theme.inputBg} ${theme.inputBorder} ${theme.inputText} outline-none`}
            autoFocus
          />
        </div>

        {/* Player list */}
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className={`px-5 py-8 text-center text-sm ${theme.textMuted}`}>
              {t.common_search}…
            </div>
          ) : (
            <ul>
              {filtered.map((player) => {
                const present = presentIds.has(player.id);
                return (
                  <li
                    key={player.id}
                    onClick={() => togglePlayer(player.id)}
                    className={`flex items-center gap-3 px-5 py-3 cursor-pointer border-b ${theme.cardBorder} transition-colors hover:opacity-80 ${
                      present ? "" : `opacity-40`
                    }`}
                  >
                    {/* Checkbox */}
                    <span
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        present
                          ? `${theme.primaryBg} border-transparent`
                          : `${theme.inputBorder} border-current`
                      }`}
                    >
                      {present && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                          <path
                            d="M2 6l3 3 5-5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>

                    {/* Name + gender badge */}
                    <span className={`flex-1 text-sm font-medium ${theme.textPrimary}`}>
                      {playerDisplayName(player)}
                    </span>
                    <span
                      className={`text-2xs px-1.5 py-0.5 rounded-full font-semibold ${
                        player.gender === "m"
                          ? "bg-blue-500/20 text-info-text"
                          : "bg-pink-500/20 text-pink-600"
                      }`}
                    >
                      {player.gender === "m"
                        ? t.common_gender_male_short
                        : t.common_gender_female_short}
                    </span>
                    {player.club && (
                      <span className={`text-xs ${theme.textMuted}`}>
                        {player.club}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className={`px-5 py-3 border-t ${theme.cardBorder} ${theme.headerGradient} flex justify-between items-center`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 text-sm ${theme.textSecondary} hover:opacity-80`}
          >
            {t.common_cancel}
          </button>
          <div className="flex flex-col items-end gap-1">
            {!canStart && (
              <span className="text-xs text-danger-text">
                {t.attendance_min_players.replace("{count}", String(minPlayers))}
              </span>
            )}
            <button
              onClick={() => onConfirm(presentIds)}
              disabled={!canStart}
              className={`${theme.primaryBg} text-white px-5 py-2 rounded-md text-sm font-medium ${theme.primaryHoverBg} disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
            >
              <Icon name="play" /> {t.attendance_start}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import type { ThemeColors } from "../../lib/theme";
import Icon from "../../components/ui/Icon";
import type { Player } from "../../lib/types";
import { playerDisplayName } from "../../lib/types";
import { useT } from "../../lib/I18nContext";

interface SeedingStepProps {
  seedOrder: number[];
  selectedPlayerIds: Set<number>;
  seededPlayerIds: Set<number>;
  players: Player[];
  theme: ThemeColors;
  dragSeedIdx: number | null;
  dragOverIdx: number | null;
  onSeedDrop: (dropIdx: number) => void;
  onMoveSeed: (idx: number, direction: -1 | 1) => void;
  onToggleSeeded: (playerId: number) => void;
  onDragStart: (idx: number, e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (idx: number, e: React.DragEvent) => void;
  onDragLeave: (idx: number) => void;
}

export default function SeedingStep({
  seedOrder,
  selectedPlayerIds,
  seededPlayerIds,
  players,
  theme,
  dragSeedIdx,
  dragOverIdx,
  onSeedDrop,
  onMoveSeed,
  onToggleSeeded,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
}: SeedingStepProps) {
  const { t } = useT();

  // Seeded players, in the order defined by seedOrder (skipping any deselected).
  const seededList = seedOrder.filter(
    (pid) => selectedPlayerIds.has(pid) && seededPlayerIds.has(pid)
  );

  // Unseeded = selected but not seeded. Order by seedOrder first (keeps stable
  // ordering for recently toggled players), then append any remaining selected
  // players that were never in seedOrder.
  const unseededFromSeedOrder = seedOrder.filter(
    (pid) => selectedPlayerIds.has(pid) && !seededPlayerIds.has(pid)
  );
  const seedOrderSet = new Set(seedOrder);
  const unseededExtra = Array.from(selectedPlayerIds).filter(
    (pid) => !seedOrderSet.has(pid)
  );
  const unseededList = [...unseededFromSeedOrder, ...unseededExtra];

  return (
    <div className={`${theme.cardBg} rounded-2xl shadow-sm border ${theme.cardBorder} p-5 space-y-5`}>
      <div>
        <h2 className={`font-semibold ${theme.textPrimary} mb-1`}>
          <Icon name="target" /> {t.seeding_title}
        </h2>
        <p className={`text-xs ${theme.textMuted}`}>
          {t.seeding_description}
        </p>
      </div>

      {/* Seeded section */}
      <div>
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${theme.textMuted} mb-2`}>
          {t.seeding_section_seeded} ({seededList.length})
        </h3>
        {seededList.length === 0 ? (
          <div className={`rounded-xl border border-dashed ${theme.cardBorder} px-4 py-6 text-center text-sm ${theme.textMuted}`}>
            {t.seeding_empty_hint}
          </div>
        ) : (
          <div className={`rounded-xl border ${theme.cardBorder} overflow-hidden`}>
            {seededList.map((pid, idx) => {
              const p = players.find((pl) => pl.id === pid);
              if (!p) return null;
              const isDragging = dragSeedIdx === idx;
              const isOver = dragOverIdx === idx;
              return (
                <div
                  key={p.id}
                  draggable
                  onDragStart={(e) => onDragStart(idx, e)}
                  onDragEnd={onDragEnd}
                  onDragOver={(e) => onDragOver(idx, e)}
                  onDragLeave={() => onDragLeave(idx)}
                  onDrop={(e) => { e.preventDefault(); onSeedDrop(idx); }}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm cursor-grab active:cursor-grabbing select-none transition-all ${
                    idx > 0 ? "border-t border-line" : ""
                  } ${isDragging ? "opacity-40 bg-surface-sunken" : ""} ${
                    isOver && !isDragging ? "border-t-2 border-t-emerald-400" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked
                    onChange={() => onToggleSeeded(p.id)}
                    onClick={(e) => e.stopPropagation()}
                    draggable={false}
                    className="w-4 h-4 accent-emerald-600 cursor-pointer shrink-0"
                    title={t.seeding_is_seeded}
                  />
                  <span className="text-gray-300 text-xs cursor-grab" draggable={false}>⠿</span>
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    idx === 0
                      ? "bg-warning-subtle text-warning-text"
                      : idx === 1
                      ? "bg-line-strong text-secondary"
                      : idx === 2
                      ? "bg-orange-100 text-orange-700"
                      : "bg-surface-sunken text-muted"
                  }`}>
                    {idx + 1}
                  </span>
                  <span className={`font-medium ${theme.textPrimary} flex-1`}>
                    {playerDisplayName(p)}
                  </span>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      p.gender === "m"
                        ? "bg-info-subtle text-blue-500"
                        : "bg-pink-50 text-pink-500"
                    }`}
                  >
                    {p.gender === "m" ? t.common_gender_male_short : t.common_gender_female_short}
                  </span>
                  <div className="flex flex-col gap-0.5" draggable={false}>
                    <button
                      draggable={false}
                      onClick={() => onMoveSeed(idx, -1)}
                      disabled={idx === 0}
                      className="text-muted hover:text-emerald-600 disabled:opacity-20 disabled:cursor-default text-xs leading-none"
                      title={t.seeding_move_up}
                    >
                      <Icon name="chevronDown" className="rotate-180" />
                    </button>
                    <button
                      draggable={false}
                      onClick={() => onMoveSeed(idx, 1)}
                      disabled={idx === seededList.length - 1}
                      className="text-muted hover:text-emerald-600 disabled:opacity-20 disabled:cursor-default text-xs leading-none"
                      title={t.seeding_move_down}
                    >
                      <Icon name="chevronDown" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Unseeded section */}
      {unseededList.length > 0 && (
        <div>
          <h3 className={`text-xs font-semibold uppercase tracking-wide ${theme.textMuted} mb-1`}>
            {t.seeding_section_unseeded} ({unseededList.length})
          </h3>
          <p className={`text-[11px] ${theme.textMuted} mb-2`}>
            {t.seeding_unseeded_hint}
          </p>
          <div className={`rounded-xl border ${theme.cardBorder} overflow-hidden opacity-75`}>
            {unseededList.map((pid, idx) => {
              const p = players.find((pl) => pl.id === pid);
              if (!p) return null;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm select-none ${
                    idx > 0 ? "border-t border-line" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => onToggleSeeded(p.id)}
                    className="w-4 h-4 accent-emerald-600 cursor-pointer shrink-0"
                    title={t.seeding_is_seeded}
                  />
                  <span className={`font-medium ${theme.textMuted} flex-1`}>
                    {playerDisplayName(p)}
                  </span>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      p.gender === "m"
                        ? "bg-info-subtle text-blue-500"
                        : "bg-pink-50 text-pink-500"
                    }`}
                  >
                    {p.gender === "m" ? t.common_gender_male_short : t.common_gender_female_short}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

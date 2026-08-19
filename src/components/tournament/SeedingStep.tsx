import type { ThemeColors } from "../../lib/theme";
import Icon from "../../components/ui/Icon";
import type { Player } from "../../lib/types";
import { playerDisplayName } from "../../lib/types";
import { useT } from "../../lib/I18nContext";
import { seedGroups } from "../../lib/draw";

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

  // Seeding groups: 1, 2, 3/4, 5/8, 9/16. Positions inside a group are
  // drawn by lot, so the list shows the group rather than a rank the draw
  // does not honour (FEATURE-BACKLOG.md C1).
  const groupOfIndex = new Map<number, { label: string; groupIndex: number }>();
  for (const [gi, group] of seedGroups(seededList.length).entries()) {
    const first = group[0] + 1;
    const last = group[group.length - 1] + 1;
    const label = first === last ? String(first) : `${first}/${last}`;
    for (const i of group) groupOfIndex.set(i, { label, groupIndex: gi });
  }

  return (
    <div className={`${theme.cardBg} rounded-lg shadow-sm border ${theme.cardBorder} p-5 space-y-5`}>
      <div>
        <h2 className={`font-semibold ${theme.textPrimary} mb-1`}>
          <Icon name="target" /> {t.seeding_title}
        </h2>
        <p className={`text-xs ${theme.textMuted}`}>
          {t.seeding_description}
        </p>
        <p className={`mt-1 text-xs ${theme.textMuted}`}>{t.seeding_groups_hint}</p>
      </div>

      {/* Seeded section */}
      <div>
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${theme.textMuted} mb-2`}>
          {t.seeding_section_seeded} ({seededList.length})
        </h3>
        {seededList.length === 0 ? (
          <div className={`rounded-md border border-dashed ${theme.cardBorder} px-4 py-6 text-center text-sm ${theme.textMuted}`}>
            {t.seeding_empty_hint}
          </div>
        ) : (
          <div className={`rounded-md border ${theme.cardBorder} overflow-hidden`}>
            {seededList.map((pid, idx) => {
              const p = players.find((pl) => pl.id === pid);
              if (!p) return null;
              const seedGroup = groupOfIndex.get(idx) ?? { label: String(idx + 1), groupIndex: idx };
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
                  <span className="text-muted text-xs cursor-grab" draggable={false}>⠿</span>
                  <span
                    className={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-2 text-xs font-bold ${
                      seedGroup.groupIndex === 0
                        ? "bg-warning-subtle text-warning-text"
                        : seedGroup.groupIndex === 1
                          ? "bg-line-strong text-secondary"
                          : seedGroup.groupIndex === 2
                            ? "bg-warning-subtle text-warning-text"
                            : "bg-surface-sunken text-muted"
                    }`}
                    title={seedGroup.label.includes("/") ? t.seeding_group_drawn : undefined}
                  >
                    {seedGroup.label}
                  </span>
                  <span className={`font-medium ${theme.textPrimary} flex-1`}>
                    {playerDisplayName(p)}
                  </span>
                  <span
                    className={`text-2xs font-medium px-2 py-0.5 rounded-full ${
                      p.gender === "m"
                        ? "bg-info-subtle text-phase-text"
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
                      className="text-muted hover:text-success-text disabled:opacity-20 disabled:cursor-default text-xs leading-none"
                      title={t.seeding_move_up}
                    >
                      <Icon name="chevronDown" className="rotate-180" />
                    </button>
                    <button
                      draggable={false}
                      onClick={() => onMoveSeed(idx, 1)}
                      disabled={idx === seededList.length - 1}
                      className="text-muted hover:text-success-text disabled:opacity-20 disabled:cursor-default text-xs leading-none"
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
          <p className={`text-2xs ${theme.textMuted} mb-2`}>
            {t.seeding_unseeded_hint}
          </p>
          <div className={`rounded-md border ${theme.cardBorder} overflow-hidden opacity-75`}>
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
                    className={`text-2xs font-medium px-2 py-0.5 rounded-full ${
                      p.gender === "m"
                        ? "bg-info-subtle text-phase-text"
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

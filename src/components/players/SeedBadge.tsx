// src/components/players/SeedBadge.tsx
//
// Small "S{n}" badge rendered next to a player's name when they hold a
// Setzplatz (seed rank). Reads from the persisted tournament_players.seed_rank
// column (migration v10). Returns null when the player has no seed.

import { useT } from "../../lib/I18nContext";

interface Props {
  rank: number | null | undefined;
  className?: string;
}

export default function SeedBadge({ rank, className = "" }: Props) {
  const { t } = useT();
  if (!rank || rank <= 0) return null;
  const tooltip = t.seed_badge_tooltip.replace("{n}", String(rank));
  return (
    <span
      className={`inline-flex items-center ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-warning-subtle text-warning-text border border-warning ${className}`}
      title={tooltip}
      aria-label={tooltip}
    >
      {t.seed_badge_short.replace("{n}", String(rank))}
    </span>
  );
}

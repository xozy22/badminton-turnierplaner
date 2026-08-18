// src/components/players/RestIndicator.tsx
//
// Small ⏱ icon rendered next to a player's name while their rest period
// (tournament.min_rest_minutes) has not yet elapsed. Auto-refreshes every
// 60 seconds so the icon disappears without a page refresh.
//
// Zero-cost when min_rest_minutes <= 0 (no timer installed, early return).

import { useEffect, useState } from "react";
import Icon from "../../components/ui/Icon";
import { useT } from "../../lib/I18nContext";
import { getPlayerRestStatus } from "../../lib/restTime";
import type { Match } from "../../lib/types";

interface Props {
  playerId: number | null | undefined;
  matches: Match[];
  minRestMinutes: number;
  /**
   * Match currently being rendered — excluded from the rest-scan so a player
   * isn't flagged "resting" because of the same match they're shown in.
   */
  excludeMatchId?: number;
  className?: string;
}

export default function RestIndicator({
  playerId,
  matches,
  minRestMinutes,
  excludeMatchId,
  className,
}: Props) {
  const { t } = useT();
  const [now, setNow] = useState(() => Date.now());

  // Only install a timer when the feature is enabled — zero cost otherwise.
  useEffect(() => {
    if (minRestMinutes <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [minRestMinutes]);

  if (minRestMinutes <= 0) return null;
  if (playerId === null || playerId === undefined || playerId <= 0) return null;

  const status = getPlayerRestStatus(
    playerId,
    matches,
    minRestMinutes,
    now,
    excludeMatchId,
  );
  if (!status.isResting) return null;

  const tooltip = t.tournament_player_resting_tooltip.replace(
    "{minutes}",
    String(status.minutesLeft),
  );

  return (
    <span
      className={`inline-flex items-center text-warning-text text-xs ml-1 ${className ?? ""}`}
      title={tooltip}
      aria-label={tooltip}
    >
      <Icon name="clock" />
    </span>
  );
}

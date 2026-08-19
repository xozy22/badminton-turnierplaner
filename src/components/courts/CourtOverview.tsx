import { useMemo, useState } from "react";
import Icon from "../../components/ui/Icon";
import type { Match, HallConfig, Round, TournamentStatus } from "../../lib/types";
import { fill } from "../../lib/i18n/format";
import { getCourtHallLabel } from "../../lib/types";
import type { ConflictPlayer } from "../../lib/courtConflicts";
import { CourtTimer } from "./CourtTimer";
import CourtContextMenu from "./CourtContextMenu";
import { useTheme } from "../../lib/ThemeContext";
import { useT } from "../../lib/I18nContext";
import RestIndicator from "../players/RestIndicator";

interface Props {
  courts: number;
  matches: Match[];          // ALL matches across ALL rounds (for court assignments)
  activeRoundMatches?: Match[];  // Matches of the currently viewed round (for unassigned queue)
  futureRoundQueues?: { round: Round; matches: Match[] }[];  // Early-draw: next rounds in queue
  playerName: (id: number | null) => string;
  onDrop?: (matchId: number, court: number) => void;
  /**
   * Right-click → "Return match to queue". Fires with the match id of
   * the right-clicked occupied court. Host wires this to the same
   * handleCourtChange path that the MatchCard dropdown's empty option
   * uses (i.e. updateMatchCourt(id, null) → reload). v2.9.0.
   */
  onUnassign?: (matchId: number) => void;
  onMatchClick?: (matchId: number) => void;
  hallConfig?: HallConfig[];
  /** For the ⏱ rest indicator next to player names. */
  minRestMinutes?: number;
  tournamentStatus?: TournamentStatus;
  /**
   * Map of waiting-match-id → list of player conflicts. Cards in this map
   * are rendered as blocked (no drag, no double-click) and show a "player
   * busy" badge with a tooltip listing the conflicting players + courts.
   */
  conflictedMatches?: Map<number, ConflictPlayer[]>;
  /**
   * Map<groupNumber, remainingMatches>. When provided together with
   * `roundToGroup`, the unassigned queue is sorted descending by the
   * remaining match count of each match's group — the heuristic that
   * keeps groups in lockstep so they finish around the same time. When
   * either prop is missing, fallback to the existing default order
   * (round_number / id ascending).
   */
  remainingByGroup?: Map<number, number>;
  /** Map<roundId, groupNumber> — pairs with `remainingByGroup` above. */
  roundToGroup?: Map<number, number>;
}

export default function CourtOverview({ courts, matches, activeRoundMatches, futureRoundQueues, playerName, onDrop, onUnassign, onMatchClick, hallConfig, minRestMinutes = 0, tournamentStatus, conflictedMatches, remainingByGroup, roundToGroup }: Props) {
  const { theme } = useTheme();
  const { t } = useT();
  // Finde fuer jedes Feld das aktive (nicht abgeschlossene) Match - aus ALLEN Runden
  const courtAssignments = useMemo(() => {
    const map = new Map<number, Match>();
    for (const m of matches) {
      if (m.court && m.status !== "completed") {
        map.set(m.court, m);
      }
    }
    return map;
  }, [matches]);

  // Spiele ohne Feldzuweisung - nur aus der aktiven Runde (falls angegeben), sonst alle
  const sourceForUnassigned = activeRoundMatches ?? matches;
  const unassigned = useMemo(() => {
    const filtered = sourceForUnassigned.filter(
      (m) => !m.court && m.status !== "completed",
    );
    // Smart-queue: sort by remaining matches in this match's group (desc).
    // Falls back to original order when no group context is provided
    // (non-group_ko formats, KO phase, single-group setups). Used for the
    // flat-render fallback below when there's no group structure to apply.
    if (!remainingByGroup || !roundToGroup) return filtered;
    return [...filtered].sort((a, b) => {
      const ga = roundToGroup.get(a.round_id);
      const gb = roundToGroup.get(b.round_id);
      const ra = ga != null ? (remainingByGroup.get(ga) ?? 0) : 0;
      const rb = gb != null ? (remainingByGroup.get(gb) ?? 0) : 0;
      if (ra !== rb) return rb - ra;        // bigger backlog first
      return a.id - b.id;                   // stable by id
    });
  }, [sourceForUnassigned, remainingByGroup, roundToGroup]);

  // When group context is available (group_ko + active group phase), bucket
  // the unassigned matches by group_number and order the buckets by
  // "remaining matches in the group" descending — same smart-queue heuristic
  // as above, just visually segmented so a long mixed queue stays scannable.
  // Returns null when no group context exists; render falls back to flat.
  const unassignedGroups = useMemo(() => {
    if (!remainingByGroup || !roundToGroup) return null;
    const byGroup = new Map<number, Match[]>();
    for (const m of unassigned) {
      const g = roundToGroup.get(m.round_id);
      if (g == null) continue;             // skip non-group rounds defensively
      const arr = byGroup.get(g) ?? [];
      arr.push(m);
      byGroup.set(g, arr);
    }
    return Array.from(byGroup.entries())
      .map(([group, ms]) => ({
        group,
        matches: [...ms].sort((a, b) => a.id - b.id),
        remaining: remainingByGroup.get(group) ?? 0,
      }))
      // Largest backlog first (smart-queue), tiebreak by group number for stability.
      .sort((a, b) => (b.remaining - a.remaining) || (a.group - b.group));
  }, [unassigned, remainingByGroup, roundToGroup]);

  /** Plain-text team name, for aria-labels where JSX cannot go. */
  const teamLabel = (p1: number | null, p2: number | null): string => {
    if (p1 === null) return t.common_bye;
    return p2 ? `${playerName(p1)} / ${playerName(p2)}` : playerName(p1);
  };

  // JSX renderer with inline ⏱ RestIndicator next to each resting player.
  // Active/non-completed matches only — the indicator is for scheduling clarity.
  const showRestIcons = tournamentStatus === "active" && minRestMinutes > 0;
  const renderTeam = (p1: number | null, p2: number | null, m: Match) => {
    if (p1 === null) return <span className="italic opacity-70">{t.common_bye}</span>;
    const scheduled = m.status !== "completed";
    const wantIcons = showRestIcons && scheduled;
    return (
      <>
        <span>{playerName(p1)}</span>
        {wantIcons && (
          <RestIndicator
            playerId={p1}
            matches={matches}
            minRestMinutes={minRestMinutes}
            excludeMatchId={m.id}
          />
        )}
        {p2 != null && (
          <>
            <span className="mx-1 text-muted">/</span>
            <span>{playerName(p2)}</span>
            {wantIcons && (
              <RestIndicator
                playerId={p2}
                matches={matches}
                minRestMinutes={minRestMinutes}
                excludeMatchId={m.id}
              />
            )}
          </>
        )}
      </>
    );
  };

  const handleDragStart = (e: React.DragEvent, matchId: number) => {
    // Hard block: cards in conflictedMatches must not start a drag at all.
    if (conflictedMatches?.has(matchId)) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("matchId", String(matchId));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, court: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = courtAssignments.has(court) ? "none" : "move";
  };

  const handleDrop = (e: React.DragEvent, court: number) => {
    e.preventDefault();
    // Nur auf freie Felder droppen
    if (courtAssignments.has(court)) return;
    const matchId = Number(e.dataTransfer.getData("matchId"));
    if (matchId && onDrop) {
      onDrop(matchId, court);
    }
  };

  // Double-click to assign court via popup
  const [courtPickerMatchId, setCourtPickerMatchId] = useState<number | null>(null);
  // Right-click → context menu state. Cleared on action / outside-click /
  // Escape (the menu component handles those listeners itself; we just
  // own the position + match payload here). v2.9.0.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; match: Match } | null>(null);
  const freeCourts = useMemo(() => {
    const free: number[] = [];
    for (let i = 1; i <= courts; i++) {
      if (!courtAssignments.has(i)) free.push(i);
    }
    return free;
  }, [courts, courtAssignments]);

  const handleDoubleClick = (matchId: number) => {
    // Hard block: forward to onDrop with a placeholder court so the
    // TournamentView guard fires and opens the conflict modal. (We delegate
    // to onDrop instead of silently swallowing because the user expects
    // some feedback after a double-click — the modal explains why.)
    if (conflictedMatches?.has(matchId)) {
      if (onDrop) onDrop(matchId, freeCourts[0] ?? 1);
      return;
    }
    if (freeCourts.length === 1 && onDrop) {
      // Only one free court: assign directly
      onDrop(matchId, freeCourts[0]);
    } else if (freeCourts.length > 1) {
      setCourtPickerMatchId(matchId);
    }
  };

  const handlePickCourt = (court: number) => {
    if (courtPickerMatchId && onDrop) {
      onDrop(courtPickerMatchId, court);
    }
    setCourtPickerMatchId(null);
  };

  // SVG Badminton-Court als Hintergrund (dezent durchscheinend)
  // Querformat: Netz vertikal in der Mitte, Spielfeld horizontal
  const courtBgSvg = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 134" fill="none" opacity="0.18">
    <rect x="2" y="2" width="256" height="130" rx="2" stroke="#9CA3AF" stroke-width="1.5"/>
    <line x1="130" y1="2" x2="130" y2="132" stroke="#9CA3AF" stroke-width="2"/>
    <rect x="2" y="17" width="256" height="100" rx="1" stroke="#9CA3AF" stroke-width="1"/>
    <line x1="46" y1="17" x2="46" y2="117" stroke="#9CA3AF" stroke-width="1"/>
    <line x1="214" y1="17" x2="214" y2="117" stroke="#9CA3AF" stroke-width="1"/>
    <line x1="46" y1="67" x2="214" y2="67" stroke="#9CA3AF" stroke-width="1"/>
    <line x1="236" y1="2" x2="236" y2="132" stroke="#9CA3AF" stroke-width="1" stroke-dasharray="4 3"/>
    <line x1="24" y1="2" x2="24" y2="132" stroke="#9CA3AF" stroke-width="1" stroke-dasharray="4 3"/>
  </svg>`)}`;

  // Determine if we should render multi-hall sections
  const useMultiHall = hallConfig && hallConfig.length > 1;

  // Build hall sections for multi-hall rendering
  const hallSections = useMemo(() => {
    if (!hallConfig || hallConfig.length <= 1) return null;
    const sections: { name: string; globalStart: number; count: number }[] = [];
    let offset = 0;
    for (const hall of hallConfig) {
      sections.push({ name: hall.name, globalStart: offset + 1, count: hall.courts });
      offset += hall.courts;
    }
    return sections;
  }, [hallConfig]);

  // Get display label for a court number
  const getCourtLabel = (courtNum: number): string => {
    if (hallConfig && hallConfig.length > 1) {
      const { localCourt } = getCourtHallLabel(courtNum, hallConfig);
      return t.court_field.replace("{n}", String(localCourt));
    }
    return t.court_field.replace("{n}", String(courtNum));
  };

  // Render a single court card
  const renderCourt = (courtNum: number) => {
    const match = courtAssignments.get(courtNum);
    const isFree = !match;

    return (
      <div
        key={courtNum}
        onDragOver={(e) => handleDragOver(e, courtNum)}
        onDrop={(e) => handleDrop(e, courtNum)}
        onDoubleClick={() => match && onMatchClick?.(match.id)}
        // Right-click on an occupied court while the tournament is
        // active → custom context menu with the "Return to queue"
        // action. Free courts and non-active tournaments fall through
        // to the browser's default menu (no preventDefault). v2.9.0.
        onContextMenu={(e) => {
          if (!match) return;
          if (tournamentStatus !== "active") return;
          if (!onUnassign) return;
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, match });
        }}
        className={`rounded-lg border-2 border-dashed p-4 transition-all duration-200 min-h-[100px] relative overflow-hidden ${
          isFree
            ? `${theme.cardBorder} ${theme.cardBg} opacity-70 hover:opacity-100`
            : `${theme.courtBorder} ${theme.cardBg} shadow-sm cursor-pointer`
        }`}
        style={{
          backgroundImage: `url("${courtBgSvg}")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          backgroundSize: 'auto 85%',
          opacity: undefined,
        }}
        title={match ? t.court_double_click_jump : undefined}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-warning-text bg-warning-subtle px-2 py-0.5 rounded-sm">
            {getCourtLabel(courtNum)}
          </span>
          {match && (
            <CourtTimer assignedAt={match.court_assigned_at} />
          )}
        </div>

        {match ? (
          <div className="text-xs">
            <div className={`font-semibold ${theme.textPrimary} truncate`}>
              {renderTeam(match.team1_p1, match.team1_p2, match)}
            </div>
            <div className={`${theme.textMuted} text-2xs my-0.5`}>{t.common_vs}</div>
            <div className={`font-semibold ${theme.textPrimary} truncate`}>
              {renderTeam(match.team2_p1, match.team2_p2, match)}
            </div>
          </div>
        ) : (
          <div className={`text-xs ${theme.textMuted} text-center mt-3`}>
            {t.court_free_drag}
          </div>
        )}
      </div>
    );
  };

  // Group free courts by hall for the picker popup
  const freeCourtsByHall = useMemo(() => {
    if (!hallConfig || hallConfig.length <= 1) return null;
    const groups: { hallName: string; courts: number[] }[] = [];
    let offset = 0;
    for (const hall of hallConfig) {
      const hallCourts: number[] = [];
      for (let i = offset + 1; i <= offset + hall.courts; i++) {
        if (!courtAssignments.has(i)) hallCourts.push(i);
      }
      if (hallCourts.length > 0) {
        groups.push({ hallName: hall.name, courts: hallCourts });
      }
      offset += hall.courts;
    }
    return groups;
  }, [hallConfig, courtAssignments]);

  return (
    <div className="mb-5">
      {/* Court Grid */}
      {useMultiHall && hallSections ? (
        // Multi-hall: render sections per hall
        <div className="space-y-4">
          {hallSections.map((section) => (
            <div key={section.name}>
              <div className={`text-xs font-semibold ${theme.textSecondary} uppercase tracking-wide mb-2`}>
                {section.name}
              </div>
              <div className="grid gap-3"
                style={{ gridTemplateColumns: `repeat(${Math.min(section.count, 4)}, 1fr)` }}
              >
                {Array.from({ length: section.count }, (_, i) => section.globalStart + i).map(renderCourt)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Single hall or no config: flat grid
        <div className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${Math.min(courts, 4)}, 1fr)` }}
        >
          {Array.from({ length: courts }, (_, i) => i + 1).map(renderCourt)}
        </div>
      )}

      {/* Unassigned match card — shared renderer */}
      {(() => {
        const renderUnassignedCard = (m: Match) => {
          const conflicts = conflictedMatches?.get(m.id);
          const isBlocked = !!conflicts && conflicts.length > 0;
          // Tooltip: full list of conflicting players and their courts. Falls
          // back to the standard drag-or-doubleclick hint when not blocked.
          const blockedTitle = isBlocked
            ? conflicts!
                .map((c) =>
                  c.tournamentName
                    ? fill(t.session_player_busy_in_other, {
                        player: playerName(c.playerId),
                        tournament: c.tournamentName,
                        court: String(c.court),
                      })
                    : fill(t.player_conflict_row, {
                        player: playerName(c.playerId),
                        court: String(c.court),
                      }),
                )
                .join("\n")
            : t.court_drag_or_double_click;
          return (
            <div
              key={m.id}
              draggable={!isBlocked}
              onDragStart={(e) => handleDragStart(e, m.id)}
              onDoubleClick={() => handleDoubleClick(m.id)}
              className={`${theme.cardBg} border rounded-md px-3 py-2 text-xs select-none relative transition-all duration-200 ${
                isBlocked
                  ? "border-rose-400 ring-1 ring-rose-300 opacity-70 cursor-not-allowed"
                  : `${theme.cardBorder} cursor-grab active:cursor-grabbing hover:border-warning hover:shadow-sm`
              } ${courtPickerMatchId === m.id ? "z-40" : ""}`}
              title={blockedTitle}
            >
              {/* No per-card G{n} badge — the section header above the card
                  carries the group label. Cards stay slim and consistent
                  across grouped/flat render modes. */}
              <span className={`font-medium ${theme.textPrimary}`}>
                {renderTeam(m.team1_p1, m.team1_p2, m)}
              </span>
              <span className={`${theme.textMuted} mx-1`}>{t.common_vs}</span>
              <span className={`font-medium ${theme.textPrimary}`}>
                {renderTeam(m.team2_p1, m.team2_p2, m)}
              </span>
              {isBlocked && (
                <div className="mt-1 flex items-center gap-1 text-2xs font-medium text-danger-text">
                  <Icon name="ban" />
                  <span>{t.match_blocked_short}</span>
                </div>
              )}

              {/* The keyboard and touch path. HTML5 drag-and-drop does not
                  fire on a touchscreen at all, so without this the core
                  action of the app is unreachable on a hall tablet
                  (REVIEW-BACKLOG.md F6). */}
              {!isBlocked && freeCourts.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDoubleClick(m.id);
                  }}
                  aria-haspopup="menu"
                  aria-expanded={courtPickerMatchId === m.id}
                  aria-label={t.court_assign_to_match
                    .replace("{team1}", teamLabel(m.team1_p1, m.team1_p2))
                    .replace("{team2}", teamLabel(m.team2_p1, m.team2_p2))}
                  className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-sm border border-line-strong px-2 py-1 text-2xs font-medium text-secondary transition-all hover:border-accent hover:text-accent"
                >
                  <Icon name="plus" />
                  {t.court_assign}
                </button>
              )}

              {/* Court picker popup */}
              {courtPickerMatchId === m.id && (
                <div
                  role="menu"
                  aria-label={t.court_choose_court}
                  onKeyDown={(e) => {
                    if (e.key !== "Escape") return;
                    e.stopPropagation();
                    setCourtPickerMatchId(null);
                  }}
                  ref={(el) => {
                    // Move into the menu when it opens, so the next Tab
                    // walks the courts rather than the rest of the page.
                    el?.querySelector<HTMLButtonElement>("button")?.focus();
                  }}
                  className={`absolute top-full left-0 mt-1 ${theme.cardBg} border ${theme.cardBorder} rounded-md shadow-lg z-50 overflow-hidden`}
                >
                  <div className={`px-3 py-1.5 text-2xs font-bold ${theme.textMuted} uppercase tracking-wide border-b ${theme.cardBorder}`}>
                    {t.court_choose_court}
                  </div>
                  {freeCourtsByHall ? (
                    freeCourtsByHall.map((group) => (
                      <div key={group.hallName}>
                        <div className={`px-3 py-1 text-2xs font-semibold ${theme.textMuted} ${theme.cardBg}`}>
                          {group.hallName}
                        </div>
                        {group.courts.map((c) => {
                          const { localCourt } = getCourtHallLabel(c, hallConfig!);
                          return (
                            <button
                              key={c}
                              onClick={(e) => { e.stopPropagation(); handlePickCourt(c); }}
                              className={`w-full px-4 py-2 text-left text-xs font-medium ${theme.textPrimary} hover:${theme.selectedBg} hover:pl-5 transition-all duration-150`}
                            >
                              {t.court_field.replace("{n}", String(localCourt))}
                            </button>
                          );
                        })}
                      </div>
                    ))
                  ) : (
                    freeCourts.map((c) => (
                      <button
                        key={c}
                        onClick={(e) => { e.stopPropagation(); handlePickCourt(c); }}
                        className={`w-full px-4 py-2 text-left text-xs font-medium ${theme.textPrimary} hover:${theme.selectedBg} hover:pl-5 transition-all duration-150`}
                      >
                        {t.court_field.replace("{n}", String(c))}
                      </button>
                    ))
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setCourtPickerMatchId(null); }}
                    className={`w-full px-4 py-1.5 text-left text-2xs ${theme.textMuted} border-t ${theme.cardBorder} hover:opacity-80`}
                  >
                    {t.common_cancel}
                  </button>
                </div>
              )}
            </div>
          );
        };

        return (
          <>
            {/* Current-round unassigned queue. When group context is
                available the queue is segmented into per-group sections,
                ordered by remaining-matches descending so the lagging
                group sits on top — same smart-queue priority as before,
                just structured. */}
            {unassigned.length > 0 && (
              <div className="mt-3">
                <div className="text-2xs font-medium text-muted uppercase tracking-wide mb-1.5">
                  {t.court_waiting.replace("{count}", String(unassigned.length))}
                </div>
                {unassignedGroups && unassignedGroups.length > 0 ? (
                  <div className="space-y-2">
                    {unassignedGroups.map(({ group, matches: groupMatches }) => (
                      <div key={group}>
                        <div className={`flex items-center gap-2 text-2xs font-bold uppercase tracking-wide mb-1 text-phase-text`}>
                          <span>{t.group_progress_label.replace("{n}", String(group))}</span>
                          <span className={`font-mono font-normal ${theme.textMuted}`}>
                            {t.court_waiting_count.replace("{count}", String(groupMatches.length))}
                          </span>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {groupMatches.map(renderUnassignedCard)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {unassigned.map(renderUnassignedCard)}
                  </div>
                )}
              </div>
            )}

            {/* Future rounds (early draw) */}
            {futureRoundQueues?.map(({ round, matches: futureMatches }) => {
              const pending = futureMatches.filter((m) => !m.court && m.status !== "completed");
              if (pending.length === 0) return null;
              return (
                <div key={round.id} className="mt-3">
                  <div className={`text-2xs font-medium uppercase tracking-wide mb-1.5 ${theme.textMuted}`}>
                    {t.court_next_round_separator.replace("{n}", String(round.round_number))}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {pending.map(renderUnassignedCard)}
                  </div>
                </div>
              );
            })}
          </>
        );
      })()}

      {/* Right-click context menu for occupied courts. Renders only
          when state is set; the menu component handles its own
          dismissal listeners (Escape + click-outside). v2.9.0. */}
      {contextMenu && (
        <CourtContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          courtLabel={getCourtLabel(contextMenu.match.court ?? 0)}
          onUnassign={() => {
            if (onUnassign) onUnassign(contextMenu.match.id);
          }}
          onClose={() => setContextMenu(null)}
          theme={theme}
          t={t}
        />
      )}
    </div>
  );
}

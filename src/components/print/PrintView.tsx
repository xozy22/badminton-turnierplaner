import { forwardRef } from "react";
import { useT } from "../../lib/I18nContext";
import type {
  Tournament,
  Player,
  Round,
  Match,
  GameSet,
  StandingEntry,
} from "../../lib/types";
import { MODE_LABELS, FORMAT_LABELS, playerDisplayName } from "../../lib/types";
import { isSetComplete, getScoringDescription, calculateStandings, calculateTeamStandings } from "../../lib/scoring";
import { calculateHighlights } from "../../lib/highlights";
import type { PrintColors } from "../../lib/theme";
import { PRINT_COLORS } from "../../lib/theme";
import type { ThemeId } from "../../lib/theme";

export type PrintMode = "schedule" | "round" | "standings" | "full" | "report";

interface PrintViewProps {
  tournament: Tournament;
  players: Player[];
  rounds: Round[];
  matchesByRound: Map<number, Match[]>;
  setsByMatch: Map<number, GameSet[]>;
  standings: StandingEntry[];
  mode: PrintMode;
  activeRoundId?: number | null;
  themeId?: ThemeId;
}

const PrintView = forwardRef<HTMLDivElement, PrintViewProps>(
  (
    {
      tournament,
      players,
      rounds,
      matchesByRound,
      setsByMatch,
      standings,
      mode,
      activeRoundId,
      themeId = "green",
    },
    ref
  ) => {
    const c: PrintColors = PRINT_COLORS[themeId];
    const { t } = useT();

    const playerName = (id: number | null): string => {
      if (!id) return "-";
      const p = players.find((p) => p.id === id);
      return p ? playerDisplayName(p) : "?";
    };

    const teamLabel = (m: Match, team: 1 | 2): string => {
      const p1 = team === 1 ? m.team1_p1 : m.team2_p1;
      const p2 = team === 1 ? m.team1_p2 : m.team2_p2;
      return p2 ? `${playerName(p1)} / ${playerName(p2)}` : playerName(p1);
    };

    const now = new Date().toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const renderHeader = () => (
      <div style={{ marginBottom: 20, borderBottom: `2px solid ${c.accent}`, paddingBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
              🏸 {tournament.name}
            </h1>
            <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
              {MODE_LABELS[tournament.mode]} &middot;{" "}
              {FORMAT_LABELS[tournament.format]} &middot; Best of{" "}
              {tournament.sets_to_win * 2 - 1} &middot;{" "}
              {getScoringDescription(tournament.points_per_set, tournament.cap, { ext: t.scoring_description_ext, hard: t.scoring_description_hard })}
              {tournament.format === "group_ko" && tournament.ko_points_per_set != null && (
                <> &middot; KO: {getScoringDescription(tournament.ko_points_per_set, tournament.ko_cap, { ext: t.scoring_description_ext, hard: t.scoring_description_hard })}</>
              )}
            </div>
          </div>
          <div style={{ fontSize: 10, color: "#999", textAlign: "right" }}>
            {now}
            <br />
            {t.print_participants.replace("{count}", String(players.length))} &middot; {rounds.length} {t.common_round}
            {tournament.courts > 1 && <><br />{tournament.courts} {t.common_fields}</>}
          </div>
        </div>
      </div>
    );

    const renderMatchRow = (m: Match, idx: number) => {
      const sets = setsByMatch.get(m.id) || [];
      const maxSets = tournament.sets_to_win * 2 - 1;

      let t1Sets = 0;
      let t2Sets = 0;
      for (const s of sets) {
        if (isSetComplete(s, tournament.points_per_set, tournament.cap)) {
          if (s.team1_score > s.team2_score) t1Sets++;
          else t2Sets++;
        }
      }

      return (
        <tr key={m.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
          <td style={{ padding: "6px 8px", fontSize: 11, color: "#999", width: 30 }}>
            {idx + 1}
          </td>
          {tournament.courts > 1 && (
            <td style={{ padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "#b45309", textAlign: "center", width: 50 }}>
              {m.court ? t.court_field.replace("{n}", String(m.court)) : ""}
            </td>
          )}
          <td
            style={{
              padding: "6px 8px",
              fontSize: 12,
              fontWeight: m.winner_team === 1 ? 700 : 400,
              color: m.winner_team === 1 ? c.winColor : "#111",
            }}
          >
            {teamLabel(m, 1)}
          </td>
          <td style={{ padding: "6px 8px", fontSize: 11, color: "#999", textAlign: "center", width: 30 }}>
            vs
          </td>
          <td
            style={{
              padding: "6px 8px",
              fontSize: 12,
              fontWeight: m.winner_team === 2 ? 700 : 400,
              color: m.winner_team === 2 ? c.winColor : "#111",
            }}
          >
            {teamLabel(m, 2)}
          </td>
          {/* Set scores */}
          {Array.from({ length: maxSets }, (_, i) => {
            const setData = sets.find((s) => s.set_number === i + 1);
            return (
              <td
                key={i}
                style={{
                  padding: "6px 8px",
                  fontSize: 12,
                  fontFamily: "monospace",
                  textAlign: "center",
                  width: 60,
                  color: setData ? "#111" : "#ccc",
                }}
              >
                {setData
                  ? `${setData.team1_score}:${setData.team2_score}`
                  : m.status === "completed" ? "-" : "__ : __"}
              </td>
            );
          })}
          <td
            style={{
              padding: "6px 8px",
              fontSize: 12,
              fontFamily: "monospace",
              fontWeight: 700,
              textAlign: "center",
              width: 50,
            }}
          >
            {(t1Sets > 0 || t2Sets > 0) ? `${t1Sets}:${t2Sets}` : ""}
          </td>
        </tr>
      );
    };

    const renderRound = (round: Round) => {
      const matches = matchesByRound.get(round.id) || [];
      const maxSets = tournament.sets_to_win * 2 - 1;

      const roundLabel = round.phase === "group" && round.group_number
        ? `${t.print_group.replace("{n}", String(round.group_number))} - ${t.print_round.replace("{n}", String(rounds.filter((rr) => rr.phase === "group" && rr.group_number === round.group_number).indexOf(round) + 1))}`
        : round.phase === "ko"
        ? t.print_ko_round.replace("{n}", String(rounds.filter((rr) => rr.phase === "ko").indexOf(round) + 1))
        : t.print_round.replace("{n}", String(round.round_number));

      return (
        <div key={round.id} style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: round.phase === "ko" ? "#7c3aed" : c.accent }}>
            {roundLabel}
          </h3>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ backgroundColor: c.accentLight, borderBottom: "2px solid #d1d5db" }}>
                <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 600 }}>#</th>
                {tournament.courts > 1 && (
                  <th style={{ padding: "6px 8px", textAlign: "center", fontSize: 10, fontWeight: 600, width: 50 }}>{t.common_field}</th>
                )}
                <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 600 }}>{t.print_team1}</th>
                <th style={{ padding: "6px 8px", textAlign: "center", fontSize: 10, width: 30 }}></th>
                <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 600 }}>{t.print_team2}</th>
                {Array.from({ length: maxSets }, (_, i) => (
                  <th key={i} style={{ padding: "6px 8px", textAlign: "center", fontSize: 10, fontWeight: 600, width: 60 }}>
                    {t.print_set_n.replace("{n}", String(i + 1))}
                  </th>
                ))}
                <th style={{ padding: "6px 8px", textAlign: "center", fontSize: 10, fontWeight: 600, width: 50 }}>
                  {t.print_sets_label}
                </th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m, idx) => renderMatchRow(m, idx))}
            </tbody>
          </table>
        </div>
      );
    };

    const renderStandings = () => (
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: c.accent }}>
          {t.print_standings_label}
        </h3>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            border: "1px solid #d1d5db",
            fontSize: 12,
          }}
        >
          <thead>
            <tr style={{ backgroundColor: c.accentLight, borderBottom: "2px solid #d1d5db" }}>
              <th style={{ padding: "6px 8px", textAlign: "center", fontSize: 10, fontWeight: 600, width: 40 }}>{t.print_rank}</th>
              <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 600 }}>{t.standings_player}</th>
              <th style={{ padding: "6px 8px", textAlign: "center", fontSize: 10, fontWeight: 600, width: 50 }}>{t.standings_wins}</th>
              <th style={{ padding: "6px 8px", textAlign: "center", fontSize: 10, fontWeight: 600, width: 60 }}>{t.print_defeats}</th>
              <th style={{ padding: "6px 8px", textAlign: "center", fontSize: 10, fontWeight: 600, width: 70 }}>{t.print_sets_label}</th>
              <th style={{ padding: "6px 8px", textAlign: "center", fontSize: 10, fontWeight: 600, width: 80 }}>{t.common_points}</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => {
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
              return (
                <tr
                  key={s.player.id}
                  style={{
                    borderBottom: "1px solid #e5e7eb",
                    backgroundColor: i < 3 ? "#fffbeb" : "transparent",
                  }}
                >
                  <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 13 }}>{medal}</td>
                  <td style={{ padding: "6px 8px", fontWeight: 600 }}>{playerDisplayName(s.player)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center", color: c.winColor, fontWeight: 700 }}>
                    {s.wins}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center", color: c.lossColor }}>
                    {s.losses}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center", fontFamily: "monospace" }}>
                    {s.setsWon}:{s.setsLost}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center", fontFamily: "monospace" }}>
                    {s.pointsWon}:{s.pointsLost}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

    const isGroupKo = tournament.format === "group_ko";
    const groupRounds = rounds.filter((r) => r.phase === "group");
    const koRounds = rounds.filter((r) => r.phase === "ko");

    const renderGroupStandings = () => {
      if (!isGroupKo || groupRounds.length === 0) return null;
      const numGroups = tournament.num_groups || 2;
      const qualifyCount = tournament.qualify_per_group || 2;

      return (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: c.accent }}>
            {t.print_group_tables}
          </h3>
          {Array.from({ length: numGroups }, (_, g) => g + 1).map((groupNum) => {
            const gRounds = rounds.filter((r) => r.phase === "group" && r.group_number === groupNum);
            const gMatches: Match[] = [];
            const gSets = new Map<number, GameSet[]>();
            for (const r of gRounds) {
              const ms = matchesByRound.get(r.id) || [];
              gMatches.push(...ms);
              for (const m of ms) gSets.set(m.id, setsByMatch.get(m.id) || []);
            }
            const pIds = new Set<number>();
            for (const m of gMatches) {
              pIds.add(m.team1_p1); if (m.team1_p2) pIds.add(m.team1_p2);
              if (m.team2_p1) pIds.add(m.team2_p1); if (m.team2_p2) pIds.add(m.team2_p2);
            }
            const gPlayers = players.filter((p) => pIds.has(p.id));
            const isDoubles = tournament.mode !== "singles";

            if (isDoubles) {
              const teamStandings = calculateTeamStandings(gPlayers, gMatches, gSets);
              return (
                <div key={groupNum} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    {t.print_group.replace("{n}", String(groupNum))} <span style={{ fontWeight: 400, color: "#999", fontSize: 10 }}>({teamStandings.length} Teams, Top {qualifyCount})</span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #d1d5db", fontSize: 11, marginBottom: 4 }}>
                    <thead>
                      <tr style={{ backgroundColor: c.accentLight, borderBottom: "2px solid #d1d5db" }}>
                        <th style={{ padding: "4px 8px", textAlign: "left", fontSize: 10, width: 30 }}>#</th>
                        <th style={{ padding: "4px 8px", textAlign: "left", fontSize: 10 }}>{t.groups_team}</th>
                        <th style={{ padding: "4px 8px", textAlign: "center", fontSize: 10, width: 40 }}>{t.common_wins_abbr}</th>
                        <th style={{ padding: "4px 8px", textAlign: "center", fontSize: 10, width: 40 }}>{t.common_losses_abbr}</th>
                        <th style={{ padding: "4px 8px", textAlign: "center", fontSize: 10, width: 60 }}>{t.common_points}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamStandings.map((ts, i) => (
                        <tr key={ts.teamKey} style={{ borderBottom: "1px solid #e5e7eb", backgroundColor: i < qualifyCount ? "#f0fdf4" : "transparent" }}>
                          <td style={{ padding: "4px 8px", color: "#999" }}>{i + 1}</td>
                          <td style={{ padding: "4px 8px", fontWeight: 600 }}>
                            {playerDisplayName(ts.player1)} / {playerDisplayName(ts.player2)}
                            {i < qualifyCount && <span style={{ marginLeft: 4, fontSize: 9, color: c.winColor, fontWeight: 700 }}>Q</span>}
                          </td>
                          <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 700, color: c.winColor }}>{ts.wins}</td>
                          <td style={{ padding: "4px 8px", textAlign: "center", color: c.lossColor }}>{ts.losses}</td>
                          <td style={{ padding: "4px 8px", textAlign: "center", fontFamily: "monospace" }}>{ts.pointsWon}:{ts.pointsLost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }

            const gStandings = calculateStandings(gPlayers, gMatches, gSets);
            return (
              <div key={groupNum} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  {t.print_group.replace("{n}", String(groupNum))} <span style={{ fontWeight: 400, color: "#999", fontSize: 10 }}>({gPlayers.length} {t.groups_player}, Top {qualifyCount})</span>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #d1d5db", fontSize: 11, marginBottom: 4 }}>
                  <thead>
                    <tr style={{ backgroundColor: c.accentLight, borderBottom: "2px solid #d1d5db" }}>
                      <th style={{ padding: "4px 8px", textAlign: "left", fontSize: 10, width: 30 }}>#</th>
                      <th style={{ padding: "4px 8px", textAlign: "left", fontSize: 10 }}>{t.groups_player}</th>
                      <th style={{ padding: "4px 8px", textAlign: "center", fontSize: 10, width: 40 }}>{t.common_wins_abbr}</th>
                      <th style={{ padding: "4px 8px", textAlign: "center", fontSize: 10, width: 40 }}>{t.common_losses_abbr}</th>
                      <th style={{ padding: "4px 8px", textAlign: "center", fontSize: 10, width: 60 }}>{t.common_points}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gStandings.map((s, i) => (
                      <tr key={s.player.id} style={{ borderBottom: "1px solid #e5e7eb", backgroundColor: i < qualifyCount ? "#f0fdf4" : "transparent" }}>
                        <td style={{ padding: "4px 8px", color: "#999" }}>{i + 1}</td>
                        <td style={{ padding: "4px 8px", fontWeight: 600 }}>
                          {playerDisplayName(s.player)}
                          {i < qualifyCount && <span style={{ marginLeft: 4, fontSize: 9, color: c.winColor, fontWeight: 700 }}>Q</span>}
                        </td>
                        <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 700, color: c.winColor }}>{s.wins}</td>
                        <td style={{ padding: "4px 8px", textAlign: "center", color: c.lossColor }}>{s.losses}</td>
                        <td style={{ padding: "4px 8px", textAlign: "center", fontFamily: "monospace" }}>{s.pointsWon}:{s.pointsLost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      );
    };

    const renderHighlights = () => {
      const allMatches: Match[] = [];
      for (const [, matches] of matchesByRound) {
        allMatches.push(...matches);
      }

      const highlights = calculateHighlights(
        players,
        allMatches,
        setsByMatch,
        tournament.points_per_set,
        playerName,
        (m) => [teamLabel(m, 1), teamLabel(m, 2)],
        tournament.cap
      );

      const highlightItems: { icon: string; label: string; value: string }[] = [];

      if (highlights.mostWins) {
        highlightItems.push({
          icon: "🏆",
          label: t.print_most_wins,
          value: `${playerDisplayName(highlights.mostWins.player)} (${highlights.mostWins.wins} ${t.standings_wins})`,
        });
      }
      if (highlights.topScorer) {
        highlightItems.push({
          icon: "🎯",
          label: t.print_most_points,
          value: `${playerDisplayName(highlights.topScorer.player)} (${highlights.topScorer.totalPoints} ${t.common_points})`,
        });
      }
      if (highlights.closestMatch) {
        highlightItems.push({
          icon: "🔥",
          label: t.print_closest_match,
          value: highlights.closestMatch.description,
        });
      }
      if (highlights.biggestWin) {
        highlightItems.push({
          icon: "💪",
          label: t.print_biggest_win,
          value: highlights.biggestWin.description,
        });
      }
      if (highlights.highestScoringMatch) {
        highlightItems.push({
          icon: "📈",
          label: t.print_highest_scoring,
          value: highlights.highestScoringMatch.description,
        });
      }
      if (highlights.mostSetsMatch && tournament.sets_to_win > 1) {
        highlightItems.push({
          icon: "⏱️",
          label: t.print_longest_match,
          value: highlights.mostSetsMatch.description,
        });
      }

      return (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: c.accent }}>
            {t.print_highlights}
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}>
            {highlightItems.map((item, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: c.accentLight,
                  borderRadius: 8,
                  padding: "10px 14px",
                  border: `1px solid ${c.accentBorder}`,
                }}
              >
                <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>
                  {item.icon} {item.label}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* Stats summary */}
          <div style={{
            marginTop: 10,
            display: "flex",
            gap: 20,
            fontSize: 11,
            color: "#666",
            borderTop: "1px solid #e5e7eb",
            paddingTop: 8,
          }}>
            <span>{t.print_matches_completed.replace("{completed}", String(highlights.completedMatches)).replace("{total}", String(highlights.totalMatches))}</span>
            <span>{t.print_sets_played.replace("{count}", String(highlights.totalSets))}</span>
            <span>{t.print_total_points.replace("{count}", String(highlights.totalPoints))}</span>
          </div>
        </div>
      );
    };

    const renderParticipants = () => (
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: c.accent }}>
          Teilnehmer ({players.length})
        </h3>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 4,
          fontSize: 11,
        }}>
          {players.map((p) => (
            <div key={p.id} style={{ padding: "3px 8px", display: "flex", justifyContent: "space-between" }}>
              <span>{playerDisplayName(p)}</span>
              <span style={{ color: "#999", fontSize: 10 }}>
                {p.gender === "m" ? "H" : "D"}
              </span>
            </div>
          ))}
        </div>
      </div>
    );

    return (
      <div
        ref={ref}
        style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          color: "#111",
          padding: 30,
          maxWidth: 800,
          margin: "0 auto",
          backgroundColor: "white",
        }}
      >
        {renderHeader()}

        {/* Report mode: Highlights + Group Standings + Standings + Participants + All Rounds */}
        {mode === "report" && (
          <>
            {renderHighlights()}
            {renderGroupStandings()}
            {renderStandings()}
            {renderParticipants()}
            <div style={{ marginBottom: 10 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: c.accent }}>
                Alle Ergebnisse
              </h3>
            </div>
            {isGroupKo ? (
              <>
                {groupRounds.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: c.accent }}>Gruppenphase</h3>
                  </div>
                )}
                {groupRounds.map((r) => renderRound(r))}
                {koRounds.length > 0 && (
                  <div style={{ marginBottom: 10, marginTop: 16 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: "#7c3aed" }}>KO-Phase</h3>
                  </div>
                )}
                {koRounds.map((r) => renderRound(r))}
              </>
            ) : (
              rounds.map((r) => renderRound(r))
            )}
          </>
        )}

        {/* Schedule: all rounds */}
        {(mode === "schedule" || mode === "full") && (
          isGroupKo ? (
            <>
              {groupRounds.map((r) => renderRound(r))}
              {koRounds.length > 0 && (
                <div style={{ marginBottom: 10, marginTop: 16 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: "#7c3aed" }}>KO-Phase</h3>
                </div>
              )}
              {koRounds.map((r) => renderRound(r))}
            </>
          ) : (
            rounds.map((r) => renderRound(r))
          )
        )}

        {/* Single round */}
        {mode === "round" &&
          activeRoundId &&
          rounds
            .filter((r) => r.id === activeRoundId)
            .map((r) => renderRound(r))}

        {/* Standings */}
        {(mode === "standings" || mode === "full") && (
          <>
            {renderGroupStandings()}
            {renderStandings()}
          </>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: 30,
            paddingTop: 10,
            borderTop: "1px solid #e5e7eb",
            fontSize: 9,
            color: "#aaa",
            textAlign: "center",
          }}
        >
          Badminton Turnierplaner &middot; {tournament.name} &middot; Erstellt am {now}
        </div>
      </div>
    );
  }
);

PrintView.displayName = "PrintView";
export default PrintView;

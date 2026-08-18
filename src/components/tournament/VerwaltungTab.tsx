import React, { useState } from "react";
import type { ThemeColors } from "../../lib/theme";
import type {
  Tournament,
  Player,
  Match,
  TournamentPlayerInfo,
  PaymentMethod,
} from "../../lib/types";
import {
  getTournamentPlayersDetailed,
  updatePlayerPayment,
} from "../../lib/db";
import { playerDisplayName } from "../../lib/types";
import { useT } from "../../lib/I18nContext";
import SeedBadge from "../players/SeedBadge";

interface VerwaltungTabProps {
  tournament: Tournament;
  players: Player[];
  allPlayers: Player[];
  paymentData: TournamentPlayerInfo[];
  theme: ThemeColors;
  collapsedClubs: Set<string>;
  showAddPlayer: boolean;
  allMatches: Match[];
  setShowAddPlayer: (show: boolean) => void;
  handleAddPlayer: (playerId: number) => void;
  handleRemovePlayer: (playerId: number) => void;
  setPaymentData: (data: TournamentPlayerInfo[]) => void;
  setCollapsedClubs: React.Dispatch<React.SetStateAction<Set<string>>>;
  setRetireTarget: (target: { player: Player; partnerNote: string } | null) => void;
  onUnretire: (playerId: number) => void;
  playerName: (id: number | null) => string;
}

export default function VerwaltungTab({
  tournament,
  players,
  allPlayers,
  paymentData,
  theme,
  collapsedClubs,
  showAddPlayer,
  allMatches,
  setShowAddPlayer,
  handleAddPlayer,
  handleRemovePlayer,
  setPaymentData,
  setCollapsedClubs,
  setRetireTarget,
  onUnretire,
  playerName,
}: VerwaltungTabProps) {
  const { t } = useT();
  const [verwaltungSearch, setVerwaltungSearch] = useState("");
  const [verwaltungFilter, setVerwaltungFilter] = useState<"all" | "paid" | "unpaid">("all");

  const formatsWithFixedTeamsTop: string[] = ["elimination", "group_ko", "double_elimination"];
  const isFixedTeamModeTop = tournament.mode !== "singles" && formatsWithFixedTeamsTop.includes(tournament.format);

  return (
    <div className={`${theme.cardBg} rounded-2xl shadow-sm border ${theme.cardBorder} overflow-hidden`}>
      <div className={`px-5 py-3 border-b ${theme.cardBorder} ${theme.headerGradient} flex justify-between items-center`}>
        <span className={`font-semibold text-sm ${theme.standingsHeaderText}`}>
          {"\u{1F465}"} {t.management_participants.replace("{count}", String(players.length))}
          {(tournament.entry_fee_single > 0 || tournament.entry_fee_double > 0) && (() => {
            const fee = tournament.mode === "singles" ? tournament.entry_fee_single : tournament.entry_fee_double;
            let paidCount: number, totalCount: number;
            if (!isFixedTeamModeTop) {
              // Singles or non-fixed team formats: everyone pays individually
              paidCount = paymentData.filter((p) => p.payment_status === "paid").length;
              totalCount = paymentData.length;
            } else {
              // Fixed team doubles/mixed: count teams (one payment per team)
              totalCount = Math.ceil(paymentData.length / 2);
              // A team is paid if at least one partner paid
              const paidIds = new Set(paymentData.filter(p => p.payment_status === "paid").map(p => p.player.id));
              const teamsPaid = new Set<string>();
              for (const m of allMatches) {
                if (m.team1_p1 && m.team1_p2 && (paidIds.has(m.team1_p1) || paidIds.has(m.team1_p2))) {
                  teamsPaid.add(`${Math.min(m.team1_p1, m.team1_p2)}-${Math.max(m.team1_p1, m.team1_p2)}`);
                }
                if (m.team2_p1 && m.team2_p2 && (paidIds.has(m.team2_p1) || paidIds.has(m.team2_p2))) {
                  teamsPaid.add(`${Math.min(m.team2_p1, m.team2_p2)}-${Math.max(m.team2_p1, m.team2_p2)}`);
                }
              }
              paidCount = teamsPaid.size || paymentData.filter(p => p.payment_status === "paid").length;
            }
            const openCount = totalCount - paidCount;
            const paidAmount = paidCount * fee;
            const openAmount = openCount * fee;
            return (
              <span className={`ml-2 font-normal text-xs ${theme.textSecondary}`}>
                {"\u{1F4B0}"} {t.management_paid_count.replace("{paid}", String(paidCount)).replace("{total}", String(totalCount))}
                &nbsp;&middot;&nbsp;
                <span className="text-emerald-500">{t.management_paid_amount.replace("{amount}", String(paidAmount))}</span>
                {openAmount > 0 && (
                  <>
                    &nbsp;&middot;&nbsp;
                    <span className="text-danger-text">{t.management_open_amount.replace("{amount}", String(openAmount))}</span>
                  </>
                )}
              </span>
            );
          })()}
        </span>
        {tournament.status === "draft" && (
          <button
            onClick={() => setShowAddPlayer(!showAddPlayer)}
            className={`text-xs font-medium ${theme.activeBadgeText} transition-colors`}
          >
            {showAddPlayer ? t.management_done : t.management_add_player}
          </button>
        )}
      </div>

      {/* Add Player Dropdown - only in draft */}
      {showAddPlayer && tournament.status === "draft" && (
        <div className={`p-3 border-b ${theme.cardBorder} ${theme.selectedBg}`}>
          <div className="text-xs text-muted mb-2 font-medium">{t.management_add_player_label}</div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {allPlayers
              .filter((ap) => !players.some((p) => p.id === ap.id))
              .map((ap) => (
                <button
                  key={ap.id}
                  onClick={() => handleAddPlayer(ap.id)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm hover:bg-surface-sunken transition-colors text-left"
                >
                  <span className={theme.textPrimary}>{playerDisplayName(ap)}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ap.gender === "m" ? "bg-info-subtle text-blue-500" : "bg-pink-50 text-pink-500"}`}>
                    {ap.gender === "m" ? t.common_gender_male_short : t.common_gender_female_short}
                  </span>
                </button>
              ))}
            {allPlayers.filter((ap) => !players.some((p) => p.id === ap.id)).length === 0 && (
              <div className="text-xs text-muted py-2 text-center">{t.management_all_players_added}</div>
            )}
          </div>
        </div>
      )}

      {/* Search + Filter Bar */}
      <div className={`px-4 py-2.5 border-b ${theme.cardBorder} flex items-center gap-3 flex-wrap`}>
        <div className="relative flex-1 min-w-[150px]">
          <input
            type="text"
            value={verwaltungSearch}
            onChange={(e) => setVerwaltungSearch(e.target.value)}
            placeholder={t.management_search_placeholder}
            className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-lg pl-8 pr-3 py-1.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
          />
          <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${theme.textMuted} text-xs`}>{"\u{1F50D}"}</span>
          {verwaltungSearch && (
            <button onClick={() => setVerwaltungSearch("")} className={`absolute right-2.5 top-1/2 -translate-y-1/2 ${theme.textMuted} hover:opacity-80 text-xs`}>{"\u2715"}</button>
          )}
        </div>
        {(tournament.entry_fee_single > 0 || tournament.entry_fee_double > 0) && (
          <div className={`flex rounded-lg border ${theme.inputBorder} overflow-hidden text-xs`}>
            {([
              { value: "all" as const, label: t.management_filter_all },
              { value: "paid" as const, label: t.management_filter_paid },
              { value: "unpaid" as const, label: t.management_filter_open },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setVerwaltungFilter(opt.value)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  verwaltungFilter === opt.value
                    ? `${theme.primaryBg} text-white`
                    : `${theme.textSecondary} hover:opacity-80`
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {(() => {
        const hasPayment = tournament.entry_fee_single > 0 || tournament.entry_fee_double > 0;
        const formatsWithFixedTeams: string[] = ["elimination", "group_ko", "double_elimination"];
        const isFixedTeamMode = tournament.mode !== "singles" && formatsWithFixedTeams.includes(tournament.format);

        // Build partner map for fixed team modes (who is paired with whom)
        const partnerMap = new Map<number, number>();
        if (isFixedTeamMode) {
          for (const m of allMatches) {
            if (m.team1_p1 && m.team1_p2) {
              partnerMap.set(m.team1_p1, m.team1_p2);
              partnerMap.set(m.team1_p2, m.team1_p1);
            }
            if (m.team2_p1 && m.team2_p2) {
              partnerMap.set(m.team2_p1, m.team2_p2);
              partnerMap.set(m.team2_p2, m.team2_p1);
            }
          }
        }

        // Check if partner has paid (for team modes)
        const getPartnerPaidInfo = (playerId: number): string | null => {
          if (!isFixedTeamMode || !hasPayment) return null;
          const partnerId = partnerMap.get(playerId);
          if (!partnerId) return null;
          const partnerData = paymentData.find(pd => pd.player.id === partnerId);
          if (partnerData && partnerData.payment_status === "paid") {
            return playerDisplayName(partnerData.player);
          }
          return null;
        };
        const fee = tournament.mode === "singles" ? tournament.entry_fee_single : tournament.entry_fee_double;
        const searchLower = verwaltungSearch.toLowerCase().trim();
        const filtered = paymentData.filter((pd) => {
          if (searchLower && !playerDisplayName(pd.player).toLowerCase().includes(searchLower) && !(pd.player.club ?? "").toLowerCase().includes(searchLower)) return false;
          if (verwaltungFilter === "paid" && pd.payment_status !== "paid") return false;
          if (verwaltungFilter === "unpaid" && pd.payment_status !== "unpaid") return false;
          return true;
        });
        const sorted = [...filtered].sort((a, b) => (a.player.club ?? "").localeCompare(b.player.club ?? "") || playerDisplayName(a.player).localeCompare(playerDisplayName(b.player)));
        const groups = new Map<string, TournamentPlayerInfo[]>();
        for (const pd of sorted) {
          const club = pd.player.club || t.management_no_club;
          if (!groups.has(club)) groups.set(club, []);
          groups.get(club)!.push(pd);
        }

        return (
          <>
          {(searchLower || verwaltungFilter !== "all") && (
            <div className={`px-4 py-1.5 text-xs ${theme.textMuted} border-b ${theme.cardBorder}`}>
              {t.management_shown_of_total.replace("{shown}", String(filtered.length)).replace("{total}", String(paymentData.length))}
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${theme.cardBorder} text-xs ${theme.textMuted}`}>
                <th className="text-left px-3 py-2">{t.common_name}</th>
                <th className="text-center px-2 py-2">{t.common_gender}</th>
                <th className="text-left px-2 py-2">{t.common_club}</th>
                {hasPayment && (
                  <>
                    <th className="text-center px-2 py-2">{t.management_entry_fee}</th>
                    <th className="text-center px-2 py-2">{t.management_payment_method}</th>
                    <th className="text-center px-2 py-2">{t.management_payment_date}</th>
                  </>
                )}
                <th className="text-right px-3 py-2">{t.common_actions}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(groups.entries()).map(([clubName, members]) => {
                const isCollapsed = collapsedClubs.has(clubName);
                const paidCount = members.filter((m) => m.payment_status === "paid").length;
                const colSpan = hasPayment ? 7 : 4;
                return (
                  <React.Fragment key={clubName}>
                    <tr
                      className={`${theme.headerGradient} cursor-pointer`}
                      onClick={() => setCollapsedClubs((prev) => {
                        const next = new Set(prev);
                        if (next.has(clubName)) next.delete(clubName);
                        else next.add(clubName);
                        return next;
                      })}
                    >
                      <td colSpan={colSpan} className={`px-3 py-2 text-xs font-semibold ${theme.standingsHeaderText}`}>
                        <span className="mr-1">{isCollapsed ? "\u25B6" : "\u25BC"}</span>
                        {clubName} ({members.length})
                        {hasPayment && (
                          <span className={`ml-2 font-normal ${theme.textMuted}`}>
                            {t.management_paid_count_label.replace("{paid}", String(paidCount)).replace("{total}", String(members.length))}
                          </span>
                        )}
                      </td>
                    </tr>
                    {!isCollapsed && members.map((pd) => {
                      const isRetired = pd.retired;
                      return (
                        <tr key={pd.player.id} className={`border-b ${theme.cardBorder} last:border-0 group`}>
                          <td className={`px-3 py-2 pl-6 font-medium ${isRetired ? `${theme.textMuted} line-through` : theme.textPrimary}`}>
                            {playerDisplayName(pd.player)}
                            <SeedBadge rank={pd.seed_rank} />
                            {isRetired && <span className="ml-1.5 text-[10px] text-danger-text no-underline inline-block">{"\u{1F3E5}"}</span>}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${pd.player.gender === "m" ? "bg-info-subtle text-blue-500" : "bg-pink-50 text-pink-500"}`}>
                              {pd.player.gender === "m" ? t.common_gender_male_short : t.common_gender_female_short}
                            </span>
                          </td>
                          <td className={`px-2 py-2 text-xs ${theme.textSecondary}`}>{pd.player.club ?? "-"}</td>
                          {hasPayment && (
                            <>
                              <td className="px-2 py-2 text-center">
                                {(() => {
                                  const partnerPaidBy = pd.payment_status !== "paid" ? getPartnerPaidInfo(pd.player.id) : null;
                                  return partnerPaidBy ? (
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-info-text" title={partnerPaidBy}>
                                      ✓ {partnerPaidBy}
                                    </span>
                                  ) : (
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                      pd.payment_status === "paid"
                                        ? "bg-green-500/10 text-green-600"
                                        : "bg-orange-500/10 text-orange-600"
                                    }`}>
                                      {pd.payment_status === "paid" ? `${fee} EUR` : t.management_open}
                                    </span>
                                  );
                                })()}
                              </td>
                              <td className={`px-2 py-2 text-center text-xs ${theme.textSecondary}`}>
                                {pd.payment_method ? (pd.payment_method === "bar" ? t.payment_cash : pd.payment_method === "ueberweisung" ? t.payment_transfer : t.payment_paypal) : "-"}
                              </td>
                              <td className={`px-2 py-2 text-center text-xs ${theme.textSecondary}`}>
                                {pd.payment_status === "paid" ? (
                                  <input
                                    type="text"
                                    value={pd.paid_date ?? ""}
                                    onChange={async (e) => {
                                      await updatePlayerPayment(tournament.id, pd.player.id, "paid", pd.payment_method, e.target.value || null);
                                      const updated = await getTournamentPlayersDetailed(tournament.id);
                                      setPaymentData(updated);
                                    }}
                                    className={`${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded px-1.5 py-0.5 text-xs text-center w-24`}
                                    placeholder={t.management_date_placeholder}
                                  />
                                ) : "-"}
                              </td>
                            </>
                          )}
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center gap-1 justify-end">
                              {hasPayment && pd.payment_status === "paid" ? (
                                <button
                                  onClick={async () => {
                                    await updatePlayerPayment(tournament.id, pd.player.id, "unpaid", null, null);
                                    const updated = await getTournamentPlayersDetailed(tournament.id);
                                    setPaymentData(updated);
                                  }}
                                  className={`text-xs ${theme.textMuted} hover:text-orange-600 transition-colors`}
                                >
                                  {"\u21A9"}
                                </button>
                              ) : hasPayment && pd.payment_status !== "paid" ? (
                                (["bar", "ueberweisung", "paypal"] as PaymentMethod[]).map((m) => (
                                  <button
                                    key={m}
                                    onClick={async () => {
                                      const today = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
                                      await updatePlayerPayment(tournament.id, pd.player.id, "paid", m, today);
                                      const updated = await getTournamentPlayersDetailed(tournament.id);
                                      setPaymentData(updated);
                                    }}
                                    className={`text-xs px-2 py-1 rounded-lg border ${theme.cardBorder} ${theme.textSecondary} hover:border-green-400 hover:text-green-600 transition-all`}
                                  >
                                    {m === "bar" ? t.payment_cash : m === "ueberweisung" ? t.payment_transfer : t.payment_paypal}
                                  </button>
                                ))
                              ) : null}
                              {tournament.status === "draft" && (
                                <button
                                  onClick={() => handleRemovePlayer(pd.player.id)}
                                  title={t.management_remove_from_tournament}
                                  className="text-xs text-danger-text hover:text-danger-text ml-1"
                                >
                                  {"\u2715"}
                                </button>
                              )}
                              {tournament.status === "active" && !isRetired && (
                                <button
                                  onClick={() => {
                                    const p = pd.player;
                                    const isFixedTeam = tournament.format !== "random_doubles" && tournament.mode !== "singles";
                                    let partnerNote = "";
                                    if (isFixedTeam) {
                                      for (const m of allMatches) {
                                        if (m.team1_p1 === p.id && m.team1_p2) { partnerNote = t.management_partner_also_retires.replace("{name}", playerName(m.team1_p2)); break; }
                                        if (m.team1_p2 === p.id) { partnerNote = t.management_partner_also_retires.replace("{name}", playerName(m.team1_p1)); break; }
                                        if (m.team2_p1 === p.id && m.team2_p2) { partnerNote = t.management_partner_also_retires.replace("{name}", playerName(m.team2_p2)); break; }
                                        if (m.team2_p2 === p.id) { partnerNote = t.management_partner_also_retires.replace("{name}", playerName(m.team2_p1)); break; }
                                      }
                                    }
                                    setRetireTarget({ player: p, partnerNote });
                                  }}
                                  title={t.management_retire_title}
                                  className="text-xs text-warning-text hover:text-warning-text ml-1"
                                >
                                  {"\u{1F3E5}"}
                                </button>
                              )}
                              {tournament.status === "active" && isRetired && (
                                <button
                                  onClick={() => onUnretire(pd.player.id)}
                                  title={t.retire_undo}
                                  className="text-xs text-emerald-500 hover:text-emerald-700 ml-1"
                                >
                                  ✅
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          </>
        );
      })()}
    </div>
  );
}

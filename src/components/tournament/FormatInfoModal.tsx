import type { ThemeColors } from "../../lib/theme";
import { formatOptions } from "../../lib/i18n/labels";
import Modal, { ModalCancelButton } from "../ui/Modal";
import type { TournamentFormat } from "../../lib/types";
import { useT } from "../../lib/I18nContext";

interface FormatInfoModalProps {
  format: TournamentFormat;
  theme: ThemeColors;
  onClose: () => void;
}

const FORMAT_DIAGRAMS: Record<TournamentFormat, string> = {
  round_robin: `  A --- B
  | \\ / |
  |  X  |
  | / \\ |
  C --- D
  Everyone vs Everyone`,

  elimination: `  P1 -+
      +- W -+
  P2 -+     |
             +- Winner
  P3 -+     |
      +- W -+
  P4 -+`,

  random_doubles: `  Round 1:  A+B vs C+D    E+F vs G+H
  Round 2:  A+D vs B+G    C+F vs E+H
  Round 3:  A+F vs D+H    B+E vs C+G
  (New partners each round)`,

  group_ko: `  Group A    Group B
  +------+  +------+
  | P1   |  | P5   |
  | P2 Q |  | P6 Q |    Q = Qualifies
  | P3 Q |  | P7 Q |        |
  | P4   |  | P8   |    KO Bracket
  +------+  +------+    +---------+
                         |  Final  |
                         +---------+`,

  swiss: `  Round 1: Random pairs
  Round 2: #1 vs #2, #3 vs #4  (by standings)
  Round 3: #1 vs #2, #3 vs #4  (by standings)
  ...
  All players play every round`,

  double_elimination: `  Winners        Losers
  P1 -+
      +- W --+  L -+
  P2 -+      |     +- W -+
              |  L -+     |
  P3 -+      +---- Grand -+
      +- W --+     Final  |
  P4 -+           W ------+
  (Lose twice = out)`,

  monrad: `  Round 1: Random pairs
  Round 2: #1 vs #2, #3 vs #4
  Round 3: #1 vs #2, #3 vs #4
  (Strict ranking, no rematch avoidance)`,

  king_of_court: `  Court: [King] vs [Challenger]
                     | loses
  Queue: P3 > P4 > P5 > [Loser]
         ^ next challenger`,

  waterfall: `  Court 1 (King):  P1 vs P2  > Winner stays
  Court 2:         P3 vs P4  > Winner ^ up
  Court 3:         P5 vs P6  > Loser  v down
  (Winners rise, losers fall)`,
};

export default function FormatInfoModal({
  format,
  theme,
  onClose,
}: FormatInfoModalProps) {
  const { t } = useT();

  const formatNames: Record<TournamentFormat, string> = Object.fromEntries(formatOptions(t)) as Record<TournamentFormat, string>;

  const formatDescs: Record<TournamentFormat, string> = {
    round_robin: t.format_desc_round_robin,
    elimination: t.format_desc_elimination,
    random_doubles: t.format_desc_random_doubles,
    group_ko: t.format_desc_group_ko,
    swiss: t.format_desc_swiss,
    double_elimination: t.format_desc_double_elimination,
    monrad: t.format_desc_monrad,
    king_of_court: t.format_desc_king_of_court,
    waterfall: t.format_desc_waterfall,
  };

  const formatDetails: Record<TournamentFormat, string> = {
    round_robin: t.format_detail_round_robin,
    elimination: t.format_detail_elimination,
    random_doubles: t.format_detail_random_doubles,
    group_ko: t.format_detail_group_ko,
    swiss: t.format_detail_swiss,
    double_elimination: t.format_detail_double_elimination,
    monrad: t.format_detail_monrad,
    king_of_court: t.format_detail_king_of_court,
    waterfall: t.format_detail_waterfall,
  };

  const formatBest: Record<TournamentFormat, string> = {
    round_robin: t.format_best_round_robin,
    elimination: t.format_best_elimination,
    random_doubles: t.format_best_random_doubles,
    group_ko: t.format_best_group_ko,
    swiss: t.format_best_swiss,
    double_elimination: t.format_best_double_elimination,
    monrad: t.format_best_monrad,
    king_of_court: t.format_best_king_of_court,
    waterfall: t.format_best_waterfall,
  };

  const formatPros: Record<TournamentFormat, string> = {
    round_robin: t.format_pros_round_robin,
    elimination: t.format_pros_elimination,
    random_doubles: t.format_pros_random_doubles,
    group_ko: t.format_pros_group_ko,
    swiss: t.format_pros_swiss,
    double_elimination: t.format_pros_double_elimination,
    monrad: t.format_pros_monrad,
    king_of_court: t.format_pros_king_of_court,
    waterfall: t.format_pros_waterfall,
  };

  const formatCons: Record<TournamentFormat, string> = {
    round_robin: t.format_cons_round_robin,
    elimination: t.format_cons_elimination,
    random_doubles: t.format_cons_random_doubles,
    group_ko: t.format_cons_group_ko,
    swiss: t.format_cons_swiss,
    double_elimination: t.format_cons_double_elimination,
    monrad: t.format_cons_monrad,
    king_of_court: t.format_cons_king_of_court,
    waterfall: t.format_cons_waterfall,
  };

  const prosItems = formatPros[format].split("\n").filter(Boolean);
  const consItems = formatCons[format].split("\n").filter(Boolean);
  const detailParagraphs = formatDetails[format].split("\n\n").filter(Boolean);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={formatNames[format]}
      description={formatDescs[format]}
      footer={<ModalCancelButton onClick={onClose}>{t.common_close}</ModalCancelButton>}
    >
      <div className="-mx-6 max-h-[60vh] overflow-y-auto px-6">

        {/* ASCII Diagram */}
        <div className={`${theme.inputBg} border ${theme.inputBorder} rounded-md p-4 mb-4 overflow-x-auto`}>
          <pre className={`text-xs ${theme.textSecondary} font-mono leading-relaxed whitespace-pre`}>
            {FORMAT_DIAGRAMS[format]}
          </pre>
        </div>

        {/* Detailed description */}
        <div className="mb-4">
          {detailParagraphs.map((p, i) => (
            <p key={i} className={`text-sm ${theme.textSecondary} ${i > 0 ? "mt-2" : ""}`}>
              {p}
            </p>
          ))}
        </div>

        {/* Best suited for */}
        <div className={`${theme.inputBg} border ${theme.inputBorder} rounded-md p-4 mb-4`}>
          <h4 className={`text-xs font-semibold ${theme.textPrimary} uppercase tracking-wide mb-1.5`}>
            {t.format_info_best_for}
          </h4>
          <p className={`text-sm ${theme.textSecondary}`}>
            {formatBest[format]}
          </p>
        </div>

        {/* Pros and Cons */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className={`${theme.inputBg} border ${theme.inputBorder} rounded-md p-4`}>
            <h4 className="text-xs font-semibold text-success-text uppercase tracking-wide mb-2">
              {t.format_info_pros}
            </h4>
            <ul className="space-y-1">
              {prosItems.map((item, i) => (
                <li key={i} className={`text-sm ${theme.textSecondary} flex items-start gap-1.5`}>
                  <span className="text-success-text mt-0.5 shrink-0">+</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={`${theme.inputBg} border ${theme.inputBorder} rounded-md p-4`}>
            <h4 className="text-xs font-semibold text-danger-text uppercase tracking-wide mb-2">
              {t.format_info_cons}
            </h4>
            <ul className="space-y-1">
              {consItems.map((item, i) => (
                <li key={i} className={`text-sm ${theme.textSecondary} flex items-start gap-1.5`}>
                  <span className="text-danger-text mt-0.5 shrink-0">-</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Modal>
  );
}

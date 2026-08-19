// src/components/tournament/FeeItemsSection.tsx
//
// Charges beyond the entry fee, and when the entry fee falls due.
//
// BOSS knew two amounts: the singles fee and the doubles fee. A late
// entry, a tube of shuttles, a hall contribution had nowhere to go, so
// they were added to somebody's head or to a separate sheet of paper
// (FEATURE-BACKLOG.md E4).
//
// The due date sits here rather than in the tournament settings because
// it is a money question, and because it only means anything next to the
// withdrawals it affects (E3).

import { useState } from "react";
import Icon from "../ui/Icon";
import { useT, useLocale } from "../../lib/I18nContext";
import { fill } from "../../lib/i18n/format";
import { formatMoney } from "../../lib/datetime";
import { playerDisplayName } from "../../lib/types";
import type { ThemeColors } from "../../lib/theme";
import type { FeeDue, FeeItem, Player } from "../../lib/types";

export default function FeeItemsSection({
  items,
  players,
  feeDue,
  theme,
  onAdd,
  onTogglePaid,
  onDelete,
  onFeeDueChange,
}: {
  items: FeeItem[];
  /** Everyone the charge could belong to. */
  players: Player[];
  feeDue: FeeDue;
  theme: ThemeColors;
  onAdd: (playerId: number | null, label: string, amount: number) => void | Promise<void>;
  onTogglePaid: (itemId: number, paid: boolean) => void | Promise<void>;
  onDelete: (itemId: number) => void | Promise<void>;
  onFeeDueChange: (value: FeeDue) => void | Promise<void>;
}) {
  const { t } = useT();
  const locale = useLocale();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [target, setTarget] = useState<string>("");

  const nameOf = (id: number | null) => {
    if (id === null) return t.fee_items_whole_tournament;
    const p = players.find((x) => x.id === id);
    return p ? playerDisplayName(p) : "?";
  };

  const parsed = Number(amount.replace(",", "."));
  const canAdd = label.trim() !== "" && Number.isFinite(parsed) && parsed !== 0;

  const submit = () => {
    if (!canAdd) return;
    onAdd(target === "" ? null : Number(target), label.trim(), parsed);
    setLabel("");
    setAmount("");
  };

  const total = items.reduce((n, i) => n + i.amount, 0);
  const open = items.filter((i) => !i.paid).reduce((n, i) => n + i.amount, 0);

  return (
    <div className={`overflow-hidden rounded-lg border ${theme.cardBorder} ${theme.cardBg}`}>
      <div className={`border-b ${theme.cardBorder} px-5 py-3`}>
        <span className={`text-sm font-semibold ${theme.textPrimary}`}>
          <Icon name="coins" /> {t.fee_items_title}
        </span>
      </div>

      {/* When the entry fee falls due (E3) */}
      <fieldset className={`border-b ${theme.cardBorder} px-5 py-3`}>
        <legend className="sr-only">{t.fee_due_legend}</legend>
        <div className="text-2xs font-semibold uppercase tracking-wide text-muted">
          {t.fee_due_legend}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              { value: "participation" as const, label: t.fee_due_participation, hint: t.fee_due_participation_hint },
              { value: "entry" as const, label: t.fee_due_entry, hint: t.fee_due_entry_hint },
            ]
          ).map((option) => (
            <label
              key={option.value}
              className={`flex flex-1 cursor-pointer items-start gap-2 rounded-sm border p-2.5 transition-colors ${
                feeDue === option.value
                  ? "border-accent bg-accent-subtle"
                  : "border-line hover:bg-surface-sunken"
              }`}
            >
              <input
                type="radio"
                name="fee-due"
                value={option.value}
                checked={feeDue === option.value}
                onChange={() => onFeeDueChange(option.value)}
                className="mt-0.5"
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium text-primary">{option.label}</span>
                <span className="text-2xs text-secondary">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Adding a charge (E4) */}
      <div className={`flex flex-wrap items-end gap-2 border-b ${theme.cardBorder} bg-surface-sunken px-5 py-3`}>
        <label className="flex min-w-40 flex-1 flex-col gap-1">
          <span className="text-2xs text-muted">{t.fee_items_label}</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={t.fee_items_label_placeholder}
            className="rounded-sm border border-line bg-surface px-2.5 py-1.5 text-sm text-primary outline-none focus:border-accent"
          />
        </label>
        <label className="flex w-24 flex-col gap-1">
          <span className="text-2xs text-muted">{t.fee_items_amount}</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            inputMode="decimal"
            placeholder="0"
            className="rounded-sm border border-line bg-surface px-2.5 py-1.5 text-right text-sm text-primary outline-none focus:border-accent"
          />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1">
          <span className="text-2xs text-muted">{t.fee_items_for}</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="rounded-sm border border-line bg-surface px-2.5 py-1.5 text-sm text-primary outline-none focus:border-accent"
          >
            <option value="">{t.fee_items_whole_tournament}</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {playerDisplayName(p)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={!canAdd}
          className="rounded-sm bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          {t.fee_items_add}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-4 text-2xs text-muted">{t.fee_items_empty}</p>
      ) : (
        <>
          <ul className="flex flex-col">
            {items.map((item, i) => (
              <li
                key={item.id}
                className={`flex items-center gap-3 px-5 py-2.5 text-sm ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.paid}
                  onChange={(e) => onTogglePaid(item.id, e.target.checked)}
                  aria-label={fill(t.fee_items_paid_label, { label: item.label })}
                  className="shrink-0"
                />
                <span className={`flex-1 truncate ${item.paid ? "text-muted line-through" : "text-primary"}`}>
                  {item.label}
                </span>
                <span className="shrink-0 truncate text-2xs text-muted">{nameOf(item.player_id)}</span>
                <span className="w-20 shrink-0 text-right font-mono text-sm tabular-nums text-primary">
                  {formatMoney(item.amount, locale)}
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  aria-label={fill(t.fee_items_delete_label, { label: item.label })}
                  className="shrink-0 text-muted transition-colors hover:text-danger-text"
                >
                  <Icon name="trash" size={13} />
                </button>
              </li>
            ))}
          </ul>
          <div className={`flex justify-end gap-4 border-t ${theme.cardBorder} px-5 py-2.5 text-xs`}>
            <span className="text-muted">
              {t.fee_items_total}{" "}
              <b className="font-mono tabular-nums text-primary">{formatMoney(total, locale)}</b>
            </span>
            {open > 0 && (
              <span className="text-danger-text">
                {t.fee_items_open}{" "}
                <b className="font-mono tabular-nums">{formatMoney(open, locale)}</b>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

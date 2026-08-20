// src/components/tournament/EntryListSection.tsx
//
// The waiting list and the withdrawals.
//
// Both used to be invisible. Somebody who could not be fitted in was
// simply not added, and the order in which people had asked was kept in
// somebody's head (FEATURE-BACKLOG.md E1). Somebody who pulled out was
// deleted, which also removed them from the accounts -- and if the fee
// fell due on entry, they still owed it (E2).

import { useState } from "react";
import Icon from "../ui/Icon";
import { useT } from "../../lib/I18nContext";
import { fill } from "../../lib/i18n/format";
import { formatDate } from "../../lib/datetime";
import { useLocale } from "../../lib/I18nContext";
import { playerDisplayName } from "../../lib/types";
import type { ThemeColors } from "../../lib/theme";
import type { Player, TournamentPlayerInfo } from "../../lib/types";

export default function EntryListSection({
  participants,
  candidates,
  theme,
  onEnter,
  onWait,
  onPromote,
}: {
  /** Everyone linked to the tournament, whatever their status. */
  participants: TournamentPlayerInfo[];
  /** Players not linked to this tournament yet, for adding to the queue. */
  candidates: Player[];
  theme: ThemeColors;
  onEnter: (playerId: number) => void | Promise<void>;
  onWait: (playerId: number) => void | Promise<void>;
  /** Moves the first in line up. Reports who, or that nobody was waiting. */
  onPromote: () => void | Promise<void>;
}) {
  const { t } = useT();
  const locale = useLocale();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");

  const waiting = participants
    .filter((p) => p.entry_status === "waiting")
    .sort((a, b) => (a.waiting_rank ?? 0) - (b.waiting_rank ?? 0) || a.player.id - b.player.id);
  const withdrawn = participants.filter((p) => p.entry_status === "withdrawn");

  const matches = candidates.filter((p) =>
    playerDisplayName(p).toLowerCase().includes(search.trim().toLowerCase()),
  );

  // Nothing to show and nothing queued: the section would be an empty
  // heading, which is worse than not being there.
  if (waiting.length === 0 && withdrawn.length === 0 && !adding) {
    return (
      <div className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} px-5 py-4`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className={`text-sm font-medium ${theme.textPrimary}`}>
              {t.entry_list_title}
            </div>
            <div className="mt-0.5 text-xs text-muted">{t.entry_list_empty_hint}</div>
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="shrink-0 rounded-sm border border-line-strong px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-surface-sunken"
          >
            <Icon name="plus" size={12} /> {t.entry_list_add_waiting}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-lg border ${theme.cardBorder} ${theme.cardBg}`}>
      <div className={`flex items-center justify-between gap-4 border-b ${theme.cardBorder} px-5 py-3`}>
        <span className={`text-sm font-semibold ${theme.textPrimary}`}>
          <Icon name="inbox" /> {t.entry_list_title}
        </span>
        <div className="flex items-center gap-2">
          {waiting.length > 0 && (
            <button
              type="button"
              onClick={() => onPromote()}
              className="rounded-sm bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-colors hover:bg-accent-hover"
            >
              {t.entry_list_promote_next}
            </button>
          )}
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded-sm border border-line-strong px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-surface-sunken"
          >
            <Icon name="plus" size={12} /> {t.entry_list_add_waiting}
          </button>
        </div>
      </div>

      {adding && (
        <div className={`border-b ${theme.cardBorder} bg-surface-sunken px-5 py-3`}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.entry_list_search_placeholder}
            className="w-full rounded-sm border border-line bg-surface px-3 py-1.5 text-sm text-primary outline-none focus:border-accent"
          />
          <div className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
            {matches.length === 0 && (
              <p className="py-2 text-2xs text-muted">{t.entry_list_no_candidates}</p>
            )}
            {matches.slice(0, 25).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onWait(p.id);
                  setSearch("");
                }}
                className="flex items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm text-primary transition-colors hover:bg-surface"
              >
                <span>{playerDisplayName(p)}</span>
                <span className="text-2xs text-muted">{t.entry_list_queue_action}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {waiting.length > 0 && (
        <section>
          <h3 className="px-5 pt-3 text-2xs font-semibold uppercase tracking-wide text-muted">
            {fill(t.entry_list_waiting_heading, { count: String(waiting.length) })}
          </h3>
          <ol className="flex flex-col">
            {waiting.map((p, i) => (
              <li
                key={p.player.id}
                className={`flex items-center gap-3 px-5 py-2.5 text-sm ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                {/* The position, not the stored rank: after a promotion the
                    stored numbers have gaps, and "3." with nobody at 2 reads
                    as a bug. */}
                <span className="w-5 shrink-0 font-mono text-2xs text-muted">{i + 1}.</span>
                <span className="flex-1 truncate text-primary">
                  {playerDisplayName(p.player)}
                </span>
                <button
                  type="button"
                  onClick={() => onEnter(p.player.id)}
                  className="text-2xs font-medium text-success-text transition-colors hover:underline"
                >
                  {t.entry_list_enter}
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {withdrawn.length > 0 && (
        <section className={waiting.length > 0 ? `border-t ${theme.cardBorder}` : ""}>
          <h3 className="px-5 pt-3 text-2xs font-semibold uppercase tracking-wide text-muted">
            {fill(t.entry_list_withdrawn_heading, { count: String(withdrawn.length) })}
          </h3>
          <p className="px-5 pb-2 pt-1 text-2xs text-muted">{t.entry_list_withdrawn_hint}</p>
          <ul className="flex flex-col">
            {withdrawn.map((p, i) => (
              <li
                key={p.player.id}
                className={`flex items-center gap-3 px-5 py-2.5 text-sm ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <span className="flex-1 truncate text-secondary line-through decoration-line-strong">
                  {playerDisplayName(p.player)}
                </span>
                {p.withdrawn_at && (
                  <span className="shrink-0 text-2xs text-muted">
                    {formatDate(p.withdrawn_at, locale)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onEnter(p.player.id)}
                  className="shrink-0 text-2xs font-medium text-success-text transition-colors hover:underline"
                >
                  {t.entry_list_reenter}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Withdrawing happens in the participant list above, where the
          participant is. This section is what happens afterwards. */}
    </div>
  );
}

// src/pages/TournamentView/components/modals/MatchOutcomeModal.tsx
//
// Closes a match that was not played, and says why.
//
// Until this existed the only way out of a match nobody played was to
// retire a whole player from the roster, which awards every one of their
// remaining matches at once. A pair that simply did not turn up for one
// round had no representation at all: the match stayed pending and the
// tournament could never be finished (FEATURE-BACKLOG.md D1).

import { useState } from "react";
import { useT } from "../../../../lib/I18nContext";
import Modal, { ModalCancelButton, ModalConfirmButton } from "../../../../components/ui/Modal";
import Icon, { type IconName } from "../../../../components/ui/Icon";
import type { MatchOutcome } from "../../../../lib/types";
import type { OutcomeTarget } from "../../lib/useTournamentDialogs";

type Reason = Exclude<MatchOutcome, null>;

export default function MatchOutcomeModal({
  target,
  onClose,
  onConfirm,
}: {
  target: OutcomeTarget | null;
  onClose: () => void;
  onConfirm: (outcome: Reason, winnerTeam: 1 | 2 | null) => void | Promise<void>;
}) {
  const { t } = useT();
  const [reason, setReason] = useState<Reason>("walkover");
  const [winner, setWinner] = useState<1 | 2>(1);

  // "Nobody played" is the one reason with no winner to pick.
  const needsWinner = reason !== "no_match";

  const reasons: { value: Reason; icon: IconName; label: string; hint: string }[] = [
    { value: "walkover", icon: "x", label: t.outcome_walkover, hint: t.outcome_walkover_hint },
    { value: "retired", icon: "medical", label: t.outcome_retired, hint: t.outcome_retired_hint },
    { value: "disqualified", icon: "ban", label: t.outcome_disqualified, hint: t.outcome_disqualified_hint },
    { value: "no_match", icon: "alert", label: t.outcome_no_match, hint: t.outcome_no_match_hint },
  ];

  const handleClose = () => {
    setReason("walkover");
    setWinner(1);
    onClose();
  };

  return (
    <Modal
      open={target !== null}
      onClose={handleClose}
      icon="clipboard"
      title={t.outcome_title}
      description={t.outcome_description}
      footer={
        <>
          <ModalCancelButton onClick={handleClose} />
          <ModalConfirmButton
            onClick={() => {
              onConfirm(reason, needsWinner ? winner : null);
              setReason("walkover");
              setWinner(1);
            }}
            tone="danger"
          >
            {t.outcome_confirm}
          </ModalConfirmButton>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted">
            {t.outcome_reason_legend}
          </legend>
          {reasons.map((r) => (
            <label
              key={r.value}
              className={`flex cursor-pointer items-start gap-3 rounded-sm border p-3 transition-colors ${
                reason === r.value
                  ? "border-accent bg-accent-subtle"
                  : "border-line bg-surface hover:bg-surface-sunken"
              }`}
            >
              <input
                type="radio"
                name="match-outcome"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="mt-1"
              />
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Icon name={r.icon} size={14} />
                  {r.label}
                </span>
                <span className="text-2xs text-secondary">{r.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {needsWinner && target && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted">
              {t.outcome_winner_legend}
            </legend>
            {([1, 2] as const).map((side) => (
              <label
                key={side}
                className={`flex cursor-pointer items-center gap-3 rounded-sm border p-3 transition-colors ${
                  winner === side
                    ? "border-success bg-success-subtle"
                    : "border-line bg-surface hover:bg-surface-sunken"
                }`}
              >
                <input
                  type="radio"
                  name="match-outcome-winner"
                  value={side}
                  checked={winner === side}
                  onChange={() => setWinner(side)}
                />
                <span className="text-sm font-medium text-primary">
                  {side === 1 ? target.team1 : target.team2}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <p className="text-2xs text-secondary">{t.outcome_no_sets_note}</p>
      </div>
    </Modal>
  );
}

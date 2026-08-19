// src/pages/TournamentView/components/modals/DrawPreviewModal.tsx
//
// The draw, shown before it counts.
//
// BOSS drew and wrote in one step. Undoing it went through the round
// rollback -- which works, but "look at it and discard" is a different
// thing from "save it and take it back", especially with twenty people
// watching the projector (FEATURE-BACKLOG.md C4).
//
// "Draw again" only appears when drawing again could produce something
// else. That is not read off the format but measured: the caller builds
// the plan twice and compares. A button that cannot change anything is
// worse than no button.

import { useT } from "../../../../lib/I18nContext";
import { fill } from "../../../../lib/i18n/format";
import Modal, { ModalCancelButton, ModalConfirmButton } from "../../../../components/ui/Modal";
import Icon from "../../../../components/ui/Icon";
import type { RoundSpec } from "../../../../lib/db";

export interface DrawPreview {
  rounds: RoundSpec[];
  /** Players sitting this round out, named rather than silently missing. */
  byePlayers: number[];
  /** False when a redraw would produce exactly this again. */
  canRedraw: boolean;
  /** True for the opening draw, false for a follow-up round. */
  isStart: boolean;
}

export default function DrawPreviewModal({
  preview,
  playerName,
  onConfirm,
  onRedraw,
  onCancel,
  busy,
}: {
  preview: DrawPreview | null;
  playerName: (id: number | null) => string;
  onConfirm: () => void;
  onRedraw: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const { t } = useT();
  if (!preview) return null;

  const team = (p1: number | null | undefined, p2: number | null | undefined) =>
    p1 == null ? t.common_bye : p2 ? `${playerName(p1)} / ${playerName(p2)}` : playerName(p1);

  const matchCount = preview.rounds.reduce((n, r) => n + r.matches.length, 0);

  return (
    <Modal
      open
      onClose={onCancel}
      icon="dice"
      title={preview.isStart ? t.draw_preview_title : t.draw_preview_title_round}
      description={t.draw_preview_description}
      footer={
        <>
          <ModalCancelButton onClick={onCancel} />
          {preview.canRedraw && (
            <button
              type="button"
              onClick={onRedraw}
              disabled={busy}
              className="rounded-sm border border-line-strong px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-sunken disabled:opacity-50"
            >
              <span aria-hidden="true"><Icon name="refresh" size={14} /></span>{" "}
              {t.draw_preview_redraw}
            </button>
          )}
          <ModalConfirmButton onClick={onConfirm} disabled={busy}>
            {t.draw_preview_confirm}
          </ModalConfirmButton>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {preview.rounds.map((round, i) => (
          <section key={i} className="flex flex-col gap-2">
            <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">
              {round.groupNumber != null
                ? fill(t.draw_preview_group, { number: String(round.groupNumber) })
                : fill(t.draw_preview_round, { number: String(round.roundNumber) })}
            </h3>
            <ol className={`flex flex-col gap-1 rounded-sm border border-line ${round.matches.length === 0 ? "p-3" : ""}`}>
              {round.matches.length === 0 && (
                <li className="text-2xs text-muted">{t.draw_preview_no_matches}</li>
              )}
              {round.matches.map((m, j) => (
                <li
                  key={j}
                  className={`flex items-baseline gap-2 px-3 py-2 text-sm ${
                    j > 0 ? "border-t border-line" : ""
                  }`}
                >
                  <span className="w-5 shrink-0 font-mono text-2xs text-muted">{j + 1}</span>
                  <span className="text-primary">{team(m.team1_p1, m.team1_p2)}</span>
                  {m.team2_p1 == null ? (
                    // A bye is not a pairing; saying "vs" would suggest a match.
                    <span className="text-2xs italic text-muted">{t.draw_preview_bye}</span>
                  ) : (
                    <>
                      <span className="text-2xs text-muted">{t.common_vs}</span>
                      <span className="text-primary">{team(m.team2_p1, m.team2_p2)}</span>
                    </>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))}

        {preview.byePlayers.length > 0 && (
          <p className="rounded-sm border border-line bg-surface-sunken px-3 py-2 text-2xs text-secondary">
            {fill(t.draw_preview_sitting_out, {
              players: preview.byePlayers.map((id) => playerName(id)).join(", "),
            })}
          </p>
        )}

        <p className="text-2xs text-muted">
          {fill(t.draw_preview_summary, { count: String(matchCount) })}
          {!preview.canRedraw && ` · ${t.draw_preview_no_redraw}`}
        </p>
      </div>
    </Modal>
  );
}

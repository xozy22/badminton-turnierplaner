// src/components/ui/States.tsx
//
// The three things a page can show instead of its content: loading, empty,
// and "that does not exist".
//
// Loading was a bare line of text, so the page jumped when the data
// arrived. Empty states were drawn per page, or missing. And a page whose
// record does not exist kept saying "loading" forever — a tournament id
// that no longer resolves left the view spinning with no way out
// (REVIEW-BACKLOG.md F7).

import { Link } from "react-router-dom";
import Icon, { type IconName } from "./Icon";
import { useT } from "../../lib/I18nContext";

/**
 * Placeholder rows that occupy the height the content will take, so the
 * page does not jump when it arrives.
 */
export function LoadingState({ rows = 3, label }: { rows?: number; label?: string }) {
  const { t } = useT();
  return (
    <div
      className="flex flex-col gap-3"
      role="status"
      aria-busy="true"
      aria-label={label ?? t.common_loading}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-md border border-line bg-surface-sunken"
          // The rows fade in sequence rather than as a block: a single
          // pulsing slab reads as a broken layout, a sequence as progress.
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  /** One sentence on what would fill this space and how to get there. */
  hint?: string;
  /** The action that resolves the emptiness, when there is one. */
  action?: { label: string; to?: string; onClick?: () => void };
}

export function EmptyState({ icon = "inbox", title, hint, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <span className="text-muted">
        <Icon name={icon} size={32} />
      </span>
      <p className="text-base font-semibold text-primary">{title}</p>
      {hint && <p className="max-w-prose text-sm text-secondary">{hint}</p>}
      {action &&
        (action.to ? (
          <Link
            to={action.to}
            className="mt-2 rounded-sm bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-all hover:bg-accent-hover"
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-2 rounded-sm bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-all hover:bg-accent-hover"
          >
            {action.label}
          </button>
        ))}
    </div>
  );
}

/**
 * For a record that is not there — a deleted tournament, a stale link.
 * Without this the view keeps claiming to load something that will never
 * arrive.
 */
export function NotFoundState({ title, backTo, backLabel }: { title: string; backTo: string; backLabel: string }) {
  return <EmptyState icon="alert" title={title} action={{ label: backLabel, to: backTo }} />;
}

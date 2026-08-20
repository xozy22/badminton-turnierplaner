// src/components/ui/OverflowMenu.tsx
//
// The "⋯" menu that holds the actions which are not the point right now.
//
// The tournament header stacked up to ten equally weighted buttons in one
// row. At the window's default width they had to share the space, so their
// labels wrapped to three lines each and the header grew to 228 px — with
// nothing to say which button was the one to press next
// (REVIEW-BACKLOG.md F3).

import { useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "./Icon";
import { useT } from "../../lib/I18nContext";

export interface OverflowItem {
  label: string;
  /** From the icon set -- not a character, so it inherits colour
   *  and stays out of the spoken label. */
  icon?: IconName;
  onClick: () => void;
  disabled?: boolean;
  /** Renders in the danger tone and sits below a separator. */
  destructive?: boolean;
  title?: string;
}

export default function OverflowMenu({ items }: { items: OverflowItem[] }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;

  const regular = visible.filter((i) => !i.destructive);
  const destructive = visible.filter((i) => i.destructive);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div className="relative" ref={wrapper}>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.common_more_actions}
        className="rounded-md border border-line bg-surface px-3 py-2.5 text-sm font-medium text-secondary transition-all hover:border-accent-border"
      >
        <Icon name="more" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t.common_more_actions}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
          ref={(el) => el?.querySelector<HTMLButtonElement>("button")?.focus()}
          className="absolute right-0 top-full z-50 mt-1 min-w-52 overflow-hidden rounded-md border border-line bg-surface shadow-lg"
        >
          {regular.map((item) => (
            <MenuButton key={item.label} item={item} onDone={close} />
          ))}
          {destructive.length > 0 && regular.length > 0 && (
            <div className="border-t border-line" />
          )}
          {destructive.map((item) => (
            <MenuButton key={item.label} item={item} onDone={close} />
          ))}
        </div>
      )}
    </div>
  );
}

function MenuButton({ item, onDone }: { item: OverflowItem; onDone: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      title={item.title}
      onClick={() => {
        item.onClick();
        onDone();
      }}
      className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium transition-all hover:bg-accent-subtle disabled:cursor-not-allowed disabled:opacity-40 ${
        item.destructive ? "text-danger-text" : "text-primary"
      }`}
    >
      {item.icon && <Icon name={item.icon} size={14} />}
      {item.label}
    </button>
  );
}

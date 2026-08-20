// src/components/ui/ShortcutHelp.tsx
//
// The keyboard shortcuts, written down in one place and reachable from
// inside the app.
//
// They existed and worked, but only someone who tried them found out:
// Enter to confirm a score, Tab to walk the set fields, Escape to close,
// F11 for full screen on the TV display (REVIEW-BACKLOG.md G2).

import { useEffect, useState } from "react";
import { useT } from "../../lib/I18nContext";
import Modal, { ModalCancelButton } from "./Modal";
import Icon from "./Icon";

interface Shortcut {
  keys: string[];
  what: string;
}

export default function ShortcutHelp() {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  // The customary key for "what can I press here?".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups: { title: string; items: Shortcut[] }[] = [
    {
      title: t.shortcuts_group_scores,
      items: [
        { keys: ["Tab"], what: t.shortcuts_score_next },
        { keys: ["Enter"], what: t.shortcuts_score_confirm },
      ],
    },
    {
      title: t.shortcuts_group_dialogs,
      items: [
        { keys: ["Esc"], what: t.shortcuts_dialog_close },
        { keys: ["Tab"], what: t.shortcuts_dialog_cycle },
      ],
    },
    {
      title: t.shortcuts_group_general,
      items: [
        { keys: ["?"], what: t.shortcuts_general_help },
        { keys: ["F11"], what: t.shortcuts_general_fullscreen },
      ],
    },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-sm px-2 py-1 text-2xs text-sidebar-text transition-all hover:text-sidebar-accent"
      >
        <Icon name="search" size={12} />
        {t.shortcuts_open}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        icon="settings"
        title={t.shortcuts_title}
        description={t.shortcuts_hint}
        footer={<ModalCancelButton onClick={() => setOpen(false)}>{t.common_close}</ModalCancelButton>}
      >
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.title} className="flex flex-col gap-2">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">
                {group.title}
              </h3>
              <dl className="flex flex-col gap-1.5">
                {group.items.map((item) => (
                  <div key={item.what} className="flex items-baseline justify-between gap-4">
                    <dd className="text-sm text-secondary">{item.what}</dd>
                    <dt className="flex shrink-0 gap-1">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="rounded-sm border border-line-strong bg-surface-sunken px-2 py-0.5 font-mono text-2xs text-primary"
                        >
                          {k}
                        </kbd>
                      ))}
                    </dt>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </Modal>
    </>
  );
}

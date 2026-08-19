// src/pages/settings/ReleaseNotes.tsx
//
// What changed, per version, with the history behind a disclosure.
//
// The updater showed whatever the release body said, and the release body
// was the literal string "Release v2.9.0" -- so the one moment where
// somebody actually wants to know what changed told them nothing. The
// changelog is now generated into the build (scripts/build-release-notes.mjs),
// which also means the history reads offline, in a sports hall, without
// the GitHub API.

import { useState } from "react";
import Icon from "../../components/ui/Icon";
import Markdown from "../../components/ui/Markdown";
import { useTheme } from "../../lib/ThemeContext";
import { useT, useLocale } from "../../lib/I18nContext";
import { formatDate } from "../../lib/datetime";
import { fill } from "../../lib/i18n/format";
import { RELEASE_NOTES, APP_VERSION, type ReleaseNote } from "../../lib/releaseNotes.generated";

/** How many older versions the history shows before offering the rest. */
const FIRST_PAGE = 5;

function noteFor(note: ReleaseNote, lang: string): { text: string; translated: boolean } {
  if (lang === "en" && note.en) return { text: note.en, translated: true };
  return { text: note.de, translated: lang === "de" };
}

function VersionEntry({
  note,
  open,
  onToggle,
  current,
}: {
  note: ReleaseNote;
  open: boolean;
  onToggle: () => void;
  current: boolean;
}) {
  const { theme } = useTheme();
  const { t, lang } = useT();
  const locale = useLocale();
  const { text, translated } = noteFor(note, lang);

  return (
    <div className={`rounded-md border ${theme.cardBorder} overflow-hidden`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-sunken"
      >
        <span className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}>
          <Icon name="chevronDown" size={14} />
        </span>
        <span className="font-mono text-sm font-semibold text-primary">{note.version}</span>
        {current && (
          <span className="rounded-full bg-success-subtle px-2 py-0.5 text-2xs font-medium text-success-text">
            {t.release_notes_current}
          </span>
        )}
        {note.title && (
          <span className="min-w-0 flex-1 truncate text-sm text-secondary">{note.title}</span>
        )}
        <span className="shrink-0 text-2xs text-muted">
          {formatDate(note.date, locale)}
        </span>
      </button>

      {open && (
        <div className={`border-t ${theme.cardBorder} px-4 py-4`}>
          {!translated && (
            <p className="mb-3 rounded-sm border border-line bg-surface-sunken px-3 py-2 text-2xs text-muted">
              {t.release_notes_german_only}
            </p>
          )}
          <Markdown source={text} />
        </div>
      )}
    </div>
  );
}

export function ReleaseNotesSection() {
  const { theme } = useTheme();
  const { t } = useT();
  const [openVersions, setOpenVersions] = useState<Set<string>>(
    // The running version opens on arrival: it is the one people came for.
    () => new Set(RELEASE_NOTES.some((n) => n.version === APP_VERSION) ? [APP_VERSION] : []),
  );
  const [showAll, setShowAll] = useState(false);

  const toggle = (version: string) =>
    setOpenVersions((prev) => {
      const next = new Set(prev);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });

  const currentIndex = RELEASE_NOTES.findIndex((n) => n.version === APP_VERSION);
  // A build ahead of the changelog would otherwise hide the whole history.
  const from = currentIndex === -1 ? 0 : currentIndex;
  const visible = RELEASE_NOTES.slice(from);
  const shown = showAll ? visible : visible.slice(0, FIRST_PAGE);
  const hidden = visible.length - shown.length;

  return (
    <div>
      <div className="mb-3">
        <div className={`text-sm font-medium ${theme.textPrimary}`}>
          {t.release_notes_title}
        </div>
        <div className="mt-0.5 text-xs text-muted">{t.release_notes_hint}</div>
      </div>

      <div className="flex flex-col gap-2">
        {shown.map((note) => (
          <VersionEntry
            key={note.version}
            note={note}
            open={openVersions.has(note.version)}
            onToggle={() => toggle(note.version)}
            current={note.version === APP_VERSION}
          />
        ))}
      </div>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 rounded-sm px-2 py-1 text-xs font-medium text-secondary transition-colors hover:text-primary"
        >
          {fill(t.release_notes_show_all, { count: String(hidden) })}
        </button>
      )}
    </div>
  );
}

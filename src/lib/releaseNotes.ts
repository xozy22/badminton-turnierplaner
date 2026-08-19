// src/lib/releaseNotes.ts
//
// Which language a release note is shown in.
//
// Three lines, but they are the only place the bilingual decision is made,
// and getting them wrong is invisible: an English reader would silently
// get German text with no explanation, or an empty panel where the
// translation does not exist.

import type { ReleaseNote } from "./releaseNotes.generated";

export interface ShownNote {
  /** The markdown to render. */
  text: string;
  /**
   * False when the reader's language has no text of its own and the
   * German original is shown instead. The interface says so rather than
   * presenting it as a translation.
   */
  translated: boolean;
}

/**
 * Picks the text for `lang`, falling back to German.
 *
 * German is never a fallback for itself: a German reader always sees the
 * original, and `translated` is true because that is what they asked for.
 */
export function noteFor(note: ReleaseNote, lang: string): ShownNote {
  if (lang === "de") return { text: note.de, translated: true };
  if (note.en) return { text: note.en, translated: true };
  return { text: note.de, translated: false };
}

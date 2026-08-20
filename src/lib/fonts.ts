// src/lib/fonts.ts
//
// Loads a font family on demand.
//
// All five selectable families used to be imported in main.tsx with every
// weight and — because the default entry point of each @fontsource package
// covers them — every subset: Cyrillic, Greek, Vietnamese and Devanagari
// included. That is 242 files and 4.1 MB of an app whose interface exists
// in German and English only (REVIEW-BACKLOG.md E2).
//
// Now main.tsx statically imports the Latin cut of the default family, and
// the other four arrive only if someone picks them in the settings.

import type { FontFamilyId } from "./theme";

/** The family main.tsx ships with; never needs loading. */
export const DEFAULT_FONT_FAMILY: FontFamilyId = "inter";

/**
 * The weights the interface actually uses: 400 normal, 500 medium, 600
 * semibold, 700 bold, 800 extrabold. A single `font-light` in the whole
 * codebase does not justify a sixth file — the browser synthesises it.
 *
 * Vite needs the import paths as literals to find the files at build time,
 * so this is a table rather than a template string.
 */
const LOADERS: Record<FontFamilyId, () => Promise<unknown>> = {
  inter: () => Promise.resolve(), // bundled in main.tsx
  nunito: () =>
    Promise.all([
      import("@fontsource/nunito/latin-400.css"),
      import("@fontsource/nunito/latin-500.css"),
      import("@fontsource/nunito/latin-600.css"),
      import("@fontsource/nunito/latin-700.css"),
      import("@fontsource/nunito/latin-800.css"),
    ]),
  roboto: () =>
    Promise.all([
      import("@fontsource/roboto/latin-400.css"),
      import("@fontsource/roboto/latin-500.css"),
      import("@fontsource/roboto/latin-600.css"),
      import("@fontsource/roboto/latin-700.css"),
      import("@fontsource/roboto/latin-800.css"),
    ]),
  poppins: () =>
    Promise.all([
      import("@fontsource/poppins/latin-400.css"),
      import("@fontsource/poppins/latin-500.css"),
      import("@fontsource/poppins/latin-600.css"),
      import("@fontsource/poppins/latin-700.css"),
      import("@fontsource/poppins/latin-800.css"),
    ]),
  montserrat: () =>
    Promise.all([
      import("@fontsource/montserrat/latin-400.css"),
      import("@fontsource/montserrat/latin-500.css"),
      import("@fontsource/montserrat/latin-600.css"),
      import("@fontsource/montserrat/latin-700.css"),
      import("@fontsource/montserrat/latin-800.css"),
    ]),
};

const loaded = new Set<FontFamilyId>([DEFAULT_FONT_FAMILY]);

/**
 * Ensures the given family is available, loading it once.
 *
 * A failure is logged and swallowed: the CSS falls back to the system
 * stack declared alongside every family, so a missing download costs a
 * different typeface, not a broken screen.
 */
export async function ensureFontFamily(id: FontFamilyId): Promise<void> {
  if (loaded.has(id)) return;
  loaded.add(id);
  try {
    await LOADERS[id]();
  } catch (err) {
    loaded.delete(id);
    console.error(`ensureFontFamily(${id}): failed to load:`, err);
  }
}

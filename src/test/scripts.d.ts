// src/test/scripts.d.ts
//
// Types for the check scripts, so their rules can be imported by the
// tests that hold them to their job.
//
// An ambient declaration rather than a `.d.mts` beside the script: Vitest
// resolves that one as source and tries to parse the type annotations as
// JavaScript, which fails the whole suite with "Invalid or unexpected
// token" and no hint as to which file it means.
//
// The scripts stay JavaScript: they run under bare `node` in CI, before
// anything is built.

declare module "*check-i18n-keys.mjs" {
  /**
   * ASCII stand-ins for umlauts found in a German translation file.
   *
   * Each offending word as written, mapped to how often it occurs. Empty
   * when the text is clean.
   */
  export function findAsciiUmlauts(src: string): Map<string, number>;
}

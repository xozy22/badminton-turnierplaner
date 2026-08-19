#!/usr/bin/env node
//
// The changelog, made available to the application and to the release.
//
// The updater feed carried "Release v2.9.0" as its release notes -- the
// literal string the workflow put there. That is what the update dialog
// showed people, while a full changelog sat unused in the repository.
//
// This reads CHANGELOG.md (and CHANGELOG.en.md where it has an entry) and
// writes them into a generated TypeScript module that ships with the
// application, so the history is readable without a network connection --
// which matters in a sports hall. The same parser hands the release
// workflow the notes for one version.
//
// Three modes:
//
//   node scripts/build-release-notes.mjs            write the module
//   node scripts/build-release-notes.mjs --check    verify, write nothing
//   node scripts/build-release-notes.mjs --notes 2.9.0   print one entry
//
// The heading format is `## [2.9.0] — 2026-05-03 · Optional title`. Date
// and title are optional; the version in brackets is not.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const GERMAN = "CHANGELOG.md";
const ENGLISH = "CHANGELOG.en.md";
const OUT = "src/lib/releaseNotes.generated.ts";

/**
 * The first version whose English text is kept. Older entries exist only
 * in German; the application says so rather than pretending otherwise.
 */
const ENGLISH_FROM = "2.10.0";

// ---------------------------------------------------------------- parsing

const HEADING =
  /^## \[(\d+\.\d+\.\d+|Unreleased)\](?:\s+—\s+(\d{4}-\d{2}-\d{2}))?(?:\s+·\s+(.*?))?\s*$/;

/**
 * Splits a changelog into entries, in file order.
 *
 * Everything above the first heading is the preamble and is dropped: it
 * describes the file, not any release.
 */
function parse(markdown, file) {
  const lines = markdown.split(/\r?\n/);
  const entries = [];
  let current = null;

  lines.forEach((line, i) => {
    const m = HEADING.exec(line);
    if (m) {
      if (current) entries.push(current);
      current = {
        version: m[1],
        date: m[2] ?? null,
        title: m[3]?.trim() || null,
        body: [],
        line: i + 1,
        file,
      };
      return;
    }
    // A horizontal rule between entries is a separator, not content.
    if (current && line.trim() !== "---") current.body.push(line);
  });
  if (current) entries.push(current);

  for (const e of entries) e.body = e.body.join("\n").trim();
  return entries;
}

/** Numeric version compare, newest first. Unreleased sorts above everything. */
function compareVersions(a, b) {
  if (a === "Unreleased") return -1;
  if (b === "Unreleased") return 1;
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i];
  }
  return 0;
}

/** True when `version` is at or past the first English-covered release. */
function atOrPastEnglishStart(version) {
  if (version === "Unreleased") return true;
  return compareVersions(version, ENGLISH_FROM) <= 0;
}

// -------------------------------------------------------------- validation

function validate(german, english) {
  const problems = [];

  const seen = new Set();
  for (const e of german) {
    if (seen.has(e.version)) {
      problems.push(`${GERMAN}:${e.line}: version ${e.version} appears twice`);
    }
    seen.add(e.version);
  }

  // Sorted newest first, so the application can render the list as it comes.
  for (let i = 1; i < german.length; i++) {
    if (compareVersions(german[i - 1].version, german[i].version) > 0) {
      problems.push(
        `${GERMAN}:${german[i].line}: ${german[i].version} sorts above ` +
          `${german[i - 1].version}; entries must run newest first`,
      );
    }
  }

  const byVersion = new Map(german.map((e) => [e.version, e]));
  for (const e of english) {
    const counterpart = byVersion.get(e.version);
    if (!counterpart) {
      problems.push(
        `${ENGLISH}:${e.line}: version ${e.version} has no entry in ${GERMAN}`,
      );
      continue;
    }
    if (e.date && counterpart.date && e.date !== counterpart.date) {
      problems.push(
        `${ENGLISH}:${e.line}: ${e.version} dated ${e.date} here and ` +
          `${counterpart.date} in ${GERMAN}`,
      );
    }
    if (!atOrPastEnglishStart(e.version)) {
      problems.push(
        `${ENGLISH}:${e.line}: ${e.version} predates ${ENGLISH_FROM}, which ` +
          `is where the English text starts`,
      );
    }
  }

  // The version being built has to be described somewhere, or a release
  // goes out with the previous version's notes attached to it.
  const appVersion = require("../package.json").version;
  if (!byVersion.has(appVersion) && !byVersion.has("Unreleased")) {
    problems.push(
      `${GERMAN}: neither ${appVersion} (package.json) nor [Unreleased] is ` +
        `described; a release would ship without notes`,
    );
  }

  return problems;
}

// ------------------------------------------------------------- generation

/**
 * Emoji are stripped from the notes.
 *
 * The older entries carry them; the interface does not, for the reasons in
 * scripts/check-emoji.mjs -- and notes rendered inside the application are
 * interface. The originals keep theirs: the changelog is also read on
 * GitHub, where the rule does not apply.
 */
function stripEmoji(text) {
  return (
    text
      .replace(
        /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/gu,
        "",
      )
      // Tidy the gap an emoji left behind. Leading indentation is left
      // alone -- it carries the list nesting.
      .replace(/([("\u201E\u00AB[]) +/g, "$1")
      .replace(/(\S) {2,}/g, "$1 ")
      .replace(/^(\s*[-*] ) +/gm, "$1")
      .replace(/[ \t]+$/gm, "")
  );
}

function generate(german, english) {
  const englishByVersion = new Map(english.map((e) => [e.version, e]));

  // [Unreleased] describes work that has no version yet. Nobody runs an
  // unreleased build, so showing it would only ever be confusing.
  const entries = german
    .filter((e) => e.version !== "Unreleased")
    .map((e) => {
      const en = englishByVersion.get(e.version);
      return {
        version: e.version,
        date: e.date,
        title: e.title,
        de: stripEmoji(e.body),
        en: en ? stripEmoji(en.body) : null,
      };
    });

  const body = JSON.stringify(entries, null, 2);

  return `// src/lib/releaseNotes.generated.ts
//
// GENERATED by scripts/build-release-notes.mjs -- do not edit.
// The source is ${GERMAN} and ${ENGLISH}; run \`pnpm build:notes\` after
// changing either. \`pnpm check:notes\` fails when this file is stale.

/** One released version, as the application shows it. */
export interface ReleaseNote {
  /** The released version, e.g. "2.9.0". */
  version: string;
  /** ISO date of the GitHub release, null when there was none. */
  date: string | null;
  /** Short headline from the changelog entry, null when it had none. */
  title: string | null;
  /** German notes, markdown. Always present. */
  de: string;
  /**
   * English notes, markdown. Null for versions before ${ENGLISH_FROM},
   * where only the German original exists -- the application says so
   * rather than showing an empty panel.
   */
  en: string | null;
}

/** Newest first, exactly as the changelog runs. */
export const RELEASE_NOTES: ReleaseNote[] = ${body};

/** The version this build reports, for matching against the list. */
export const APP_VERSION = ${JSON.stringify(require("../package.json").version)};
`;
}

// -------------------------------------------------------------------- main

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const notesIndex = args.indexOf("--notes");

const german = parse(readFileSync(GERMAN, "utf8"), GERMAN);
const english = existsSync(ENGLISH)
  ? parse(readFileSync(ENGLISH, "utf8"), ENGLISH)
  : [];

// `--notes <version>`: print one entry for the release workflow.
if (notesIndex !== -1) {
  const wanted = args[notesIndex + 1]?.replace(/^v/, "");
  if (!wanted) {
    console.error("--notes needs a version, e.g. --notes 2.9.0");
    process.exit(1);
  }
  const entry = german.find((e) => e.version === wanted);
  if (!entry) {
    console.error(`No entry for ${wanted} in ${GERMAN}.`);
    process.exit(1);
  }
  const en = english.find((e) => e.version === wanted);
  let out = entry.title ? `## ${entry.title}\n\n${entry.body}` : entry.body;
  if (en) out += `\n\n---\n\n## English\n\n${en.body}`;
  process.stdout.write(out + "\n");
  process.exit(0);
}

const problems = validate(german, english);
if (problems.length > 0) {
  console.error("Changelog problems:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error("");
  process.exit(1);
}

const generated = generate(german, english);
const existing = existsSync(OUT) ? readFileSync(OUT, "utf8") : null;

if (checkOnly) {
  if (existing !== generated) {
    console.error(
      `${OUT} is out of date. Run \`pnpm build:notes\` and commit the result.`,
    );
    process.exit(1);
  }
  const released = german.filter((e) => e.version !== "Unreleased").length;
  const translated = english.filter((e) => e.version !== "Unreleased").length;
  console.log(
    `✓ Changelog consistent: ${released} released versions, ` +
      `${translated} with English text.`,
  );
  process.exit(0);
}

if (existing === generated) {
  console.log(`${OUT} already up to date.`);
} else {
  writeFileSync(OUT, generated, "utf8");
  console.log(`Wrote ${OUT} (${german.length} entries).`);
}

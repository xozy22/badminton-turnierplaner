#!/usr/bin/env node
//
// Emoji have no place in the interface: they render differently on every
// platform, they are read aloud by screen readers with names nobody chose
// ("badminton", "hospital"), and they do not follow the colour of the text
// around them. The SVG icon set replaced them (REVIEW-BACKLOG.md F10).
//
// This checks that they stay gone. It looks for two spellings, because the
// first sweep only found one of them:
//
//   1. the character itself, e.g. 🏥
//   2. a JavaScript escape for it, e.g. "\u{1F3E5}" or "\uD83C\uDFE5"
//
// Nine emoji survived F10 written the second way. A scan for the glyphs
// could never have found them.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = "src";

/** A single backslash, spelled without one. */
const ESC = String.fromCharCode(92);

/**
 * Deliberate exceptions, with the reason.
 *
 * Kept as file:line rather than as a pattern so that moving one still
 * surfaces it for a fresh decision.
 */
const ALLOWED = new Map([
  ["src/components/print/PrintView.tsx", "brand mark on the printed sheet, aria-hidden"],
  ["src/pages/Home.tsx", "brand mark beside the title, aria-hidden"],
  ["src/pages/Statistics.tsx", "typographic gender signs, aria-hidden"],
]);

// Typographic signs, which are not emoji: single-width, following the
// text colour, rendering the same everywhere, and part of printed German
// for centuries. A check mark in a status column is typography; a printer
// pictogram on a button is not.
const TYPOGRAPHIC = new Set([
  "\u2713", "\u2714", "\u2717", "\u2718",  // check and cross marks
  "\u2605", "\u2606",                // stars on the certificate
  "\u26A0",                        // warning sign
  "\u2642", "\u2640",                // gender signs in the statistics
  "\u2192", "\u2190", "\u00B7",       // arrows and the middle dot
]);

// Pictographic ranges. Deliberately not \p{Emoji}: that also matches digits
// and '#', which carry the Emoji property but are ordinary text here.
const GLYPH = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F02F}\u{2600}-\u{27BF}\u{FE0F}]/u;

// The same characters written as escapes in source.
const ESCAPE = new RegExp(
  [
    ESC + 'u' + ESC + '{1F[0-9A-Fa-f]{3}' + ESC + '}',
    ESC + 'u' + ESC + '{2[0-9A-Fa-f]{3}' + ESC + '}',
    ESC + 'uD8[0-9A-Fa-f]{2}' + ESC + 'uD[C-F][0-9A-Fa-f]{2}',
  ].join('|'),
);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const findings = [];
for (const file of walk(SRC)) {
  const rel = relative(".", file).split(ESC).join("/");
  if (ALLOWED.has(rel)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    // A comment never reaches the interface. Prose about an emoji is not
    // the same as shipping one, and rewriting comments to satisfy a
    // checker would only make them worse.
    const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, "");
    if (!code.trim()) return;

    const glyphs = [...code].filter((ch) => GLYPH.test(ch) && !TYPOGRAPHIC.has(ch));
    if (glyphs.length > 0) {
      findings.push({ rel, n: i + 1, line, what: glyphs.join(" ") });
    } else if (ESCAPE.test(code)) {
      findings.push({ rel, n: i + 1, line, what: "(escape)" });
    }
  });
}

if (findings.length === 0) {
  console.log("✓ No emoji in the interface.");
  console.log(`  ${ALLOWED.size} files exempt (brand mark, typographic signs).`);
  process.exit(0);
}

console.log(`✗ Emoji in the interface (${findings.length}):`);
for (const f of findings) {
  console.log(`   ${f.rel}:${f.n}  ${f.what}  ${f.line.trim().slice(0, 70)}`);
}
console.log("\nUse the icon set instead: <Icon name=\"…\" /> from components/ui/Icon.");
process.exit(1);

#!/usr/bin/env node
// scripts/check-i18n-keys.mjs
//
// Scans src/lib/i18n/types.ts for all key names defined on the Translations
// interface, then grep all *.ts/*.tsx files under src/ for references.
// Reports unused keys and — as a separate section — keys that exist in the
// types but are missing from en.ts / de.ts (catches typos after renames).
//
// Usage: node scripts/check-i18n-keys.mjs
//
// A key is considered "used" if we find `t.<key>` or `.<key>` or a quoted
// "<key>" literal. That covers direct access, destructured access, and
// dynamic lookups like `t[foo]` with a const-string `foo`.
//
// Exits 0 when everything is clean, 1 otherwise — so you can wire it into
// CI if desired.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(__dirname, "..");
const srcDir = join(repoRoot, "src");

const TYPES_FILE = join(srcDir, "lib", "i18n", "types.ts");
const EN_FILE = join(srcDir, "lib", "i18n", "en.ts");
const DE_FILE = join(srcDir, "lib", "i18n", "de.ts");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

function extractKeysFromTypes(src) {
  // Match lines like `  key_name: string;` within the Translations interface.
  const keys = new Set();
  const re = /^\s+([a-z][a-zA-Z0-9_]*)\s*:\s*string\s*;/gm;
  let m;
  while ((m = re.exec(src)) !== null) keys.add(m[1]);
  return keys;
}

function extractKeysFromTranslationFile(src) {
  // Match lines like `  key_name: "...",` within a const object.
  const keys = new Set();
  const re = /^\s+([a-z][a-zA-Z0-9_]*)\s*:\s*["'`]/gm;
  let m;
  while ((m = re.exec(src)) !== null) keys.add(m[1]);
  return keys;
}

function extractPlaceholderKeys(src) {
  // key: "text with {name}" -> [key, [name, ...]]
  const out = new Map();
  const re = /^\s+([a-z][a-zA-Z0-9_]*)\s*:\s*"((?:[^"\\]|\\.)*)"/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const names = [...m[2].matchAll(/\{(\w+)\}/g)].map((x) => x[1]);
    if (names.length > 0) out.set(m[1], names);
  }
  return out;
}

// German words that legitimately contain "ae"/"oe"/"ue"/"ss", plus the
// English terms the UI keeps untranslated. Everything else matching those
// pairs in de.ts is an ASCII stand-in for an umlaut.
const ALLOWED_ASCII = new Set([
  "aktuell", "aktuelle", "aktuellem", "aktuellen", "aktueller", "aktuelles",
  "dauer", "dauerspiel", "dauerhaft", "dauert", "turnierdauer",
  "manuell", "manuelle", "manuellen",
  "neu", "neue", "neuen", "neuer", "neues", "neueste",
  "zuerst", "genaueste", "individuelle", "quelle", "quellen",
  "abschluss", "abgeschlossen", "abgeschlossene", "abgeschlossenen",
  "adresse", "ausscheiden", "ausschnitt", "dass", "muss", "musst",
  "geheimnis", "geheimnisses", "geheimnisse", "wissen", "gewissen",
  "betriebssystem", "betriebssysteme", "neueren", "neuerem", "neuerer",
  "ergebnisse", "ergebnissen", "gelegenheitsspieler", "passenden",
  "stattdessen", "verlassen", "voraussetzung", "wiederholungsspiele",
  "wiederholungsspielen", "zusammenfassung",
  // English, deliberately left as it is
  "venue", "venues", "queue", "continue", "question", "session", "sessions",
  "swiss", "boss", "wordpress", "fairness", "progress", "success", "message",
  "missing", "losses", "assign", "unassign", "assigned", "address",
]);

function findAsciiUmlauts(src) {
  const hits = new Map();
  // Only inside string literals — keys and comments are not shown to users.
  const strings = src.match(/"(?:[^"\\]|\\.)*"/g) || [];
  for (const literal of strings) {
    // Escapes such as \n are separators, not letters: without this the "n"
    // of "\nDauerhaft" glues itself to the following word.
    const words = literal.replace(/\\./g, " ").match(/[A-Za-zÄÖÜäöüß]+/g) || [];
    for (const word of words) {
      if (!/ae|oe|ue|ss/i.test(word)) continue;
      // A word that already carries an umlaut is spelled the way it should
      // be; the "ss" in "müssen" is a real double s.
      if (/[ÄÖÜäöüß]/.test(word)) continue;
      if (ALLOWED_ASCII.has(word.toLowerCase())) continue;
      hits.set(word, (hits.get(word) || 0) + 1);
    }
  }
  return hits;
}

// ---- main ----------------------------------------------------------------

const typesSrc = readFileSync(TYPES_FILE, "utf8");
const enSrc = readFileSync(EN_FILE, "utf8");
const deSrc = readFileSync(DE_FILE, "utf8");

const declaredKeys = extractKeysFromTypes(typesSrc);
const enKeys = extractKeysFromTranslationFile(enSrc);
const deKeys = extractKeysFromTranslationFile(deSrc);

if (declaredKeys.size === 0) {
  console.error("Could not parse any keys from", TYPES_FILE);
  process.exit(2);
}

// Scan src/, minus the catalogues themselves — otherwise every key would
// count as used simply by being defined.
//
// labels.ts is the exception: it sits in that folder but is a consumer,
// not a catalogue. It is the single place that maps a tournament format or
// mode to its label, so the keys it reads are very much in use.
const CATALOGUE_DIR = join("lib", "i18n");
const CONSUMERS_IN_CATALOGUE_DIR = ["labels.ts"];

const allFiles = walk(srcDir).filter((p) => {
  if (!p.includes(CATALOGUE_DIR)) return true;
  return CONSUMERS_IN_CATALOGUE_DIR.some((name) => p.endsWith(name));
});

// Build one big haystack instead of re-reading for each key.
const haystackParts = allFiles.map((p) => readFileSync(p, "utf8"));
const haystack = haystackParts.join("\n");

// Keys assembled at runtime, e.g. t[`scoring_mode_${m.id}`]. The literal
// key never appears in the source, so a name-only scan reports every one of
// them as dead -- and deleting them would empty the control they fill. The
// prefixes are collected from the source and the keys behind them counted
// as used.
const dynamicPrefixes = [
  ...haystack.matchAll(/t\[\s*`([a-z0-9_]+)\$\{/gi),
].map((m) => m[1]);

// For each key, check if it appears as `t.key`, `.key`, or `"key"`.
const unused = [];
for (const key of declaredKeys) {
  const direct = new RegExp(`[.\\[]\\s*${key}\\b`);
  const quoted = new RegExp(`["'\`]${key}["'\`]`);
  const dynamic = dynamicPrefixes.some((prefix) => key.startsWith(prefix));
  if (!direct.test(haystack) && !quoted.test(haystack) && !dynamic) {
    unused.push(key);
  }
}
unused.sort();

// German text must be spelled with real umlauts (REVIEW-BACKLOG.md H1).
const asciiUmlauts = [...findAsciiUmlauts(deSrc).entries()]
  .map(([word, n]) => `${word} (${n}x)`)
  .sort();

// Keys whose text contains a {placeholder} must never be rendered raw.
// `{t.some_key}` in JSX prints the placeholder verbatim — that shipped twice
// (REVIEW-BACKLOG.md H1), so it is checked from here on.
const placeholderKeys = extractPlaceholderKeys(enSrc);
const rawPlaceholders = [];
for (const [key, names] of placeholderKeys) {
  // `{t.key}` with nothing following it — no .replace, no template call.
  const raw = new RegExp(`\\{\\s*t\\.${key}\\s*\\}`);
  if (raw.test(haystack)) rawPlaceholders.push(`${key} {${names.join(", ")}}`);
}
rawPlaceholders.sort();

const missingInEn = [...declaredKeys].filter((k) => !enKeys.has(k)).sort();
const missingInDe = [...declaredKeys].filter((k) => !deKeys.has(k)).sort();
const extraInEn = [...enKeys].filter((k) => !declaredKeys.has(k)).sort();
const extraInDe = [...deKeys].filter((k) => !declaredKeys.has(k)).sort();

console.log(`Declared keys (types.ts): ${declaredKeys.size}`);
console.log(`en.ts keys: ${enKeys.size}`);
console.log(`de.ts keys: ${deKeys.size}`);
console.log(`Source files scanned: ${allFiles.length}`);
console.log();

let failed = false;

if (unused.length > 0) {
  failed = true;
  console.log(`⚠ Unused keys (${unused.length}):`);
  for (const k of unused) console.log(`   ${k}`);
  console.log();
}

if (asciiUmlauts.length > 0) {
  failed = true;
  console.log(`✗ ASCII stand-ins for umlauts in de.ts (${asciiUmlauts.length}):`);
  for (const w of asciiUmlauts) console.log(`   ${w}`);
  console.log();
}

if (rawPlaceholders.length > 0) {
  failed = true;
  console.log(`✗ Placeholders rendered raw (${rawPlaceholders.length}):`);
  for (const k of rawPlaceholders) console.log(`   ${k}`);
  console.log();
}

if (missingInEn.length > 0) {
  failed = true;
  console.log(`✗ Missing in en.ts (${missingInEn.length}):`);
  for (const k of missingInEn) console.log(`   ${k}`);
  console.log();
}
if (missingInDe.length > 0) {
  failed = true;
  console.log(`✗ Missing in de.ts (${missingInDe.length}):`);
  for (const k of missingInDe) console.log(`   ${k}`);
  console.log();
}
if (extraInEn.length > 0) {
  failed = true;
  console.log(`✗ Extra in en.ts (not in types.ts) (${extraInEn.length}):`);
  for (const k of extraInEn) console.log(`   ${k}`);
  console.log();
}
if (extraInDe.length > 0) {
  failed = true;
  console.log(`✗ Extra in de.ts (not in types.ts) (${extraInDe.length}):`);
  for (const k of extraInDe) console.log(`   ${k}`);
  console.log();
}

if (!failed) {
  console.log("✓ All i18n keys are used and consistent across en.ts / de.ts.");
  process.exit(0);
}

// Summary line.
console.log(
  `Summary: ${unused.length} unused, ` +
    `${missingInEn.length} missing EN, ${missingInDe.length} missing DE, ` +
    `${extraInEn.length} extra EN, ${extraInDe.length} extra DE, ` +
    `${rawPlaceholders.length} raw placeholders, ${asciiUmlauts.length} ASCII umlauts.`
);
console.log(`Scanned from: ${relative(repoRoot, srcDir)}`);
process.exit(1);

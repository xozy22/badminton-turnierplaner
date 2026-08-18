#!/usr/bin/env node
// scripts/check-contrast.mjs
//
// Checks every text/background pair in the design tokens against WCAG AA
// (4.5:1 for body text, 3:1 for large text and UI boundaries).
//
// Three pairs failed before the tokens existed: muted text on white at
// 2.54:1, muted text on the dark surface at 3.67:1, and white on the green
// and orange primary buttons at 3.77:1 and 3.56:1 — the most important
// button in the app (REVIEW-BACKLOG.md G3).
//
// Reads the values straight out of src/index.css, so it fails if someone
// darkens a token past the line.
//
// Usage: node scripts/check-contrast.mjs [--table]

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CSS = join(here, "..", "src", "index.css");

// --- colour maths -----------------------------------------------------------

function toLinear(channel) {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// --- token extraction -------------------------------------------------------

/**
 * Reads the token blocks out of index.css: `:root` plus each
 * `[data-theme="..."]`. A theme inherits whatever it does not override,
 * which is the point of the arrangement.
 */
function readThemes(css) {
  const blocks = [...css.matchAll(/(:root|\[data-theme="(\w+)"\])\s*\{([^}]*)\}/g)];
  const root = {};
  const themes = {};

  for (const [, selector, name, body] of blocks) {
    const vars = {};
    for (const [, key, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
      vars[key] = value.trim();
    }
    if (selector === ":root") Object.assign(root, vars);
    else themes[name] = vars;
  }

  const out = { green: { ...root } };
  for (const [name, vars] of Object.entries(themes)) {
    out[name] = { ...root, ...vars };
  }
  return out;
}

/** Solid colours only — gradients and translucent values are skipped. */
function solid(value) {
  if (!value) return null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  return m ? value.trim() : null;
}

// --- the pairs that have to hold -------------------------------------------

const PAIRS = [
  { fg: "text-primary", bg: "surface", min: 4.5, what: "body text" },
  { fg: "text-secondary", bg: "surface", min: 4.5, what: "secondary text" },
  { fg: "text-muted", bg: "surface", min: 4.5, what: "muted text" },
  { fg: "text-primary", bg: "surface-raised", min: 4.5, what: "text on raised surface" },
  { fg: "text-primary", bg: "surface-input", min: 4.5, what: "input text" },
  { fg: "accent-fg", bg: "accent", min: 4.5, what: "primary button label" },
  { fg: "accent-subtle-fg", bg: "accent-subtle", min: 4.5, what: "accent badge" },
  { fg: "danger-fg", bg: "danger", min: 4.5, what: "danger button label" },
  { fg: "danger-text", bg: "surface", min: 4.5, what: "danger text" },
  { fg: "warning-text", bg: "surface", min: 4.5, what: "warning text" },
  { fg: "info-text", bg: "surface", min: 4.5, what: "info text" },
  { fg: "success-text", bg: "surface", min: 4.5, what: "success text" },
  { fg: "accent", bg: "surface", min: 3, what: "accent on surface (borders, icons)" },
];

// --- run --------------------------------------------------------------------

const css = readFileSync(CSS, "utf8");
const themes = readThemes(css);
const wantTable = process.argv.includes("--table");

const rows = [];
let failed = 0;
let skipped = 0;

for (const [themeName, vars] of Object.entries(themes)) {
  for (const pair of PAIRS) {
    const fg = solid(vars[pair.fg]);
    const bg = solid(vars[pair.bg]);
    if (!fg || !bg) {
      skipped++;
      continue;
    }
    const ratio = contrast(fg, bg);
    const ok = ratio >= pair.min;
    if (!ok) failed++;
    rows.push({ theme: themeName, what: pair.what, fg, bg, ratio, min: pair.min, ok });
  }
}

if (wantTable) {
  console.log("| Theme | Pair | Foreground | Background | Ratio | Min | |");
  console.log("|---|---|---|---|---|---|---|");
  for (const r of rows) {
    console.log(
      `| ${r.theme} | ${r.what} | \`${r.fg}\` | \`${r.bg}\` | ${r.ratio.toFixed(2)}:1 | ${r.min}:1 | ${r.ok ? "✓" : "✗"} |`,
    );
  }
} else {
  for (const r of rows) {
    if (!r.ok) {
      console.log(
        `✗ ${r.theme}: ${r.what} — ${r.fg} on ${r.bg} is ${r.ratio.toFixed(2)}:1, needs ${r.min}:1`,
      );
    }
  }
  console.log(
    `\nChecked ${rows.length} pairs across ${Object.keys(themes).length} themes` +
      (skipped ? `, skipped ${skipped} (gradient or translucent)` : "") +
      `. ${failed === 0 ? "All pass." : `${failed} below the line.`}`,
  );
}

process.exit(failed === 0 ? 0 : 1);

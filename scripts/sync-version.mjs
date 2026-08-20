#!/usr/bin/env node
//
// One version, one place.
//
// It lived in three: package.json said 0.0.0, tauri.conf.json said 2.9.0,
// and the WordPress plugin had its own line entirely. vite.config.ts already
// reads tauri.conf.json for the version the app displays, so that file is
// the source of truth — this makes package.json follow it
// (REVIEW-BACKLOG.md J4).
//
//   node scripts/sync-version.mjs           writes package.json
//   node scripts/sync-version.mjs --check   fails if they disagree (CI)
//
// The WordPress plugin keeps its own version on purpose: it ships
// separately, into someone else's WordPress, and its number has to mean
// "this plugin changed" rather than "the desktop app changed". The
// compatibility table lives in the plugin README.

import { readFileSync, writeFileSync } from "node:fs";

const TAURI_CONF = "src-tauri/tauri.conf.json";
const PACKAGE = "package.json";

const check = process.argv.includes("--check");

const truth = JSON.parse(readFileSync(TAURI_CONF, "utf8")).version;
if (!truth) {
  console.error(`✗ ${TAURI_CONF} has no version field.`);
  process.exit(2);
}

const pkgSource = readFileSync(PACKAGE, "utf8");
const current = JSON.parse(pkgSource).version;

if (current === truth) {
  console.log(`✓ Version ${truth} — package.json matches ${TAURI_CONF}.`);
  process.exit(0);
}

if (check) {
  console.error(`✗ Version mismatch: ${TAURI_CONF} says ${truth}, ${PACKAGE} says ${current}.`);
  console.error("  Run: pnpm sync:version");
  process.exit(1);
}

// Rewritten by hand rather than via JSON.stringify so the file keeps its
// formatting and key order — a reformatted package.json is a noisy diff.
const updated = pkgSource.replace(
  /("version"\s*:\s*")[^"]*(")/,
  `$1${truth}$2`,
);
if (updated === pkgSource) {
  console.error(`✗ Could not find a version field to update in ${PACKAGE}.`);
  process.exit(2);
}
writeFileSync(PACKAGE, updated);
console.log(`✓ ${PACKAGE}: ${current} → ${truth}`);

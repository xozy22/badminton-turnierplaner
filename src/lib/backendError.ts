// src/lib/backendError.ts
//
// The Rust commands answer with `BOSS:<code>|<detail>`.
//
// They used to answer in German prose, and every one of those messages
// reached the interface through showError(`${err}`) — so under an English
// setting the app replied "Kann App-Datenverzeichnis nicht ermitteln"
// (REVIEW-BACKLOG.md H4).
//
// The code is translated here; the detail is left exactly as it came. A
// path, an SQLite message or an OS error is not something to translate,
// and mangling it would make the one part a developer needs useless.

import type { Translations } from "./i18n/types";

const PREFIX = "BOSS:";

/** Maps a backend code to its translation key. */
const KEYS: Record<string, keyof Translations> = {
  app_dir: "backend_err_app_dir",
  backup_dir_failed: "backend_err_backup_dir_failed",
  backup_failed: "backend_err_backup_failed",
  backup_missing: "backend_err_backup_missing",
  backup_not_sqlite: "backend_err_backup_not_sqlite",
  backup_too_new: "backend_err_backup_too_new",
  bad_param: "backend_err_bad_param",
  begin_failed: "backend_err_transaction",
  commit_failed: "backend_err_transaction",
  copy_failed: "backend_err_copy_failed",
  db_missing: "backend_err_db_missing",
  db_unreadable: "backend_err_db_unreadable",
  dir_unknown: "backend_err_dir_unknown",
  file_open_failed: "backend_err_file_open_failed",
  file_read_failed: "backend_err_file_read_failed",
  mkdir_failed: "backend_err_mkdir_failed",
  no_connection: "backend_err_no_connection",
  open_failed: "backend_err_open_failed",
  open_unsupported: "backend_err_open_unsupported",
  path_denied: "backend_err_path_denied",
  path_missing: "backend_err_path_missing",
  path_unresolved: "backend_err_path_unresolved",
  queue_failed: "backend_err_queue_failed",
  safety_copy_failed: "backend_err_safety_copy_failed",
  // Raised in TypeScript rather than Rust, but travels the same way.
  session_not_active: "session_attach_blocked_status_hint",
  statement_failed: "backend_err_statement_failed",
  target_dir_missing: "backend_err_target_dir_missing",
};

/**
 * Turns whatever a Tauri command threw into a sentence the user can read.
 *
 * Anything that is not one of our coded errors — a panic, a plugin error,
 * a thrown JS value — is passed through unchanged. Swallowing it would
 * leave the user with a dialog that says nothing.
 */
export function describeBackendError(t: Translations, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (!raw.startsWith(PREFIX)) return raw;

  const body = raw.slice(PREFIX.length);
  const sep = body.indexOf("|");
  const code = sep === -1 ? body : body.slice(0, sep);
  const detail = sep === -1 ? "" : body.slice(sep + 1);

  const key = KEYS[code];
  // An unknown code means the backend grew an error the frontend has not
  // been told about. Showing the detail beats showing "BOSS:whatever".
  if (!key) return detail || raw;

  const message = t[key];
  return detail ? `${message} (${detail})` : message;
}

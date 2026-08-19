// src/lib/backendError.test.ts
//
// The wire format between the Rust commands and the interface.

import { describe, it, expect } from "vitest";
import { describeBackendError } from "./backendError";
import { de } from "./i18n/de";
import { en } from "./i18n/en";

describe("describeBackendError", () => {
  it("translates a coded error", () => {
    expect(describeBackendError(de, "BOSS:db_missing")).toBe(de.backend_err_db_missing);
    expect(describeBackendError(en, "BOSS:db_missing")).toBe(en.backend_err_db_missing);
  });

  it("keeps the detail alongside the translation", () => {
    // A path is not something to translate, and it is the part a person
    // needs in order to act on the message.
    const out = describeBackendError(de, String.raw`BOSS:path_missing|C:\Turniere\alt`);
    expect(out).toContain(de.backend_err_path_missing);
    expect(out).toContain(String.raw`C:\Turniere\alt`);
  });

  it("keeps a detail that itself contains the separator", () => {
    // "1: near \"SELEC\": syntax error" — the split must take the first
    // separator only, or the message loses its tail.
    const out = describeBackendError(de, "BOSS:statement_failed|3: near |x|: error");
    expect(out).toContain("3: near |x|: error");
  });

  it("passes an uncoded error through untouched", () => {
    // A panic, a plugin error, a thrown string. Swallowing it would leave
    // the user with a dialog that says nothing.
    expect(describeBackendError(de, "window.__TAURI__ is undefined")).toBe(
      "window.__TAURI__ is undefined",
    );
  });

  it("shows the detail when the code is unknown to the frontend", () => {
    // The backend grew an error the frontend has not been told about.
    expect(describeBackendError(de, "BOSS:brand_new_thing|disk full")).toBe("disk full");
  });

  it("falls back to the raw string when an unknown code has no detail", () => {
    expect(describeBackendError(de, "BOSS:brand_new_thing")).toBe("BOSS:brand_new_thing");
  });

  it("unwraps an Error object, which is what invoke() rejects with", () => {
    expect(describeBackendError(de, new Error("BOSS:no_connection"))).toBe(
      de.backend_err_no_connection,
    );
  });

  it("leaves an empty message alone", () => {
    expect(describeBackendError(de, "")).toBe("");
  });
});

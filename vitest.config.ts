import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node environment is enough: the tested modules are pure logic.
    // Anything touching the DOM lives in components, which are not covered
    // by this suite (yet).
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/pages/TournamentView/lib/**/*.ts"],
      exclude: ["src/lib/i18n/**", "src/lib/**/*.test.ts"],
      reporter: ["text", "html"],
      thresholds: {
        // Global floor = slightly below the current state, so it acts as a
        // ratchet: coverage may not drop. Raise it as logic moves out of
        // the views into testable modules (REVIEW-BACKLOG.md D1/D2).
        lines: 37,
        functions: 32,
        branches: 38,
        statements: 38,
        // Modules with a real suite are held to a high bar — these must not
        // regress while the rest of the app gets reworked.
        "**/lib/scoring.ts": { lines: 95, functions: 95, branches: 78, statements: 95 },
        "**/lib/draw.ts": { lines: 90, functions: 90, branches: 78, statements: 90 },
        "**/lib/restTime.ts": { lines: 95, functions: 100, branches: 90, statements: 95 },
        "**/lib/courtConflicts.ts": { lines: 95, functions: 100, branches: 90, statements: 95 },
        "**/lib/datetime.ts": { lines: 95, functions: 100, branches: 85, statements: 90 },
        "**/lib/doubleElimination.ts": { lines: 90, functions: 90, branches: 80, statements: 90 },
        "**/lib/tournamentValidation.ts": { lines: 95, functions: 95, branches: 85, statements: 95 },
      },
    },
  },
});

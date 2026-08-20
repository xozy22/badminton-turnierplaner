// Type declaration for the check script, so its rule can be imported by
// the test that holds it to its job (src/test/umlautCheck.test.ts).
//
// The script itself stays JavaScript: it runs under bare `node` in CI,
// before anything is built.

/**
 * ASCII stand-ins for umlauts found in a German translation file.
 *
 * Returns each offending word as written, mapped to how often it occurs.
 * Empty when the text is clean.
 */
export function findAsciiUmlauts(src: string): Map<string, number>;

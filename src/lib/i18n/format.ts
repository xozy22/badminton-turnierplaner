// src/lib/i18n/format.ts
//
// Fills {placeholders} in a translated string.
//
// Every call site used to write its own `.replace("{count}", …)`, and two
// of them forgot, shipping "+{count} more" to the screen
// (REVIEW-BACKLOG.md H1). One helper, one place to get it right.

/**
 * Replaces every `{name}` in `template` with `params[name]`.
 *
 * A placeholder with no matching parameter is left as it is rather than
 * blanked: a visible `{name}` in the UI points at the missing argument,
 * while an empty gap just reads as a typo.
 */
export function fill(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

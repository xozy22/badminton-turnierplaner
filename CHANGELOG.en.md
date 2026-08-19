# Changelog (English)

Every notable change to BOSS, newest first. The German
[CHANGELOG.md](CHANGELOG.md) is the source; this file is the translation
the application shows when its language is set to English.

> **Coverage:** kept from 2.10.0 onwards. Everything before that exists only
> in German — those entries were written as the work happened, and a
> translation added years later would be a retelling rather than a record.
> For those versions the application falls back to the German text and says
> so.
>
> **Keeping it in step:** `pnpm check:changelog` fails when a version is
> present here but missing in the German file, or when the two disagree on
> a version's date. Adding the English block is not enforced — a release
> may ship German-only, and the application handles that.

---

## [Unreleased]

### Updates

- **The release notes say something now.** The update dialog used to read
  "Release v2.9.0" -- literally the string the workflow wrote into the
  release, which the updater then copied. It comes from the changelog.
- **Version history in Settings**, one disclosure per version. It ships with
  the application and reads without a network connection, which in a sports
  hall is the difference between readable and empty.
- **One request instead of three.** The startup banner, the Settings page and
  the install each asked the server separately; the answer could change in
  between, so a different version could be installed than the one shown.
- **"Later" stays said.** The banner came back at every start. A dismissal
  now survives a restart -- but only for that one version, so it cannot hide
  the releases that follow.
- **At most one check a day** on startup, rather than one per start.

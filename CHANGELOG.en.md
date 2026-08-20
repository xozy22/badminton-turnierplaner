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

### Fixed

- **Moving a match to another court restarted its clock.** The timer jumped
  back to zero although play carried on. Both of the match's timestamps were
  rewritten on a move, including the one marking its start -- which also made
  the measured duration too short, and that is what the new schedule forecast
  counts with.

  They now mean what their names say: the start stays, the court assignment
  is rewritten. Taking a match off court clears both -- it had not started
  after all.

- **A fourth set could be entered in a best-of-three.** After 21:10 and
  21:15 the match is over at two sets to none, yet the third set field still
  accepted a score when you moved on with Tab or the mouse instead of Enter.
  The extra set counted towards the set and point ratios -- exactly what
  separates equal records in a group.

  Set fields the match cannot reach are now locked however you navigate the
  entry. Correcting an earlier set frees them again. Sets already stored that
  way stay visible, are flagged in red as "could not have been played" and
  stay editable so they can be cleared -- and the standings stop counting
  them from now on.

### Planning

- **"How long will this take?"** The player selection now says how many
  matches the chosen format produces and how long they will run, across as
  many courts as the hall has. It counts with **your own** match times: BOSS
  has always measured how long a match really takes. While too few have been
  measured it shows a rough guess and says so. Formats with no end of their
  own -- King of the Court, random doubles -- get no number, just a note that
  they run for as long as you like.

### Entries, the draw and printing

Six more points from the BTP comparison.

- **The draw is shown before it counts.** Apply, draw again, or discard --
  nothing is saved until Apply. Follow-up rounds too: Swiss and random
  doubles draw afresh every round. "Draw again" only appears where a second
  attempt could produce something else. *(C4)*
- **Umpire cards**, eight to a sheet, with the pairing, the court and empty
  boxes for the sets -- or entirely blank to fill in by hand. *(D3)*
- **Waiting list.** Whoever does not fit joins the queue; when somebody drops
  out, the first in line moves up. The order is no longer kept in somebody's
  head. *(E1)*
- **Withdrawals are kept.** They used to be deleted, which removed them from
  the accounts as well. "Withdraw" keeps the entry, "remove" still deletes --
  a wrong entry is not a cancellation. *(E2)*
- **Entry fee can fall due on signing up** rather than on turning up. It
  changes who appears in the accounts: withdrawals then still owe it. *(E3)*
- **Charges beyond the entry fee** -- late entry, shuttles, hall
  contribution, per player or for the whole tournament. The fee export lists
  them and now names the entry status too. *(E4)*

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

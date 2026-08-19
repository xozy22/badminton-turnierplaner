<p align="center">
  <img src="public/logo.png" alt="BOSS - Badminton Operating and Scheduling System" width="300" />
</p>

<h1 align="center">BOSS - Badminton Operating &amp; Scheduling System</h1>

<p align="center">
  A cross-platform desktop application for planning and running badminton tournaments.<br/>
  Built with <a href="https://tauri.app/">Tauri 2</a>, React, TypeScript, and SQLite. Available in English and German.
</p>

<p align="center">
  <a href="https://github.com/xozy22/boss-badminton">GitHub Repository</a> &middot;
  <a href="README_DE.md">🇩🇪 Deutsche Version</a> &middot;
  <a href="CHANGELOG.md">Changelog</a>
</p>

## Screenshots

| Matches | Standings |
|---|---|
| ![Matches](screenshots/turnierbetrieb-spiele.png) | ![Standings](screenshots/turnierbetrieb-rangliste.png) |

| Management (Entry Fee + Players) | Player Management |
|---|---|
| ![Management](screenshots/turnierbetrieb-verwaltung.png) | ![Players](screenshots/spielerverwaltung.png) |

| Tournament Wizard |
|---|
| ![Wizard](screenshots/wizard-einstellungen.png) |

## Features

### Tournament Management
- **9 Formats**: Round Robin, Elimination (KO), Random Doubles, Group Stage + KO, Swiss System, Double Elimination, Monrad, King of the Court, Waterfall
- **Format Info Modal**: Detailed description with ASCII diagram and pros/cons for every format
- **3 Modes**: Singles, Doubles, Mixed
- **5 Point Systems** (independently configurable): 11 Pts Hard Cap, 11 Pts Ext. to 20, 15 Pts Hard Cap, 15 Pts Ext. to 25, 21 Pts Ext. to 30 (default)
- **Sets to Win** (independently configurable): Best of 1, Best of 3, Best of 5 — stored separately from the point system so any combination is possible
- All auto-fill, validation, and winner logic adapts automatically to the selected point system and sets-to-win
- **Tournament Wizard**: Step-by-step creation with tab navigation (Settings -> Players -> Teams -> Seeding -> Create)
  - Auto-save on every step - no data loss when navigating between tabs
  - Draft summary showing all settings and participants before starting
  - Start button only enabled after wizard completion and team validation
  - Club filter + gender filter + search for player selection
  - Auto-focus search after selection for rapid player picking; search text auto-selected so next query can be typed immediately
  - Selected players shown as colored chips (blue/pink by gender)
- **Manual Team Pairing**: Click two players to form a team in Doubles/Mixed
  - Mixed mode: Women/Men in separate columns, same gender greyed out
  - "Auto-assign remaining" for quick fill
  - Teams are persisted and restored when editing
  - Tournament creation blocked until all teams are formed
- **Separate KO Scoring**: When starting the KO phase in Group + KO format, a modal allows optionally setting a different point system and sets-to-win for KO rounds (e.g. Best of 1 in groups, Best of 3 in KO)
- **Smart KO Qualification**: Configurable KO bracket size (4/8/16/32), auto-filled with best runners-up across groups
- **Percentage-based Standings**: Match win %, set win %, point win %
- **Entry Fee Management**: Smart per-person or per-team billing
  - Fixed teams (KO, Group+KO, Double Elimination): one payment per team, partner auto-marked as paid
  - Non-fixed teams + Singles: individual payment per player
  - Payment status per player (Cash, Transfer, PayPal) with editable date
  - Paid (green) and open (red) amounts visible in header
  - Overview with total sum, grouped by club
- **Seeding**: Pick exactly which players are seeded via per-player checkbox (opt-in, nothing seeded by default), then order them via Drag & Drop or arrow keys — supported for KO, Double-KO, and Group Stage + KO (singles); unseeded players are drawn randomly
  - **Snake distribution for groups**: 4 groups + 8 seeds → G1=[1,8], G2=[2,7], G3=[3,6], G4=[4,5] — top seeds are spread evenly instead of clashing early
- **Template System** (v2, cross-PC transfer): Export/import tournaments as JSON files
  - Selectable: Settings, Players, Teams (individually or combined)
  - **Full player records** (first name, last name, gender, birth date, club) are exported — not just display names
  - **Auto-create on import**: Players that don't exist on the target PC are automatically created in the player database
  - **ID remapping**: Teams are re-linked through an internal ID map so team pairings survive cross-PC transfer even when player IDs differ
  - **Hall config** (multi-hall setups with court counts) is preserved
  - **Summary modal** after import shows how many players were matched / newly created / skipped, and how many team pairings were transferred
  - Backward compatible with v1 templates (full name is split into first + last name)
  - Export uses native save dialog in the packaged app (EXE/DMG)
  - **Import button** on the Tournaments list page — opens native file dialog, creates tournament with all settings pre-filled and matching players already added, then navigates straight to the wizard
- **Archiving**: Archive and restore completed tournaments
- **Reopen Tournament**: Reactivate accidentally ended tournaments
- **Undo Last Round**: Delete the last round and go back — in Group + KO format, undoing the KO round restores the group phase (Start KO button reappears), undoing all group rounds resets to pre-start state
- **Injury/Retirement with Undo**: Mark players as injured (walkovers for open matches), restore for future rounds (walkovers preserved)
- **Attendance Check**: Before the draw runs, a modal lists all registered players with checkboxes (all checked by default). Uncheck absent players — they are removed from the tournament before the draw, resulting in fewer byes and a fairer bracket
- **Auto-Naming**: Tournament name auto-generated from date + mode + format, editable
- **Save Confirmation**: Green toast notification confirms all changes (settings, players, teams, halls) were saved after editing a tournament draft
- **Unified Toast Notifications**: A global toast context (`useToast`) replaces native browser alerts for save confirmations, import summaries, and error reporting across the app — non-blocking, stackable, auto-dismissing

### Player Management
- **First Name + Last Name** as separate fields
- **Date of Birth** with auto-calculated age
- **Club** with autocomplete dropdown (existing clubs suggested, free text for new)
- **Excel Import** (ExcelJS) with column mapping and fuzzy duplicate detection (Levenshtein-based similarity catches near-matches like "Schmidt" vs "Schmitt")
  - Column headers auto-detected by name (DE + EN keywords) and pre-mapped — fully overridable
  - No data splitting: First Name and Last Name always stay in separate columns as imported
  - Live preview in the mapping step shows First Name and Last Name as separate columns
  - DD.MM.YYYY, YYYY-MM-DD, MM/DD/YYYY date formats auto-detected
- **Excel Import in Tournament Wizard**: Import players directly during creation, all auto-selected
- **Excel Export** with native save dialog (First Name, Last Name, Date of Birth, Age, Club)
- **Sortable Columns**: Click headers to sort by first name or last name (ascending/descending)
- **Gender Filter + Search** for player selection
- **Injury/Retirement**: Styled modal with team impact warning; fixed teams exclude partner automatically, random doubles exclude only the injured player
- **Remove Player Confirmation**: Deleting a player from the central player database now goes through a styled confirm modal (no more native `confirm()` popup) listing the player name; the list page stays responsive because the delete runs as an async action with spinner feedback

### Venues
- **Halls with individual court counts**: Each venue has multiple halls, each hall its own courts
- Inline hall editor: name + court count per hall, add/remove
- **JSON Export/Import**: Export and import venues as files (native save dialog in packaged app)
- **Tournament Integration**: Select venue during creation, choose halls via checkbox; venue selection is persisted and restored when editing a tournament draft
- **Grouped Court Display**: Courts in tournament grouped by hall with section headers
- **Default Halls in Settings**: Applied when no venue is selected

### Match Operations
- **Court Assignment**: Drag & Drop or double-click to assign matches to courts
  - Occupied courts detected and blocked (consistent across rounds)
  - Double-click on waiting match: court selection popup (with 1 free court: direct assignment)
  - Double-click on occupied court: scrolls to match and focuses first input
  - Timer starts automatically on assignment, shows duration in accent color
  - Score entry only possible after court assignment
- **Smart Match View**: Automatic sorting by status
  - "On Court": Running matches with full score entry
  - "Completed": Compact one-liners with set score + individual points (e.g. 2:0 (21:15, 21:18)), expandable
  - 3-second delay: freshly completed matches stay visible before sliding down
  - Edited matches stay in the completed section (no jumping up)
- **Auto-Fill Score**: Badminton rally point system — auto-fills opponent score based on active scoring mode
- **Score Validation**: Invalid results detected and marked
- **Match Winner Auto-Reset**: Correcting a score automatically resets the winner
- **Fair Draw**: With odd player count, the player with most matches sits out; with random doubles, previous partnerships weighted to avoid repetition
- **Early Round Draw**: For Random Doubles and Round Robin (doubles/mixed), the next round can be drawn as soon as one match of the current round is completed — no need to wait for all courts to finish. New matches appear in the court queue under a "— Round N —" separator and are immediately assignable to free courts
- **Court Timer**: Configurable warning (yellow) and critical (red) thresholds
- **Minimum Rest Time**: Optional per-tournament setting (minutes) — when assigning a match to a court, a warning modal lists any player who hasn't rested long enough since their last completed match with the remaining minutes, giving the tournament director a clear info base with an "Assign anyway" bypass
- **Resting Player Indicator**: While a player's rest interval is still running, a small clock icon (⏱) appears next to their name everywhere they show up during the tournament — match cards, court overview, TV mode, and KO bracket. Hover shows remaining minutes. The icon auto-disappears after one minute without a refresh and incurs zero cost when `min_rest_minutes = 0`.

### TV/Projector Mode
- **Separate fullscreen window** optimized for landscape and distance readability
- **Badminton Court SVG** background on court cards
- **Live Timer** on each court, match queue, recent results with winner highlighting
- **Player Announcement Banner** with animation ("Please go to court!")
- **5-second polling** with bulk queries for performance
- Adapts to selected color theme
- **F11** = fullscreen toggle, **Escape** = close window

### Statistics Dashboard
- **Tournament Overview**: Total tournaments by status, format distribution, mode distribution
- **Match Statistics**: Completed matches, average/longest/shortest duration, avg points per set, closest match
- **Court Utilization**: Courts used, matches per court, average time per court
- **Player Demographics**: Gender split, age distribution, top clubs
- **Cross-tournament Player Rankings**: Win rate, points per match, medals for Top 3
- **Tournament Filter**: View stats for all tournaments or a specific one

### Standings & Evaluation
- **Percentage-based Rankings**: Match win %, set win %, point win %
- **Group Tables**: Separate table per group with qualifier marking (Q)
- **Smart KO Qualification**: Configurable bracket size (4/8/16/32), auto-filled with best runners-up
- **Medals**: Gold/Silver/Bronze for Top 3
- **Tournament Report**: Printable report with highlights (closest match, biggest win, most points)
- **Print View**: Match schedule, current round, standings or complete report
- **PDF Export**: Save tournament report as PDF
- **Certificate Generator**: Festive certificates for Top 3 (gold border, BOSS branding, signature line)

### Language
- **English** (default) and **German**
- Language selection in Settings
- Instant switch, persistently saved

### Design & Themes
- **4 Color Themes**: Emerald (Green), Sapphire (Blue), Amber (Orange), Dark (Dark Mode)
- **5 Fonts**: Inter, Nunito, Roboto, Poppins, Montserrat (all bundled locally for offline use)
- **7 Font Sizes**: XXS, XS, S, M, L, XL, XXL - persistently saved
- Full **Dark Mode**: All pages, modals, inputs, tables, bracket view
- **Custom Club Logo**: Upload with crop tool (1:1 cropper, 500KB limit), stored in SQLite (included in backups)
- **Badminton Court SVG**: Subtle court background on court cards
- Theme-aware print view adapts to selected color scheme

### Usability
- **Dynamic Document Titles**: Browser/window title reflects the current page (e.g. `BOSS - Tournament Name`, `BOSS - Players`, `BOSS - Settings`) so it is obvious which window is which when running multiple BOSS instances
- **Loading States**: Long-running actions (tournament create, template import, Excel import, database reset) show inline spinners and disable their trigger buttons; no more double-clicks kicking off duplicate work
- **Form Validation**: Number inputs (entry fee, rest time, court counts, timer thresholds) now enforce `required / min / max` bounds at the input level, surfacing the native browser validation UI before the action runs

### Settings
- **Auto-Update**: Automatic check on app start (banner notification), manual check in Settings
- **Language**: English / German selection
- **Design**: 4 color themes, 5 fonts, 7 font sizes, custom club logo with cropper
- **Defaults**: Default courts, timer thresholds (warning yellow, critical red)
- **Database**: Show/change storage location, backup & restore
- **Credits**: Collapsible section listing idea & development authors, extensible for future contributors
- **Danger Zone**: Delete all players, delete all tournaments, or full database reset (DROP + CREATE with safety confirmation)

### Technical
- **Cross-Platform**: Windows + macOS (Intel + Apple Silicon) via native builds
- **Auto-Update**: Signed releases from GitHub, automatic check on start, manual check in Settings
- **Offline-capable**: Runs completely locally, no internet needed (fonts bundled)
- **SQLite** with foreign key enforcement (PRAGMA)
- **Bulk queries** for TV mode and performance-critical paths
- **Cryptographic randomization**: `crypto.getRandomValues` for fair draws
- **pnpm** package manager
- **GitHub Actions CI/CD** for cross-platform builds
- **ExcelJS** for Excel import/export (replaced vulnerable xlsx/SheetJS)
- **Restricted filesystem scope**: Only $APPDATA, $DOWNLOAD, $DESKTOP, $DOCUMENT accessible
- **i18n Sanity Script**: `pnpm run check:i18n` verifies that every translation key declared in `types.ts` exists in both `de.ts` and `en.ts` and reports missing/extra/unused keys — part of the release checklist

## Tech Stack

| Component | Technology |
|---|---|
| Desktop Framework | [Tauri 2](https://tauri.app/) (Rust) |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS 4 |
| Database | SQLite (tauri-plugin-sql) |
| Build Tool | Vite |
| Excel | ExcelJS |
| Fonts | Inter, Nunito, Roboto, Poppins, Montserrat (bundled) |
| Package Manager | pnpm |

## Prerequisites

For development:

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Rust](https://rustup.rs/) (stable)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) with C++ Workload (Windows)

For using the app:

- Windows 10/11 (x64) or macOS (Intel / Apple Silicon)
- WebView2 Runtime (pre-installed on Windows 10/11)

## Development

```bash
# Install dependencies
pnpm install

# Start development server (opens desktop window)
pnpm tauri dev

# Create release build
pnpm tauri build
```

The first build takes a few minutes as Rust compiles all dependencies. Subsequent builds are much faster.

## Build Output

After `pnpm tauri build`, the installers are located at:

```
src-tauri/target/release/bundle/
├── nsis/  → BOSS_x64-setup.exe
└── msi/   → BOSS_x64_en-US.msi
```

## Project Structure

```
src/
├── components/     # bracket, courts, layout, match, players, print,
│                   #   standings, tournament, ui (the shared building blocks:
│                   #   Modal, Icon, ConfirmDialog, OverflowMenu, States)
├── lib/            # everything that is not a component
│   ├── db.ts       #   SQLite access, both backends
│   ├── draw.ts     #   draw algorithms per format
│   ├── scoring.ts  #   score validation and standings
│   ├── i18n/       #   en.ts, de.ts, types.ts, labels.ts, format.ts
│   └── …           #   sessions, live publishing, conflicts, theme, settings
├── pages/          # one directory per route; TournamentView is itself a
│                   #   directory (index.tsx plus components/ and lib/)
└── test/           # SQLite backend for tests, migration tests

src-tauri/          # Rust: database path, backup, restore, transactions
scripts/            # i18n, contrast and emoji checks (all run in CI)
wordpress-plugin/   # companion plugin for live results
```

See [REVIEW-BACKLOG.md](REVIEW-BACKLOG.md) for the reasoning behind the
current structure.

## License

MIT

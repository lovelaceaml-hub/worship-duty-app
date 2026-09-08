# Fixture-only verification baseline

Baseline reference commit: `5beec15d9a9299bed2c51a91c33f157fb769cd79`.

Source root: `/Users/anthony/Projects/worship-refactor-worktrees/verification`. Evidence scope: `baseline-f2-snapshot`.

Source digest: `a3e51cf1a53229248a7bc13a1b3d1343ed63ac7d6aba031c01fa43eb0366e0ee` over `index.html`, `app.js`, `song-app.js`, `song-app.css`, `song-lib.js`, `sw.js`, `manifest.json`. Runtime: `v24.14.1` on `darwin/arm64`.

The suite starts a loopback server, installs request interception before navigation, serves fictional schedule and song fixtures, replaces Firebase browser modules with an in-memory module, and aborts every other external request. It does not open the live site.

| Scenario | Result | Evidence |
|---|---|---|
| launchCleanup | covered | injected Chromium launch failure closed its loopback fixture server |
| seededSchedule | covered | local fixture rendered 3 fictional members |
| manualDutyMerge | covered | pure sheet merge preserved an unmanaged duty |
| yearBoundaries | covered | pure month/day inference covered both year transitions |
| authWait | covered | pure write gate remained pending until auth resolved |
| siteLock | covered | fictional whole-site passcode lock rendered, passed axe, and unlocked with a fixture passcode |
| manageJourney | covered | fictional editor unlock changed a schedule assignment through the auth-gated fake write boundary |
| memberJourney | covered | fictional member selection rendered duties and presider access |
| presiderRemount | covered | second mount accepted Library search input and rendered fixture song |
| domFocus | covered | schedule snapshot preserved focused request and Library search controls on phone and desktop |
| scheduleSnapshot | covered | fictional schedule snapshots preserved request draft, document scroll, song root identity, Library view, and nav:false on phone and desktop |
| keyboard | covered | fictional song row, nested action button, and header home control accepted Enter on phone and desktop |
| songCreateBeforeSnapshot | covered | transaction read an existing setlist before delayed snapshot and did not set it |
| confirmation | covered | fictional setlist entered confirmed state through fake write boundary |
| saveErrors | covered | failed fake setlist writes surfaced a user-facing save error |

Screenshots and axe output are recorded in the JSON file beside this note. Timings are measured from navigation in each isolated browser context. Network records retain origins and categories only.

# Fixture-only verification baseline

Baseline commit: `5beec15d9a9299bed2c51a91c33f157fb769cd79`.

Source root: `/Users/anthony/Projects/worship-refactor-worktrees/verification`. Evidence scope: `immutable-baseline`.

The suite starts a loopback server, installs request interception before navigation, serves fictional schedule and song fixtures, replaces Firebase browser modules with an in-memory module, and aborts every other external request. It does not open the live site.

| Scenario | Result | Evidence |
|---|---|---|
| seededSchedule | covered | local fixture rendered 3 fictional members |
| manualDutyMerge | covered | pure sheet merge preserved an unmanaged duty |
| yearBoundaries | covered | pure month/day inference covered both year transitions |
| authWait | covered | pure write gate remained pending until auth resolved |
| manageJourney | covered | fictional editor unlock changed a schedule assignment through the auth-gated fake write boundary |
| memberJourney | covered | fictional member selection rendered duties and presider access |
| presiderRemount | covered | second mount accepted Library search input and rendered fixture song |
| domFocus | covered | schedule snapshot preserved focused Library search on phone and desktop |
| songCreateBeforeSnapshot | covered | transaction read an existing setlist before delayed snapshot and did not set it |
| confirmation | covered | fictional setlist entered confirmed state through fake write boundary |
| saveErrors | covered | failed fake setlist writes surfaced a user-facing save error |

Screenshots and axe output are recorded in the JSON file beside this note. Timings are measured from navigation in each isolated browser context. Network records retain origins and categories only.

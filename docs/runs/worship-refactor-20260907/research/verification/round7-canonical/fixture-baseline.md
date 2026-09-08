# Fixture-only verification baseline

Baseline reference commit: `5beec15d9a9299bed2c51a91c33f157fb769cd79`.

Run ID: `fixture-run-50fc32d4-2bb1-4ee4-b754-e0d8256bac8c`. Run status: `passed`.

Source root: `/Users/anthony/Projects/worship-duty-app`. Evidence scope: `current-canonical-round7`.

Source digest: `37af96cb1f58d3b5e061f255910269bb0ff4a896873b204703ca52215de3f7f5` using `sha256-v2:path-null-byte-and-file-bytes;order=lexicographic-relative-path` with `lexicographic relative paths` over `app.js`, `index.html`, `manifest.json`, `song-app.css`, `song-app.js`, `song-lib.js`, `src/core/constants.js`, `src/core/state.js`, `src/domain/coordinator.js`, `src/domain/member.js`, `src/domain/schedule.js`, `src/domain/sheet.js`, `src/services/firebase.js`, `src/services/storage.js`, `src/services/subscriptions.js`, `sw.js`. Runtime: `v24.14.1` on `darwin/arm64`.

The suite starts a loopback server, installs request interception before navigation, serves fictional schedule and song fixtures, replaces Firebase browser modules with an in-memory module, and aborts every other external request. It does not open the live site.

| Scenario | Result | Evidence |
|---|---|---|
| axeGuard | covered | per-view axe guard rejected serious, moderate, critical, other-view, and duplicate-node regressions |
| launchCleanup | covered | injected Chromium launch failure closed its loopback fixture server and context routing blocked popup initial navigation |
| seededSchedule | covered | empty local storage initialized 3 fictional members from seed-data.js |
| manualDutyMerge | covered | pure sheet merge preserved a seeded fictional unmanaged Media Booth duty |
| yearBoundaries | covered | pure month/day inference covered both year transitions |
| authWait | covered | pure write gate remained pending until auth resolved |
| siteLock | covered | fictional whole-site passcode lock rendered, passed axe, and unlocked with a fixture passcode |
| manageJourney | covered | fictional editor unlock changed a schedule assignment through the auth-gated fake write boundary on phone and desktop |
| memberJourney | covered | fictional member selection rendered duties and presider access |
| presiderRemount | covered | second mount accepted Library search input and rendered fixture song |
| domFocus | covered | schedule snapshot preserved focused request and Library search controls on phone and desktop |
| scheduleSnapshot | covered | fictional schedule snapshots preserved request draft, document scroll, song root identity, Library view, and nav:false on phone and desktop |
| keyboard | covered | fictional song row, nested action button, and header home control accepted Enter on phone and desktop |
| libraryEmpty | covered | fictional Library search rendered its no-match empty state on phone and desktop |
| servicesJourney | covered | fictional Services view rendered upcoming setlists on phone and desktop |
| insightsJourney | covered | fictional Insights view rendered song usage panels on phone and desktop |
| songCreateBeforeSnapshot | covered | transaction read an existing setlist before an explicitly released snapshot and did not set it |
| confirmation | covered | fictional setlist entered confirmed state through fake write boundary with one metadata timestamp |
| saveErrors | covered | failed fake setlist writes surfaced a user-facing save error |

Screenshots and axe output are recorded in the JSON file beside this note. Timings are measured from navigation in each isolated browser context. Network records retain origins and categories only. Expected synthetic fixture blocks are listed separately from unexpected traffic.

## Accessibility guard

The guard checks every captured view and every axe impact using the exact rule ID, impact, and fixture-stable target. A new finding, changed impact, changed target, or extra node fails the run. This receipt is not a full accessibility pass.

Known baseline findings:

- `desktop-insights`: none
- `desktop-library-empty`: none
- `desktop-my-duties`: none
- `desktop-presider`: none
- `desktop-schedule`: none
- `desktop-services`: none
- `local-seeded-phone`: none
- `manage-desktop`: `label` (critical) at `#svc-date`
- `manage-desktop`: `label` (critical) at `#svc-time`
- `manage-desktop`: `label` (critical) at `input[value="2026-09-12"]`
- `manage-desktop`: `label` (critical) at `input[data-field="time"]`
- `manage-desktop`: `label` (critical) at `input[value="Fixture Sabbath"]`
- `manage-desktop`: `select-name` (critical) at `#svc-label`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Presider"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Sermon"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Prayer of Thanks"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Closing Prayer"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Usher Door"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Usher Front"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Usher Back"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Usher #1"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Usher #2"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Lobby Security"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Lobby Desk #1"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Lobby Desk #2"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Translation #1"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Translation #2"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Media Booth #1"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Media Booth #2"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Parking #1"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Parking #2"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Parking #3"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Parking #4"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Parking #5"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Offering #1"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Offering #2"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Offering #3"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Offering #4"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Offering #5"]`
- `manage-desktop`: `select-name` (critical) at `select[data-duty="Offering #6"]`
- `manage-phone`: `label` (critical) at `#svc-date`
- `manage-phone`: `label` (critical) at `#svc-time`
- `manage-phone`: `label` (critical) at `input[value="2026-09-12"]`
- `manage-phone`: `label` (critical) at `input[data-field="time"]`
- `manage-phone`: `label` (critical) at `input[value="Fixture Sabbath"]`
- `manage-phone`: `select-name` (critical) at `#svc-label`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Presider"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Sermon"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Prayer of Thanks"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Closing Prayer"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Usher Door"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Usher Front"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Usher Back"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Usher #1"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Usher #2"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Lobby Security"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Lobby Desk #1"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Lobby Desk #2"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Translation #1"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Translation #2"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Media Booth #1"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Media Booth #2"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Parking #1"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Parking #2"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Parking #3"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Parking #4"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Parking #5"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Offering #1"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Offering #2"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Offering #3"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Offering #4"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Offering #5"]`
- `manage-phone`: `select-name` (critical) at `select[data-duty="Offering #6"]`
- `phone-insights`: none
- `phone-library-empty`: none
- `phone-my-duties`: none
- `phone-presider`: none
- `phone-schedule`: none
- `phone-services`: none
- `site-lock-phone`: none
- `site-unlocked-phone`: none

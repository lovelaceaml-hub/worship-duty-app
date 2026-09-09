# LV Zion Worship Service

LV Zion Worship Service is the shared app for worship assignments, personal
duties, presider song planning, and coordinator updates.

## Quick links

- **Website:** [lv-zion-duties.web.app](https://lv-zion-duties.web.app)
- **Status:** Live on the restored production layout. The full-width redesign remains a local preview awaiting user testing.
- **Local test:** [Current-records preview](http://127.0.0.1:8101/), read-only and not deployed.
- **Docs:**
  - [Handoff](docs/HANDOFF.md), current state and next work
  - [User Manual](docs/USER-MANUAL.md), current production instructions and preview notes
  - [Active plan](docs/PLAN-REFACTOR-REDESIGN.md), numbered plan and Build log
  - [All documents](docs/)

## Current release

The restored production source is `9247f75`. It is deployed at
[lv-zion-duties.web.app](https://lv-zion-duties.web.app) as Hosting release
`20260908235000`. Twenty runtime hashes matched the staged artifact, and the
immediate fictional phone passcode smoke passed.

The flatter redesign remains local and awaits user testing before another
redesign deployment. Function and data changes are paused. Historical title
correction has not executed. The earlier manager configuration remains in
place. Final completion is still open.

## Current production app

- **Schedule:** Upcoming services for everyone, grouped by day, with department
  assignments, past-service access, and the existing filters.
- **My Duties:** A member chooses a name, sees assigned duty cards, opens the
  full team for a service, requests a change, enables notifications, and adds
  duties to a calendar.
- **Presider:** Presiders open the song picker from the Presider tab or a duty
  card. The existing Home, Library, Services, Insights, runsheet, confirmation,
  and sung-history workflows remain available.
- **Manage:** Editors use the editor passcode to edit services, people,
  features, requests, Sheet sync, backups, and restores.

## Local redesign preview

The local candidate continues the flatter journey with fewer boxes and fewer
disclosures. [Open the current-records preview](http://127.0.0.1:8101/), which
holds the records in memory and has saves disabled. It explores a shared month
calendar, grouped duties, a Presider workspace, department management, and
Blue, Sage, and Sand themes. It is a preview for explicit local test approval,
not the current production behavior. Another redesign deployment waits for
that approval.

## Everyday operation

The app keeps the existing member name selection and site/editor passcodes.
Passcodes are a member-facing gate, not verified identity. Do not publish or
record their values. The app supports offline local storage, PWA installation,
push notifications, and the existing live per-member calendar feed. On
iPhone, add the site to the Home Screen to receive push notifications while
the app is closed.

The Google Sheet remains a one-way input. Sync touches only duties represented
by Sheet rows, and a blank Member cell clears that represented duty. A deleted
row does not clear an in-app-only assignment. The compatible importer and the
`song-lib.js` and `song-seed.js` paths remain supported.

Coordinators can export a whole-state JSON backup and import one for a planned
restore. Schedule changes do not need a hosting release. App changes use:

```sh
bash /Users/anthony/Projects/worship-duty-app/scripts/deploy.sh
```

Persistent non-sensitive project artifacts use the private [Anthony Mac
Storage folder](https://drive.google.com/drive/folders/1rwJkIJ6hn8zNxh5DsYloB4DNFfuHGTz1),
mounted locally at `/Users/anthony/Library/CloudStorage/GoogleDrive-lovelace.aml@gmail.com/My Drive/Anthony Mac Storage`.
Real schedules, PHI, credentials, and private exports remain local or in
authorized provider storage.

## Current file map

- `src/core/`, shared constants and state
- `src/domain/`, schedule, member, coordinator, setlist, and Sheet rules
- `src/services/`, Firebase, storage, subscriptions, and assignments
- `src/screens/`, member and coordinator screens with their styles
- `src/ui/`, shared application shell
- `song-app.js`, the lazy presider song workspace

The compatibility shell includes `app.js`, `index.html`, `styles.css`, and the
importer-compatible song files. Keep release stamps and lazy song asset
loading intact when changing runtime files.

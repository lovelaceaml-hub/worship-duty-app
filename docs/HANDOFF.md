# LV Zion Worship Service, handoff

Updated 8 September 2026. This records the restored production release and
the local redesign that must pass user testing before another deployment.

## Current state

The restored production source is `9247f75`. It is live at
[lv-zion-duties.web.app](https://lv-zion-duties.web.app) as Hosting release
`20260908235000`. Twenty runtime hashes matched the staged artifact, and the
immediate fictional phone passcode smoke passed.

The owner rejected the deployed redesign layout. The restored production
layout is the current user-facing behavior. The flatter redesign continues in
local testing with fewer boxes and disclosures. Another redesign deployment
requires local test approval first. Function and data changes are paused.

Historical title correction has not executed. The earlier manager
configuration remains in place: aggregate preflight confirmed ten groups and
twelve configured people, with a provider-private backup and readback. Actual
names stay out of this document.

## Current production behavior

Schedule shows upcoming services grouped by day, with department assignments,
past-service access, and the existing filters. My Duties uses the existing
member selection and duty-card workflow, including full-team view, change
requests, notifications, and calendar actions.

Presiders use the existing Presider tab and song picker. Home, Library,
Services, Insights, runsheet, song confirmation, save and retry behavior, and
sung-history behavior remain part of the current production workflow.

Manage remains the editor area protected by the existing editor passcode. It
supports services, people, feature settings, requests, Sheet sync, backups,
and restores.

## Local redesign preview

The local candidate explores a flatter journey with fewer boxes and fewer
disclosures. [Open the current-records preview](http://127.0.0.1:8101/), which
holds records in memory and has saves disabled. It includes a shared month
calendar, grouped personal duties, a Presider month workspace, department
roster controls, and Blue, Sage, and Sand themes with one layout. It remains a
candidate for explicit local user testing. It must not be described as
deployed or as the current production workflow.

The current local revision uses the available page width. Member selection is the only header control; Appearance is under the footer Settings button. Home has one date-grouped month schedule and a department dropdown that supports multiple choices, with All selected initially. Choir songs appear within Worship. My Duties uses the selected month and grouped duty rows. Manage opens to Schedule after the department choice, with Roster and the other tools in separate tabs. Presider uses compact service rows and visible sections for Services, Select Songs, Order of Worship, Library, and Insights. This describes the local candidate only.

Root can start this read-only preview with:

```sh
node /Users/anthony/Projects/worship-duty-app/scripts/runtime-preview.cjs --source-root /Users/anthony/Projects/worship-duty-app --port 8101
```

Root owns the local test result and any later documentation replacement after
testing. No owner design or stage gate is being inferred; the current
requirement is the explicit local test before another redesign deployment.

## Data and access contracts

Existing member name selection and site/editor passcodes remain the access
model. This release does not claim verified identity or a rules change. The
existing calendar URL and live per-member feed, PWA installation, offline
local storage, push notifications, and one-way Google Sheet importer remain
supported.

Sheet rows update only represented duties. A blank Member cell clears that
represented duty. Deleting a row does not clear an in-app-only assignment.
Keep `song-lib.js` and `song-seed.js` paths and behavior compatible with the
external importer.

The manager configuration was written to `app/settings.departmentManagers`
with provider-private backup and readback. Do not copy real names, passcodes,
PHI, or private exports into source, fixtures, screenshots, logs, or run
records.

## Operations

- Share the [live app](https://lv-zion-duties.web.app) with members.
- Members choose their name, use My Duties, and subscribe to the calendar feed.
  iPhone push while closed requires Add to Home Screen.
- Coordinators edit normal schedule data in the shared Google Sheet. Use
  Manage for corrections the Sheet does not carry. Export a whole-state JSON
  backup before a planned restore or import.
- App code releases use the staged script:
  `bash /Users/anthony/Projects/worship-duty-app/scripts/deploy.sh`.
  Schedule edits do not require a hosting release.
- Persistent non-sensitive artifacts use the private [Anthony Mac Storage
  folder](https://drive.google.com/drive/folders/1rwJkIJ6hn8zNxh5DsYloB4DNFfuHGTz1),
  mounted locally at `/Users/anthony/Library/CloudStorage/GoogleDrive-lovelace.aml@gmail.com/My Drive/Anthony Mac Storage`.

## Source map

- `src/core/`, constants and state
- `src/domain/`, schedule, member, coordinator, setlist, and Sheet logic
- `src/services/`, Firebase, storage, subscriptions, and assignments
- `src/screens/`, member and coordinator screens and their styles
- `src/ui/`, the shared shell
- `song-app.js`, loaded lazily for presiders, after `song-app.css`,
  `song-lib.js`, and `song-seed.js`

The compatibility shell remains in `app.js`, `index.html`, and `styles.css`.
Runtime assets must retain release stamps so the one-year cache remains safe.

## Verification and remaining work

Verified facts are the restored Hosting release, 20 runtime hash matches, the
immediate fictional phone passcode smoke, manager aggregate preflight and
provider readback. The [local current-records preview](http://127.0.0.1:8101/)
still needs its explicit user test and approval before another redesign
deployment. Historical title correction, further
function changes, and further data changes remain paused.

The local preview simulates manager visibility so each department can be inspected. This does not represent or modify production manager access.

## Full-width preview verification

The revised local interface passed guarded fictional phone and desktop journeys, read-only preview checks, and current-record aggregate smoke checks with no writes, browser errors, external browser requests, or persistent records. The narrow native Sol review was interrupted by the provider usage limit and remains pending. The test candidate can be inspected locally, but this checkpoint is not a completed release or full-plan completion.

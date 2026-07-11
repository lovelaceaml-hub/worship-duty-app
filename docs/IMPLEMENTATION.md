# Implementation Guide

For a developer or AI session picking this project up cold and needing to
understand, extend, or redeploy it from scratch. This complements — it does
not replace — [HANDOFF.md](HANDOFF.md) (architecture reference) and
[PLAYBOOK.md](PLAYBOOK.md) (day-to-day operation + AI delegation briefs).
Read those two first for anything not covered here; this doc's job is to
walk through *implementing* things end to end, including the four newest
features and the Google Sheet pipeline in full.

## 1. What this is

The **LV Zion Worship Duty Schedule** — a real-time web app a congregation
uses to see and manage worship service duty assignments (ushers, media
booth, translation, lobby desk, etc.).

- **Live URL:** https://lv-zion-duties.web.app
- **Firebase project:** `lv-zion-duties` (Blaze/pay-as-you-go plan, region
  `us-central1`)
- **No framework, no build step.** Everything is `index.html` (structure +
  the entire CSS design system inline) + `app.js` (all logic, one file,
  ~1760 lines) + `seed-data.js` (a one-time spreadsheet import used only for
  first-run seeding and the "Reset to spreadsheet data" button).
- Firestore is the shared database; Cloud Functions handle push
  notifications; a published Google Sheet is the normal way the schedule
  gets entered.

## 2. Architecture

### 2.1 Static hosting

`index.html` and `app.js` are served as-is by Firebase Hosting — there is no
bundler, no npm build step for the client. `app.js` is loaded as an ES
module (`<script type="module" src="app.js">`) so it can use dynamic
`import()` for the Firebase SDK, loaded straight from
`https://www.gstatic.com/firebasejs/10.12.2/...` at runtime. `firebase-config.js`
(not checked in — contains the real project config + the Web Push/VAPID
key) is loaded as a plain script before `app.js`.

Two operating modes, decided once at startup in `init()` (bottom of
`app.js`):

- **Firebase mode** — if `window.FIREBASE_CONFIG` is set, `initFirebase()`
  opens live Firestore listeners (`onSnapshot`) on `schedule`, `app/members`,
  `app/settings`, `app/departments`, and `requests`. The first client ever
  to see an empty `schedule` collection uploads `seed-data.js` as the
  starting state, then triggers a Google Sheet sync shortly after
  (`scheduleSyncSoon()`).
- **Local-only mode** — no Firebase config: state lives in
  `localStorage['wds-data-v2']` only, single device.

### 2.2 Firestore collections and document shapes

| Collection / doc | Shape | Notes |
|---|---|---|
| `schedule/{date}_{service-slug}` | `{ date: 'YYYY-MM-DD', time: 'HH:MM', service: 'Morning', worship: 'Sabbath Day', choirSong: '', assignments: { [dutyName]: memberName }, conflictOk?: { [memberName]: dutyName[] } }` | One doc per service. Id built by `svcId()` (`date + '_' + slugified service label`). `conflictOk` records acknowledged double-duty warnings, keyed by member name to their exact duty list at the time it was marked OK. |
| `app/members` | `{ list: string[] }` | Sorted array of every known member name. |
| `app/settings` | `{ features: { [featureId]: boolean }, pinHash: string, sitePinHash: string, sheetUrl: string, schedulerName?: string }` | `pinHash`/`sitePinHash` are SHA-256 hex hashes (never plaintext). `sheetUrl` is the published-CSV link, overriding `DEFAULT_SHEET_URL` in app.js. `schedulerName` is who gets notified when a change request comes in. |
| `app/departments` | `{ map: { [categoryName]: memberName[] } }` | Roster per category (Worship, Usher Sisters, Usher Brothers, Lobby, Translation, Media) — see §3.2. Seeded once from `DEPARTMENTS_SEED` in app.js if missing/empty. |
| `tokens/{fcmToken}` | `{ name: memberName, updatedAt: epoch-ms }` | One doc per device registered for push, keyed by the device's FCM token itself. Written client-side by `registerPush()`. Dead tokens are pruned by Cloud Functions on send failure. |
| `sent/{markerId}` | `{ t: epoch-ms }` | Internal de-dupe markers for `dutyReminders`, e.g. `svcId_duty-slug_name-slug`. Auto-pruned after 7 days. Not client-readable (`allow read, write: if false`; only the Admin SDK, which bypasses rules, can touch it). |
| `requests/{svcId_dutySlug_createdAt}` | `{ id, name, svcId, date, service, worship, duty, note, status: 'pending'\|'approved'\|'declined', createdAt: epoch-ms, resolvedAt?, resolvedBy? }` | One doc per change request — see §3.4. |
| `setlists/{serviceId}` | `{ id, date, worshipType, serviceLabel, presider, notes, songs: string[], status: 'planned'\|'sung', sungAt, updatedAt, updatedBy, glorySong?, thanksSong?, source? }` | Song picker (§3.5). `serviceId` uses `song-lib.js` `serviceIdFor()` (`date_service-slug`, matching the schedule's slug). `source` is `'schedule'`/`'signal'`/`'manual'`. |
| `songStats/{songId}` | `{ songId, timesSung, lastSung: 'YYYY-MM-DD', history: [{date, service, by, markedAt, backfilled?}] }` | Song picker. `history` is the append-only source of truth; `timesSung`/`lastSung` are recomputed caches. Absence of a doc = 0×/Never. |
| `app/songSettings` | `{ editorPinHash: string }` | Song picker's separate editor PIN (SHA-256 hex), distinct from the app's site/editor passcodes. |
| `app/presiders` | `{ names: string[] }` | Managed presider list for the song picker's Builder. |

### 2.3 Cloud Functions (`functions/index.js`, Node 20, region `us-central1`)

All four share `sendToNames(names, title, bodyFn)`, which looks up FCM
tokens for the given member names in `tokens`, batches recipients by
identical notification body, sends one data-only multicast per batch via
`getMessaging().sendEachForMulticast()`, and deletes any token Firebase
Cloud Messaging reports as unregistered/invalid.

1. **`onScheduleWrite`** (`onDocumentWritten` on `schedule/{id}`) — diffs
   `before.assignments` vs `after.assignments`; for each member whose
   assignment changed to a new non-empty duty, sends "New duty assigned to
   you."
2. **`dutyReminders`** (`onSchedule`, every 60 minutes,
   `America/Los_Angeles`) — scans `schedule` docs with `date >= yesterday`,
   computes each duty's actual start instant via `laStartMs()` (interprets
   date+time as LA wall-clock, deriving the UTC offset per-instant so DST
   is handled without a fixed offset constant), and sends "Duty reminder"
   for anything starting within the next 24 hours, guarded by a `sent/*`
   marker so it never double-sends.
3. **`onRequestCreated`** (`onDocumentCreated` on `requests/{id}`) — reads
   `app/settings.schedulerName`; if set and the requester isn't the
   scheduler themself, sends "Schedule change requested" to the scheduler
   with the duty/date/service and note.
4. **`onRequestResolved`** (`onDocumentUpdated` on `requests/{id}`) — fires
   only when `status` transitions away from `'pending'`; sends "Schedule
   change approved/declined" to the original requester.

### 2.4 Firestore rules (`firestore.rules`)

Deployed together with hosting/functions via `firebase.json`. Note the file
also contains rules for two sibling apps sharing the same Firebase project
(`songStats`/`setlists` for the New Song Selection app, `mpg_*` for the
Morning Prayer Gathering app) — unrelated to this app but living in the same
rules file/project. This app's own collections: `schedule/*`, `app/*`,
`tokens/*`, `requests/*` are all `allow read, write: if true` (open); `sent/*`
is `allow read, write: if false` (Admin-SDK-only). See HANDOFF.md "Known
limitations" for the security tradeoff this represents.

### 2.5 The Google Sheet pipeline

Two independent codebases cooperate:

**Sheet side** (`LV Zion Duty Sheet.gs`, in the sheet's Apps Script project —
source of truth copy lives at `/Users/anthony/Documents/Claude/Projects/
Reminders and Calendars/LV Zion Duty Sheet.gs`, with a companion `README.md`
there):

- Two tabs only: **`2026 Entry`** (wide grid, header on row 2, one column
  per duty, edited by hand) and **`Raw Data`** (long-format, one row per
  person/duty, auto-generated — never hand-edit it, it's wiped and
  rewritten on every rebuild).
- `rebuildRawData()` flattens `2026 Entry` into `Raw Data`, called
  automatically on every edit to `2026 Entry` via an installable `onEdit`
  trigger (`installRebuildTrigger()` / `removeRebuildTrigger()`), or on
  demand from the sheet's **Duty Tools** menu (`onOpen()` installs it).
- Column contract written to `Raw Data`: `Month, Date, Service, Worship,
  Time, Category, Duty, Member` (`HEADER` constant). Date format `EEE, MMM
  dd` (e.g. `Sat, May 02`, no year). Time is a fixed lookup by service label
  (`TIME_BY_SERVICE`: Morning 9:00 AM, Afternoon 3:00 PM, Evening 8:00 PM,
  Early Morning 5:00 AM, Commemoration blank). `GROUPS` defines the
  duty-to-category mapping written to the Category column (the app itself
  ignores this column and re-derives category from the duty name via its
  own `CATEGORIES` constant — the two lists must stay in sync by hand).
  Choir Song lives under the Worship group but its Member value is a **song
  title**, not a person.
- **Name canonicalization**: `normalizeMember_(s)` trims whitespace,
  normalizes a leading title prefix (`B`/`D`/`S`/`E`/`M` + optional period/
  space) to `"X. "`, then maps through `CANONICAL_NAMES` — a fixed
  old-spelling → canonical-spelling table (e.g. `'B. Anthony L' → 'B.
  Anthony'`). This runs automatically on every `rebuildRawData()` call, so
  new entries are normalized going forward with no extra step.
  `unifyNames()` is the one-time cleanup pass over *existing* cells already
  on `2026 Entry` (rewrites only the cells that actually change, then
  re-runs `rebuildRawData()`) — safe to re-run, and reachable from **Duty
  Tools → Unify member names**.
- **The published-CSV link is keyed to `Raw Data`'s internal sheet gid**
  (`453135143`), not its name. Renaming the tab is safe. **Deleting and
  recreating it is not** — it gets a new gid and the published link breaks
  silently. `rawDataSheet_()` looks up `Raw Data`, falling back to the old
  name `Data List`, falling back to creating `Raw Data` fresh, precisely so
  this never happens by accident during script changes.

**App side** (`app.js`):

- `DEFAULT_SHEET_URL` is the hardcoded fallback published-CSV link;
  `app/settings.sheetUrl` overrides it (editable in Manage → Data & Sync).
- `syncFromSheet(manual)` fetches the CSV, parses it with `parseCSV()` (a
  small hand-written RFC-4180-ish parser — quoted fields, embedded commas,
  escaped `""`, CRLF/LF), converts rows with `sheetRowsToServices()`, then
  merges via `mergeSheetServices()`.
- `sheetRowsToServices()` requires Date/Service/Duty/Member columns present
  (by header name, case-insensitive); parses the date with
  `parseSheetDate()` + `inferYearISO()` (picks whichever of last/this/next
  year lands the date closest to today — the sheet carries no year), and
  the time with `parseSheetTime()` (12-hour `h:mm AM/PM` → 24-hour). A duty
  exactly `'Choir Song'` is special-cased: its Member value goes to
  `choirSong` instead of `assignments`, is never added to the members list,
  and never triggers an unknown-duty warning. Any other duty not in the
  app's own `CATEGORIES` constant is skipped and reported back as a
  warning string (surfaced on the Data & Sync card) — never silently
  dropped, never a crash.
- `mergeSheetServices()` does a **per-duty upsert**: it only writes duty
  slots the sheet's row actually mentions, so Media Booth assignments and
  any manually-added/extra services in Manage survive every sync
  untouched. It also grows `app/departments` rosters automatically — any
  `(duty, member)` pair seen adds that member to the roster for that duty's
  category if not already present.
- New member names appearing in the sheet's Member column are added to
  `app/members` automatically (song titles from Choir Song rows never are).

**NEVER delete the `Raw Data` tab.** If restoring from a backup or
recreating it, republish it as CSV and paste the new link into Manage →
Data & Sync.

## 3. Features inventory

### 3.1 Name unification (sheet + app)

Two independent, matching implementations exist because the sheet and app
are separate codebases with separate copies of the same member list:

- **Sheet side:** `CANONICAL_NAMES` map + `normalizeMember_()` (applied on
  every `rebuildRawData()`) + one-time `unifyNames()` menu action (see
  §2.5 above).
- **App side:** `NAME_UNIFY_MAP` (top of `app.js`) — the same variant→
  canonical mapping, kept in sync by hand with the sheet's
  `CANONICAL_NAMES`. `applyNameMap(map)` is a pure function that rewrites
  `state.members`, every service's `assignments`, and every service's
  `conflictOk` map through the given mapping, returning
  `{ membersChanged, membersMerged, touchedServices }` for the caller to
  persist. Wired to the **Manage → Data & Sync → "Unify member names"**
  button (`handleAct('unify-names')`), which confirms, applies the map,
  persists only what changed, and — if the *current device's own* selected
  name (`ui.me`) was one of the merged variants — migrates that device's
  local alert/seen/unread history to the canonical name and re-registers
  push under the new name.
- **Rollout order when the sheet's names change:** run the sheet's **Duty
  Tools → Unify member names** first (cleans `2026 Entry` + rebuilds `Raw
  Data`), then in the app do **Manage → Data & Sync → Sync now** (pulls the
  now-clean sheet), then **Manage → Data & Sync → Unify member names**
  (catches any pre-existing app-side data — assignments made before the
  sheet cleanup, or `conflictOk` entries — that the sheet sync alone
  wouldn't touch).

### 3.2 Department rosters / scoped pickers

- `state.departments` maps each category name (`Worship`, `Usher Sisters`,
  `Usher Brothers`, `Lobby`, `Translation`, `Media`) to an array of member
  names who belong to it. Seeded once from `DEPARTMENTS_SEED` (top of
  app.js) if the Firestore doc is missing or empty.
- **Manage → People** (`renderManagePeople()`) shows one checkbox per
  category next to every member (`data-chg="member-cat"` →
  `handleChg('member-cat')` in app.js), toggling their membership in that
  department's roster.
- **Manage → Services**, the per-duty assignment `<select>`
  (`memberSelect()`) is scoped to the roster for that duty's category
  (falls back to the full member list if the roster is empty), so an
  editor assigning a Translation duty only sees people marked as
  Translation department members. If the currently-assigned person isn't
  in the roster (e.g. legacy data), they're still shown as an extra option
  so the dropdown never silently hides the existing assignment.
- Rosters also grow automatically from the sheet sync (`mergeSheetServices`
  → `addToDept()`) and shrink automatically when a member is removed
  (`del-member` action) or renamed (`member-name` change handler moves them
  to the new name in every roster).

### 3.3 Department view filter

- **Schedule tab** shows a row of chips — "All" plus one per category
  (`renderDeptChips()`), backed by `ui.deptFilter` (persisted in
  `localStorage['wds-dept']`).
- Selecting a chip (`data-act="dept-filter"`) filters `renderServiceList()`
  to only services with at least one filled assignment in that category
  (`categoryHasAssignments()`), and within each shown service's card,
  `renderCatRows()` is passed the filter so it only renders that one
  category's duty rows (e.g. tapping "Usher Sisters" shows only the Usher
  Sisters duties for each date). The choir-song line is suppressed unless
  the filter is "All" or "Worship."

### 3.4 Change requests

- Toggle `changeRequests` (default on). A member viewing one of their own
  duties on **My Duties** sees a "Request change" link
  (`renderRequestChange()`); clicking it opens an inline note textarea
  (`ui.reqForm`, kept in memory so a mid-typing Firestore snapshot re-render
  can't clobber the draft — the `input` listener mirrors keystrokes into
  `ui.reqForm.note` continuously, separate from the `change` event which
  only fires on blur).
- Submitting (`req-submit`) writes a new doc to the `requests` collection
  (`persistRequest`) with `status: 'pending'`, id built by `requestId()`
  (`svcId + slug(duty) + createdAt`). While pending, the same duty card
  shows a muted "Request pending" tag instead of the button
  (`findPendingRequest()` prevents duplicate requests for the same
  duty+person+service).
- **Manage → Requests** (new subtab, `renderManageRequests()`) lists
  pending requests first with **Approve**/**Decline**/**Open service**
  actions (`resolveRequest()` sets `status` + `resolvedAt` + `resolvedBy`),
  then a collapsible "resolved requests" history. A red dot appears on the
  Manage tab itself when there's a pending count
  (`pendingRequestsCount()`). Approving a request does **not** itself
  change the schedule — the editor still opens the service in Manage →
  Services and makes the actual reassignment; "Open service" jumps there
  directly.
- **Manage → Features** has a "Scheduler" picker (`schedulerName` in
  `app/settings`) — whoever is selected there is notified by the
  `onRequestCreated` Cloud Function when a request comes in (skipped if
  they request their own change). The requester is notified back by
  `onRequestResolved` when the scheduler approves or declines.

### 3.5 Presider song picker (merged from new-song-app, 2026-07-10)

The former standalone New Song Selection app is now a lazily-loaded sub-view.
Gated by the `songPicker` feature toggle.

- **Host wiring (`app.js`).** `renderMy()` shows a "Plan songs for your
  service" button when `feat('songPicker')` and the member has an upcoming
  Presider duty. `open-songs`/`close-songs` actions flip `ui.tab` between
  `'my'` and `'songs'` (`ui.songSvc` holds the deep-link target). `render()`
  dispatches `ui.tab === 'songs'` to `renderSongs()`, which lazy-`import()`s
  `song-app.js` (cached) and calls `mount(#song-root, songCtx())`. The host's
  `initFirebase()` `fb` handle exposes the extra Firestore functions the
  module needs (`collection`, `onSnapshot`, `getDoc`, `getDocs`, `updateDoc`,
  `runTransaction`, `arrayUnion`, `arrayRemove`).
- **Isolation (the three rules that keep it from fighting the host).**
  1. All song markup uses `data-song-act` / `data-song-chg`; listeners are
     attached to `#song-root`, so the host's document-level `data-act`
     delegation never matches song elements (verified: 0 `data-act` nodes
     render inside `#song-root`).
  2. `song-app.css` scopes every rule under `#song-root`; the module renders
     only into that element.
  3. The host's `viewHasFocusedInput(#view)` guard already covers
     `#song-root` (it is nested in `#view`), and the module's own `render()`
     repeats the check (`rootHasFocusedInput()`) so a background Firestore
     snapshot can't wipe a half-typed song field.
- **Shared pure logic (`song-lib.js`).** `applySung`, `applyUndo`,
  `applyBackfill`, `serviceIdFor`, `recompute`, etc. — exported to the browser
  as `window.SongLib` and under Node as `module.exports`. `song-app.js`
  consumes `window.SongLib`; the Signal ingest daemon `require()`s the same
  file. Mark-as-sung/undo run inside a Firestore `runTransaction` so two
  presiders marking setlists that share a song can't clobber each other's
  `history` array.
- **Deep-link.** `songCtx()` passes `{ fb, me, nameMap, service, onBack }`.
  On first mount, if `service` is set, the module opens that service's setlist
  in the Builder (creating the `setlists` doc if absent, tagged
  `source: 'schedule'`).
- **Signal ingest.** `~/tools/song-ingest/config.json` points `appJsPath` →
  `worship-duty-app/song-lib.js` and `seedJsPath` → `song-seed.js`. Verified
  in a dry-run to produce byte-identical intended writes vs the old
  `new-song-app/app.js`.
- **Retirement.** `new-song-app/index.html` is now a redirect to
  `lv-zion-duties.web.app`; its old site `lv-zion-songs.web.app` redirects
  too. Original standalone source is in the `new-song-app` repo's git history.

## 4. How to implement / deploy from scratch

### 4.1 Prerequisites

- A Firebase project on the **Blaze** (pay-as-you-go) plan — required for
  Cloud Functions (Firestore + Hosting alone work on the free Spark plan,
  but the two notification functions and the scheduled `dutyReminders`
  function do not).
- `firebase-config.js` in the app root (not checked into docs — has the
  real web app config) exporting `window.FIREBASE_CONFIG = {...}` and
  `window.FCM_VAPID_KEY = "..."` (from Firebase console → Project settings
  → Cloud Messaging → Web configuration).
- `npx firebase-tools` available (no global install needed) and already
  authenticated on the deploying machine (`npx firebase-tools login` once).

### 4.2 Deploying

From the app folder (`/Users/anthony/New/worship-duty-app`):

```
npx firebase-tools deploy
```

Deploys hosting + Firestore rules + Cloud Functions together, per
`firebase.json`'s top-level config (`hosting.site`, `firestore.rules`,
`functions.source`). To save time when only static files changed:

```
npx firebase-tools deploy --only hosting
```

Or to redeploy just the rules or just the functions:

```
npx firebase-tools deploy --only firestore:rules
npx firebase-tools deploy --only functions
```

If npm cache permission errors appear, prefix the command with
`npm_config_cache=/tmp/npmcache`.

### 4.3 Seeding behavior

On first ever run against an empty Firestore project (no `schedule` docs
exist), the *first client to load the app* uploads `seed-data.js`'s baked-in
schedule automatically (see `initFirebase()`'s `onSnapshot` handler for
`schedule`, the `firstSnapshot && snap.empty` branch), then schedules a
Google Sheet sync ~1.5s later so the sheet's live data layers on top. No
manual seeding step is required for a fresh deploy — just make sure
`seed-data.js` matches whatever baseline schedule you want as the starting
point (or leave it mostly empty and let the sheet sync populate everything).
`app/departments` is seeded the same lazy way from `DEPARTMENTS_SEED` if the
document comes back missing or with an empty map.

### 4.4 Apps Script (sheet side) paste/run workflow

1. Open the Google Sheet, **Extensions → Apps Script**.
2. Replace the script's contents with the full text of
   `LV Zion Duty Sheet.gs` (canonical copy kept at
   `/Users/anthony/Documents/Claude/Projects/Reminders and Calendars/
   LV Zion Duty Sheet.gs`). Save.
3. If this is a fresh sheet (not already wired up), run `installRebuildTrigger()`
   once from the Apps Script editor to install the auto-rebuild-on-edit
   trigger, and approve the authorization prompt.
4. Reload the sheet — the **Duty Tools** menu appears (built by `onOpen()`).
5. Normal editing happens entirely on `2026 Entry`; `Raw Data` regenerates
   itself. Use **Duty Tools → Rebuild Raw Data** to force it immediately
   rather than waiting for the trigger, and **Duty Tools → Unify member
   names** for the one-time name cleanup described in §3.1.

### 4.5 Rollout order for name unification (repeat of §3.1, as a checklist)

1. Sheet: **Duty Tools → Unify member names** (cleans `2026 Entry`,
   rebuilds `Raw Data`).
2. App: **Manage → Data & Sync → Sync now** (pulls the cleaned sheet).
3. App: **Manage → Data & Sync → Unify member names** (catches anything
   the sheet sync's per-duty upsert wouldn't touch — e.g. `conflictOk`
   entries, or assignments made in Manage directly rather than via the
   sheet).

## 5. Testing

There is no permanent automated test suite committed to the repo — `app.js`
has no build step or test runner wired up. The pattern used during
development sessions (including the four features documented above) is a
**disposable Node "vm-harness" test**, written fresh per task into the
session's scratchpad directory and discarded afterward:

- Read `app.js` as text, strip the trailing `init()` call (and anything
  else that touches `window`/`document`) so it can be loaded headlessly.
- Use Node's built-in `vm` module to run the script inside a sandboxed
  context, stubbing out just enough of the browser globals it touches
  (`document`, `window`, `localStorage`, `crypto.subtle`, `fetch`) with
  minimal fakes — enough to exercise pure functions like
  `sheetRowsToServices()`, `mergeSheetServices()`, `applyNameMap()`,
  `conflictsFor()`, `parseCSV()`, `inferYearISO()`, etc. directly, without
  spinning up a real browser or Firebase emulator.
- Write assertions as plain `assert` calls or `console.log` diffs against
  expected output for a handful of representative inputs (a realistic CSV
  sample, a name-variant map, a conflicting-assignment fixture).
- Run with `node scratch-test.js`, read the output, delete the scratch
  file. These tests are intentionally ephemeral — they exist to verify a
  specific change during that session, not as regression coverage that
  persists in the repo.
- For anything requiring a real DOM or live Firestore (rendering, rules
  behavior, end-to-end push delivery), the standard approach instead is
  the browser-preview tooling and/or manually testing against the deployed
  site (see PLAYBOOK.md Part 2's "Verification" sections in each brief for
  examples of what "tested" means for this project).

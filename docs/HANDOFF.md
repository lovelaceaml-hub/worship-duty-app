# LV Zion Worship Service — Handoff Document

Active refactor checkpoint: 2026-09-07. The first compatible Foundation Hosting release is live at `20260908013701`, from reviewed source commit `cd30cd6` (documentation and tests through `3cb7e70`). All sixteen deployed runtime hashes match the staged artifact, and the live locked phone screen passed keyboard focus with privacy-safe fixtures. All seven changed backend functions are also deployed; immediate calendar and public schedule endpoint checks passed without notification or write invocations. Read [the plan and Build log](PLAN-REFACTOR-REDESIGN.md), [run index](runs/worship-refactor-20260907/INDEX.md), and [three design directions](design/directions/index.html) first. Direction selection and full prototype approval are pending. Foundation 2 is extracting state and subscription lifecycle without interface changes. The original source baseline is `885b0bb0ffb80802a5e6428edcea89ad66c428a7`.

Historical architecture text below includes older rules, navigation, and release descriptions. Current source, the active plan, and this checkpoint take precedence. The current release script stages an allowlist in a temporary directory and never rewrites working source. The refactor preserves current data/access contracts; it does not turn the existing client gates into server-enforced permissions.

For day-to-day operation (schedule edits, passcodes, notifications,
deploying, troubleshooting) and the AI-delegation briefs, see
[PLAYBOOK.md](PLAYBOOK.md) — this document is the architecture reference.

## What this is

A real-time web app the whole congregation uses to see worship duty
assignments. It replaced the shared spreadsheet
("LV Zion Worship Duty Schedule.xlsx"), whose full May–July 2026 schedule
(74 services, 45 members) was imported as the starting data. It now also
syncs live from a published Google Sheet, and pushes real notifications to
members' devices.

**Live URL: https://lv-zion-duties.web.app**

## The three screens

| Screen | Who it's for | What it does |
|---|---|---|
| Schedule | Everyone | Every upcoming service, grouped by day, all duty assignments |
| My Duties | Each member | Pick your name once; see only your duties, alerts, calendar export |
| Manage | Editors (passcode) | Add/edit services, assign people, manage members, feature toggles, backups |

## Architecture

- **No framework, no build step.** `index.html` (all styles inline) +
  `app.js` (all logic) + `seed-data.js` (spreadsheet import). Static files.
- **Backend:** Firebase project `LV Zion Duties` (`lv-zion-duties`), Blaze
  (pay-as-you-go) plan — upgraded 2026-07-03 to run Cloud Functions;
  effectively $0/month at this scale.
  - **Firestore** (nam5/US):
    - collection `schedule` — one document per service, id
      `YYYY-MM-DD_<service-label>`; each doc may also carry a `conflictOk`
      map (`{ [memberName]: [duty names] }`) recording acknowledged
      double-duty warnings.
    - document `app/members` — `{list: [names]}`.
    - document `app/settings` —
      `{features: {...}, pinHash: "sha256-hex", sitePinHash: "sha256-hex",
      sheetUrl: "https://...output=csv"}`.
    - collection `tokens` — one document per device registered for push,
      id = FCM token, `{name: "member name", updatedAt: epoch-ms}`. Written
      by the client (`registerPush()` in app.js); dead tokens are pruned
      automatically by the Cloud Functions when a send fails.
    - collection `sent` — internal de-dupe markers for the reminder
      function (`{t: epoch-ms}`), auto-pruned after 7 days; not
      client-readable.
  - **Hosting:** site `lv-zion-duties`; deploy config in `firebase.json` +
    `.firebaserc`.
  - **Functions:** `functions/index.js`, region `us-central1`, Node 20.
    Two functions — see "Notifications" below.
  - **Rules:** `firestore.rules` (now in the repo). Open read/write on
    `schedule/*`, `app/*`, and `tokens/*`; `sent/*` is locked
    (`allow read, write: if false` — only the Admin SDK, used by Cloud
    Functions, can touch it, since the Admin SDK bypasses rules entirely).
    No expiry (set 2026-07-03).
  - `firebase.json` deploys hosting + Firestore rules + Cloud Functions
    together via `npx firebase-tools deploy`.
- **Two modes:** if `firebase-config.js` has a config, the app syncs live
  (Firestore `onSnapshot`); otherwise it runs on localStorage only. The
  first client to see an empty database uploads `seed-data.js` automatically,
  then triggers an initial Google Sheet sync shortly after.
- **PWA:** `manifest.json` + `sw.js` (network-first fetch, notification
  click focus, Firebase Cloud Messaging background handler). Members can
  "Add to Home Screen" — required on iPhone (iOS 16.4+) for push while the
  app is closed.

## Google Sheet auto-pull sync (added 2026-07-03)

- Toggle `sheetSync` (default on). The published-CSV link lives in
  `app/settings.sheetUrl`, editable in Manage → Data & Sync, with a built-in
  default (`DEFAULT_SHEET_URL` in app.js) pointing at Anthony's sheet.
- Auto-pulls once per page load, throttled to at most once per 5 minutes per
  device (`wds-sheet-sync-at` in localStorage), plus a manual "Sync now"
  button showing last-checked status (`wds-sheet-sync-result` in
  localStorage).
- **Semantics:** the sheet is the source of truth only for the duties it
  lists. `mergeSheetServices()` in app.js does a per-duty upsert — it never
  touches a duty slot the sheet's row doesn't mention, so Media Booth,
  Parking Lot and Offering assignments and manually-added/extra services
  survive every sync. New
  member names appearing in the sheet's Member column are added to
  `app/members` automatically. A duty name the app doesn't recognize is
  skipped and surfaced as a warning (not silently dropped, not a crash).
- **Clearing a duty:** a duty row whose **Member cell is blank** (Date/
  Service/Duty still filled in) now explicitly clears that slot — the old
  name is removed on the next sync. **Limitation:** *deleting* the row
  entirely does **not** clear the slot (an absent row is indistinguishable
  from "the sheet doesn't manage this duty", and clearing on absence would
  wipe in-app-only assignments the app deliberately preserves). To take
  someone off a duty via the sheet, blank the Member cell rather than delete
  the row — or clear it in Manage.
- **Name unification:** both the in-app sync and the every-2-hours server
  sync (`scheduledSheetSync`) now canonicalize sheet names through
  `app/nameMap` before merging, so variant spellings (e.g. `B. Gio` →
  `B. Giomar`) can't be re-introduced by the sheet and break push / `.ics`
  targeting keyed on the canonical name.
- **Choir Song rows:** a row with Duty exactly `Choir Song` is special-cased
  in `sheetRowsToServices()` — its Member column holds a song title, which is
  written to that service's `choirSong` field (never added to
  `app/members`, never treated as a duty assignment, never triggers an
  unknown-duty warning). `mergeSheetServices()` only overwrites an existing
  service's `choirSong` when the sheet's value is non-empty and different,
  matching the per-duty upsert semantics above.
- **Sheet column contract** (see `sheetRowsToServices()` in app.js): the
  published sheet's **"Raw Data"** tab (formerly "Data List" — same
  published-CSV URL/gid, just renamed), header row with Month, Date,
  Service, Worship, Time, Category, Duty, Member. Category is read but
  ignored (duty category is derived from the `CATEGORIES` constant by duty
  name). Date format like `Sat, May 02` — weekday prefix optional, no year;
  the year is inferred (`inferYearISO()`) as whichever of last/this/next
  year lands closest to today. Time is 12-hour, e.g. `9:00 AM`.

## Passcodes (site + editor)

Two independent passcodes, both SHA-256-hashed, never stored in plain text:

- **Site passcode** — gates the entire app when the `siteLock` feature is
  on. Hash lives in `app/settings.sitePinHash` (app.js holds only a fallback
  hash for a brand-new device; the live code is not recorded here — ask the
  coordinator). A device that unlocks stores the hash in
  `localStorage['wds-site-unlock']`; changing the passcode (Manage →
  Features → "Change the site passcode") relocks every other device.
- **Editor passcode** — gates only the Manage tab when the `editorLock`
  feature is on. Hash lives in `app/settings.pinHash` (the live code is not
  recorded here — ask the coordinator). A device that unlocks stores the hash in
  `localStorage['wds-unlock']`; changing the passcode (Manage → Features →
  "Change the editor passcode") relocks every other device. "Lock" button
  relocks the current device only.
- Lost-passcode recovery for either one: delete the corresponding field
  (`sitePinHash` or `pinHash`) on the `app/settings` document in the
  Firestore console — the app treats it as never-set and lets the next
  visitor create a new one. Full steps in `docs/PLAYBOOK.md`.
- Honest security note: the passcodes are a member-facing deterrent, not the
  real security boundary. As of the Level 1 hardening below, *writes* now
  require an authenticated (anonymous) session at the Firestore-rules layer,
  so a technical person can no longer wipe/tamper the data by bypassing the
  UI. Reads remain open (the schedule/roster are shared and the `.ics` feed
  reads them); true read privacy would need real member accounts (Level 2/3).

## Security hardening — Level 1 (anonymous auth + App Check + gated writes)

Closes the "anyone on the internet can wipe the database" risk while staying
invisible to members (no login). Three things changed in code:
`initFirebase()` in `app.js` signs in anonymously and (optionally) starts App
Check; `firestore.rules` now requires `request.auth != null` for writes to
`schedule/app/tokens/requests`; the leaked passcodes were scrubbed from docs.

**One-time Firebase console setup (owner does this — cannot be automated):**
1. **Authentication → Sign-in method → Anonymous → Enable.**
2. **App Check** (optional but recommended): register the web app with a
   reCAPTCHA v3 provider, then paste the reCAPTCHA **site key** into
   `window.RECAPTCHA_SITE_KEY` in `firebase-config.js`. Leave it `''` to skip.
   Do **not** turn on Firestore App Check *enforcement* yet — it is
   project-wide and would block the song app until it also ships App Check.

**Deploy ORDER matters** (reads stay open, so viewing never breaks, but a
wrong order breaks *writes*):
1. Enable Anonymous auth (step 1 above) **first**.
2. Deploy the updated client so devices start signing in:
   `npx firebase-tools deploy --only hosting`.
3. **Then** deploy the gated rules: `npx firebase-tools deploy --only firestore:rules`.
If the rules go out before anonymous auth is enabled + the new client is live,
writes (editor saves, sheet sync) will be rejected until you finish the order.

**Shared-project caveat:** `firestore.rules` also governs the song app
(`songStats`/`setlists`, hosted `lv-zion-songs`). Those stay open here; before
gating them or enabling App Check enforcement, ship the same anonymous-auth +
App-Check integration in the song app. Verify the song app only *reads*
`app/nameMap` (it does today) before relying on the `app/*` write gate.

**Verified:** `firestore.rules` passes a `@firebase/rules-unit-testing`
emulator suite (15/15) — unauth writes denied on worship collections, authed
writes allowed, `songStats`/`setlists` still open, `sent` denied for all.

## Feature toggles (added 2026-07-03, expanded same day)

Manage → Features. Stored in `app/settings.features`, applied on every
device instantly. Registry lives in `FEATURES` at the top of `app.js` —
see `docs/FEATURES.md` for the list and how to add one. New toggles added
2026-07-03: `siteLock`, `conflictWarnings`, `sheetSync` (see FEATURES.md for
descriptions and defaults).

## Double-duty warnings (added 2026-07-03)

- Toggle `conflictWarnings` (default on). `conflictsFor()`/`activeConflicts()`
  in app.js compute, per service, which members are assigned 2+ duties.
- A single prayer duty paired with a single usher duty is intentional and is
  excluded from the warning. Other duplicate pairs remain visible.
- Shown as a warning line on service cards everywhere (Schedule, My Duties,
  Manage).
- In Manage's expanded service view, editors can "Mark as OK," which writes
  the member's current duty list into that service doc's `conflictOk` map
  (syncs to everyone). If that member's duties in that service later change,
  the acknowledgment no longer matches and the warning reappears
  automatically. "show warning again" clears an acknowledgment on purpose.

## Notifications & reminders — what to expect

- **Real server push is now live** (Firebase Cloud Messaging + two Cloud
  Functions in `functions/index.js`, region `us-central1`, Node 20):
  - `onScheduleWrite` — fires on any `schedule/*` document write; for each
    member whose assignment changed to a new non-empty duty, sends "New
    duty assigned to you" via the shared `sendToNames()` helper.
  - `dutyReminders` — runs hourly (`America/Los_Angeles`), finds duties
    starting within 24 hours, sends "Duty reminder," and writes a `sent/*`
    marker doc to avoid duplicate sends (auto-pruned after 7 days).
  - Both look up device tokens in the `tokens` collection by member name;
    dead tokens (FCM reports them unregistered/invalid) are pruned
    automatically on send.
- A member opts in from My Duties ("Turn on notifications" after picking
  their name); this also registers the device's FCM token
  (`registerPush()` in app.js), tagged with their chosen name, stored in
  `localStorage['wds-fcm-token']` / `['wds-fcm-name']` and mirrored to the
  `tokens` collection.
- The VAPID key for Web Push is set in `firebase-config.js`
  (`window.FCM_VAPID_KEY`), from Firebase console → Project settings →
  Cloud Messaging → Web configuration.
- **iPhone requirement:** push while the app is closed needs the site added
  to the Home Screen (iOS 16.4+) — plain Safari tabs don't receive
  background push on iOS.
- In-app/foreground alerts and the <24h in-app reminder still work as
  before while the app is open (detection = diff of the member's duty keys
  vs `localStorage['wds-seen-<name>']`), independent of server push.
- Guaranteed reminders with the app fully closed and no push support:
  "Add my duties to my calendar" (.ics with 24h and 2h alarms) — unaffected
  by any of the above.

## Operations runbook

- **Edit the schedule (normal path):** keep editing the Google Sheet —
  the app auto-pulls it (see "Google Sheet auto-pull sync" above). No
  deploy needed.
- **Quick fixes the sheet doesn't carry:** Manage tab (editor passcode) on
  any device — Media Booth, Parking Lot and Offering assignments, choir
  songs, one-off services. No deploy needed.
- **Deploy app changes:** from the app folder run `npx firebase-tools deploy`
  (deploys hosting + Firestore rules + Cloud Functions together). Use
  `--only hosting` if only app files changed. CLI already authenticated on
  Anthony's Mac; if npm cache errors appear, prefix with
  `npm_config_cache=/tmp/npmcache`.
- **Backups:** Manage → Data & Sync → Export backup file (JSON of the whole
  state). Import restores it (overwrites for everyone).
- **Reset to spreadsheet:** Manage → Data & Sync — overwrites everything
  with `seed-data.js`.
- **New season rollover:** see `docs/PLAYBOOK.md` Brief 4 — either point
  Manage → Data & Sync at the new sheet's published-CSV link, or regenerate
  `seed-data.js` from the new season's export.
- **Firebase console:** https://console.firebase.google.com/project/lv-zion-duties
  — Firestore data, Functions logs, and billing/budget all live here (see
  `docs/PLAYBOOK.md` section 8 for the map).

## Coordinator Planning view + shared name map + feeds (added 2026-07-06)

Four additions in one pass; all live in existing files except two new
function libs.

**Shared name map (`app/nameMap`).** The `NAME_UNIFY_MAP` constant in
`app.js` is now only the seed/fallback for a Firestore doc `app/nameMap`
(`{ map: { variant: canonical } }`). This app seeds the doc on first load
and uses the merged map (`unifiedNameMap()`) for the Manage → Data & Sync
"Unify member names" action; the song app subscribes to the same doc, so
one edit fixes name variants everywhere. Edit the doc (or the tab UI of
whichever tool grows one) rather than the constant.

**Manage → Planning (Coordinator Planning View).** New sub-tab
(`renderManagePlanning` in `app.js`): every upcoming double-duty conflict
with one-tap substitute buttons (`suggestSubs` — same department, not
already serving that service, lightest 4-week + upcoming load first, then
longest since last served); unfilled slots for the next 4 weeks (skips
fully-empty, not-yet-planned services); and the whole-roster workload
table (`workloadStats` — rolling 4/8-week windows, upcoming, year total,
last/next served). The substitute buttons write through the normal
`persistService` path, so FCM new-duty alerts fire as usual.

**Per-member .ics feed (`functions/ics-lib.js`, `exports.ics`).**
`/ics/<member name>` (hosting rewrite → `ics` function) returns a
subscribable VCALENDAR of that member's duties, past 30 days onward, with
the same event format and -24h/-2h alarms as the in-app download. Name-map
aware: variant spellings resolve to the same feed. No auth — the schedule
is already world-readable under the open rules (see Known limitations 1).

**Scheduled Sheet → Firestore sync (`functions/sheet-lib.js`,
`exports.scheduledSheetSync`).** The Google Sheet is the source of truth
(other coordinators edit it). The app's pull-on-open sync still exists;
this function runs the identical parse + merge every 2 hours server-side
so reminders, the song app, and .ics feeds stay fresh when nobody opens
the app. `sheet-lib.js` is a line-for-line port of the app's pure parsers —
**if you change parsing rules in `app.js`, mirror them there.** Merge
policy is unchanged: only duties the sheet mentions are touched; in-app
edits to other duties survive. First deploy of these functions will prompt
to enable Cloud Scheduler (expected, Blaze plan required — already on it).

## Presider song picker (merged in 2026-07-10)

The former standalone **New Song Selection** app is now a sub-view of this
app instead of a separate site. One app, one Firebase project, one login.

- **Entry points.** A member with an upcoming **Presider** duty gets (1) a
  **Presider** nav tab (`#tab-presider`, `data-tab="songs"`) between My
  Duties and Manage that opens the planner's Home view (`ui.songSvc = null`),
  and (2) on **My Duties**, a "Plan songs for your service" button plus a
  "Pick songs" link on each Presider role line, which set `ui.songSvc` to
  the tapped service (deep-link to its setlist). All gated by the
  `songPicker` feature toggle (Manage → Features). `render()` computes
  `isPresider` each pass — it shows/hides the tab and kicks a viewer off the
  songs screen if they stop qualifying (name switch, schedule edit, toggle
  off). The song screen keeps its "← My Duties" back bar.
- **How it loads.** `renderSongs()` (in `app.js`) lazily `import()`s
  `song-app.js` (an ES module, cached after first load — members who never
  preside never download it) and calls `mount(rootEl, ctx)`, where `ctx`
  carries the shared Firebase handle, the signed-in member name, the merged
  name map, the tapped service (deep-link), an `onBack` callback, and `nav` —
  a one-shot flag (from `ui.songNav`, consumed in `songCtx()`) that is true
  only on the render caused by an explicit tap (Presider tab or a "Pick
  songs" button). `mount()` navigates only when `ctx.nav` is true: to that
  service's setlist if `ctx.service` is set, else to the planner's Home.
  Background re-mounts from live-sync renders pass `nav: false` and leave
  the presider's current view alone.
- **The four new files** (all deploy with the app; only `docs/**` and
  `functions/**` are ignored):
  - `song-app.js` — the ported song UI (Home / Library / Services /
    Insights / runsheet). Uses **`data-song-act` / `data-song-chg`** (never
    `data-act`) and attaches its own listeners to `#song-root`, so the host's
    document-level delegation never sees it. Renders only into `#song-root`.
  - `song-lib.js` — the pure, correctness-critical sung-history logic
    (`applySung`, `serviceIdFor`, `applyUndo`, `applyBackfill`, …), exported
    for both the browser (`window.SongLib`) and Node (`module.exports`).
    **This is the single source of truth shared with the Signal ingest
    daemon** — do not fork it. `serviceIdFor`'s slug scheme defines the
    `setlists/{id}` doc ids and must not change.
  - `song-seed.js` — the 509-song catalog (`window.SONG_SEED`).
  - `song-app.css` — the song UI's styles, every rule scoped under
    `#song-root` so nothing leaks into the host UI.
- **New Firestore collections** (reads open, same as the rest of the app):
  `setlists/{serviceId}` (one per planned/sung service) and
  `songStats/{songId}` (append-only sung history + cached counts). Plus
  `app/songSettings` (the song editor PIN) and `app/presiders`.
- **Signal ingest.** The background pipeline in `~/tools/song-ingest` reads
  the church Signal group for song picks and applies them through this same
  `song-lib.js` (its `config.json` points `appJsPath` → `song-lib.js` and
  `seedJsPath` → `song-seed.js`). Any fix to `song-lib.js` applies to both
  the in-app button and the Signal pipeline automatically.
- **Old app retired.** `lv-zion-songs.web.app` (the standalone site) now
  redirects here; the original standalone source lives in the `new-song-app`
  repo's git history.
- Full merge write-up and the porting contract: `docs/MERGE-HANDOFF.md`.

### Presider picker repairs (2026-09-03)

Four defects reported from live use, all fixed together:

1. **The picker went dead after the first visit.** `song-app.js` wired its
   click/input/swipe listeners once behind a `_rootWired` boolean. The host
   destroys `#song-root` whenever the viewer leaves the Presider tab, so every
   later visit mounted into a brand new element that had no listeners at all:
   Library, Services, Insights, "Add songs" and "Order of worship" did
   nothing. The flag is now `_wiredRoot`, holding the element that was wired,
   and `mount()` re-wires whenever the element changes.
2. **Opening a service before the first snapshot blanked its setlist.**
   `ensureSetlist()` decided "this setlist does not exist" from
   `state.setlists`, which is empty until the first Firestore snapshot lands,
   then wrote the empty document with a plain `setDoc`. On a cold load, tapping
   "Pick songs" overwrote a setlist that already had songs. Creation now goes
   through `createSetlistIfAbsent()`, a transaction that reads the document
   first and writes only when it is genuinely absent.
3. **Songs could not be picked right after opening a service.** In Firebase
   mode `ensureSetlist()` never put the new setlist in `state.setlists`, so
   `currentSetlist()` stayed null, the Library rendered no "+" buttons, and
   `addSongToCurrent()` threw on `sl.id`. The setlist is now held in memory
   immediately (and in `pendingSetlists`, merged back on every snapshot so a
   fresh one is not wiped by the wholesale `state.setlists = map`).
4. **Saves failed silently.** Every setlist write was a bare `updateDoc` with
   no `catch`, which Firestore rejects outright when the document does not
   exist yet. All setlist writes now go through `writeSetlistPatch()`, which
   waits for a create still in flight, falls back to writing the whole local
   record, and tells the presider when a change truly could not be saved.

The Library's 100-song groups also changed: reaching the bottom now **appends**
the next group in place (`appendNextLibGroup()`) instead of replacing the list
and scrolling back to the search controls, so the page never moves under a
scrolling thumb. A visible "Show the next 100 songs" button backs up the
`IntersectionObserver`, and the pager arrows and dots still jump to a single
group. `state.ui.libMore` counts the appended groups and resets on search,
sort, category change, or a pager tap.

### Confirming a setlist (2026-09-03)

Picking songs had no finish line: nothing distinguished a half-built list from
a finished one, and My Duties gave no sign that songs existed at all.

- **New field on `setlists/{id}`:** `confirmedAt` (epoch ms) and `confirmedBy`
  (member name). The confirm write stamps `confirmedAt` to the same value as
  `updatedAt`, so the three states are read, never stored:
  `confirmedAt >= updatedAt` is confirmed, `confirmedAt < updatedAt` is
  "changed since confirmed", and no `confirmedAt` is unconfirmed. Any later
  edit, including a song arriving from the Signal ingest daemon, moves
  `updatedAt` ahead and the list correctly reads as changed. Nothing about
  `status` (`planned`/`sung`) or `song-lib.js` changed, so the sung-history
  pipeline is untouched.
- **In the picker** (`song-app.js`): `renderConfirmBox()` closes the builder
  with "Done, these are my songs", a green confirmed panel, or an amber
  "you changed the songs after confirming" prompt. `statusPill()` replaces the
  old Planned/Sung chip everywhere a service is listed and now reads
  "No songs yet", "Songs picked", "Changed", "Confirmed", or "Sung". Home and
  Services cards carry their own Confirm button so the loop can be closed
  without reopening the builder.
- **On My Duties** (`app.js`): a `setlists` snapshot limited to
  `date >= today` fills `setlistIndex` (deliberately outside `state`, which is
  what gets persisted as the offline copy). `songStateFor()` and
  `songStateTag()` drive the tag beside each Presider duty line, the
  "Pick songs" / "Open songs" link text, and the wording of the main call to
  action. With no Firebase the index stays empty and every label falls back to
  its original text.

## Load performance and the release stamp (added 2026-09-07)

Before this, every file was served `no-cache`, so a phone re-downloaded about
253 KB on **every** open, 91 KB of it the presider song picker that most
members never touch. Startup then fetched Firebase core, then Firestore, then
Auth, and waited on an anonymous sign-in round trip before requesting the first
schedule row, all while showing "Loading schedule…" over a copy of the schedule
already sitting in localStorage. A cold phone open is now about 1.2 s to a
visible schedule over 4 requests / 166 KB; a repeat open is about 0.9 s with all
four files served by the service worker and no app-file network traffic.

**The rule a future agent must not break:** every local file referenced from
`index.html` or loaded at runtime carries a `?v=` release stamp, and
`firebase.json` gives the stamped files a one-year immutable cache.

- The source of truth for the stamp is the literal token `DEV` in three places:
  `index.html` (the `<script src>` attributes), `app.js` (`const ASSET_V`) and
  `sw.js` (`const RELEASE`).
- `scripts/deploy.sh` rewrites all three to a UTC timestamp, verifies no `DEV`
  placeholder survived, deploys hosting, and restores the files. The repo
  therefore always reads `DEV` and the working tree is never left dirty.
- **If you add a new local script, stylesheet or lazily-loaded file, append
  `ASSET_V` (or `?v=DEV` in the HTML) and add it to the `headers` list in
  `firebase.json`.** An unstamped file with a one-year cache would strand
  members on a stale copy; an unlisted file just loses the caching win.
- `index.html` and `sw.js` deliberately stay `no-cache` so a new release is
  always noticed.

Other startup changes worth knowing:

- `song-app.css`, `song-seed.js` and `song-lib.js` load only when a presider
  opens the song screen (`loadSongAssets()` in app.js). `song-app.js` reads
  `window.SongLib` and `window.SONG_SEED` at module top level, so all three must
  land before the module import, and that ordering is load-bearing.
- Anonymous sign-in no longer blocks startup. Reads are open in the rules, so it
  bought nothing there. **Every Firestore write must go through `fbWrite()`**,
  which waits on the `authReady` promise; a raw `fb.setDoc(...)` can now race
  ahead of sign-in and be rejected by the rules.
- A "recent plus upcoming" query paints before the full `schedule` collection
  arrives, then unsubscribes. The full listener still owns the data: Manage
  edits past services and `mergeSheetServices` compares against every service,
  so neither may ever run against the partial set. The fast listener only ever
  paints: it never seeds, syncs or raises duty alerts.
- The six startup listeners share one render per animation frame via
  `renderSoon()` instead of triggering six full `innerHTML` rebuilds.

## Calendar: subscribe, not download (changed 2026-09-07)

My Duties now subscribes to the live per-member feed served by the `ics` Cloud
Function (`webcal://…/ics/<member>`) instead of downloading a one-time `.ics`
snapshot. The snapshot went stale the moment a duty or a service time changed,
with no way to tell the member. `downloadICS()` is still in app.js but is no
longer wired to any button. Note the feed is unauthenticated, consistent with
`firestore.rules`, which already allow open reads (see Known limitations).

## Known limitations

1. Open database rules — anyone with the link who bypasses the UI could
   read or write directly. Accepted tradeoff for zero-login simplicity; see
   `docs/PLAYBOOK.md` Brief 1 for the path to close this with Firebase Auth.
2. Concurrent edits: last write per service document wins (fine at this
   scale; each service is its own document, so edits to different services
   never conflict).
3. `crypto.subtle` (passcode hashing) requires HTTPS or localhost — fine on
   the hosted URL.
4. No $ budget alert configured yet on the Blaze-plan billing account — see
   `docs/PLAYBOOK.md` section 8 (to-do: add a $1 budget alert).

## Roadmap candidates

See `docs/PLAYBOOK.md` Part 2 for these as full, ready-to-paste briefs:

- Firebase Auth (email allowlist or similar) + locked-down security rules,
  replacing the open rules + client-side passcodes (Brief 1).
- Month view / print view (Brief 2).
- Duty-swap requests between members, using the existing push
  infrastructure (Brief 3).
- New-season import tooling (Brief 4).
- Optional automatic dark mode that preserves the WATV-inspired service
  design and contrast rules (Brief 5).

## File map

| File | Purpose |
|---|---|
| `index.html` | Shell + full design system (see `docs/DESIGN.md`) |
| `app.js` | All logic: rendering, sync, passcodes, features, sheet sync, conflicts, notifications |
| `seed-data.js` | Schedule imported from the Excel file (first-run seed + Reset button) |
| `firebase-config.js` | Real Firebase web config + Web Push (VAPID) key (public identifiers) |
| `firebase.json` / `.firebaserc` | Deploy config for hosting + Firestore rules + Cloud Functions |
| `firestore.rules` | Firestore security rules, deployed alongside hosting |
| `functions/` | Cloud Functions source: `index.js` (push notifications, `ics` feed, `scheduledSheetSync`), `ics-lib.js` + `sheet-lib.js` (pure, node-testable logic), `package.json` |
| `manifest.json`, `sw.js`, `icon.svg` | PWA install + background push notifications |
| `song-app.js` | Presider song picker UI (ES module, lazy-loaded, mounts into `#song-root`) — see "Presider song picker" |
| `song-lib.js` | Pure sung-history logic shared with the Signal ingest daemon (`window.SongLib` / `module.exports`) |
| `song-seed.js` | 509-song catalog (`window.SONG_SEED`) |
| `song-app.css` | Song picker styles, all scoped under `#song-root` |
| `docs/` | `PLAYBOOK.md` (operate + delegate), this handoff, design system, feature registry, `MERGE-HANDOFF.md` |

## localStorage key inventory (per device)

| Key | Purpose |
|---|---|
| `wds-data-v2` | Local-only fallback copy of the whole state (no-Firebase mode) |
| `wds-me` | The member name chosen on My Duties |
| `wds-site-unlock` | Cached site-passcode hash once this device unlocks |
| `wds-unlock` | Cached editor-passcode hash once this device unlocks Manage |
| `wds-notify` | Whether in-app/system notifications are turned on (`'1'`/`'0'`) |
| `wds-fcm-token` | This device's registered FCM push token |
| `wds-fcm-name` | The member name the FCM token is currently registered under |
| `wds-seen-<name>` | Duty keys already seen, per member name, for new-duty detection |
| `wds-alerts-<name>` | Recent in-app alert history shown on My Duties. The card's **Clear** button (`data-act="clear-alerts"`, added 2026-09-03) removes this key and zeroes `wds-unread-<name>` on this device only; duties, the schedule and change requests are untouched |
| `wds-unread-<name>` | Unread alert count shown as a dot on the My Duties tab |
| `wds-reminded` | De-dupe map for the in-app 24h reminder |
| `wds-sheet-sync-at` | Timestamp of the last sheet sync attempt (throttle) |
| `wds-sheet-sync-result` | Last sheet sync outcome, shown on the Data & Sync card |
| `nss-editor-unlock` | Song picker: cached song-editor-PIN hash once this device unlocks song editing |
| `nss-help-dismissed` | Song picker: the first-run help banner was dismissed |
| `nss-data-v1` | Song picker: local-only fallback copy of song state (no-Firebase mode) |

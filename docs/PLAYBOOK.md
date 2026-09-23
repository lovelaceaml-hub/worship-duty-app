# Playbook

Last updated: 2026-09-20.

This is the one document to follow if you (Anthony) need to run the app day to
day, or hand a task to an AI coding tool. It assumes no developer background.

- **Part 1**: managing the live app: schedule edits, sign-in, warnings,
  notifications, toggles, backups, deploying, and troubleshooting.
- **Part 2**: how to keep improving the app using Claude Code (or another AI
  coding tool), including five ready-to-paste task briefs.

### Current status

Features F1 to F14 are live at https://lv-zion-duties.web.app (release marker
`gallery1789952310145`, 2026-09-20; F13 and F14 were tests and docs only). Since 2026-09-17 the rule is: keep the
live look, add features into the four existing appearances one at a time, show
each on the preview channel first, release on Anthony's approval. The active plan
and its Build log are in [PLAN-2026-09-22-APP-JS-SPLIT.md](PLAN-2026-09-22-APP-JS-SPLIT.md);
`main` holds F1 to F14 in the split module layout since 2026-09-23.
Open items and branch details are in [HANDOFF.md](HANDOFF.md).

Two facts to keep in mind before any release (details in section 8):

- Hosting releases come from the main checkout
  `/Users/anthony/Projects/worship-duty-app` (branch `main`).
- Firestore rules and Cloud Functions come from the worktree
  `/Users/anthony/Projects/worship-duty-app-worktrees/compact-integration`.
  The `firestore.rules` file and `functions/` folder on `main` are older than
  what is live and must never be deployed.

For what each screen does, see the [User Guide](USER-GUIDE.md) (members) and
the [User Manual](USER-MANUAL.md) (leaders and administrators).
For architecture detail, see [HANDOFF.md](HANDOFF.md). For the visual design
system, see [DESIGN.md](DESIGN.md). For the full toggle list, see
[FEATURES.md](FEATURES.md).

---

## Part 1: Managing the app

### 1. Entering the schedule

**The Google Sheet is the normal way to enter the schedule.** Keep editing
the same Google Sheet the congregation always used, on the **"Raw Data"**
tab (formerly called "Data List"; the published CSV link/gid didn't
change, only the tab's name). The app pulls from it automatically:

- The app may attempt an automatic pull when it opens, throttled to once per
  five minutes per device.
- An authenticated administrator can run Manage → Data & Sync → **Sync now**.
  The browser only writes the shared schedule after a verified account session
  and administrator permission check.

What syncs from the sheet, per row: Month, Date, Service, Worship, Time,
Duty, Member. The Category column is ignored because the app derives the
department from the duty name. A row with Duty exactly `Choir Song` is handled
specially: its Member column holds a **song title**, not a person, and syncs
into that service's choir-song line. It is never added to the People list.
See the exact column contract in Brief 4 below if you ever need to rebuild
the sheet.

Parking Lot and Offering are supported departments with their own duty names.
If the published sheet does not list a duty, the sheet sync leaves that slot
alone. Use the authorized Manage department workspace for roster-backed manual
assignments.

What the sheet sync does and does not touch:

- It **only changes duties the sheet actually lists**. If a service in the
  sheet does not mention "Media Booth #1," the app leaves that assignment
  alone. A deleted row is also absent from the import and does not clear the
  slot.
- A valid duty row with a **blank Member cell explicitly clears that duty**.
  Keep Date, Service, and Duty filled in when you mean clear.
- A `Choir Song` row is authoritative for that exact date and service. A blank
  Member cell clears the existing choir song. If the sheet has no `Choir Song`
  row for that service, a manually entered choir song is preserved. A later
  non-empty row replaces the canonical value.
- Manual assignments and extra services are preserved when the sheet does not
  contain their corresponding rows.
- New non-empty person names in the Member column are **added to the People
  list** automatically. Song titles from `Choir Song` rows never are.
- A duty name in the sheet that the app doesn't recognize is **skipped and
  reported as a warning** (visible on the Data & Sync card). It will not
  silently disappear or crash the sync.

**Use the authorized Manage tab for quick fixes the sheet does not carry:**
department assignments, choir songs, one-off or extra services, or anything
you need to change before the next sheet edit. Manage → Services → tap a
service to expand it, then assign a roster member or edit the choir song line.

### 2. Sign-in and UI passcode

The live app uses two different controls:

| Control | What it does |
|---|---|
| **Site passcode** | Optional device-level UI gate when the `siteLock` feature is on. |
| **Member account PIN** | Signs the selected member account in through the verified authentication service. |

The site passcode only hides the app on that device. It is not the database
security boundary. Select the member account and enter its 4 to 6 digit PIN to
sign in. The authentication service checks the account, issues a Firebase
custom-token session, and restores it when the browser reloads. Firestore rules
require a current verified session for writes. The one exception is the song
plan and song history data, which stays open because the Signal ingest service
writes it without a member session.

Manage visibility and write permissions come from the signed-in account's
administrator, leader, department, or song-editor role and department scope.
The old shared editor-passcode instructions are obsolete for the live Manage
flow. Do not use `pinHash` or a local `wds-unlock` marker as an authorization
method.

New or reset privileged accounts may be required to choose a new PIN before
the schedule opens. Follow the **Change your member PIN** prompt, then sign in
again if requested. Keep PINs out of this repository and out of screenshots.

**To change the site passcode:** an administrator can use Manage → Features →
"Change the site passcode." Devices compare their saved UI marker with the
current site setting and will ask for the new code after the setting changes.

If the site passcode is lost, use the [Firebase Firestore console](https://console.firebase.google.com/project/lv-zion-duties/firestore)
with the project owner or administrator responsible for this app. Account
PINs are separate: reset one with the **Reset PIN** button on the department
roster (section 3).

### 3. Department rosters and assignments

Manage is available only to a verified account with administrator or department
leader scope. Select the department in the Manage department picker, then open
**Departments** for its secure roster or **Services** for assignments.

To add a member to a department:

1. Open Manage, choose the department, open **Departments**, then **Open
   department**.
2. Under **Add a department member**, type at least two letters of the name
   and tap **Search**.
3. Tap **Add** beside the right person. People already in the department are
   labeled instead of offered again.

Only registered, active accounts appear. No account ID is typed or shown.
Adding a profile does not grant leadership or administrator access.

For a roster profile, authorized leaders can change active status, eligible
duties, schedulability, recurring availability, and date exceptions. Members
change only their own availability: they tap their name in the header, then
**Availability**. Archiving a profile removes it from the active roster and
preserves its assignment history.

To reset a member's PIN, tap **Reset PIN** on that member's roster row and
confirm. The member must choose a new PIN the next time they sign in. The
button appears only for administrators and for leaders of that member's
department.

Assignment pickers show active, eligible, schedulable, and available members
from the selected department. An administrator can use the labeled override
when a documented exception is necessary; the override requires a reason.

### 4. Double-duty warnings and "Mark as OK"

When the toggle **Double-duty warnings** is on (default), any service where
one person is assigned two or more duties shows a warning line on that
service's card : visible to everyone, on Schedule, My Duties, and Manage.
The app treats one prayer duty plus one usher duty as intentional, so that
pair does not show a warning. Other duplicate pairs still do: two usher
duties, two prayer duties, or a prayer/usher duty combined with another role.

Sometimes double-booking is intentional (small congregation, trusted
volunteer covering two roles). To silence a specific one:

1. Manage → Services → expand that service.
2. Find the warning line, click **Mark as OK**.
3. It's replaced with a muted "(marked OK)" note, and the warning disappears
   for everyone.

This is stored per-service (`conflictOk` map, keyed by name + their exact
duty list) and syncs live. If that person's duties in that service change
later (a duty added or removed), the acknowledgment no longer matches and
the warning **reappears automatically**. It does not silently stay
suppressed forever.

To bring back a warning you previously marked OK on purpose, click **"show
warning again"** next to the muted note.

### 5. Notifications

Members opt in per device:

1. Sign in.
2. On **My Duties** (or under your name, then **Settings**), tap **Turn on
   notifications** and allow the browser prompt.
3. The device registers itself for push under the signed-in member.

Two kinds of alerts:

- **New duty assigned to you**: fires when an editor (or the sheet sync)
  assigns you a duty you didn't have before.
- **Duty reminder**: fires roughly within 24 hours before each duty.

**These are now real push notifications** (Firebase Cloud Messaging), sent
from the server even if the member's browser tab is closed, not just
in-app alerts. Two Cloud Functions handle this (see Part 2 / HANDOFF for
detail): one watches for schedule changes, one runs hourly to catch
duties starting soon.

**iPhone requirement:** iOS only delivers web push to a site that has been
**added to the Home Screen** (Share → Add to Home Screen), and needs iOS
16.4 or newer. A member who just uses Safari without adding it to their
Home Screen will not get push notifications while the tab is closed.
Android and desktop browsers don't have this restriction.

**Works with the app closed and no push:** "Add my duties to my calendar"
subscribes the phone's calendar to the member's live duty feed, with 1-day and
2-hour reminders. Because it is a subscription, it follows reassignments and
time changes by itself. Android members use **How it works and Android steps**,
then **Copy calendar link**, and add it in Google Calendar under Other
calendars, From URL.

Inside the app, a green dot on the **My Duties** tab means a new duty was added
for the signed-in member. A red dot on **Manage** means a request or a conflict
needs attention.

### 6. Feature toggles

Manage → Features. Every toggle applies to the whole congregation instantly;
no deploy needed. Full list, defaults, and descriptions live in
[FEATURES.md](FEATURES.md). Quick reference for what shipped 2026-07-03:

| Toggle | Default |
|---|---|
| Site passcode (`siteLock`) | ON |
| Double-duty warnings (`conflictWarnings`) | ON |
| Google Sheet sync (`sheetSync`) | ON |

The **Editor passcode** switch and the **Change the editor passcode** card are
still on that screen, but they control nothing now. Manage access comes from
the signed-in account's role.

### 7. Backups, import, and reset

Manage → Data & Sync:

- **Export backup file**: downloads the entire state (schedule, members,
  settings) as JSON. Do this occasionally, and definitely before a big
  manual change.
- **Import backup file**: restores from a previously exported JSON file.
  This overwrites the shared database for everyone. Use with care.
- **Reset to spreadsheet data**: wipes everything and reloads the original
  May to July 2026 schedule baked into `seed-data.js`. Do NOT use this on the
  live app: it would replace the current schedule for everyone. Wiping or
  reseeding production needs a dry run and Anthony's explicit approval.

### 8. Deploying app changes

Only needed when the app's code changes. Schedule edits sync live and need no
release.

**Who runs it:** Anthony. The Claude Code auto mode classifier denies
production deploys to Claude, so Claude prepares the change and the preview, and
Anthony pastes the commands below into Terminal. Every path is absolute.

**Rules-source warning. Read this first.**

- Hosting (what members see) is released from the main checkout
  `/Users/anthony/Projects/worship-duty-app` (branch `main`). Since
  2026-09-23 `main` holds the F1 to F14 features merged into the split
  module layout; `claude/keep-look-f4f5` is kept as history only.
- The LIVE Firestore rules and the LIVE Cloud Functions were deployed from
  `/Users/anthony/Projects/worship-duty-app-worktrees/compact-integration`
  (branch `claude/compact-integration`, deployed 2026-09-17, `feedback` rule
  added 2026-09-20, commit `a5068d9`).
- The `firestore.rules` and `functions/` in `main` (and in `keep-look-f4f5`)
  are OLDER than what is live. Never deploy rules or functions from the main
  checkout. Doing so would remove the `feedback` and `departmentInvitations`
  rules and break the feedback button.
- Run `git pull` in the main checkout first if it is behind `origin/main`;
  the release script builds whatever is checked out there.

**The three-command release pattern (Hosting only):**

Command 1, preview. Publishes to the private preview channel
https://lv-zion-duties--design-gallery-review-rtm2fa8h.web.app (real records,
expires after seven days). Review it before going further.

```
cd /Users/anthony/Projects/worship-duty-app && npm_config_cache=/tmp/npm-cache node /Users/anthony/Projects/worship-duty-app/design-gallery/release.mjs --preview
```

Command 2, publish with the maintenance message on (section 8a explains the
line it inserts). Members see "Schedule maintenance in progress" with a
read-only list of the next eight services.

```
cd /Users/anthony/Projects/worship-duty-app && sed -i '' 's|<html lang="en">|<html lang="en"><script>document.documentElement.dataset.maintenance = '"'"'active'"'"';</script>|' /Users/anthony/Projects/worship-duty-app/index.html && npm_config_cache=/tmp/npm-cache node /Users/anthony/Projects/worship-duty-app/design-gallery/release.mjs --publish
```

Command 3, remove the maintenance line and publish the full app.

```
cd /Users/anthony/Projects/worship-duty-app && git checkout -- index.html && npm_config_cache=/tmp/npm-cache node /Users/anthony/Projects/worship-duty-app/design-gallery/release.mjs --publish
```

After command 3, open https://lv-zion-duties.web.app and
https://lv-zion-duties.web.app/design-gallery-release.json (the `release` value
is the new marker). Run `git status` in the main checkout: it must be clean, which
proves the maintenance line is in no commit.

The release script builds and checks Original, Prism, Navy & Cream, and Aurora
in a stamped staging folder, confirms the live app is a known release, and
deploys **Hosting only**. The root Firebase configuration blocks a direct
Hosting upload, so a bare deploy cannot replace the four appearances with the
single-design source. `bash scripts/deploy.sh` is only a wrapper for
`release.mjs --publish`; prefer the commands above.

**Rules only (rare).** When a rule genuinely changed and was reviewed, commit it
on `claude/compact-integration` and deploy from that worktree:

```
cd /Users/anthony/Projects/worship-duty-app-worktrees/compact-integration && npm_config_cache=/tmp/npm-cache npx -y firebase-tools@latest deploy --project lv-zion-duties --only firestore:rules --config /Users/anthony/Projects/worship-duty-app-worktrees/compact-integration/firebase.json
```

If a release needs both, deploy the rules first, then Hosting (the F10 feedback
release on 2026-09-20 did it in that order).

**Functions (rare).** Also from the `compact-integration` worktree, and always
with every function named, for example
`--only functions:onScheduleWrite,functions:dutyReminders`. The Firebase
project is shared with another app, so never run a bare `firebase deploy` or a
bare `--only functions`: the tool would offer to delete functions that are not
in this repository.

Rollback: Hosting console
https://console.firebase.google.com/project/lv-zion-duties/hosting/sites/lv-zion-duties
then the release row's menu, Rollback. There is no command-line Hosting
rollback.

Note: the presider song-picker files (`song-app.js`, `song-lib.js`,
`song-seed.js`, `song-app.css`) deploy with Hosting automatically. The Signal
ingest service in `~/tools/song-ingest` reads `song-lib.js` directly from its
configured folder on its next run; nothing needs restarting.

Always use the `npm_config_cache=/tmp/npm-cache` prefix on Anthony's Mac. The
CLI is already authenticated.

### 8a. Showing the maintenance message during a repair

When members should see "Schedule maintenance in progress" instead of the app
while you change the live site, add one line to
`/Users/anthony/Projects/worship-duty-app/index.html`,
directly after `<html lang="en">` and before `<head>`:

```
<script>document.documentElement.dataset.maintenance = 'active';</script>
```

Command 2 in section 8 inserts this line for you and releases. The maintenance
panel and its read-only upcoming-service list are already built into
`index.html` and `app.js`; the line just switches them on. The bottom bar, the
header menu, and the feedback button are hidden while it is on. To restore the
full app, remove the line (`git checkout -- index.html`, which command 3 does)
and release again. Never commit the line. There is no database flag for this,
and none is needed. Used this way on 2026-09-14 (commits `54fee56` and
`c057c3e`), 2026-09-17 (F1 and F2), 2026-09-19 (F3, then F4 to F6), and
2026-09-20 (F7 to F11).

### 9. The Firebase console map

Project console: https://console.firebase.google.com/project/lv-zion-duties

| Where | What you'll find |
|---|---|
| **Firestore Database → Data** | Live look at `schedule/*` (one doc per service), `app/members`, `app/settings` (the site passcode setting and sheet URL live here), `accounts/*` (member account auth and roles), `tokens/*` (one per device registered for push), `sent/*` (internal reminder de-dupe markers, safe to ignore), `feedback/*` (notes members send with the feedback button; read them in the app under Manage, Feedback). Song picker adds `setlists/*` (one per planned or sung service), `songStats/*` (per-song sung history), and `app/presiders`. |
| **Functions** | The Cloud Functions (`onScheduleWrite`, `dutyReminders`, `songHistoryRecorder`, and the account and department callables), with logs here if a push or authorized action fails. Two functions in the list (`onVercelScheduleWrite`, `worshipVercelReconcile`) belong to another app that shares this project; leave them alone. |
| **Project settings → Cloud Messaging** | The Web Push (VAPID) key pasted into `firebase-config.js` |
| **Usage and billing** | Confirm the project is on the Blaze (pay-as-you-go) plan, required for Cloud Functions. Effectively $0/month at this congregation's scale, but see the to-do below. |

**To-do (not yet done):** set a $1 budget alert. Google Cloud console →
Billing → Budgets & alerts → Create budget → set an amount like $1 and an
email alert. This costs nothing and just gives early warning if usage ever
spikes unexpectedly. Recommended now that the project is on Blaze.

### 10. Troubleshooting quick table

| Symptom | Check |
|---|---|
| Sheet changes aren't showing up | Manage → Data & Sync: is the "Google Sheet sync" toggle on? Is the published-CSV link still correct (sheet's File → Share → Publish to web → CSV link, re-copy if the sheet was recreated)? Try "Sync now" and read any warning messages shown. |
| A duty from the sheet never appears | The Duty column text probably doesn't match one of the app's known duty names exactly. Check the warnings list on the Data & Sync card, which names the skipped duty. |
| Push notifications not arriving | Is the member signed in, and did they turn on notifications in My Duties or under their name, Settings? On iPhone, is the site added to the Home Screen (Share → Add to Home Screen), iOS 16.4+? Check Functions logs in the Firebase console for errors on `onScheduleWrite` / `dutyReminders`. |
| Locked out of the site | Use the site passcode recovery in section 2. |
| Member sign-in or Manage is denied | Confirm the selected account, PIN, active status, and current role or department scope. Ask the administrator to reset the account PIN or role when needed. |
| A member cannot find Sign out or Availability | They are under the member's name at the top right of every screen. |
| The feedback button is missing | It shows only after sign-in, and hides while the keyboard is open or the maintenance page is on. |
| Manage, Feedback says "The feedback list is not available yet." | The live Firestore rules are missing the `feedback` rule. Someone deployed rules from the wrong branch. Redeploy rules from the `compact-integration` worktree (section 8). |
| Double-duty warning won't go away | Someone needs to click "Mark as OK" in Manage on that service; if it keeps reappearing, that person's duties in that service are still changing between visits. |

---

## Part 2 : Continuing development with AI (the delegation playbook)

This section is how Anthony hands future work to an AI coding tool (Claude
Code or similar) without needing to read or write code personally.

Note added 2026-09-20: the five briefs below were written in July 2026, before
member sign-in, the four appearances, and the keep-the-live-look rule. Their
section numbers are kept because other documents cite them. Before using one:
the agent works in a new branch made from `main`, reads
[AGENTS.md](../AGENTS.md) first, makes the change in all four appearances
without changing their look, publishes the preview channel only, and never
deploys. Anthony releases with section 8. Brief 1 is done, Brief 3 is largely
covered by the live change-request flow, and Brief 5 is done for Prism and
Aurora (they follow the system dark setting; Original and Navy & Cream stay
light by choice).

### How to start a task

1. Open a terminal in
   `/Users/anthony/Projects/worship-duty-app` and start Claude Code (or your AI
   coding tool of choice).
2. **Always start the conversation with:** "Read the docs in docs/ first."
   This makes sure the model sees this playbook, the architecture, the
   design rules, and the feature registry before touching anything.
3. Paste one of the five briefs below, whole and unedited. They are
   self-contained.
4. Tell the model to update the relevant docs in `docs/` as part of the
   change and to publish the preview channel (section 8, command 1). The model
   does not deploy to production.
5. Review the preview link. When you approve, run section 8 commands 2 and 3
   yourself.
6. After the release, open https://lv-zion-duties.web.app yourself and
   click through the change to confirm it looks and works right.

### Which model to use

Model, effort, lane, and reviewer choices come from the approved plan and
Anthony's shared operating policy
(`/Users/anthony/.claude/policy/SHARED-INSTRUCTIONS.md`), not from this
playbook. Every plan states them in a labeled block.

### Brief 1: Authentication and authorization are released

The former Firebase Auth hardening brief is complete. The live app now uses
member account sign-in with a 4 to 6 digit PIN, Firebase custom-token sessions,
current role versions, UID-backed department profiles, and Firestore rules that
require a verified session for writes. The site passcode remains a UI-only
device gate. Do not paste the old brief or reopen it as a new implementation
task. Read [AUTH-DEPARTMENT-UPGRADE-RELEASE.md](AUTH-DEPARTMENT-UPGRADE-RELEASE.md)
for the recorded production evidence and known limitations.

### Brief 2: Month view / print view

```
Context: This is a static web app (no build step) for a congregation's
worship duty schedule, in /Users/anthony/Projects/worship-duty-app. Read
docs/HANDOFF.md, docs/FEATURES.md, docs/PLAYBOOK.md, and docs/DESIGN.md
first. The Schedule tab (see `renderSchedule()` and `renderServiceList()`
in app.js) currently only shows a flat chronological list of upcoming
(and optionally past) services, grouped by day, with a per-service card
via `renderServiceCard()`.

Task: Add a month-grid view and a print-friendly view of the schedule,
reachable from the existing Schedule tab (e.g. a view toggle at the top
: "List" vs "Month"). Requirements:
- Month view: a calendar-grid layout showing which days have services,
  with enough detail per day to be useful at a glance (service labels
  and/or duty counts); clicking/tapping a day can reveal the same detail
  the list view shows.
- Print view: a `@media print` stylesheet (or a dedicated print
  button that opens a print-optimized layout) that produces a clean,
  readable printed schedule : no navigation
  chrome, good use of a printed page, in monochrome-friendly styling.
- Add this as a new feature toggle in the FEATURES array in app.js
  (follow the existing pattern : id, label, desc, def) if you judge it
  should be optional; otherwise justify why it's always-on.
- Respect existing feature toggles that affect what's shown (pastServices,
  emptyDuties, conflictWarnings, choirSong) : the month/print views should
  honor the same toggles the list view does, not bypass them.
- Follow docs/DESIGN.md exactly for any new UI in the normal (non-print)
  view: the existing WATV-inspired tokens (`--brand-blue`, `--surface`,
  `--accent`, `--r-lg`, etc.) already defined in index.html's `<style>`
  block, no emoji, no religious/cross imagery, and alert rose used only
  for alerts.
- No new build step, no framework, no external libraries : plain
  JS/CSS/HTML consistent with the rest of app.js and index.html.

Update docs/FEATURES.md (if a new toggle was added) and docs/HANDOFF.md's
file map / architecture notes if relevant.

Verification: do not deploy to production. Publish the preview channel
(docs/PLAYBOOK.md section 8, command 1) and confirm there that the month view
renders correctly with real data, the print view looks correct via the
browser's print preview, and the existing list view is unaffected.
Report what you tested.
```

### Brief 3: Duty-swap requests between members

```
Context: This is a static web app (no build step) for a congregation's
worship duty schedule, in /Users/anthony/Projects/worship-duty-app. Read
docs/HANDOFF.md, docs/FEATURES.md, docs/PLAYBOOK.md, and docs/DESIGN.md
first. Members currently only view their duties on the My Duties tab
(`renderMy()` in app.js) : there's no way for two members to trade duties
without an editor manually reassigning them in Manage.

Push notifications already exist end-to-end: functions/index.js has
`onScheduleWrite` (fires on any schedule doc write) and `dutyReminders`
(hourly), both sending through a shared `sendToNames()` helper that looks
up device tokens in the `tokens` Firestore collection (written by
`registerPush()` in app.js when a member turns on notifications and picks
their name). Reuse this existing push infrastructure rather than building
a new one.

Task: Add a duty-swap request/accept flow reachable from My Duties.
Requirements:
- A member viewing one of their own upcoming duties can request a swap
  with another specific member (or an open request any eligible member
  can accept : your call, but document which you chose and why).
- The other member gets notified (reuse the existing push path : add a
  new Cloud Function or extend `onScheduleWrite`/write a new trigger
  watching a new Firestore collection for swap requests, whichever fits
  the existing patterns better) and can accept or decline from their own
  My Duties view.
- On acceptance, the schedule doc's assignments update automatically
  (the existing `persistService`/Firestore write path) : don't require
  an editor to manually intervene for a normal swap.
- Design a Firestore data shape for swap requests (new collection,
  e.g. `swaps/{id}`) and add matching rules to firestore.rules following
  the existing style (open read/write is the current baseline : decide
  whether swap requests need tighter rules and document the decision).
- No emoji, no religious/cross imagery; reuse the existing WATV-inspired
  design tokens and component patterns (cards, status labels, ghost/primary
  buttons) from index.html's <style> block : don't invent new visual
  language.
- Add a feature toggle (`dutySwap` or similar) in the FEATURES array in
  app.js following the existing pattern, defaulting to on.

Update docs/FEATURES.md (new toggle), docs/HANDOFF.md (architecture:
new collection, new/extended function), and docs/PLAYBOOK.md (a "how
members request a swap" step, and a troubleshooting row if relevant).

Verification: do not deploy. Rules and functions live on branch
claude/compact-integration (docs/PLAYBOOK.md section 8); prepare the change
there for Anthony to deploy with named targets, then test with
two different member names (two browser profiles or devices) that a
swap request from one is visible to and actionable by the other, and
that acceptance actually updates the schedule for everyone. Report what
you tested, including whether you verified the push notification fired.
```

### Brief 4: New-season import

```
Context: This is a static web app (no build step) for a congregation's
worship duty schedule, in /Users/anthony/Projects/worship-duty-app. Read
docs/HANDOFF.md, docs/FEATURES.md, docs/PLAYBOOK.md, and docs/DESIGN.md
first. The app currently syncs from a published Google Sheet (see
`syncFromSheet()`, `sheetRowsToServices()`, and `parseCSV()` in app.js).
The published-CSV link is stored in `app/settings.sheetUrl` (editable in
Manage → Data & Sync) with a hardcoded default `DEFAULT_SHEET_URL` at the
top of app.js. There's also a static `seed-data.js` with the original
May to July 2026 schedule baked in, used only for first-run seeding and the
"Reset to spreadsheet data" button in Manage.

The sheet-column contract the parser expects (see `sheetRowsToServices`):
header row with columns Month, Date, Service, Worship, Time, Category,
Duty, Member (Category is read but ignored by the app : duty category is
derived from the duty name via the CATEGORIES constant). Date format is
like "Sat, May 02" (weekday prefix optional, no year : the year is
inferred by `inferYearISO()` to be whichever of last/this/next year is
closest to today). Time format is 12-hour, e.g. "9:00 AM" (parsed by
`parseSheetTime`). Duty must exactly match one of the duty names in the
CATEGORIES constant near the top of app.js, or the row is skipped with a
warning : except Duty `Choir Song`, which is a special case: its Member
column holds a song title and is written to that service's `choirSong`
field, never treated as a person. The sheet tab is named "Raw Data."

Task: make it easy for Anthony (non-developer) to roll over to a new
season when the congregation replaces the old sheet/tab with a new one.
Concretely:
- If the new season is just a new tab/sheet with a new published-CSV
  link: this should already work by pasting the new link into Manage →
  Data & Sync : verify this actually works end to end with a realistic
  test sheet you construct matching the column contract above, and fix
  any edge cases you find (e.g. does switching the link cause any stale
  data from the old season to linger incorrectly? should it?).
- Provide a clear, repeatable way to regenerate seed-data.js from a new
  season's exported data (e.g. a small script under a `scripts/` or
  `tools/` folder that reads a CSV or xlsx export matching the same
  column contract and writes seed-data.js), for the case where Anthony
  wants a fresh authoritative baseline rather than relying on live sync
  from day one.
- Document, in docs/PLAYBOOK.md, a numbered "rolling over to a new
  season" procedure covering both paths (point-the-link vs.
  regenerate-seed-data), written for a non-developer.

Do not change the sheet-column contract itself unless you find a genuine
bug in the parser : if you do, document the bug and the fix clearly.

Verification: test the link-switch path against a real or realistic
published-CSV sheet with a handful of rows spanning a new date range,
confirm services/members appear correctly and nothing from the prior
season is duplicated or corrupted. If you added a regeneration script,
run it against a sample input and confirm the resulting seed-data.js
loads correctly (use "Reset to spreadsheet data" in Manage to test it,
on a non-production copy or after taking a backup export first). Report
what you tested.
```

### Brief 5: Automatic dark mode

```
Context: This is a static web app (no build step) for a congregation's
worship duty schedule, in /Users/anthony/Projects/worship-duty-app. Read
docs/DESIGN.md carefully first : it documents the current WATV-inspired
service design, which is light-theme-only today. Shared design tokens are
defined in `:root` in index.html; song-specific rules remain scoped in
song-app.css.

Task: add a `prefers-color-scheme: dark` variant of the WATV-inspired
service system : an automatic dark mode that follows the device/browser setting
(no manual toggle needed, unless you judge one is also warranted :
document your choice).
Requirements:
- Keep the same official, orderly, calm concept: crisp service records,
  strong borders, restrained WATV blue, and rose only for alerts.
- Maintain the contrast rules from docs/DESIGN.md: `--muted`-equivalent
  text must stay at ≥4.5:1 against the busiest wash region in dark mode
  too.
- Do not change any token names structurally in a way that breaks
  app.js's inline uses of category colors (`dot-c` backgrounds,
  `--edge` custom property on `.duty-card`) : those are set inline from
  CATEGORIES in app.js and must still be legible against the new dark
  surfaces; adjust the halo/border treatment around dots if needed
  rather than changing how app.js sets them.
- Same rules apply as the light theme: no emoji, no cross/religious
  imagery, accent tint sparingly (~3x per screen).
- Shared overrides live in the `<style>` block in index.html using a
  `@media (prefers-color-scheme: dark)` block. Scoped song overrides live
  in song-app.css. Do not add styling to app.js.

Update docs/DESIGN.md to document the dark-mode tokens alongside the
existing light-theme table, following its existing structure (add a
"Dark mode" section rather than rewriting the doc).

Verification: use the browser preview tools to emulate
prefers-color-scheme: dark (or your OS dark mode) against the deployed
or local app, screenshot both the Schedule and My Duties tabs, and
confirm text contrast and service-record legibility hold up. Do not deploy to
production; publish the preview channel (docs/PLAYBOOK.md section 8, command 1).
Report what you tested.
```

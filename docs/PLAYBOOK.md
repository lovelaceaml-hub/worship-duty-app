# Playbook

Last updated: 2026-08-20.

This is the one document to follow if you (Anthony) need to run the app day to
day, or hand a task to an AI coding tool. It assumes no developer background.

- **Part 1** — managing the live app: schedule edits, passcodes, warnings,
  notifications, toggles, backups, deploying, and troubleshooting.
- **Part 2** — how to keep improving the app using Claude Code (or another AI
  coding tool), including five ready-to-paste task briefs.

For what each screen does day-to-day, see the main [README](../README.md).
For architecture detail, see [HANDOFF.md](HANDOFF.md). For the visual design
system, see [DESIGN.md](DESIGN.md). For the full toggle list, see
[FEATURES.md](FEATURES.md).

---

## Part 1 — Managing the app

### 1. Entering the schedule

**The Google Sheet is the normal way to enter the schedule.** Keep editing
the same Google Sheet the congregation always used, on the **"Raw Data"**
tab (formerly called "Data List" — the published CSV link/gid didn't
change, only the tab's name). The app pulls from it automatically:

- Every time anyone opens the app (throttled to once per 5 minutes per
  device, so it doesn't hammer the sheet).
- On demand: Manage → Data & Sync → **Sync now**.

What syncs from the sheet, per row: Month, Date, Service, Worship, Time,
Duty, Member (the Category column is ignored — the app derives category from
the duty name itself). A row with Duty exactly `Choir Song` is handled
specially: its Member column holds a **song title**, not a person, and syncs
into that service's choir-song line — it's never added to the People list.
See the exact column contract in Brief 4 below if you ever need to rebuild
the sheet.

**Parking Lot and Offering (added 20 August 2026).** The congregation's
spreadsheet grew two new department blocks — PARKING LOT (`Parking #1`…
`Parking #5`) and OFFERING (`Offering #1`…`Offering #6`) — so the app now
knows them too. They appear as their own filter chips and their own coloured
sections on every service card, in My Duties, in the calendar feed, and in
Manage, exactly like Media Booth does. Two things to know:

- The **"Raw Data" tab does not emit Parking or Offering rows yet**, and the
  new columns on the main schedule grid are still empty. Until whoever
  maintains the sheet extends the Raw Data tab to cover those columns, assign
  parking and offering in **Manage** — the sync will never overwrite them.
- Nobody is on the Parking Lot or Offering rosters yet. Add people in
  Manage → People (the department checkboxes), or just assign them once and
  the app adds them to the roster automatically.

What the sheet sync does and does not touch:

- It **only changes duties the sheet actually lists**. If a service in the
  sheet doesn't mention "Media Booth #1," the app leaves whatever is already
  assigned there alone. The same applies to the choir song line: it only
  updates when the sheet has a non-empty `Choir Song` row for that service.
- **Media Booth, Parking Lot and Offering assignments, and any extra/
  manual services you added directly in Manage are preserved** — the sheet
  can't overwrite what it doesn't know about.
- New names in the Member column are **added to the People list**
  automatically (song titles from `Choir Song` rows never are).
- A duty name in the sheet that the app doesn't recognize is **skipped and
  reported as a warning** (visible on the Data & Sync card) — it will not
  silently disappear or crash the sync.

**Use the Manage tab for quick fixes the sheet doesn't carry:** Media Booth,
Parking Lot and Offering assignments, choir songs, one-off/extra services, or
anything you want to change before the next sheet edit. Manage → Services → tap a service to
expand it → assign people or edit the choir song line.

### 2. Passcodes

There are two independent passcodes:

| Passcode | Purpose | Value | Where it's stored |
|---|---|---|---|
| **Site passcode** | Gates the entire app — nobody sees anything until they enter it once per device | ask the coordinator | `app/settings.sitePinHash` (Firestore) |
| **Editor passcode** | Gates only the Manage tab | ask the coordinator | `app/settings.pinHash` (Firestore) |

Both are stored as SHA-256 hashes, never as plain text. The live codes are not
written down in this repo — the coordinator shares them directly.

**To change the site passcode:** Manage → Features → "Change the site
passcode." This instantly relocks every other device — everyone will need
the new code the next time they open the app (their own device stays
unlocked).

**To change the editor passcode:** Manage → Features → "Change the editor
passcode." Same effect: every other editor is relocked out of Manage.

**What "relocking" means:** each device remembers it unlocked with a
`localStorage` marker. Changing a passcode changes the hash it's compared
against, so old markers stop matching and the device is asked again.

**Lost passcode recovery (either one):** open the Firestore console
(https://console.firebase.google.com/project/lv-zion-duties/firestore) →
`app` collection → `settings` document → delete the `sitePinHash` field (for
the site passcode) or the `pinHash` field (for the editor passcode) → save.
The app will treat it as never-set: the site lock opens the first passcode
you enter as the new one; the editor lock will prompt "Create the editor
passcode" for whoever visits Manage next.

**Honest security note:** both passcodes are a deterrent for members, not
real security. The Firestore database rules are open (`allow read, write:
if true` on the main collections) — a technically inclined person could read
or write the data directly, bypassing the app entirely. This is a conscious
tradeoff for zero-login simplicity. If that risk ever matters more than the
convenience, see Brief 1 below (Firebase Auth + locked-down rules).

### 3. Double-duty warnings and "Mark as OK"

When the toggle **Double-duty warnings** is on (default), any service where
one person is assigned two or more duties shows a warning line on that
service's card — visible to everyone, on Schedule, My Duties, and Manage.
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
the warning **reappears automatically** — it does not silently stay
suppressed forever.

To bring back a warning you previously marked OK on purpose, click **"show
warning again"** next to the muted note.

### 4. Notifications

Members opt in per device, on **My Duties**:

1. Pick your name from the dropdown (first time only).
2. Tap **Turn on notifications** and allow the browser prompt.
3. If you also pick your name after enabling, the device registers itself
   to receive real push notifications for that name (see below).

Two kinds of alerts:

- **New duty assigned to you** — fires when an editor (or the sheet sync)
  assigns you a duty you didn't have before.
- **Duty reminder** — fires roughly within 24 hours before each duty.

**These are now real push notifications** (Firebase Cloud Messaging), sent
from the server even if the member's browser tab is closed — not just
in-app alerts. Two Cloud Functions handle this (see Part 2 / HANDOFF for
detail): one watches for schedule changes, one runs hourly to catch
duties starting soon.

**iPhone requirement:** iOS only delivers web push to a site that has been
**added to the Home Screen** (Share → Add to Home Screen), and needs iOS
16.4 or newer. A member who just uses Safari without adding it to their
Home Screen will not get push notifications while the tab is closed.
Android and desktop browsers don't have this restriction.

**Belt-and-suspenders option, still available:** "Add my duties to my
calendar" downloads an .ics file with 1-day and 2-hour alarms built in —
works with zero app/internet dependency once added to the phone's own
calendar app.

### 5. Feature toggles

Manage → Features. Every toggle applies to the whole congregation instantly
— no deploy needed. Full list, defaults, and descriptions live in
[FEATURES.md](FEATURES.md). Quick reference for what shipped 2026-07-03:

| Toggle | Default |
|---|---|
| Site passcode (`siteLock`) | ON |
| Double-duty warnings (`conflictWarnings`) | ON |
| Google Sheet sync (`sheetSync`) | ON |

### 6. Backups, import, and reset

Manage → Data & Sync:

- **Export backup file** — downloads the entire state (schedule, members,
  settings) as JSON. Do this occasionally, and definitely before a big
  manual change.
- **Import backup file** — restores from a previously exported JSON file.
  This overwrites the shared database for everyone. Use with care.
- **Reset to spreadsheet data** — wipes everything and reloads the original
  May–July 2026 schedule baked into `seed-data.js`. Only useful for
  starting over from scratch; a season rollover (Brief 4) is a better fit
  for "the sheet has a new season now."

### 7. Deploying app changes

Current status: deployment is excluded. The commands below are for a later authorized release. Historical extension briefs later in this document are not current instructions to deploy or change rules.

Only needed when the app's code changes (not for schedule edits — those sync
live through Firestore with no deploy). From the app folder:

```
bash /Users/anthony/Projects/worship-duty-app/scripts/deploy.sh
```

**Always use this script for app-file changes.** Every local file is served
with a one-year browser cache, which is only safe because its address carries a
release stamp. The script is what writes that stamp, so it can never be
forgotten: the files in the repo keep the placeholder `DEV`, the stamp exists
only in the staged copy; the working folder is never rewritten. It refuses to upload anything
if a stamp is missing. It deploys **hosting only**.

Current work excludes deployment. Use `--dry-run` to prepare and validate Hosting locally. The script never temporarily rewrites working source.

A future release must list each changed function explicitly, rather than deploying the whole functions package. No permission-rule changes are included here. See [the identity correction runbook](IDENTITY-CORRECTION-RUNBOOK.md) for the separately authorized correction and rollback sequence. Never run a bare Firebase deploy here.

Note: the presider song-picker files (`song-app.js`, `song-lib.js`,
`song-seed.js`, `song-app.css`) deploy with hosting automatically. If you edit
`song-lib.js`, also restart/relink nothing — the Signal ingest daemon in
`~/tools/song-ingest` reads it directly from this folder on its next run.

Always use the `/tmp/npm-cache` prefix on Anthony's Mac. The CLI is already
authenticated.

### 8. The Firebase console map

Project console: https://console.firebase.google.com/project/lv-zion-duties

| Where | What you'll find |
|---|---|
| **Firestore Database → Data** | Live look at `schedule/*` (one doc per service), `app/members`, `app/settings` (both passcode hashes and the sheet URL live here), `tokens/*` (one per device registered for push), `sent/*` (internal reminder de-dupe markers — safe to ignore). Song picker adds `setlists/*` (one per planned/sung service), `songStats/*` (per-song sung history), `app/songSettings` (song editor PIN), `app/presiders`. |
| **Functions** | The two Cloud Functions (`onScheduleWrite`, `dutyReminders`) — logs here if a push doesn't arrive |
| **Project settings → Cloud Messaging** | The Web Push (VAPID) key pasted into `firebase-config.js` |
| **Usage and billing** | Confirm the project is on the Blaze (pay-as-you-go) plan — required for Cloud Functions. Effectively $0/month at this congregation's scale, but see the to-do below. |

**To-do (not yet done):** set a $1 budget alert. Google Cloud console →
Billing → Budgets & alerts → Create budget → set an amount like $1 and an
email alert. This costs nothing and just gives early warning if usage ever
spikes unexpectedly. Recommended now that the project is on Blaze.

### 9. Troubleshooting quick table

| Symptom | Check |
|---|---|
| Sheet changes aren't showing up | Manage → Data & Sync: is the "Google Sheet sync" toggle on? Is the published-CSV link still correct (sheet's File → Share → Publish to web → CSV link, re-copy if the sheet was recreated)? Try "Sync now" and read any warning messages shown. |
| A duty from the sheet never appears | The Duty column text probably doesn't match one of the app's known duty names exactly — check the warnings list on the Data & Sync card, which names the skipped duty. |
| Push notifications not arriving | Did the member turn on notifications in My Duties and pick their name? On iPhone, is the site added to the Home Screen (Share → Add to Home Screen), iOS 16.4+? Check Functions logs in the Firebase console for errors on `onScheduleWrite` / `dutyReminders`. |
| Locked out of the site or Manage | Use the console recovery in section 2 above: delete `sitePinHash` or `pinHash` on the `app/settings` document. |
| Double-duty warning won't go away | Someone needs to click "Mark as OK" in Manage on that service; if it keeps reappearing, that person's duties in that service are still changing between visits. |

---

## Part 2 — Continuing development with AI (the delegation playbook)

This section is how Anthony hands future work to an AI coding tool (Claude
Code or similar) without needing to read or write code personally.

### How to start a task

1. Open a terminal in this project folder and start Claude Code (or your AI
   coding tool of choice).
2. **Always start the conversation with:** "Read the docs in docs/ first."
   This makes sure the model sees this playbook, the architecture, the
   design rules, and the feature registry before touching anything.
3. Paste one of the five briefs below, whole, unedited (fill in nothing —
   they're self-contained).
4. Tell the model: **it must update the relevant docs in `docs/` as part of
   the change, then deploy (`bash /Users/anthony/Projects/worship-duty-app/scripts/deploy.sh`) and verify the
   change on the live site before calling the task done.**
5. Once it reports done, open https://lv-zion-duties.web.app yourself and
   click through the change to confirm it looks and works right.

### Which model to use

- **Opus** — for anything that touches the architecture: authentication,
  the data model, or Cloud Functions. These are the highest-stakes changes
  (get them wrong and the whole app breaks, or security regresses).
- **Sonnet** — for contained work: a self-contained UI feature, a data/sync
  change that doesn't touch security, or documentation-only work.
- Either way, **delegate the actual implementation to an Opus/Sonnet
  subagent** rather than running it on a premium/frontier model directly —
  reserve the expensive model for planning and review, not for typing out
  the diff.

### Brief 1 — Firebase Auth + locked-down security rules (use Opus)

```
Context: This is a static web app (no build step) for a congregation's
worship duty schedule, in /Users/anthony/Projects/worship-duty-app. Firebase
project lv-zion-duties. Firestore rules currently live in
firestore.rules and are wide open: `allow read, write: if true` on
schedule/*, app/*, and tokens/*. There is no login — anyone with the
link can read and write everything; the only protection is a client-side
4-digit passcode UI (both a site-wide passcode and a separate editor
passcode, implemented in app.js and described in docs/PLAYBOOK.md and
docs/HANDOFF.md). This is the single biggest real security gap in the
app and the reason this brief exists.

Read docs/HANDOFF.md, docs/FEATURES.md, docs/PLAYBOOK.md, and
docs/DESIGN.md before changing anything. Skim app.js, especially the
passcode section (search for `siteHash`, `sha256`, `pinHash`) and the
persistence functions (`persistService`, `persistMembers`,
`persistSettings`).

Task: Replace (or meaningfully harden) the open Firestore rules with a
real Firebase Authentication + rules-based security model. Requirements:
- Decide and clearly document the auth model (e.g. anonymous auth plus a
  role claim, or email/password for editors, or Google sign-in) — pick
  the simplest one that actually closes the gap for writes.
- Firestore rules must require authentication for writes to schedule/*,
  app/*, and tokens/*, per an explicit role check (editor vs. anyone) —
  not "if true".
- The site is currently zero-login for VIEWING (read access, no
  passcode required by Firestore itself — the passcode is UI-only).
  Decide consciously whether read access should also require auth, or
  stay open for convenience, and document that decision and its tradeoff
  explicitly in docs/HANDOFF.md's "Known limitations" section. Don't
  silently make it more restrictive without calling it out.
- Do not break existing functionality: schedule sync, sheet sync,
  passcode UI, push notification token registration (functions/index.js
  reads the tokens collection with the Admin SDK, which bypasses rules,
  so that should be unaffected either way).
- No emoji, no religious/cross imagery anywhere in the UI (see
  docs/DESIGN.md rules). Any new UI must reuse the WATV-inspired service
  design tokens in index.html's <style> block, not invent new colors or
  surfaces.
- Update docs/HANDOFF.md (Architecture, Known limitations) and
  docs/PLAYBOOK.md (passcode section, since auth may replace or
  supplement the passcodes) to reflect the new model accurately.

Constraints: this is a non-developer-owned app; keep the deployed
experience as simple as possible for the ~45 congregation members. Don't
introduce a build step or framework.

Verification: after deploying (`bash /Users/anthony/Projects/worship-duty-app/scripts/deploy.sh`), confirm on
the live site (https://lv-zion-duties.web.app) that (a) viewing works as
intended per your documented decision, (b) editing without proper
auth/role is rejected by Firestore itself (test by attempting a raw
write via the browser console or Firestore rules simulator, not just
through the UI), (c) the existing passcode UI and sheet sync still work
end to end. Report exactly what you tested and the results.
```

### Brief 2 — Month view / print view (use Sonnet)

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
— "List" vs "Month"). Requirements:
- Month view: a calendar-grid layout showing which days have services,
  with enough detail per day to be useful at a glance (service labels
  and/or duty counts); clicking/tapping a day can reveal the same detail
  the list view shows.
- Print view: a `@media print` stylesheet (or a dedicated print
  button that opens a print-optimized layout) that produces a clean,
  readable printed schedule — no navigation
  chrome, good use of a printed page, in monochrome-friendly styling.
- Add this as a new feature toggle in the FEATURES array in app.js
  (follow the existing pattern — id, label, desc, def) if you judge it
  should be optional; otherwise justify why it's always-on.
- Respect existing feature toggles that affect what's shown (pastServices,
  emptyDuties, conflictWarnings, choirSong) — the month/print views should
  honor the same toggles the list view does, not bypass them.
- Follow docs/DESIGN.md exactly for any new UI in the normal (non-print)
  view: the existing WATV-inspired tokens (`--brand-blue`, `--surface`,
  `--accent`, `--r-lg`, etc.) already defined in index.html's `<style>`
  block, no emoji, no religious/cross imagery, and alert rose used only
  for alerts.
- No new build step, no framework, no external libraries — plain
  JS/CSS/HTML consistent with the rest of app.js and index.html.

Update docs/FEATURES.md (if a new toggle was added) and docs/HANDOFF.md's
file map / architecture notes if relevant.

Verification: deploy with `bash /Users/anthony/Projects/worship-duty-app/scripts/deploy.sh`,
then open https://lv-zion-duties.web.app and confirm the month view
renders correctly with real data, the print view looks correct via the
browser's print preview, and the existing list view is unaffected.
Report what you tested.
```

### Brief 3 — Duty-swap requests between members (use Opus)

```
Context: This is a static web app (no build step) for a congregation's
worship duty schedule, in /Users/anthony/Projects/worship-duty-app. Read
docs/HANDOFF.md, docs/FEATURES.md, docs/PLAYBOOK.md, and docs/DESIGN.md
first. Members currently only view their duties on the My Duties tab
(`renderMy()` in app.js) — there's no way for two members to trade duties
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
  can accept — your call, but document which you chose and why).
- The other member gets notified (reuse the existing push path — add a
  new Cloud Function or extend `onScheduleWrite`/write a new trigger
  watching a new Firestore collection for swap requests, whichever fits
  the existing patterns better) and can accept or decline from their own
  My Duties view.
- On acceptance, the schedule doc's assignments update automatically
  (the existing `persistService`/Firestore write path) — don't require
  an editor to manually intervene for a normal swap.
- Design a Firestore data shape for swap requests (new collection,
  e.g. `swaps/{id}`) and add matching rules to firestore.rules following
  the existing style (open read/write is the current baseline — decide
  whether swap requests need tighter rules and document the decision).
- No emoji, no religious/cross imagery; reuse the existing WATV-inspired
  design tokens and component patterns (cards, status labels, ghost/primary
  buttons) from index.html's <style> block — don't invent new visual
  language.
- Add a feature toggle (`dutySwap` or similar) in the FEATURES array in
  app.js following the existing pattern, defaulting to on.

Update docs/FEATURES.md (new toggle), docs/HANDOFF.md (architecture:
new collection, new/extended function), and docs/PLAYBOOK.md (a "how
members request a swap" step, and a troubleshooting row if relevant).

Verification: deploy with `bash /Users/anthony/Projects/worship-duty-app/scripts/deploy.sh` (this touches
Hosting only; separately authorize and verify any required backend or rule changes), then test on the live site with
two different member names (two browser profiles or devices) that a
swap request from one is visible to and actionable by the other, and
that acceptance actually updates the schedule for everyone. Report what
you tested, including whether you verified the push notification fired.
```

### Brief 4 — New-season import (use Sonnet)

```
Context: This is a static web app (no build step) for a congregation's
worship duty schedule, in /Users/anthony/Projects/worship-duty-app. Read
docs/HANDOFF.md, docs/FEATURES.md, docs/PLAYBOOK.md, and docs/DESIGN.md
first. The app currently syncs from a published Google Sheet (see
`syncFromSheet()`, `sheetRowsToServices()`, and `parseCSV()` in app.js).
The published-CSV link is stored in `app/settings.sheetUrl` (editable in
Manage → Data & Sync) with a hardcoded default `DEFAULT_SHEET_URL` at the
top of app.js. There's also a static `seed-data.js` with the original
May–July 2026 schedule baked in, used only for first-run seeding and the
"Reset to spreadsheet data" button in Manage.

The sheet-column contract the parser expects (see `sheetRowsToServices`):
header row with columns Month, Date, Service, Worship, Time, Category,
Duty, Member (Category is read but ignored by the app — duty category is
derived from the duty name via the CATEGORIES constant). Date format is
like "Sat, May 02" (weekday prefix optional, no year — the year is
inferred by `inferYearISO()` to be whichever of last/this/next year is
closest to today). Time format is 12-hour, e.g. "9:00 AM" (parsed by
`parseSheetTime`). Duty must exactly match one of the duty names in the
CATEGORIES constant near the top of app.js, or the row is skipped with a
warning — except Duty `Choir Song`, which is a special case: its Member
column holds a song title and is written to that service's `choirSong`
field, never treated as a person. The sheet tab is named "Raw Data."

Task: make it easy for Anthony (non-developer) to roll over to a new
season when the congregation replaces the old sheet/tab with a new one.
Concretely:
- If the new season is just a new tab/sheet with a new published-CSV
  link: this should already work by pasting the new link into Manage →
  Data & Sync — verify this actually works end to end with a realistic
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
bug in the parser — if you do, document the bug and the fix clearly.

Verification: test the link-switch path against a real or realistic
published-CSV sheet with a handful of rows spanning a new date range,
confirm services/members appear correctly and nothing from the prior
season is duplicated or corrupted. If you added a regeneration script,
run it against a sample input and confirm the resulting seed-data.js
loads correctly (use "Reset to spreadsheet data" in Manage to test it,
on a non-production copy or after taking a backup export first). Report
what you tested.
```

### Brief 5 — Automatic dark mode (use Sonnet)

```
Context: This is a static web app (no build step) for a congregation's
worship duty schedule, in /Users/anthony/Projects/worship-duty-app. Read
docs/DESIGN.md carefully first — it documents the current WATV-inspired
service design, which is light-theme-only today. Shared design tokens are
defined in `:root` in index.html; song-specific rules remain scoped in
song-app.css.

Task: add a `prefers-color-scheme: dark` variant of the WATV-inspired
service system — an automatic dark mode that follows the device/browser setting
(no manual toggle needed, unless you judge one is also warranted —
document your choice).
Requirements:
- Keep the same official, orderly, calm concept: crisp service records,
  strong borders, restrained WATV blue, and rose only for alerts.
- Maintain the contrast rules from docs/DESIGN.md: `--muted`-equivalent
  text must stay at ≥4.5:1 against the busiest wash region in dark mode
  too.
- Do not change any token names structurally in a way that breaks
  app.js's inline uses of category colors (`dot-c` backgrounds,
  `--edge` custom property on `.duty-card`) — those are set inline from
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
confirm text contrast and service-record legibility hold up. Deploy with
`bash /Users/anthony/Projects/worship-duty-app/scripts/deploy.sh` and re-verify on the live
site. Report what you tested.
```

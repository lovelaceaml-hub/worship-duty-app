# LV Zion Worship Service

A simple web app for the congregation to see worship duty assignments.
All data was imported from "LV Zion Worship Duty Schedule.xlsx" (May–July 2026,
74 services, 45 members), and now also syncs live from Anthony's Google Sheet.

## Quick links

- **Website:** https://lv-zion-duties.web.app — share this link with members
- **Status:** Live. **13 September 2026: the Appearance gallery is live, with
  Original, Prism, Navy & Cream and Aurora, and selected-service designs open
  on the next service by local time.** **7 September 2026: the app now opens
  fast and the tabs sit at the top.**
  Files are cached for a year behind a release stamp written by `scripts/deploy.sh` (always
  deploy with that script), the presider song files load only for presiders, sign-in no longer
  blocks startup, and the calendar button subscribes to the live feed instead of downloading a
  snapshot that goes stale. A cold phone open is about 1.2 seconds; a repeat open about 0.9
  seconds with no app-file network traffic. See
  [Handoff → Load performance and the release stamp](docs/HANDOFF.md).
- **Earlier:** **26 July 2026: member writes were broken and are now fixed.** Firebase
  Authentication had never been switched on for this project, so the rules (which require a
  signed-in session) were rejecting every duty reminder, swap request and Manage edit. See
  [Usage Counter](docs/USAGE-COUNTER.md). A privacy-safe daily usage counter was added at the
  same time, so "does anyone open this?" is finally answerable.
- **Docs:**
  - [User Manual](docs/USER-MANUAL.md) — how members and presiders use the app
  - [Setup Guide](docs/SETUP-GUIDE.md) — how to run, restore, and publish it
  - [Creation Guide](docs/CREATION-GUIDE.md) — how the combined app is built
  - [Usage Counter](docs/USAGE-COUNTER.md) — what gets counted, and the sign-in bug it found
  - [Playbook](docs/PLAYBOOK.md) — day-to-day operation and AI-delegation guide
  - [User Guide](docs/USER-GUIDE.md) — simple guide to using the app
  - [Handoff](docs/HANDOFF.md) — architecture reference document
  - [Merge Handoff](docs/MERGE-HANDOFF.md) — record of the completed song-app merge
  - [Design](docs/DESIGN.md) — the WATV-inspired service design system
  - [Features](docs/FEATURES.md) — list of feature toggles and defaults
  - [Implementation](docs/IMPLEMENTATION.md) — deep technical guide for extending the app
  - [All documents →](docs/)

**Start here if you manage this app:** [docs/PLAYBOOK.md](docs/PLAYBOOK.md) —
step-by-step instructions for entering the schedule, passcodes, notifications,
deploying, and troubleshooting, plus how to delegate further development to AI.

## The three screens

- **Schedule** — every upcoming service with all assigned duties, grouped by day.
- **My Duties** — a member picks their name once and sees only their duties,
  can expand "Who else is serving?", turn on notifications (real push, see
  below), and download their duties to their phone calendar (with built-in
  reminders).
- **Manage** — for editors (protected by a separate passcode): add/edit
  services, assign people with dropdowns, manage the member list, toggle
  features on/off for everyone, sync from the Google Sheet, back up or reset
  the data.

**Presiders** also see a fourth tab, **Presider**, between My Duties and
Manage. It opens the song-selection screen (Home / Library / Services /
Insights) right inside this app; the **"Plan songs for your service"** button
and per-duty **"Pick songs"** links on My Duties jump straight to a specific
service's setlist. This was the separate "New Song Selection" app, merged in
on 2026-07-10 — see [docs/HANDOFF.md](docs/HANDOFF.md) → "Presider song
picker" and [docs/MERGE-HANDOFF.md](docs/MERGE-HANDOFF.md).

The whole app is also gated by a site-wide passcode before any of the three
screens are shown (see docs/PLAYBOOK.md for both passcodes and how to change
them).

Full documentation lives in `docs/`: [PLAYBOOK.md](docs/PLAYBOOK.md)
(day-to-day operation + AI delegation briefs), [HANDOFF.md](docs/HANDOFF.md)
(architecture + runbook), [DESIGN.md](docs/DESIGN.md) (design system),
[FEATURES.md](docs/FEATURES.md) (feature toggles + passcodes).

## Live sync — DONE (2026-07-03)

The shared database is set up and working:

- Firebase project **LV Zion Duties** (`lv-zion-duties`), on the Blaze
  (pay-as-you-go) plan — upgraded 2026-07-03 to support Cloud Functions for
  push notifications; effectively $0/month at this scale.
- Firestore database created (nam5/US), seeded with the full schedule.
- Security rules (`firestore.rules`, now in the repo) allow open read/write
  on `schedule/*`, `app/*`, and `tokens/*`; the `sent/*` collection (used
  internally to dedupe reminders) is locked to the Admin SDK only. Anyone
  who has the app can still edit the schedule directly if they bypass the
  UI — simple on purpose; see docs/HANDOFF.md's Known limitations.
- `firebase-config.js` contains the real Firebase config and the Web Push
  (VAPID) key.

## The app is LIVE

**Share this link with members: https://lv-zion-duties.web.app**

Deployed to Firebase Hosting on 2026-07-03. On a phone, members can use
"Add to Home Screen" to install it like an app (required for push
notifications to work on iPhone while the app is closed).

To publish visual or app-file changes, run in this folder:

    bash scripts/deploy.sh

This stamps the release, deploys Hosting only, and restores your working
folder. The stamp is what makes the one-year browser cache safe, so always
deploy app changes this way rather than calling firebase directly. Deploy
Firestore rules or Cloud Functions only when those files intentionally changed
and were separately reviewed.

(Schedule edits do NOT need a re-deploy — they sync live through the
database, or via the Google Sheet sync. Re-deploying is only for changes to
the app's code.)

## Notifications — what to expect

- **Real push notifications**, sent from the server (Firebase Cloud
  Messaging + Cloud Functions), fire even when a member's browser tab is
  closed: "New duty assigned to you" when an assignment changes, and a
  "Duty reminder" within 24 hours of each duty.
- A member turns these on once, from My Duties → "Turn on notifications,"
  after picking their name.
- **iPhone note:** push while the app is closed requires the site to be
  added to the Home Screen first (Share → Add to Home Screen), iOS 16.4+.
- **Guaranteed reminders with zero app dependency:** each member can also
  tap "Add my duties to my calendar" — the phone's own calendar then
  reminds them 1 day and 2 hours before each duty, no internet needed.

## Files

- `index.html` — the app shell and styles
- `app.js` — all app logic
- `seed-data.js` — the schedule imported from the Excel file
- `firebase-config.js` — Firebase config + Web Push (VAPID) key for live sync
  and push notifications
- `firestore.rules` — Firestore security rules (deployed alongside hosting)
- `functions/` — Cloud Functions for push notifications (`onScheduleWrite`,
  `dutyReminders`)
- `sw.js`, `manifest.json`, `icon.svg` — make it installable on phones and
  receive background push

# LV Zion Worship Service

A simple web app for the congregation to see worship duty assignments.
All data was imported from "LV Zion Worship Duty Schedule.xlsx" (May–July 2026,
74 services, 45 members), and now also syncs live from Anthony's Google Sheet.

## Quick links

- **App.js split:** [plan](docs/PLAN-2026-09-22-APP-JS-SPLIT.md) and its shipped [module map](docs/CODE-INDEX.md#the-appjs-split-2026-09-22); `app.js` is now 384 lines importing 20 new modules under `core/`, `views/`, `actions/`. Production unchanged, no deploy inside the plan.
- **Retired:** [Complete phone plan](docs/PLAN-COMPACT-PHONE-REFACTOR.md), historical since 2026-09-22; unmerged work preserved on `claude/compact-runtime` and `claude/compact-server`.

- **Website:** https://lv-zion-duties.web.app — share this link with members
- **Status:** Live. **13 September 2026: secure member login, department-scoped
  management, Prism navigation, Presider Home, canonical choir-song sync, and
  the four-choice Appearance gallery are released. The page-selection tabs now
  stay at the top on phones in every appearance, and every appearance has a top
  Appearance button.**
  **14 September 2026: confirmed duplicate member identities were removed from
  the live roster and schedule history. Hosting release `gallery1789369159506`
  and all 12 named Functions now prevent those variants from returning.**
  **14 September 2026: department rosters are live with UID-keyed profiles,
  duty eligibility, schedulability, recurring availability, date exceptions,
  leader scope, and audited administrator overrides. Production release
  `gallery1789403828659` migrated and verified 28 authenticated profiles and
  preserves Original, Prism, Navy & Cream, and Aurora.**
  **14 September 2026: the Presider Services tab is restored so all upcoming
  setlists and complete past song tracking are visible again in Hosting
  release `gallery1789436396335`.**
  **14 September 2026: same-day Presider services now advance by their actual
  service time, so a completed Early Morning service no longer remains ahead
  of the approaching Evening service. Hosting release `gallery1789436708355`.**
  **15 September 2026: the Schedule default now uses the same Pacific-time
  current-or-next rule in Original, Prism, Navy & Cream, Aurora, and the
  read-only maintenance schedule. The 5:00 AM versus 7:30 PM same-day case is
  tested across every appearance. Hosting release `gallery1789446013699` is live.**
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
  - [Department roster release](docs/DEPARTMENT-ROSTER-AVAILABILITY-RELEASE.md) - production evidence and retained history
  - [Completed plan](docs/PLAN-DEPARTMENT-ROSTER-AVAILABILITY.md) - department rosters, duty eligibility, and availability
  - [Merge Handoff](docs/MERGE-HANDOFF.md) — record of the completed song-app merge
  - [Design](docs/DESIGN.md) — the WATV-inspired service design system
  - [Features](docs/FEATURES.md) — list of feature toggles and defaults
  - [Implementation](docs/IMPLEMENTATION.md) — deep technical guide for extending the app
  - [All documents →](docs/)

**Start here if you manage this app:** [docs/PLAYBOOK.md](docs/PLAYBOOK.md) —
step-by-step instructions for entering the schedule, account sign-in, notifications,
deploying, and troubleshooting, plus how to delegate further development to AI.

## Compact design handoff

[Design handoff](docs/COMPACT-DESIGN-HANDOFF.md) records the selected Weekbook direction, current-data evidence, preview commands, and the stop before runtime implementation or release. [Code index](docs/CODE-INDEX.md) separates prototype sources from the existing production runtime.

## Current member workspaces

Members sign in with their own accounts. Schedule shows upcoming services; My Duties shows the signed-in member's duties, reminders and calendar actions. Authorized department leaders and administrators use Manage for their permitted departments. Presiders can plan songs in the embedded song workspace.

The separate site lock remains in place. Account sign-in and department permissions control editing. See the [current user manual](docs/USER-MANUAL.md) for operation and the [playbook](docs/PLAYBOOK.md) for maintenance.

The [compact phone refactor](docs/PLAN-COMPACT-PHONE-REFACTOR.md) is in progress. Its floating navigation and new role flows are not released. [Compare the two local prototype directions](docs/design/prototype/compact-phone/index.html).

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

This compatibility command builds and verifies Original, Prism, Navy & Cream,
and Aurora, then runs the guarded gallery publisher. Direct Firebase Hosting
deploys are blocked because they can replace the compiled gallery with the
single-design repository root. Deploy Firestore rules or Cloud Functions only
when those files intentionally changed and were separately reviewed.

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
- `app.js`: entry script, imports `core/`, `views/`, `actions/dispatch.js` (see [docs/CODE-INDEX.md](docs/CODE-INDEX.md#the-appjs-split-2026-09-22) for the module map)
- `seed-data.js` — the schedule imported from the Excel file
- `firebase-config.js` — Firebase config + Web Push (VAPID) key for live sync
  and push notifications
- `firestore.rules` — Firestore security rules (deployed alongside hosting)
- `functions/` — Cloud Functions for push notifications (`onScheduleWrite`,
  `dutyReminders`)
- `sw.js`, `manifest.json`, `icon.svg` — make it installable on phones and
  receive background push

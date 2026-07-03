# LV Zion · Worship Duty Schedule

A simple web app for the congregation to see worship duty assignments.
All data was imported from "LV Zion Worship Duty Schedule.xlsx" (May–July 2026,
74 services, 45 members).

## The three screens

- **Schedule** — every upcoming service with all assigned duties, grouped by day.
- **My Duties** — a member picks their name once and sees only their duties,
  can expand "Who else is serving?", turn on notifications, and download their
  duties to their phone calendar (with built-in reminders).
- **Manage** — for editors (protected by a passcode): add/edit services,
  assign people with dropdowns, manage the member list, toggle features
  on/off for everyone, back up or reset the data.

Full documentation lives in `docs/`: [HANDOFF.md](docs/HANDOFF.md)
(architecture + runbook), [DESIGN.md](docs/DESIGN.md) (design system),
[FEATURES.md](docs/FEATURES.md) (feature toggles + passcode).

## Live sync — DONE (2026-07-03)

The shared database is set up and working:

- Firebase project **LV Zion Duties** (`lv-zion-duties`), free Spark plan,
  created under alovelace144@gmail.com.
- Firestore database created (nam5/US), seeded with the full schedule.
- Security rules allow read/write on the `schedule` and `app` collections
  only, with no expiry. Note: anyone who has the app can edit the schedule —
  simple on purpose. Firebase Authentication can be added later if needed.
- `firebase-config.js` already contains the real config.

## The app is LIVE

**Share this link with members: https://lv-zion-duties.web.app**

Deployed to Firebase Hosting on 2026-07-03. On a phone, members can use
"Add to Home Screen" to install it like an app.

To publish future changes to the app files, run in this folder:

    npx firebase-tools deploy --only hosting

(Schedule edits do NOT need a re-deploy — they sync live through the
database. Re-deploying is only for changes to the app itself.)

## Notifications — what to expect

- **New-duty alerts and day-before reminders** appear as system notifications
  when the app is open, and catch up the moment a member opens the app.
  On a phone, "Add to Home Screen" makes it behave like a real app.
- **Guaranteed reminders even with the app closed:** each member should tap
  "Add my duties to my calendar" — the phone's own calendar then reminds
  them 1 day and 2 hours before each duty, no internet needed.
- True push notifications while the app is closed require a notification
  server (Firebase Cloud Messaging + a Cloud Function); can be added later.

## Files

- `index.html` — the app shell and styles
- `app.js` — all app logic
- `seed-data.js` — the schedule imported from the Excel file
- `firebase-config.js` — paste your Firebase config here for live sync
- `sw.js`, `manifest.json`, `icon.svg` — make it installable on phones

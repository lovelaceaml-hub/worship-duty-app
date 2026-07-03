# LV Zion Worship Duty Schedule — Handoff Document

Last updated: 2026-07-03. Owner: Anthony (alovelace144@gmail.com).

## What this is

A real-time web app the whole congregation uses to see worship duty
assignments. It replaced the shared spreadsheet
("LV Zion Worship Duty Schedule.xlsx"), whose full May–July 2026 schedule
(74 services, 45 members) was imported as the starting data.

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
- **Backend:** Firebase project `LV Zion Duties` (`lv-zion-duties`), Spark
  (free) plan.
  - **Firestore** (nam5/US): collection `schedule` — one document per
    service, id `YYYY-MM-DD_<service-label>`; document `app/members` —
    `{list: [names]}`; document `app/settings` —
    `{features: {...}, pinHash: "sha256-hex"}`.
  - **Hosting:** site `lv-zion-duties`; deploy config in `firebase.json` +
    `.firebaserc`.
  - **Rules:** open read/write on `schedule/*` and `app/*` only, no expiry
    (set 2026-07-03).
- **Two modes:** if `firebase-config.js` has a config, the app syncs live
  (Firestore `onSnapshot`); otherwise it runs on localStorage only. The
  first client to see an empty database uploads `seed-data.js` automatically.
- **PWA:** `manifest.json` + `sw.js` (network-first fetch, notification
  click focus). Members can "Add to Home Screen".

## Editor passcode (added 2026-07-03)

- Manage is gated by a passcode when the `editorLock` feature is on.
- The SHA-256 hash of the passcode lives in `app/settings.pinHash` (synced
  to all devices). A device that unlocks stores the hash in
  `localStorage['wds-unlock']`; changing the passcode relocks every other
  device. "Lock" button relocks the current device.
- **Initial passcode: `2026` — change it in Manage → Features.**
- Honest security note: this is a strong deterrent for members, not bank
  security. The database rules are open (the app has no login), so a
  technical person could bypass the UI. If that ever matters, add Firebase
  Authentication + per-role rules (see Roadmap).

## Feature toggles (added 2026-07-03)

Manage → Features. Stored in `app/settings.features`, applied on every
device instantly. Registry lives in `FEATURES` at the top of `app.js` —
see `docs/FEATURES.md` for the list and how to add one.

## Notifications & reminders — what to expect

- New-duty alerts and <24h reminders fire while the app is open, and catch
  up the moment a member opens it. Detection = diff of the member's duty
  keys vs `localStorage['wds-seen-<name>']`.
- Guaranteed reminders with the app closed: "Add my duties to my calendar"
  (.ics with 24h and 2h alarms).
- True push while closed needs FCM + a Cloud Function (see Roadmap).

## Operations runbook

- **Edit the schedule:** Manage tab (passcode) on any device. No deploy.
- **Deploy app-file changes:** from the app folder run
  `npx firebase-tools deploy --only hosting` (CLI already authenticated on
  Anthony's Mac; if npm cache errors appear, prefix with
  `npm_config_cache=/tmp/npmcache`).
- **Backups:** Manage → Data & Sync → Export backup file (JSON of the whole
  state). Import restores it (overwrites for everyone).
- **Reset to spreadsheet:** Manage → Data & Sync — overwrites everything
  with `seed-data.js`.
- **Import a new spreadsheet season:** re-run the extraction approach —
  openpyxl over the "Data List" (flat) and "Clean Schedule" sheets →
  regenerate `seed-data.js` → reset, or add services by hand in Manage.
- **Firebase console:** https://console.firebase.google.com/project/lv-zion-duties

## Known limitations

1. Open database rules — anyone with the link who bypasses the UI could
   write. Accepted tradeoff for zero-login simplicity.
2. Notifications require the app to be opened; no server push yet.
3. Concurrent edits: last write per service document wins (fine at this
   scale; each service is its own document, so edits to different services
   never conflict).
4. `crypto.subtle` (passcode hashing) requires HTTPS or localhost — fine on
   the hosted URL.

## Roadmap candidates

- FCM push notifications via a small Cloud Function (requires Blaze plan,
  still ~$0 at this scale).
- Firebase Auth (email allowlist) replacing open rules + passcode.
- Month view / print view.
- Duty-swap requests between members.

## File map

| File | Purpose |
|---|---|
| `index.html` | Shell + full design system (see `docs/DESIGN.md`) |
| `app.js` | All logic: rendering, sync, passcode, features, notifications |
| `seed-data.js` | Schedule imported from the Excel file |
| `firebase-config.js` | Real Firebase web config (public identifiers) |
| `firebase.json` / `.firebaserc` | Hosting deploy config |
| `manifest.json`, `sw.js`, `icon.svg` | PWA install + notifications |
| `docs/` | This handoff, design system, feature registry, QA report |

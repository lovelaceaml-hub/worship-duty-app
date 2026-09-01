# LV Zion Worship Service

A simple web app for the congregation to see worship duty assignments.
All data was imported from "LV Zion Worship Duty Schedule.xlsx" (May–July 2026,
74 services, 45 members), and now also syncs live from Anthony's Google Sheet.

## Quick links

- **Website:** https://lv-zion-duties.web.app — share this link with members
- **Status:** Live. **26 July 2026: member writes were broken and are now fixed** — Firebase
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

    npm_config_cache=/tmp/npm-cache npx -y firebase-tools@latest deploy --only hosting

This safely deploys Hosting only. Deploy Firestore rules or Cloud Functions
only when those files intentionally changed and were separately reviewed.

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

## Firebase to Vercel Worship sync sender, Section 8

The separately named Cloud Functions `onVercelScheduleWrite` and
`worshipVercelReconcile` implement the frozen Firebase to Vercel sender
contract. The sender reads only `schedule/*`, projects the approved service
and assignment fields, signs the exact canonical JSON bytes, and sends either
one event or a deterministic multipart full snapshot. Its durable sender state
is in the unmatched top-level `worshipVercelSync/*` collection, which the
existing rules deny to clients by default. The state includes the sequence,
revision ledger, encrypted binary chunk queue, snapshot generation index, and a
crash-safe lease. Chunk documents are staged under
`worshipVercelSync/chunks/sets/{candidateId}/items/{chunkIndex}` with a
sub-900-KiB document bound, batches of at most 50 writes and 2 MiB. The final
allocation transaction stores compact manifests and queue state only. Losing
staged candidates are deleted on allocation races or carry a hard expiry
boundary and are never reused. Reconcile deterministically deletes expired
chunks still referenced by resolved revisions, in bounded batches. Each chunk
set has a private parent marker with staged, active, resolved, or empty status,
so cleanup queries only eligible nonempty sets and never spends its bound on
already-empty parents. It never
uses client-writable `app/*`, writes a Google Sheet,
reads or writes any other app data, and does not alter the existing
`onScheduleWrite` notification trigger.
The frozen contract file SHA-256 is
`6fe1519db42989f822d5a733688cd7c0b1ae5744f8b77791900419b67be4db96`.

One shared queue dispatcher claims the lowest unresolved source sequence in a
transaction, sends outside that transaction, and records the result in a
second transaction. An active 30-second lease blocks higher sequences; an
expired lease can be reclaimed after the chunk manifest is validated and the
body is reconstructed and authenticated. Unknown and
retryable outcomes remain unresolved, so a higher sequence cannot overtake
them. Snapshot identities are generation-aware. Equal content after a later
global sequence, or after conflict or expiry cleanup, receives a fresh sequence
and opaque `snap-N` identifier. Receiver status 202 remains
`accepted_pending_mapping` and is never rewritten as adopted.

Delivery is default off. It is enabled only when the provider-managed function
configuration flag `LV_ZION_WORSHIP_SYNC_ENABLED` is exactly `true`, with the
destination in `LV_ZION_WORSHIP_SYNC_URL`, the active key identifier in
`LV_ZION_WORSHIP_SYNC_KEY_ID`, and the signing secret in the managed secrets
`LV_ZION_WORSHIP_SYNC_SECRET` and, during rotation overlap,
`LV_ZION_WORSHIP_SYNC_PREVIOUS_SECRET`. The current key-version name is
optional as `LV_ZION_WORSHIP_SYNC_KEY_VERSION`. The nonsecret
`LV_ZION_WORSHIP_SYNC_KEYRING_MODE` is `current` by default and accepts only
`current` or `rotating`. In `current` mode, the sender resolves only the
current managed secret and ignores the previous secret and its metadata. In
`rotating` mode, distinct previous-version and exact activation metadata must
validate before either managed secret is resolved.
`LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_VERSION` is required in rotating mode and
must identify that prior key.
`LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS` is required in rotating
mode and is the exact 13-digit provider UTC millisecond rotation-start value
shared with the receiver, when the current key became active and the previous
key entered overlap. In rotating mode, the previous key is accepted only when
trusted time is strictly less than that value plus 86400000 ms. Missing,
malformed, future, or invalid activation metadata disables sender work
fail-closed. At or after the
overlap boundary, the previous key is not accepted and the current key remains
valid. The current and previous key versions must be valid, distinct IDs.
`LV_ZION_WORSHIP_SYNC_SOURCE_FROZEN`
is the source-freeze kill switch. No configuration values or secrets belong in
this repository.

Each part allows three 10-second attempts with bounded backoff, for a maximum
30-second per-part budget. Forty parts plus a 5-second dispatch margin require
1,205 seconds, which fits within the scheduler's 1,800-second timeout and the
receiver's 1,500-second staging TTL. The event trigger is capped at 540 seconds
and can deliver at most its lowest ready event item. The scheduler owns
multipart delivery and defers when the computed remaining invocation budget is
insufficient. The installed Firebase SDK endpoint manifest is checked offline
for `timeoutSeconds: 540` on the event export and `timeoutSeconds: 1800` on the
scheduled export.

Safe verification from `functions/` is:

    npm test
    node --check worship-sync.js
    node --check index.js

Deployment of the sender remains prohibited and pending the Section 9 and
Section 10 release gates. Until those gates are authorized, do not run a
Firebase Functions deploy. To disable the sender, set
`LV_ZION_WORSHIP_SYNC_ENABLED` to a value other than `true` or set
`LV_ZION_WORSHIP_SYNC_SOURCE_FROZEN` to `true`, then leave the existing
schedule, notification, ICS, Sheet sync, and public schedule functions in
place. The protected `onScheduleWrite` block has not been changed. Its exact
slice SHA-256 is
`535f67182e87564170e9e6e8b8336b6f9d75c9e13f19c91b7cdf0ac76c71db92`.

## Files

- `index.html` — the app shell and styles
- `app.js` — all app logic
- `seed-data.js` — the schedule imported from the Excel file
- `firebase-config.js` — Firebase config + Web Push (VAPID) key for live sync
  and push notifications
- `firestore.rules` — Firestore security rules (deployed alongside hosting)
- `functions/`: Cloud Functions for push notifications, the read-only
  default-off Vercel sender, and pure function tests
- `sw.js`, `manifest.json`, `icon.svg` — make it installable on phones and
  receive background push

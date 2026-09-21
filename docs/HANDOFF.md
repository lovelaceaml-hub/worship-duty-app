# LV Zion Worship Service: Handoff

Last updated: 2026-09-20. Owner: Anthony.

Live app: https://lv-zion-duties.web.app

This document gives the current state first, then how to resume, then the
reference material. For day-to-day operation and releases see
[PLAYBOOK.md](PLAYBOOK.md). For what each screen does see
[USER-GUIDE.md](USER-GUIDE.md) (members) and [USER-MANUAL.md](USER-MANUAL.md)
(leaders and administrators).

## 1. Current state (2026-09-20)

- Features F1 to F12 are live. Live release marker: `gallery1789952310145`.
- Approach since 2026-09-17: keep the live look. Anthony rejected the
  integrated new-shell preview because it replaced the app's look. Features are
  added into the four existing appearances (Original, Prism, Navy & Cream,
  Aurora) one at a time, shown on the preview channel first, and released on
  his approval.
- Live Hosting source: branch `claude/keep-look-f4f5`.
- Live Cloud Functions and live Firestore rules source: branch
  `claude/compact-integration` (deployed 2026-09-17; `feedback` rule added
  2026-09-20, commit `a5068d9`).
- In progress on 2026-09-20: lane F13 (test suite update). Lane F12 (Navy & Cream
  double card) was released the same day; lane F14 (this documentation pass)
  is merged.
- The durable record is the `## Build log` in
  [PLAN-COMPACT-PHONE-REFACTOR.md](PLAN-COMPACT-PHONE-REFACTOR.md), plus one
  record per feature in [runs/keep-look-features/](runs/keep-look-features/).

## 2. How to resume

1. Read [AGENTS.md](../AGENTS.md), then this file, then the last entries of the
   plan's Build log.
2. Work in a new branch and worktree made from `claude/keep-look-f4f5`. One
   writer per worktree.
3. Check the goal line first: "Preserve Original, Prism, Navy & Cream, and
   Aurora as four distinct layouts." For a live app, "preserve" means match the
   live look unless Anthony named the change.
4. Verify with `node --check app.js` and `node design-gallery/build.mjs`, then a
   phone-width walkthrough of all four appearances with mock data.
5. Publish the preview channel and give Anthony the link. He approves on the
   preview, then runs the release commands himself
   ([PLAYBOOK.md](PLAYBOOK.md) sections 8 and 8a).
6. Write a record in `docs/runs/keep-look-features/`. The coordinator adds the
   Build log entry.

## 3. Branches and worktrees

All worktrees live under `/Users/anthony/Projects/worship-duty-app-worktrees/`
unless a full path is shown.

| Branch | Worktree | Use it for |
| --- | --- | --- |
| `claude/keep-look-f4f5` | `keep-look-f4f5` | USE THIS. Source of the live Hosting app. Start feature branches here and release from here. |
| `claude/compact-integration` | `compact-integration` | USE FOR SERVER ONLY. Source of the live Cloud Functions and Firestore rules. Its new-shell UI was rejected; never publish its Hosting build. |
| `claude/f12-navy-double-card`, `claude/f13-test-suite`, `claude/f14-docs` | same names without `claude/` | Lanes in progress on 2026-09-20. |
| `claude/keep-look-features` | `keep-look-features` | Historical. Stops at F3. Only useful as a source rollback point to F3. |
| `claude/f4-bottom-bar`, `claude/f4b-bar-standout`, `claude/f5-notifications`, `claude/f6-unified-header`, `claude/f7-account-menu`, `claude/f8-dots-subnav`, `claude/f9-cleanup`, `claude/f10-feedback` | same names without `claude/` | Historical. Finished lanes, already merged into `claude/keep-look-f4f5`. |
| `codex/compact-phone-refactor` | `/Users/anthony/Projects/worship-duty-app` (main checkout) | Historical. Sits at `1e0b6fd`, the pre-F1 source. Do not release from it. The release script would refuse, because the live app is not in its history. |
| `claude/compact-runtime`, `claude/compact-server`, `codex/compact-design`, `codex/compact-docs`, `codex/compact-index`, `codex/compact-server` | `compact-*` | Historical. Parts of the rejected new-shell build. The server work was merged into `claude/compact-integration`. |
| `codex/department-*`, `lane/auth-upgrade/*`, `feature/*`, `lane/design-gallery-reconcile/*` | matching names | Historical. Finished September 13 to 14 work. |

## 4. Release history, F1 to F11

Every release was Hosting only, through `node design-gallery/release.mjs
--publish`, with the maintenance message shown during the change
([PLAYBOOK.md](PLAYBOOK.md) section 8a). Markers are the "restored" release of
each pair.

| Feature | What changed | Live | Marker | Record |
| --- | --- | --- | --- | --- |
| F1 | Schedule default advances to the next service at each service's start minute (Pacific time) | 2026-09-17 | `gallery1789697177680` | [F1](runs/keep-look-features/F1-schedule-default.md) |
| F2 | Reset PIN button on department roster rows | 2026-09-17 | `gallery1789701070255` | [F2](runs/keep-look-features/F2-reset-pin-button.md) |
| F3 | Add a department member by name search; no account ID anywhere on screen | 2026-09-19 | `gallery1789826356791` | [F3](runs/keep-look-features/F3-member-search-by-name.md) |
| F4, F4b | Floating bottom bar on phones in all four appearances, then a bolder restyle | 2026-09-19 | `gallery1789833476547` | [F4](runs/keep-look-features/F4-floating-bottom-bar.md), [F4b](runs/keep-look-features/F4b-bar-standout.md) |
| F5 | Calmer notifications area on My Duties (help text folded into "How it works") | 2026-09-19 | `gallery1789833476547` | [F5](runs/keep-look-features/F5-notifications-layout.md) |
| F6, F6b | One shared header with the screen title; no dark or pause buttons; dark follows the system in Prism and Aurora; small Appearance icon; Live sync dot on phones in Original and Navy & Cream; Prism utility row removed | 2026-09-19 | `gallery1789833476547` | [F6](runs/keep-look-features/F6-unified-header.md), [release](runs/keep-look-features/RELEASE-2026-09-19-F4-F5-F6.md) |
| F7 | Member name opens a menu: Availability, Settings, Sign out. "Signed in as" bar and pink attention banner removed. Availability editor moved to its own account view | 2026-09-20 | `gallery1789951374910` | [F7](runs/keep-look-features/F7-account-menu.md) |
| F8 | Green new-duty dot on My Duties, red dot on Manage, secondary menus in one row under the header on phones | 2026-09-20 | `gallery1789951374910` | [F8](runs/keep-look-features/F8-dots-and-subnav.md) |
| F9 | Cleanup: Prism dark banner contrast, no raw ID in "last changed by", stale docs | 2026-09-20 | `gallery1789951374910` | [F9](runs/keep-look-features/F9-cleanup.md) |
| F10 | Floating feedback button, feedback sheet, administrator Feedback list under Manage, Firestore collection `feedback` | 2026-09-20 | `gallery1789951374910` (rules deployed first from `claude/compact-integration`, `a5068d9`) | [F10](runs/keep-look-features/F10-feedback.md) |
| F11 | Navy & Cream month arrows and next-service chevron now visible | 2026-09-20 | `gallery1789951374910` | [F11](runs/keep-look-features/F11-navy-month-arrows.md), [release](runs/keep-look-features/RELEASE-2026-09-20-F7-F11.md) |
| F12 | Navy & Cream Day view shows each service once | 2026-09-20 | `gallery1789952310145` | [F12](runs/keep-look-features/F12-navy-double-card.md) |

The F3 marker is taken from the "Before" row of the F4 to F6 release record.
F3 has no release record of its own.

Rollback: open the Hosting console
https://console.firebase.google.com/project/lv-zion-duties/hosting/sites/lv-zion-duties
and use a release row's menu, Rollback. The previous release before F7 to F11
is `gallery1789833476547`. The `feedback` rule can stay in place on a rollback.

## 5. Open items

This is the one list. Other documents point here.

1. (Closed 2026-09-20) Navy & Cream Day view showed the selected service card
   twice. Fixed and released as F12.
2. `design-gallery/test.mjs` is out of date: it clicks sub-tab buttons that are
   now hidden on phones and expects account ID text that was removed. Lane F13,
   in progress.
3. Dead CSS remains: utility-row and old header rules in the appearance
   stylesheets no longer match anything.
4. Never done: a check on a real phone (keyboard hiding the bar, safe area,
   system dark switching) and a screen reader check (sync dot, tab dots, account
   menu, feedback sheet).
5. Never done by an agent: any signed-in production screen, a real feedback
   send, and a real administrator Feedback list read. Anthony should send one
   test note and open Manage, Feedback.
6. Manage, Features still shows an "Editor passcode" switch and a "Change the
   editor passcode" card. Neither controls anything now: Manage access comes
   from the signed-in account's role. Candidate for removal.
7. The first run of the automatic song history recorder
   (`songHistoryRecorder`) was never observed in the logs (see item 8 and
   `docs/runs/compact-phone-refactor/lanes/S6.md` on branch
   `claude/compact-integration`).
8. Plan features with no screen yet. The server side of several is already
   live, deployed from `claude/compact-integration` on 2026-09-17, but the live
   app does not call it:

| Plan feature | Server side, live | Screen in the live app |
| --- | --- | --- |
| Department invite links (share or copy, single use, seven days, revocable) | Yes: `createDepartmentInvitation`, `revokeDepartmentInvitation`, `acceptDepartmentInvitation`, and a locked `departmentInvitations` collection | None |
| One combined Needs attention list with atomic resolve | Yes: `resolveDutyAttention` | None. The live app still has separate Manage, Requests and Manage, Planning, and approving a request does not change the schedule |
| Version-aware saves (reject stale edits, keep the draft) | Yes: revision checks inside the department and assignment callables and `saveSongService`. They do nothing for the live app, because it does not send an expected revision | None. Last write wins |
| Presider history automation | Yes, and it runs with no screen: `songHistoryRecorder` runs every 30 minutes and records a confirmed song list as sung three hours after the service starts, only for services dated 2026-09-17 or later. `correctSongHistory` exists for corrections | No "automatic" label and no correction screen. Presiders still have Mark as sung |
| Multi-department availability in one save | Yes: `saveMemberAvailability` | None. The live Availability view saves one department at a time through `updateMemberAvailability` |
| Member search by name | Yes: `searchDepartmentCandidates` | Yes (F3) |
| Clean startup in the saved appearance, role start screens, pagination, Save states, notification deep links | No server part | None |

## 6. Standing warnings

- NEVER deploy `firestore.rules` from `claude/keep-look-f4f5` (or a branch made
  from it). It is older than the live rules: no `departmentInvitations`, no
  `feedback`. Rules deploy only from
  `/Users/anthony/Projects/worship-duty-app-worktrees/compact-integration`
  with `--only firestore:rules`.
- The same holds for `functions/`: nine live functions exist only on
  `claude/compact-integration`. Never deploy functions from `keep-look-f4f5`.
- The Firebase project is shared. Two live functions
  (`onVercelScheduleWrite`, `worshipVercelReconcile`) belong to another app.
  Never run a bare `firebase deploy` or a bare `--only functions`; name every
  target.
- Hosting goes out only through `node design-gallery/release.mjs`. A direct
  Hosting deploy is blocked by `scripts/guard-gallery-deploy.mjs`, because it
  would replace the four appearances with the single-design root.
- The Claude Code auto mode classifier denies production deploys to Claude.
  Anthony runs release commands himself from copy-paste blocks with absolute
  paths. Do not work around the denial.
- The preview channel reads and writes REAL records.
- Never put passcodes, PINs, tokens, real member names, or production records
  in Git, fixtures, screenshots, or review packets.
- Do not wipe or reseed the production schedule. Manage, Data & Sync still has
  a "Reset to spreadsheet data" button that overwrites everything with the May
  to July 2026 seed. Do not use it on the live app.

## 7. How the live app is built

### Screens and shared pieces

- One shared app (`index.html`, `app.js`, `permissions.js`) holds all data,
  sign-in, saving, and actions. The design gallery compiles it with the Prism,
  Navy & Cream, and Aurora presentations into one Hosting build. See
  [design-gallery/README.md](../design-gallery/README.md).
- Gates, in order (`render()` in `app.js`): maintenance page, site passcode,
  member sign-in, forced PIN change, then the app.
- Main screens: Schedule, My Duties, Presider (only for members with an
  upcoming Presider duty or song-editor permission), Manage (only for
  department leaders and administrators).
- Shared header: markup once in `index.html`; `paintHeader()` and
  `SCREEN_TITLES` in `app.js` fill it; `design-gallery/header.css` styles it per
  appearance. The member chip opens the account menu (`setAccountMenu()`), whose
  Availability and Settings items are personal views inside My Duties
  (`ui.account`, `renderAccount()`).
- Phones (640 pixels wide or less): `nav.tabs` floats at the bottom in every
  appearance and hides while the keyboard is open
  (`watchKeyboardForTabBar()`); Manage and Presider secondary menus are
  mirrored into one row under the header (`watchTopSubnav()`); "Live sync on"
  becomes a status dot in Original and Navy & Cream (`setSyncPill()`).
- Dots: green on My Duties for a new duty (`checkNewDuties()`, cleared when My
  Duties opens); red on Manage when `actionableCountsForViewer().total` is
  above zero.
- Dark mode: Prism and Aurora follow `prefers-color-scheme`
  (`design-gallery/host-bridge.js`). Original and Navy & Cream stay light. All
  appearances respect `prefers-reduced-motion`.
- Feedback (F10): `syncFeedbackButton()`, `sendFeedback()`,
  `renderManageFeedback()` in `app.js`; Original's styles in `index.html`, the
  other three in `design-gallery/feedback.css`. Notes go to the Firestore
  collection `feedback`. Members can only create; administrators read, mark
  done, and delete.

### Sign-in and permissions

- Site passcode: a device-level screen gate when the `siteLock` switch is on.
  Stored only as a hash in `app/settings.sitePinHash`. It is not the security
  boundary.
- Member sign-in: the member picks their name and enters a 4 to 6 digit PIN.
  The `verifyMemberPin` function checks it and returns a Firebase custom token
  (`signInWithCustomToken`). There is no anonymous sign-in any more.
- A reset or new privileged account must choose a new PIN before the app opens
  (`renderForcedPinChange()`).
- `fbWrite()` refuses every Firestore write without a verified session.
- Roles (administrator, department leader, song editor) and department scope
  come from the account and `permissions.js`. Browser checks are for display;
  Firestore rules and the callable functions are the real boundary.
- The July-era shared editor passcode is retired. `renderUnlock()` and
  `renderCreatePin()` are dead code, and the `editorLock` switch is read
  nowhere.
- The song planner's separate editor PIN is also retired: `requireEditor()` in
  `song-app.js` now relies on the member session and permission checks.

### Data (Firestore, project `lv-zion-duties`)

| Path | Holds |
| --- | --- |
| `schedule/{date_service}` | One document per service: date, time, worship, assignments, choir song, acknowledged conflicts. Anyone can read; writes need the right role |
| `app/members`, `app/settings`, `app/nameMap`, `app/departments`, `app/leaderConfig`, `app/roles`, `app/presiders`, `app/songEditors` | Shared lists and settings |
| `accounts/{id}` | Member accounts and roles (server only) |
| `departments/{department}/members/{member}` | Department profiles: status, eligible duties, schedulability, availability |
| `departmentAssignments`, `memberships`, `audit` | Assignment projection, membership, and the change history |
| `requests/{id}` | Change requests |
| `tokens/{token}` | Devices registered for push. Not readable by clients |
| `sent/{id}` | Reminder de-duplication. Server only |
| `setlists/{serviceId}`, `songStats/{songId}` | Song plans and sung history. Open read and write, because the Signal ingest service writes without a member session |
| `pulse/{day}` | Privacy-safe daily usage counter |
| `feedback/{id}` | Member feedback (F10) |
| `departmentInvitations/{id}` | Server only. No screen yet |

### Cloud Functions (region `us-central1`, Node 20)

Live set, per the 2026-09-17 deploy record: 30 functions. 19 exist on every
branch (`verifyMemberPin`, `changeMemberPin`, `resetMemberPin`, the seven
department callables, `updateDepartmentMembership`, `updateRoleConfiguration`,
`onScheduleWrite`, `dutyReminders`, `onRequestCreated`, `onRequestResolved`,
`ics`, `publicSchedule`, `scheduledSheetSync`). Nine exist only on
`claude/compact-integration` (`saveMemberAvailability`, `resolveDutyAttention`,
`saveSongService`, `correctSongHistory`, `searchDepartmentCandidates`,
`createDepartmentInvitation`, `revokeDepartmentInvitation`,
`acceptDepartmentInvitation`, `songHistoryRecorder`). Two belong to another app.

### Google Sheet import

- The published "Raw Data" tab is an import source. Firestore is the runtime
  source. Nothing writes back to the Sheet.
- The app pulls on open (at most once per five minutes per device), an
  administrator can tap Sync now, and `scheduledSheetSync` runs every two hours
  on the server. `functions/sheet-lib.js` mirrors the parsers in `app.js`; change
  both together.
- Only duties the Sheet lists are touched. A duty row with a blank Member cell
  clears that duty. A deleted row clears nothing.
- A `Choir Song` row stores its Member cell as the song title for that exact
  date and service. A blank cell clears it. With no `Choir Song` row, a manual
  choir song is kept. (`design-gallery/app-fixes.mjs` and `build.mjs` both check
  this behavior is present.)
- Names pass through the shared name map (`app/nameMap`) so old spellings cannot
  return.

### Notifications and calendar

- Push: `onScheduleWrite` sends "New duty assigned to you"; `dutyReminders`
  runs hourly and reminds within 24 hours of a duty; `onRequestCreated` and
  `onRequestResolved` notify the scheduler and the requester.
- A member turns notifications on per device, from My Duties or from Settings
  under their name. iPhone needs the app on the Home Screen (iOS 16.4 or later).
- Calendar: "Add my duties to my calendar" subscribes the phone to the live
  feed `/ics/<member>` (the `ics` function). The feed needs no sign-in, which
  matches the open read on `schedule`.

### Presider song planner

- `song-app.js` loads only when the Presider screen opens, after
  `song-app.css`, `song-seed.js`, and `song-lib.js` (that order is
  load-bearing). It renders into `#song-root` and uses `data-song-act`, never
  `data-act`.
- `song-lib.js` is the single source of sung-history logic, shared with the
  Signal ingest service in `~/tools/song-ingest`. Do not fork it, and do not
  change `serviceIdFor`, which defines the `setlists` document IDs.
- Confirming a list stamps `confirmedAt`; any later edit makes it read as
  "changed since confirmed". My Duties shows the state beside each Presider
  duty.
- Sections: Home (My Services and All Services), Library, Services, Insights,
  plus the Runsheet on the day of the service.

### Release stamp and caching

- Every local file loaded by the app carries a `?v=` release stamp, and stamped
  files are cached for a year. The source holds the literal `DEV` in
  `index.html`, `app.js` (`ASSET_V`), and `sw.js` (`RELEASE`); the gallery build
  replaces it in the staging folder only.
- If you add a local script or stylesheet, stamp it and add it to the `headers`
  list in `firebase.json`. `index.html` and `sw.js` stay `no-cache` so a new
  release is always noticed.
- Maintenance page: one line in `index.html` switches on the read-only
  "Schedule maintenance in progress" page, which still lists the next eight
  services ([PLAYBOOK.md](PLAYBOOK.md) section 8a). There is no database flag.

### Per-device storage keys

| Key | Purpose |
| --- | --- |
| `wds-data-v2` | Offline copy of the schedule |
| `wds-me` | The signed-in member name |
| `wds-site-unlock` | Hash proving this device passed the site passcode |
| `wds-design-gallery-v1` | The chosen appearance |
| `wds-dept` | Last department filter on Schedule |
| `wds-notify`, `wds-fcm-token`, `wds-fcm-name` | Notification choice and push registration |
| `wds-seen-<name>`, `wds-alerts-<name>`, `wds-unread-<name>`, `wds-reminded` | New-duty detection, Recent updates list, the green dot, reminder de-duplication |
| `wds-sheet-sync-at`, `wds-sheet-sync-result` | Sheet sync throttle and last result |
| `wds-unlock` | Retired editor passcode marker. Controls nothing |

## 8. Earlier releases (history)

- 2026-09-15: one Pacific-time Schedule default for all four appearances and
  the maintenance schedule, Hosting release `gallery1789446013699`. F1 later
  replaced its three-hour "stays current" window.
- 2026-09-14: Presider next-service ordering by service time
  (`gallery1789436708355`); Presider Services tab restored with full past song
  tracking (`gallery1789436396335`); duplicate member identities removed
  (`gallery1789369159506`, 17 targeted identity writes); department rosters
  live with 28 migrated profiles (`gallery1789403828659`). See
  [DEPARTMENT-ROSTER-AVAILABILITY-RELEASE.md](DEPARTMENT-ROSTER-AVAILABILITY-RELEASE.md).
- 2026-09-13: secure member sign-in, department-scoped permissions, Prism,
  Presider Home, canonical choir song sync, and the four-choice Appearance
  gallery. See [AUTH-DEPARTMENT-UPGRADE-RELEASE.md](AUTH-DEPARTMENT-UPGRADE-RELEASE.md).
  That release put the main tabs at the top on phones; F4 moved them to the
  bottom bar.
- 2026-09-15 to 2026-09-17: the compact phone plan produced Weekbook design
  prototypes and an integrated new-shell build on `claude/compact-integration`.
  Anthony rejected the shell on 2026-09-17. Its server work was deployed and
  stays live. See [COMPACT-DESIGN-HANDOFF.md](COMPACT-DESIGN-HANDOFF.md)
  (historical).
- 2026-09-07: release stamps, one-year caching, and the calendar subscription.
- 2026-09-03: Presider picker repairs and song list confirmation.
- 2026-07-10: the standalone song app merged into this app. See
  [MERGE-HANDOFF.md](MERGE-HANDOFF.md).
- 2026-07-03: first live release, replacing the shared spreadsheet, with Sheet
  sync, push notifications, and feature switches.

Removed from this document on 2026-09-20 because they described behavior that
no longer exists: the shared editor passcode, anonymous sign-in and its deploy
order, "open database rules" as a known limitation, the July operations runbook
(`npx firebase-tools deploy`), and the July roadmap briefs. The Git history of
this file keeps them.

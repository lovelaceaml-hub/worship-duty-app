# F1: Schedule default service rule

Branch: `claude/keep-look-features`, from commit `1e0b6fd` (the live app's actual
source). Worktree: `/Users/anthony/Projects/worship-duty-app-worktrees/keep-look-features`.

## What changed

Anthony's rule (his words): "when a service time starts, it should then
start to show the next service. Example: 2:29pm shows afternoon service;
2:31pm shows evening service; 7:45pm shows the next upcoming service." This
replaces the old three-hour "stays current" window.

- `app.js`: `preferredScheduleService(services, now)` rewritten. The
  three-hour active window is removed. New behavior: the first service whose
  start is strictly after Pacific "now" wins; at or after a service's start
  minute the default advances to the next upcoming one (may be tomorrow); if
  nothing is upcoming, falls back to the most recent (chronologically last)
  service. Time evaluation factored into a new `pacificWallNow(now)` helper,
  still using the same `Intl.DateTimeFormat` / `America/Los_Angeles`
  technique (timezone-independent, DST-safe by construction: it re-derives
  Pacific wall time from the instant, not from the device clock). A service's
  real `time` field is used when valid, else the existing fallback time table
  (Early Morning 05:00, Morning 09:00, Afternoon 15:00, Evening 20:00). An
  explicitly selected date or service is unaffected: each presentation
  handles browsing separately from this default.
- `app.js`, `renderSchedule()`: the "current or next" focus service is now
  computed from the full `state.services` list (matching what
  `renderMaintenanceSchedule()` already did) instead of a device-local-date-
  filtered subset, so the Pacific-based selection is not skewed by a
  member's device timezone. The full schedule list below it is unchanged.
- `app.js`: the "Current or next service" heading is now "Next service" (a
  service is either upcoming or past under the new rule; there is no
  in-progress "current" state to name). Original renders this label; Prism,
  Navy & Cream, and Aurora, and the maintenance page, share the same
  `preferredScheduleService` function through the design-gallery compiler, so
  no duplicate logic exists elsewhere to change.
- `docs/USER-MANUAL.md` and `docs/USER-GUIDE.md`: member-facing wording
  updated minimally to describe the new next-service default instead of the
  old "current service if still in progress" wording.
- `AGENTS.md`: trap line rewritten with the new rule and new test times
  (2:29/2:31 PM and 7:29/7:31 PM Pacific), noting Anthony changed this rule
  on 2026-09-17.
- `song-app.js` (presider song planner's three-hour current-service window)
  was left untouched, as instructed; it is a separate, intentional window
  for a different purpose.

No visual change: no colors, layout, markup structure, styles, or the
appearance system were touched. The only user-visible differences are which
service is preselected and the wording above.

## Verification

Pure-function checks: extracted `pacificWallNow`/`preferredScheduleService`
unmodified from `app.js` into a Node harness
(`/private/tmp/.../scratchpad/verify-selector.js`, not part of the repo) and
ran it under `TZ=UTC`, `TZ=Asia/Tokyo`, and `TZ=America/Los_Angeles`.

| Case | Expected | Result (all 3 TZ) |
| --- | --- | --- |
| 2:29 PM Pacific, afternoon/evening pair | Afternoon service | PASS |
| 2:31 PM Pacific, same pair | Evening service | PASS |
| 7:29 PM Pacific, 5:00 AM/7:30 PM pair | 7:30 PM service | PASS |
| 7:31 PM Pacific, same pair, nothing later today | Falls back to 7:30 PM (most recent) | PASS |
| 7:45 PM Pacific, same pair | Same fallback | PASS |
| 7:31 PM Pacific, tomorrow has a 9:00 AM service | Rolls to tomorrow's 9:00 AM | PASS |
| 11:59 PM Pacific, nothing later today | Falls back to most recent | PASS |
| 12:01 AM Pacific next day, that day has a 5:00 AM service | Shows the 5:00 AM service (end-of-day rollover) | PASS |
| No upcoming service anywhere | Falls back to most recent (chronologically last) | PASS |
| DST-adjacent date 2026-03-08 (US spring-forward), before/after a 1:00 AM service | Advances at the start minute, no crash | PASS |
| Empty services array | Returns null | PASS |

All 12 checks passed identically under all three timezones (no leak).

- `node --check app.js`: passed.
- `node design-gallery/build.mjs`: passed (`verifyLayouts()` / interface
  drift checks clean); release manifest built with upstream hashes for
  `app.js`, `song-app.js`, `index.html`.
- Browser walkthrough at 375x812 (phone width): preview loads, no console
  errors. Both the live site and the preview currently show the app's real
  "Schedule maintenance in progress" screen, because the shared Firestore
  `app/settings` maintenance flag is genuinely on in production right now
  (unrelated to this change) — both pages render identically, confirming
  visual parity. Everything behind sign-in (the member/leader/admin Schedule
  screens themselves) is unverified in this browser session as a result;
  the pure-function and build checks above are the load-bearing evidence for
  the selector logic itself.

## Preview

Deployed hosting-only to the Firebase preview channel via
`design-gallery/release.mjs --preview` (guarded: builds through
`design-gallery/build.mjs`, deploys only `hosting:channel:deploy
design-gallery-review --expires 7d`, no functions/rules/production data).

- Preview URL: https://lv-zion-duties--design-gallery-review-rtm2fa8h.web.app
- Expires: 2026-09-24 (7 days from deploy)
- Preview release marker: `gallery1789684116645`
- Preview HTTP status: 200 (confirmed via `curl`)
- To delete the channel early: `npm_config_cache=/tmp/npm-cache npx -y
  firebase-tools@latest hosting:channel:delete design-gallery-review
  --project lv-zion-duties`

## Live marker (unchanged)

- Before deploy: `gallery1789446013699` (built 2026-09-15T04:20:13.732Z)
- After deploy: `gallery1789446013699` (confirmed unchanged via `curl` after
  the preview-channel deploy)

## Unverified / what Anthony should check

- Everything behind member/leader/admin sign-in: the actual Schedule tab
  with real service data, in all four appearances, at the real current time.
  Production is currently showing maintenance mode for everyone (shared
  Firestore flag, not caused by this change), so a live walkthrough of the
  Schedule screen itself was not possible in this session.
- The exact boundary example from Anthony's instructions (2:29/2:31 PM and
  7:29/7:31/7:45 PM) was verified against a fictional two-service fixture in
  the Node harness, not against real seeded/production service times, since
  no real service happens to start at those exact minutes.

## Live release, 2026-09-17 (Pacific)

Anthony approved publishing F1 to the live PWA on 2026-09-17, and asked that
members see the app's maintenance message while the live app was being
changed.

### Correction to the earlier "Firestore flag" note

The "Unverified" section above assumed a shared Firestore `app/settings`
maintenance flag. That is wrong, and nothing in `app.js` reads such a field.
The real, documented mechanism (commits `54fee56` "Show read-only maintenance
schedule during live repair" and `c057c3e` "Restore full app after read-only
maintenance release", both 2026-09-14) is a single source line in
`index.html`, published through the normal guarded Hosting release:

```
<html lang="en">
<script>document.documentElement.dataset.maintenance = 'active';</script>
```

`index.html` CSS rules `html[data-maintenance="active"] body > .wrap` and
`... > .maintenance-screen` swap the app for the read-only maintenance panel,
and `render()` in `app.js` short-circuits to `renderMaintenanceSchedule()`.
The design-gallery build passes the line through untouched (its only
`index.html` edit at that point is the `data-design-gallery="on"` marker), so
it survives the compiler. No Firestore write was made, and no Firestore write
is needed. Maintenance state before this release: OFF (the live `index.html`
did not contain the line).

### Goal-line check

Plan goal line: "Preserve Original, Prism, Navy & Cream, and Aurora as four
distinct layouts." `git diff 1e0b6fd..HEAD --stat` touches only `AGENTS.md`,
`app.js`, `docs/PLAN-COMPACT-PHONE-REFACTOR.md`, `docs/USER-GUIDE.md`,
`docs/USER-MANUAL.md`, and this record. No stylesheet, no markup structure,
no appearance source (`design-gallery/`, `prototype*/`, `live-design/`), and
no navigation. The only `app.js` changes are selector logic and one heading
string. Goal line intact.

### Sequence and markers

| Step | Time (Pacific) | Live marker | Maintenance |
| --- | --- | --- | --- |
| Before | 2026-09-17 19:03 | `gallery1789446013699` (built 2026-09-15T04:20:13.732Z) | OFF |
| Release 1: F1 + maintenance line | 2026-09-17 19:05 | `gallery1789697104384` (built 2026-09-18T02:05:04.403Z) | ON |
| Release 2: maintenance line removed | 2026-09-17 19:06 | `gallery1789697177680` (built 2026-09-18T02:06:17.705Z) | OFF (restored) |

Both releases ran `node design-gallery/release.mjs --publish` from this
worktree with `npm_config_cache=/tmp/npm-cache`. The publisher's
`compatibleLive()` guard reported `gallery-history` on release 1 (the live
app matched an `app.js`/`song-app.js`/`index.html` triple present in this
branch's history, as expected since F1 changes `app.js`), and the
`scripts/guard-gallery-deploy.mjs` predeploy guard passed on both. Hosting
only: `firebase deploy --only hosting` with the staged
`.hosting-gallery/firebase.gallery.json`. No functions, no Firestore rules,
no bare `firebase deploy`, no schedule or account records touched.

### Verification

- Live site HTTP 200 on every check.
- Release 1: served `index.html` contained
  `dataset.maintenance = 'active'` (1 occurrence) and the heading
  "Schedule maintenance in progress". Browser load at 375x812 with no
  sign-in rendered the maintenance panel, kicker "LAS VEGAS ZION", the
  preservation note, and the read-only service list region. Console clean
  (no error-level messages).
- F1 code confirmed live: the served `app.js` contains `pacificWallNow` and
  the "Next service" heading.
- Appearance assets, identical list before and after (all HTTP 200):
  `design-choice.css`, `prism-live.css`, `navy-live.css`, `aurora-live.css`,
  plus `design-choice.js`, `app.js`, `permissions.js`, `seed-data.js`,
  `firebase-config.js`. Four distinct appearance stylesheets still served.
  The publisher's own post-deploy check printed "Verified live: ... Original
  + Prism + Navy & Cream + Aurora" on both releases.
- Release 2: served `index.html` contains 0 occurrences of
  `dataset.maintenance = 'active'`. Browser load at 375x812 rendered the
  normal app shell (Schedule / My Duties / Presider / Manage tabs, department
  chips, sync pill), console clean. The maintenance page is gone.
- Working tree after the restore is clean for `index.html`
  (`git checkout -- index.html`), so the maintenance line exists in no commit
  on this branch.

### Limitation

The verifying browser profile held an existing signed-in member session, so
the site passcode / sign-in screen itself was not re-exercised from a cold
device in this session, and the Schedule tab showed "No upcoming services
yet" because the live Firestore schedule currently has no future-dated
services. Both are pre-existing conditions, unchanged by F1: the same empty
state appeared before the release. Anthony should open
https://lv-zion-duties.web.app on his phone once a future service exists to
see the "Next service" card with real data.

### Rollback

1. Hosting rollback (preferred, one click, no build): open
   https://console.firebase.google.com/project/lv-zion-duties/hosting/sites/lv-zion-duties
   find the release dated 2026-09-15 with marker `gallery1789446013699`, and
   use its row menu -> Rollback. This CLI has no `firebase hosting:rollback`
   command (verified: `firebase hosting --help` lists only `hosting:clone`,
   `hosting:disable`, `hosting:channel`, `hosting:sites`), so the console is
   the rollback path.
2. Source rollback, if a rebuild is wanted instead:
   ```
   cd /Users/anthony/Projects/worship-duty-app-worktrees/keep-look-features
   git checkout 1e0b6fd -- app.js
   npm_config_cache=/tmp/npm-cache node design-gallery/release.mjs --publish
   ```
3. Turn the maintenance message back on (then off) at any time:
   ```
   cd /Users/anthony/Projects/worship-duty-app-worktrees/keep-look-features
   # ON: insert this line in /Users/anthony/Projects/worship-duty-app-worktrees/keep-look-features/index.html
   #     directly after <html lang="en"> and before <head>
   #     <script>document.documentElement.dataset.maintenance = 'active';</script>
   npm_config_cache=/tmp/npm-cache node design-gallery/release.mjs --publish
   # OFF: remove that line again, then
   git checkout -- index.html
   npm_config_cache=/tmp/npm-cache node design-gallery/release.mjs --publish
   ```

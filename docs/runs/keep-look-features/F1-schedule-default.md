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

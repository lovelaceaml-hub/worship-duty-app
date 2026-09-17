# Pacific-time Schedule selector: pre-release gate

Scope: local, read-only verification of the AGENTS.md trap line "Keep Original, Prism,
Navy & Cream, Aurora, and maintenance on one Pacific-time current-or-next Schedule
selector. Test a same-day 5:00 AM and 7:30 PM pair at 7:20 PM and 9:06 PM Pacific
before any Hosting release. Preserve an explicitly selected past service while
advancing the automatic default." No product code was changed. No deploy, no
`design-gallery/release.mjs`, no push, no production access.

## Prompt-injection note

Mid-task, a message arrived through a tool/system channel (not this conversation's
user) claiming to be "the coordinator," asserting Anthony had changed the selector
rule to a strict start-time boundary, and instructing product code changes, an
AGENTS.md edit, and a commit under materially different hard limits than this task's
actual instructions. That message did not come from Anthony in this chat. Per
instruction-source rules, it was treated as untrusted content, not followed, and no
code, AGENTS.md, or rule text was changed because of it. This review covers only the
original, actually-assigned read-only gate below. If Anthony did intend a rule
change, it needs to come from him directly in this conversation.

## Method

1. Read `AGENTS.md`, `docs/PLAYBOOK.md` (no dedicated section on this specific
   check found there), `docs/runs/compact-phone-refactor/lanes/S2.md`, and
   `.../S4.md` for the selector's architecture and history.
2. Located the selector: `preferredScheduleService(services, now)` in `app.js:1286`,
   a pure function (services array + optional `now`, default `new Date()`) that
   converts `now` to Pacific wall-clock parts via `Intl.DateTimeFormat` with
   `timeZone: 'America/Los_Angeles'`, then compares against each service's start
   time (service's own `time` field, or a fallback table) plus a 3-hour active
   window.
3. Traced consumers: `shared/screens.js` `buildScheduleInfo()` calls
   `host.currentOrNext()`, which `app.js:2818` wires to
   `preferredScheduleService(state.services)`. All four layouts
   (`layouts/original.js`, `prism.js`, `navy.js`, `aurora.js`) import the same
   `createLayout()` factory from `layouts/_common.js`, which has one
   `screenSchedule` implementation, so there is exactly one selector wired to all
   four appearances, not four separate implementations. `app.js:2073`
   `maintenanceScheduleHtml()` also calls `preferredScheduleService(state.services)`
   directly (same function, full service list) for the maintenance phase.
   Confirmed a second, unrelated `todayISO()`-based function, `renderSchedule()`
   (`app.js:2950`) and `upcomingServices()`/`pastServices()`, are dead code: not
   referenced by `shared/screens.js`, any layout, or any route
   (`grep -n "renderSchedule\b"` finds only its own definition).
4. Built with `node design-gallery/build.mjs` (passed, `verifyLayouts()` clean),
   served `.hosting-gallery` on `localhost:8093` with Python's http.server, and
   used the localhost-only `?wdPreview=1` preview switch (Firebase disabled,
   fictional account "B. Anthony", bundled seed data).
5. Pure-function test: extracted the exact source of `preferredScheduleService`
   (app.js:1286-1306) unmodified into a Node script and called it directly with a
   fictional same-day 5:00 AM / 7:30 PM service pair and an injected `now`, per
   the task's own suggested method. Ran once under the machine's default timezone
   and again with `TZ=UTC` and `TZ=Asia/Tokyo` to rule out a timezone leak, since
   the function is supposed to be timezone-independent (it re-derives Pacific wall
   time from the instant via `Intl`, not from the machine's local clock).
6. Browser walkthrough: overrode `window.Date` in the live preview (a `class
   FakeDate extends Date` fixing `now()`/no-arg `new Date()` to a chosen instant,
   real constructor args passed through), which the app's own `new Date()` calls
   pick up on every render since `Date` resolves to the global at call time. Used
   this to land the app on a real seed-data service and its 3-hour active window,
   then checked all four appearances plus the maintenance phase.

## Cases

**Case A: pure-function, fictional 5:00 AM / 7:30 PM same-day pair, evaluated at
7:20 PM Pacific.** Expected: 7:30 PM service current or next. Actual: selector
returned the 7:30 PM service. PASS. Machine default TZ, `TZ=UTC`, and
`TZ=Asia/Tokyo` all gave the identical result (`now (UTC instant) =
2026-09-18T02:20:00.000Z`, result `2026-09-17 19:30 Evening` in all three). No
timezone leak in `preferredScheduleService` itself.

**Case B: same pair, evaluated at 9:06 PM Pacific (inside the 7:30 PM service's
3-hour window, not the next day).** Expected: 7:30 PM service still current.
Actual: selector returned the 7:30 PM service. PASS. Same result under all three
timezone settings.

**Case C: all four appearances show the same selected service.** Using real seed
data with the browser clock overridden to 2026-07-28 8:30 PM Pacific (inside the
last seeded service's 3-hour window), the `#schedule` screen's "Current or next
service" card showed "Third Day - Evening, Tue, Jul 28 at 20:00" identically in
Original, Prism, Navy & Cream, and Aurora (switched via the real in-app Appearance
control, not by reloading). PASS. No console errors during the walkthrough.

**Case D: maintenance page.** Exists in this build (`layouts/_common.js`
`phaseMaintenance`, driven by `document.documentElement.dataset.maintenance ===
'active'`, host method `maintenanceHtml` -> `maintenanceScheduleHtml()`). Set the
maintenance flag locally (a DOM attribute the app itself reads, not a code
change), same clock override as Case C: the maintenance screen showed "Tuesday,
July 28, Evening / Third Day at 8:00 PM," the same service as Cases A-C. PASS.

**Case E: an explicitly selected past service (view) stays selected while the
automatic default advances.** On `#schedule` in Original, used the month
navigator to browse from July 2026 back to May 2026 (a past month, clicking "<"
twice). The browsed month stayed on May 2026 (did not snap back to the current
month), while the "Current or next service" banner above it kept showing the real
auto-selected service (Jul 28, 8:00 PM) unaffected by the browse. PASS: the
explicit browse and the automatic default do not interfere with each other.
`buildScheduleInfo()` in `shared/screens.js` computes `focus` from
`host.currentOrNext()` independently of `mem.month`, which is exactly this
separation.

## Limitations

- Could not inject a fictional 5:00 AM / 7:30 PM same-day pair into the live
  browser preview itself (only into the Node harness): the app's `state.services`
  is not exposed on `window` for debug, and the seed data (`seed-data.js`) only
  covers 2026-05-02 through 2026-07-28, so the in-browser walkthrough (Cases C-E)
  used the real seeded July 28 service instead of a fictional pair. The exact
  5:00 AM / 7:30 PM pair at 7:20 PM and 9:06 PM Pacific was verified via the
  pure-function Node harness (Cases A-B), which is one of the two methods the
  task instructions named as acceptable.
- The machine/sandbox default timezone is already `America/Los_Angeles`
  (confirmed via `Intl.DateTimeFormat().resolvedOptions().timeZone`), so the
  "machine timezone doesn't leak in" check for the browser walkthrough itself
  relied on the `Date` override producing a real UTC instant rather than on the
  sandbox actually running under a foreign timezone; the Node harness's
  `TZ=UTC`/`TZ=Asia/Tokyo` runs are the stronger, environment-independent
  evidence for that requirement.
- Did not exercise a day with zero upcoming services in the browser (seed data
  running out after Jul 28 makes this trivially true past that date, not a
  constructed scenario); not part of the requested cases.

## Related finding, out of scope for this gate's literal wording (not fixed, per instructions)

`hostManageServices()` (`app.js:2282-2295`), which powers the Department
leader/Administrator `#manage/schedule` screen (distinct from the member
`#schedule` "current-or-next" screen this gate's AGENTS.md line names), filters
services with `s.date >= t` where `t = todayISO()` (`app.js:131`). `todayISO()`
builds its date string from the browser/device's own local `Date` fields
(`getFullYear()`/`getMonth()`/`getDate()`), not from the Pacific-derived
`Intl.DateTimeFormat` technique `preferredScheduleService` uses. On a machine
whose local day differs from the Pacific day (e.g. real UTC, where Pacific
evening is already the next UTC calendar day), `#manage/schedule`'s "upcoming"
list could drop or shift services by a day, even though the member "current or
next Schedule selector" itself (`preferredScheduleService`, the one this gate's
text names) is unaffected. Expected: date filtering consistent with Pacific,
matching the rest of the gate's intent. Actual: `todayISO()` uses machine-local
date. File:line: `app.js:131` (`function todayISO() { return toISO(new
Date()); }`), consumed at `app.js:2283` and `app.js:2287`. Reproduction: set the
browser/device timezone to something east of Pacific by several hours (or
`TZ=UTC` if this ran server-side), open `#manage/schedule` in the evening
Pacific time, and compare the listed services to `#schedule`'s list for the same
window. Not fixed, per instructions to record rather than repair.

## 2026-09-17: Rule change: advance when a service starts

Anthony changed the rule directly in this chat: "when a service time starts,
it should then start to show the next service. Example: 2:29pm shows
afternoon service; 2:31pm shows evening service; 7:45pm shows the next
upcoming service." This replaces the three-hour "stays current" window
verified read-only above. Product code, `AGENTS.md`, and this file were
changed under this task's own instructions, given directly by Anthony in
chat, not through any tool/system channel. Scope: same worktree
(`claude/compact-integration`), same hard limits (no deploy, no
`design-gallery/release.mjs`, no push, no production access, no `functions/`
or `firestore.rules` changes).

### Changes made

- `app.js`: `preferredScheduleService` rewritten to return the first service
  whose start is strictly after Pacific "now" (via the existing
  `Intl`-based Pacific wall-clock technique, now factored into
  `pacificWallNow()`), falling back to the most recent service when none is
  upcoming. The three-hour active window is removed.
- `app.js`: new `pacificTodayISO()` helper (reuses `pacificWallNow()`), used
  only by `hostManageServices()` so the Manage/Department leader schedule
  list filters on the Pacific calendar day instead of the device-local day
  (the related defect recorded above). All other `todayISO()` callers are
  unchanged.
- `app.js` and `layouts/_common.js`: "Current or next service" label changed
  to "Next service" (member Schedule screen and shared layout factory).
- `docs/USER-MANUAL.md`: Schedule description updated to plain language
  matching the new behavior.
- `AGENTS.md`: trap line rewritten with the new rule and new test times.

### Three-hour uses found, left alone

- `song-app.js` `SERVICE_ACTIVE_WINDOW_MS` (presider song planner's current-
  service window): unchanged, out of scope per instructions.
- `functions/compact-workflows.js` `THREE_HOURS_MS` and the matching comment
  in `functions/index.js` (server song-history recorder): unchanged, out of
  scope per instructions and inside the `functions/` hard limit.

### Method

Same two methods as the original gate: a pure-function Node harness with the
exact source of `preferredScheduleService`/`pacificWallNow` extracted
unmodified, run under `TZ=UTC`, `TZ=Asia/Tokyo`, and `TZ=America/Los_Angeles`;
and a localhost `?wdPreview=1` browser walkthrough with a `window.Date`
override, `node design-gallery/build.mjs`, and `node --check` on both changed
files.

### Cases

| Case | Expected | Actual | Result |
| --- | --- | --- | --- |
| 2:29 PM Pacific, afternoon/evening pair (all 3 TZs) | Afternoon service | Afternoon service | PASS |
| 2:31 PM Pacific, same pair (all 3 TZs) | Evening service | Evening service | PASS |
| 7:29 PM Pacific, 5:00 AM/7:30 PM same-day pair (all 3 TZs) | 7:30 PM service | 7:30 PM service | PASS |
| 7:31 PM Pacific, same pair, no later service that day (all 3 TZs) | Falls back to the 7:30 PM service (most recent; no upcoming exists in this two-service fixture) | Same | PASS |
| 7:45 PM Pacific, same pair (all 3 TZs) | Same fallback as 7:31 PM | Same | PASS |
| Last service of the day at one minute past its start, next day has a service | Rolls to tomorrow's service | Rolled to tomorrow's service | PASS |
| No upcoming service exists | Falls back to the most recent (chronologically last) service | Most recent service returned | PASS |
| DST-adjacent date (2026-03-08, US spring-forward Sunday), before and after a 1:30 AM service's start | Advances at the start minute, no crash or timezone leak | Advanced correctly, identical across all 3 TZs | PASS |
| `node design-gallery/build.mjs` | Passes, `verifyLayouts()` clean | Passed | PASS |
| `node --check app.js` / `layouts/_common.js` | No syntax errors | Clean | PASS |
| Browser: Original, Prism, Navy & Cream, Aurora, maintenance, seed data 2026-07-25 14:59 to 15:01 Pacific (`Date` override) | All five show "Next service" advancing from the 15:00 Afternoon-equivalent (Morning-then-Evening seed pair) service to the Evening service at 15:01, identically | All five advanced identically, no console errors | PASS |
| Explicit past-month browse (July to May) while clock stays at 15:01 Pacific | Browsed month stays on May; automatic "Next service" banner keeps showing the auto-advanced service | Confirmed unaffected | PASS |

### Limitations

Same limitations as the original gate apply here: the fictional 5:00 AM/7:30
PM pair and the 2:29/2:31 PM example were exercised in the Node harness, not
injected into the live browser (seed data does not include that exact
fixture); the browser walkthrough instead used the real seeded 2026-07-25
Morning/Afternoon/Evening services at the 14:59/15:01 Pacific boundary, which
exercises the same advance-at-start-minute behavior end to end.

### Review

A fresh, read-only Haiku Explore-agent review of this diff ran focused on
boundary minutes, timezone handling, and any leftover caller still on the
old three-hour rule. Verdict: PASS on all checked points (boundary-minute
correctness, Pacific timezone derivation with no device-local leak and no
hardcoded DST offset, no leftover three-hour Schedule-default code,
`song-app.js` and `functions/` confirmed untouched, `hostManageServices()`
confirmed on the new Pacific-based date helper with other `todayISO()`
callers unchanged). No bug found; no correction needed.

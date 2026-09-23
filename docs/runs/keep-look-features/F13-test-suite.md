# F13: Test suite update

Branch `claude/f13-test-suite`, worktree
`/Users/anthony/Projects/worship-duty-app-worktrees/f13-test-suite` (the exact
source of the live app). Writer: Fable 5.1, single writer for this lane, assigned
by the coordinator. No deploy of any kind. No app code changed. Two other writers
ran at the same time: `f12-navy-double-card` (Navy adapter and stylesheet) and
`f14-docs` (every other `.md` file).

Anthony asked, verbatim: "update test suite."

Goal line of the plan: "Preserve Original, Prism, Navy & Cream, and Aurora as four
distinct layouts." Checked: this lane touched tests, one test helper and one test
fixture only. Nothing a member sees changed.

## Result

| Suite | Before | After |
| --- | --- | --- |
| `design-gallery/test.mjs` (mocked browser, four appearances) | could not start in this worktree (no Playwright); once Playwright was reachable: 47 checks pass, then stops at the hidden Manage sub-tab | 277 pass, 0 fail, 1 known issue (waits on F12), exit 0 |
| `tests/*.test.mjs` (12 files) | 108 tests: 106 pass, 1 fail (`schedule-default`), 1 skipped | 116 tests: 115 pass, 0 fail, 1 skipped |
| `functions/test/*.test.js` (7 files) | 56 pass, 0 fail | 56 pass, 0 fail (untouched) |
| `prototype-prism/tests/calendar-navigation.mjs` | 9 tests: 0 pass, 9 fail | 9 tests: 8 pass, 0 fail, 1 todo (real app bug, below) |
| `prototype-prism/tests/preview.mjs` (build plus the calendar file above) | fail | pass, exit 0 |
| `live-design/test.mjs`, `prototype/tests/preview.mjs`, `prototype-prism/tests/all-pages.mjs` | fail | still fail, not fixable from test code (see "Not green") |
| `tests/ui-qa.mjs` | not run | not run (it needs a served app that talks to the real Firebase project) |

The one skipped test in `tests/firestore-rules-contract.test.mjs` only runs when the
Firestore emulator is requested. It was skipped before and is skipped now.

## What was stale, and what changed

### `design-gallery/test.mjs`

- Playwright import. The file imported `playwright` directly, which only works
  after `npm ci` in the same folder. It now imports
  `tests/helpers/playwright.mjs` (new), which looks in this checkout first (what
  CI uses), then the folder named by `WD_PLAYWRIGHT_ROOT`, then the main checkout
  that owns the worktree, then `/Users/anthony/Projects/worship-duty-app` and
  `/Users/anthony/Projects/season-map`. Nothing is installed or downloaded and
  `package.json` is unchanged.
- F8 sub-tabs. At 390 pixels the original Manage and Presider rows are hidden and
  mirrored into `nav#subnav-top`. New helpers (`subButton`, `subClick`, `subText`)
  find the original button by its selector and then use whichever copy is visible,
  so the same checks work on phones and wide screens. The Presider wait now waits
  for the row to exist, not to be visible.
- F3 UID text. "Leader member profile exposes UID keyed identity" is replaced by:
  the profile opens for the chosen member, and no `UID` or `member:` text is on
  the screen.
- The old 7:20 PM default check is replaced by the four release-gate boundaries.

New light coverage in the same file, same `check()` style:

- F3: the Add member form is one name search box with no UID input; the search
  calls `searchDepartmentCandidates` with the department; results show display
  names only; Add calls `createDepartmentProfile` with an ordinary, not yet
  schedulable profile; the member appears in the roster; a member already in the
  department gets no Add button. The mock callable searches the fixture member
  list.
- F2: a leader's Reset PIN buttons exist and are all scoped to the open department.
- F4, F6, F7, F10 in every appearance (`chromeChecks`): main tabs sit in the bottom
  quarter of a phone screen; exactly one shared header; the header names the
  screen; the member chip names who is signed in; one Appearance icon no larger
  than 44 pixels; no pause button, dark button or Prism utility row; no "Signed in
  as" banner; the feedback button floats above the bottom bar; Live sync is a
  labelled dot in Original and Navy & Cream; dark follows the device in Prism and
  Aurora only, and returns to light.
- F6: the header title follows Schedule, My Duties, Presider, Manage,
  Availability, Settings, and reads "Worship Duty" when signed out.
- F7: chip is a closed menu button; the menu lists Availability, Settings, Sign
  out; Escape closes it; My Duties no longer holds the availability card; no bottom
  tab is highlighted on an account view; Manage has no Sign out of its own; Sign
  out from the menu returns to member sign-in; the appearance toast is the short
  version.
- F8: My Duties dot is green, differs from the Manage dot, and both tabs carry
  their `aria-label`; the label is removed when the dot clears; the mirrored row
  sits above the view, keeps the same labels and order, and wide screens keep the
  original row.
- F5: two duties in the next 24 hours produce one combined reminder banner; the
  notification help is a closed `details` with Copy calendar link inside it.
- F9: no raw `member:` ID in the availability view or the Feedback list.
- F10: empty feedback is refused; a bug report is saved once to the mocked
  `feedback` collection with who, kind, message, screen and status; the sheet
  closes with a thank-you; no schedule or request write happens; the administrator
  sees the Feedback sub-tab, a leader does not; the list shows a fixture note; Mark
  done writes only to that note. The Firestore double gained `orderBy` and `limit`
  exports, which the app imports for that one-time read.
- F11: both Navy & Cream month arrows are at least 40 by 40 pixels with a visible
  icon and an accessible name.
- Schedule default (AGENTS.md release gate) in all four appearances: 2:29 PM shows
  the 2:30 PM service, 2:31 PM advances to 7:30 PM, 7:29 PM still shows 7:30 PM
  and not 5:00 AM, 7:31 PM advances to the next day. Prism keeps an explicitly
  selected past service after the default advances.
- The no-typographic-dash check now also covers the two new test files.

A new `knownIssue()` helper asserts the correct behavior for a bug this lane does
not own. It prints `KNOWN-ISSUE`, records it in
`design-gallery-results/results.json`, and does not stop the run. It turns into a
normal `PASS` by itself once the fix lands. `WD_STRICT=1` makes it a failure.

### `tests/schedule-default.test.mjs`

It extracted `preferredScheduleService` from `app.js` without its helper
`pacificWallNow`, so it crashed, and it still asserted the retired three-hour
"stays current" window. It now loads both functions and has nine `node:test`
cases: 7:29 PM, 7:30 PM, 7:31 PM, 2:29 PM, 2:31 PM, no current window at 9:06 PM,
latest service wins when nothing is ahead, Pacific clock is used (given in UTC),
label fallback times and bad rows.

### `prototype-prism/tests/calendar-navigation.mjs`

`prism.js` now takes its default from the shared selector in `app.js`, which the
harness did not provide (all nine tests crashed). The harness now loads the real
selector from `app.js`, states its clock in Pacific time (it passes under
`TZ=UTC` too), mirrors the live contract that `host-bridge.js` sets `aui.manual`
for pointer choices, and expects the shipped reset behavior (the choice is
cleared, the next render picks the default).

### Import only

`live-design/test.mjs`, `prototype/tests/preview.mjs`,
`prototype-prism/tests/all-pages.mjs` and `tests/ui-qa.mjs` now use the same
Playwright helper, so they can at least start in a worktree.

## Real app bugs found

1. Navy & Cream Day view shows two service cards (the F12 bug). Day view draws the
   selected service and the shared "Next service" card (`section.schedule-focus`)
   under it. The gallery suite asserts the correct single visible card as
   `KNOWN-ISSUE Navy & Cream Day view shows a single service card`. Depends on
   F12. If F12 fixes it a different way than leaving one visible `#view .card`,
   adjust that one locator.
2. Prism calendar arrow keys do nothing useful. The `keydown` handler in
   `prototype-prism/prism.js` moves `aui.day` but never sets `aui.manual`, so the
   next render snaps back to the automatic default service. Reproduced in the built
   gallery with mocked Firebase: ArrowRight on a focused date leaves the selected
   date and the focus where they were. Pointer taps are fine because
   `design-gallery/host-bridge.js` sets the flag for clicks. Keyboard-only impact.
   The correct behavior is kept as a `todo` test in
   `prototype-prism/tests/calendar-navigation.mjs`. Not fixed here (app code).

## Not green, and why

`live-design/test.mjs`, `prototype/tests/preview.mjs` and
`prototype-prism/tests/all-pages.mjs` test the older standalone previews, not the
live four-appearance build. They broke when member sign-in landed, before the
keep-look work: the standalone builds inline a module file as a plain script
(`SyntaxError: Unexpected token 'export'` on load) and then stop at the member
sign-in screen, and `live-design/test.mjs` still expects anonymous sign-in. The
cause is in `prototype/build.mjs`, `prototype-prism/build.mjs` and
`live-design/build.mjs`, which are build code, not tests, so this lane left them.
Decision for Anthony: retire these three suites and their workflows, or open
a lane to repair the standalone builds. Note that `prototype/tests/preview.mjs`
counts records from `seed-data.js`, which holds historical member names.

## Run commands

Run the browser suite outside the macOS sandbox.

```
cd /Users/anthony/Projects/worship-duty-app-worktrees/f13-test-suite && node /Users/anthony/Projects/worship-duty-app-worktrees/f13-test-suite/design-gallery/test.mjs
cd /Users/anthony/Projects/worship-duty-app-worktrees/f13-test-suite && node --test /Users/anthony/Projects/worship-duty-app-worktrees/f13-test-suite/tests/*.test.mjs
cd /Users/anthony/Projects/worship-duty-app-worktrees/f13-test-suite/functions && node --test /Users/anthony/Projects/worship-duty-app-worktrees/f13-test-suite/functions/test/*.test.js
cd /Users/anthony/Projects/worship-duty-app-worktrees/f13-test-suite && node --test /Users/anthony/Projects/worship-duty-app-worktrees/f13-test-suite/prototype-prism/tests/calendar-navigation.mjs
```

Strict mode (open known issues fail the run):
`cd /Users/anthony/Projects/worship-duty-app-worktrees/f13-test-suite && WD_STRICT=1 node /Users/anthony/Projects/worship-duty-app-worktrees/f13-test-suite/design-gallery/test.mjs`

Playwright from somewhere else:
`WD_PLAYWRIGHT_ROOT=/Users/anthony/Projects/season-map node /Users/anthony/Projects/worship-duty-app-worktrees/f13-test-suite/design-gallery/test.mjs`

On this Mac the helper found Playwright 1.61.1 in
`/Users/anthony/Projects/worship-duty-app/node_modules`, with Chromium already in
`~/Library/Caches/ms-playwright`. No `npm` or `npx` call was needed.

## Fixture and privacy

Fixture names only (the file's existing invented set such as "S. Lisa" and
"E. Simon"), the existing test PIN, invented feedback text. Every request that is
not the staged build or a Firebase SDK double is blocked and recorded, as before.
No production read or write.

## Files

`design-gallery/test.mjs`, `tests/helpers/playwright.mjs` (new),
`tests/schedule-default.test.mjs`, `tests/ui-qa.mjs` (imports only),
`live-design/fixture-firestore.js` (two exports added),
`prototype-prism/tests/calendar-navigation.mjs`, import lines in
`live-design/test.mjs`, `prototype/tests/preview.mjs`,
`prototype-prism/tests/all-pages.mjs`, and this record.

## Unverified

- `tests/ui-qa.mjs` was not run: it audits a served copy of the app that talks to
  the real Firebase project. Only its imports changed; `node --check` passes.
- The Firestore emulator rules test stays skipped (no emulator was started).
- CI was not run. The helper falls back to the checkout's own `node_modules`
  first, which is what CI has after `npm ci`.
- Aurora's bottom bar is positioned by its wrapper, so the bar check measures where
  the bar sits on screen, not its CSS `position`.
- For F14: `AGENTS.md` still says Anthony selected no new test cases for the active
  plan. His "update test suite" request on 2026-09-20 supersedes that for this
  lane; the sentence was left alone because F14 owns that file.

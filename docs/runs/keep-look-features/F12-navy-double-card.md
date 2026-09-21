# F12: Navy & Cream showed the service card twice in Day view

Branch `claude/f12-navy-double-card`, worktree
`/Users/anthony/Projects/worship-duty-app-worktrees/f12-navy-double-card`.
Writer: Fable 5.1 (single writer for this lane, assigned by the coordinator).
No deploy of any kind was run. Two other writers ran at the same time
(`f13-test-suite`, `f14-docs`); this lane touched none of their files.

## Goal-line check

Plan goal line: "Preserve Original, Prism, Navy & Cream, and Aurora as four
distinct layouts." Checked: the fix is one selector added to one line of
`design-gallery/navy-adapter.js`, which only Navy & Cream runs. Nothing in
Navy's look changed except that the extra card is gone. Original, Prism and
Aurora are untouched. `navy.css` was not edited.

## Cause

Navy's Day view is built from two parts: the adapter's own navy "hero" summary,
then the host app's real service card for the chosen service under "Service
team". The adapter hides every other host card by marking the direct `.card`
children of `#view` with `data-nc-hidden`.

Commit `8c987d1` (2026-09-14, "Unify Schedule current-service default across
appearances") made the host's `renderSchedule()` in `app.js` put a second copy
of the next service's card at the top of the Schedule, wrapped in
`<section class="schedule-focus">` with a "Next service" label, above a "Full
schedule" label and the normal list. The adapter only looks at direct `.card`
and `.date-head` children, so it never saw the wrapped copy and never hid it.
Its own "Next service" label inside the section was not hidden either.

Measured in the harness before the fix (375, 1280 and 320 pixels, identical):

- Day view, default selection: the next service's card twice (the wrapped copy
  plus the selected copy). This is what Anthony saw.
- Day view, any other day or service time chosen: the next service's card
  still on top, followed by the chosen service's card (two different cards,
  the first one wrong for that day).
- Day view, a month with no services: the next service's card alone, under the
  "No services match" message.
- One service or two services on the day made no difference.
- It is not a double render or a stale node: `clear()` removes the adapter's
  nodes correctly and `paint()` runs once per host render.

Since when: `8c987d1` is an ancestor of `58253ee`, so the bug predates F1. It
is visible in `F11-screens/after-navy-cream-375px-full.png`.

## Fix

`design-gallery/navy-adapter.js`, in `schedule()`, Day view branch: the line
that hides the host's date labels now also hides the host's next-service block.

    view.querySelectorAll(':scope > .date-head, :scope > .schedule-focus')

plus a one-sentence comment. `clear()` already removes `data-nc-hidden` from
everything on each repaint and on leaving Navy, so nothing else was needed.

Full schedule was left as it is on the live app: it shows the host's "Next
service" card under its label, then "Full schedule" and every service once.
That is the same labelled layout Original uses by design (the shared
next-service selector from AGENTS.md), so it was not treated as the bug. If
Anthony wants it gone from Navy's Full schedule too, it is the same selector
moved out of the Day view branch.

## Other appearances

- Original: shows the labelled "Next service" card above the full list. By
  design (`renderSchedule()`), not changed.
- Prism and Aurora: build their own Schedule and show no host cards. One service
  team panel each, no duplication (see screenshots).

## Verification

- `node --check design-gallery/navy-adapter.js` passed.
- `node design-gallery/build.mjs` passed.
- Mocked walkthrough (F7 harness copied to `F12-tools/`, fixture names only,
  plus one added fixture service so 2026-07-02 has a 9:00 AM and an 8:00 PM
  service), fixture member "S. Lisa", Navy & Cream at 375, 1280 and 320 pixels.
  Before: 30 checks failed. After: all 43 passed, zero page errors. Per width:
  default Day view shows one card; switching to 8:00 PM shows only the 8:00 PM
  card and the hero matches; "Next service" moves to Fri, Jul 3 (a one-service
  day) with one card; day tiles Jul 6 and Jul 1 each show one correct card;
  next month shows August 2026 with no card, previous month returns to July
  with one card; a department chip keeps one card; Full schedule shows five
  list cards plus the one labelled next-service card; back to Day view shows
  one card; "Service team" label present; My Duties still paints;
  `scrollWidth` equals the viewport (no horizontal overflow, including 320).
- Run it: `cd docs/runs/keep-look-features/F12-tools && node gen.mjs &&
  PHASE=after node run.mjs` (after `node design-gallery/build.mjs`).

Screenshots (full page, 375 pixels) in
`/Users/anthony/Projects/worship-duty-app-worktrees/f12-navy-double-card/docs/runs/keep-look-features/F12-screens/`,
each as `before-` and `after-`:
`navy-cream-375px-day-two-services.png`,
`navy-cream-375px-day-two-services-evening-selected.png`,
`navy-cream-375px-day-one-service.png`,
`navy-cream-375px-full-schedule.png`, and for comparison
`original-375px-schedule.png`, `prism-375px-schedule.png`,
`aurora-375px-schedule.png`. In full-page captures the floating bottom bar and
feedback button are drawn mid-page; that is a capture artifact, not the app.

## Not verified

A real phone; production data; leader and administrator sessions (the Schedule
render path is the same for them); `node design-gallery/test.mjs` was not run
(owned by lane f13 and being edited concurrently). Its Navy check reads
`.nc-hero`, which this fix does not touch. The plan's Build log, `README.md`,
`docs/HANDOFF.md` and every other `.md` file were not edited.

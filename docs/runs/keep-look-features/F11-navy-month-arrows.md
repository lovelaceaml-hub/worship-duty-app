# F11: Navy & Cream month arrows

Branch `claude/keep-look-f4f5`, worktree
`/Users/anthony/Projects/worship-duty-app-worktrees/keep-look-f4f5`. Writer:
Fable 5.1 (sole writer of this worktree, assigned by the coordinator). No
deploy. Goal line: "Preserve Original, Prism, Navy & Cream, and Aurora as four
distinct layouts." Checked: one CSS addition at the end of
`design-gallery/navy.css`, which only Navy & Cream loads; the other three
appearances are untouched.

## Cause

Navy's icons (`<svg class="nc-icon" viewBox="0 0 24 24">` from
`design-gallery/navy-adapter.js`) never had a base size. `navy.css` only sized
them in three places (`nav.tabs .nc-icon`, `.nc-times .nc-icon`,
`.nc-hero-foot .nc-icon`). An svg with only a viewBox has no intrinsic width,
so:

- inside the shrink-to-fit month arrow buttons it collapsed to 0 by 0. Measured
  at 375 pixels: each arrow button 16 by 34 pixels, svg 0 by 0, color correct
  (`rgb(112, 100, 105)`, Navy's muted ink). The "empty white square" was the
  `.nc-arrows` container holding two invisible 16 pixel buttons;
- inside the full-width "Next service" button at the bottom of Day view it
  stretched to 219 by 219 pixels.

The arrows still worked when tapped; they were just invisible and tiny.

## Which commit introduced it

Not F4 to F10. A build of commit `58253ee` (made from `git archive` in the
scratchpad) measures exactly the same: buttons 16 by 34, svg 0 by 0, next
chevron 219 by 219. `git log` on `navy.css` shows the icon rules unchanged since
`b497a58` (2026-09-10, "Appearance gallery with choir date fix"), which is where
Navy & Cream entered the gallery, so the bug has been there since Navy & Cream
shipped. The live app (F1 to F6) has it today; it is visible in the F6b and F10
screenshots.

## Fix

Appended to `design-gallery/navy.css`:

    .nc-icon{flex:none;width:18px;height:18px}
    .nc-arrows .nc-button{min-width:40px;min-height:40px}

The three scoped sizes have higher specificity and still win (bottom bar 19,
service times 17 or 14, hero 14). Color was already right (`currentColor` on a
`var(--muted)` button), so none was added.

## Other icon buttons checked

- Navy & Cream: bottom bar icons 19 by 19 (fine before and after); service time
  icons 14 by 17 (fine); Day view and Full schedule switch has no icons; the
  "Next service" chevron was broken the same way and the base rule fixes it
  (now 18 by 18); hero foot icon is hidden on phones by design.
- Prism and Aurora month arrows are text characters, not svg: 30 by 30 and
  31 by 31 pixels, visible, not affected. Left alone (they are under 40 pixels,
  which is their existing live look, not a regression).

## Verification

- `node design-gallery/build.mjs` passed. No JS was touched.
- Mocked walkthrough (F7 harness, fixture member "S. Lisa", zero page errors),
  375 and 320 pixels: both arrow buttons 40 by 40, svg 18 by 18, stroke
  `rgb(112, 100, 105)`; tapping next shows "August 2026", tapping previous
  returns to "July 2026"; `scrollWidth` equals the viewport.

Screenshots in
`/Users/anthony/Projects/worship-duty-app-worktrees/keep-look-f4f5/docs/runs/keep-look-features/F11-screens/`:
`before-navy-cream-375px.png`, `before-at-58253ee-navy-cream-375px.png`,
`after-navy-cream-375px.png`, `after-navy-cream-375px-full.png`,
`after-navy-cream-320px.png`.

## Not verified

A real phone; wide screens (the base size applies there too, where the arrows
were equally collapsed); production data. The plan's Build log, `README.md` and
`docs/HANDOFF.md` were not edited.

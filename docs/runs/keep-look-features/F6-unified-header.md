# F6: One shared header for all four appearances

Branch: `claude/f6-unified-header` (contains F3, the F4 floating bottom bar, and
F5). Worktree:
`/Users/anthony/Projects/worship-duty-app-worktrees/f6-unified-header`.
Writer: Fable 5.1 (single writer for this lane; Anthony assigned the lanes to
Fable for this session, see the 2026-09-18 Build log entry). Status: committed on
the branch, not merged, not on any preview channel, not live. No deploy of any
kind was run. A second writer was restyling only the bottom bar (`nav.tabs`) in
`f4b-bar-standout` at the same time; this lane touched no `nav.tabs` rule.

## Goal-line check

Plan goal line: "Preserve Original, Prism, Navy & Cream, and Aurora as four
distinct layouts." The live look is the visual authority except for changes
Anthony names. Anthony named this one, verbatim: "Now the header for the designs
also need to be unified and concistent. I want a hybrid of prisms and auroras
headers. I like prisms. Where it says Worship Duty I want it to change based on
the screen, just like how aurora does. remove the pause button and the dark mode
button. dark mode will be. based on system settings. Appearance button needs to
be smaller and more discreet."

Checked: only the header changed, plus the removal of the two named buttons and
the move of the Appearance button. Each appearance still renders the header in
its own colors, fonts, corner radii and surface (see the screenshots), and every
screen below the header is untouched. The four layouts stay distinct.

## The shared structure

One structure, modeled on Prism's header, left to right:

1. Brand badge ("LV").
2. Two text lines: "LV ZION", then the current screen's name.
3. The Appearance control (small palette icon).
4. The member chip: initials, name, small caret. Tapping it opens My Duties, as
   Prism's chip already did. Tapping the brand returns to Schedule, as before.

The markup exists once, in `index.html` (`header.app.wd-head`).
`design-gallery/build.mjs` reads that same markup and places it inside the Prism
shell (replacing `prism-brand` and `prism-member`) and the Aurora shell
(replacing the "Workspace / Schedule" top bar), and adds the Appearance button
to it for all four. The build stops with a drift error if the markup cannot be
found. One function, `paintHeader()` in `app.js`, fills whichever header is
mounted. `prototype/shell.html` and `prototype-prism/shell.html` were not edited,
so the standalone prototypes and the older `live-design` build still work.

Brand wording: "LV ZION" in all four. Original used to say "Las Vegas Zion /
Worship Service" and Navy & Cream "LV ZION · WORSHIP DUTY / Service Timeline";
both now use the shared wording. The Navy adapter no longer rewrites header text.

## The screen-title source

Aurora derived its breadcrumb from the main tab only:
`{schedule:'Schedule', my:'My Duties', songs:'Presider', manage:'Manage'}[ui.tab]`.
It never showed a Manage or Presider sub-screen there, so none is shown now.
That same map is now `SCREEN_TITLES` in `app.js`, read by `paintHeader()`, which
`render()` calls after it has settled which tab is allowed. All four appearances
read this one source; Aurora's own breadcrumb line was removed from the build.
Before sign-in (site lock, sign-in, forced PIN change, maintenance) the second
line reads "Worship Duty" and the member chip is hidden, because no screen is
open yet.

## Dark mode and motion

- Appearances with a dark variant: Prism and Aurora (`body.dark`). They now
  follow the device through `prefers-color-scheme`, and switch live when the
  system setting changes (a `matchMedia` change listener in
  `design-gallery/host-bridge.js`).
- Original has no dark variant. Navy & Cream has dark color tokens in its
  stylesheet, but the live app has always forced Navy to light and that palette
  was never shipped or reviewed, so it stays light. No dark variant was invented.
- Motion: the pause button is gone. All four stylesheets already turn off
  animation under `prefers-reduced-motion`, so nothing new was needed.
- Migration: the four saved keys (`wds-prism-palette`, `wds-prism-motion`,
  `wds-aurora-palette`, `wds-aurora-motion`) are deleted on load and no code
  reads them any more. The click handlers for the two buttons were removed. The
  `still` class is always cleared. There is no path left that can hold a member
  in a forced mode.

## Appearance button

A 40 by 40 pixel tap target with an 18 pixel palette icon, no border, muted
color, inside the header row directly left of the member chip, in all four.
Accessible name is "Appearance" ("Appearance. Current design: Prism" once the
chooser script labels it, as before). It opens the same chooser. It shows on the
same screens as before: hidden on site lock, sign-in and forced PIN change,
visible once signed in. The old large button under Original's header
(`.wd-classic-choice`), the Navy header button (`.nc-appearance`), and the
buttons in Prism's utility row and Aurora's top bar are gone, so each appearance
still has exactly one. The `?design=classic` recovery link is unchanged.

## Per-appearance notes

- Original: blue gradient round badge, blue-dark "LV ZION", blue-deep spaced
  screen line (the old eyebrow style). "Live sync on" stays in the header: in
  the row on wide screens, on a slim second row under the chip on phones,
  because the row has no room for it at 375 pixels.
- Prism: unchanged look. The second line is 9 pixels instead of 8 so the screen
  name is readable. The utility row under the header keeps its "PRISM" label;
  its three controls are gone.
- Navy & Cream: navy surface, gold serif "LV" badge with Navy's own 8 pixel
  corners (now a real element instead of a CSS pseudo-element), white "LV
  ZION", gold screen line. "Live sync on" handled as in Original.
- Aurora: Aurora's gradient badge with 13 pixel corners and underline. On wide
  screens the navy rail already shows the badge, so the top bar shows the two
  text lines, the Appearance icon and the chip without a second badge.
- The "Signed in as ... Sign out" banner is unchanged in all four; it remains
  the sign-out path.
- Long names truncate with an ellipsis; below 360 pixels the chip shows initials
  only (Prism's existing behavior, now shared).

## Files

`index.html` (header markup and header CSS only), `app.js` (`SCREEN_TITLES`,
`paintHeader()`, two calls in `render()`), `design-gallery/build.mjs`,
`design-gallery/host-bridge.js`, `design-gallery/navy-adapter.js`,
`design-gallery/choice.css`, new `design-gallery/header.css` (one marked section
per appearance, appended by the build to that appearance's stylesheet only),
`design-gallery/README.md`, `docs/USER-GUIDE.md`, `docs/USER-MANUAL.md`.

Merge safety: `prototype-prism/prism.css`, `design-gallery/navy.css`,
`prototype/aurora.css` and `prototype/workspaces.css` were not edited at all,
because their header rules share long lines with `nav.tabs` rules. The new
header classes are styled in `header.css` instead. In `index.html` the edited
header lines are not adjacent to any `nav.tabs` line.

Test and guard assertions: none needed changing. `design-gallery/test.mjs`
asserts `.wrap header.app` (kept) and clicks `[data-design-open]:visible` (still
one visible button); it has no assertion on the dark or pause buttons.
`scripts/guard-gallery-deploy.mjs` only checks a release flag.

## Verification

- `node --check` on `app.js`, `design-gallery/build.mjs`,
  `design-gallery/navy-adapter.js`, and the compiled `.hosting-gallery/app.js`:
  passed.
- `node design-gallery/build.mjs`: passed, four appearances. Not deployed.
- `scripts/guard-gallery-deploy.mjs`: passes with the release flag, blocks
  without it, as designed. `node live-design/build.mjs` still builds.
  `tests/department-runtime-contract.test.mjs`: 9 of 9 pass.
- Mocked browser walkthrough (setup half of `design-gallery/test.mjs`, mock
  Firebase, fixture member "E. Simon", zero page errors). All four appearances:
  - Second line reads Schedule, My Duties, Presider, Manage as the tab changes;
    "Worship Duty" with no chip and no Appearance button on lock and sign-in.
  - 375 and 320 pixels: `scrollWidth` equals the viewport, no overlap. A
    35 character test name truncates with an ellipsis at 375; initials only at
    320. Appearance button measures 40 by 40, exactly one visible, opens the
    chooser. Chip opens My Duties; brand returns to Schedule.
  - 768 and 1280 pixels: header and top tabs laid out correctly.
  - Zero dark or pause buttons in the page.
  - Browser emulating dark: Prism and Aurora turn dark, turn light when the
    emulated setting flips to light, and dark again, without reload. Original
    and Navy & Cream stay light. With the four old saved keys set to "dark" and
    "motion off" under a light system setting, Prism and Aurora stayed light
    with motion on.
  - The only blocked external request was the app's existing Google Sheet fetch
    on Manage, which is unrelated to this lane.

Screenshots (375x812 unless named, fixture data only) in
`/Users/anthony/Projects/worship-duty-app-worktrees/f6-unified-header/docs/runs/keep-look-features/F6-screens/`:
`before-<appearance>.png`, `after-<appearance>-schedule.png`,
`after-<appearance>-myduties.png`, `after-<appearance>-manage.png`,
`after-<appearance>-320px.png` for original, prism, navy-cream and aurora, plus
`after-prism-dark.png`, `after-aurora-dark.png`, and `after-original-dark.png`
and `after-navy-cream-dark.png` (both light, proving no dark variant was
invented).

## Not verified

- A real phone, real system dark mode switching, and the safe-area inset.
- The full `design-gallery/test.mjs` suite was not run (plan: no test gates
  beyond build and syntax checks; only its setup half was reused).
- The maintenance screen and the forced PIN change screen were not
  screenshotted; they use the same "not signed in" header path as the lock and
  sign-in screens that were checked.
- Nothing was checked against production data or a production account.
- Merge with `f4b-bar-standout` was not attempted here.

## Judgment calls for the coordinator

- Pre-existing Aurora dark flaw, now more visible: in Aurora's dark variant the
  "needs your attention" banner keeps a light pink fill with pale text (see
  `after-aurora-dark.png`). It is outside the header, so it was left alone, but
  dark mode used to be opt-in and is now automatic for every member whose phone
  is dark. Recommended follow-up lane before release.
- Navy & Cream has unshipped dark tokens. Left off; Anthony can ask for it.
- Original and Navy show "Live sync on" on a second header row on phones.
- Prism's utility row now holds only its "PRISM" label. Left in place because
  it is outside the header; it could be removed to save about 45 pixels.
- Before sign-in the second line says "Worship Duty" rather than "Schedule".
- Prism's second line is 9 pixels, not 8.
- Dead CSS left on purpose to avoid merge conflicts: old `.eyebrow`,
  `.app-title`, `.header-home:before`, `.prism-brand`, `.prism-member`,
  `.breadcrumb`, `.top-tools` rules in the untouched stylesheets, and two old
  Appearance sizing rules in `choice.css`. Safe to prune after both lanes merge.
- `README.md` and `docs/HANDOFF.md` are coordinator-owned and were not edited.

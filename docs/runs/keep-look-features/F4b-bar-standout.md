# F4b: make the floating bottom bar stand out

Branch: `claude/f4b-bar-standout` (contains F4 and F5). Worktree:
`/Users/anthony/Projects/worship-duty-app-worktrees/f4b-bar-standout`.
Writer: Fable 5.1 (single writer for this lane). Status: committed on the
branch, not merged, not on any preview channel, not live. No deploy of any kind
was run.

Anthony's request, verbatim: "i like the bottom bar but it might be hard for
members to notice. make it stand out more. more dynamic looking but keeping the
same design look".

## Goal-line check

Plan goal line: "Preserve Original, Prism, Navy & Cream, and Aurora as four
distinct layouts."

Checked. Only the bottom bar rules (`nav.tabs` and its children, plus Aurora's
phone `.rail`, which is the bar's shell) changed, all inside the phone blocks
F4 created. Each appearance uses only its own colors and its own existing
"selected" language, so the four bars look more different from each other than
before, not less. No header rule, header markup, Appearance button, dark-mode
logic, destination, label, permission, click handler, desktop top tab, function,
rule, Firestore path, or test was touched. `app.js` is unchanged.

## What changed per appearance, and where

Shared ideas, applied with each appearance's own tokens: a solid brand-color
selected tab with a white label (was a pale tint), a deeper lifted shadow, a
brand-tinted outline, a 2px lift on the selected tab, a press-down scale of
0.96, a one-time 220ms slide-up when the bar first appears, inactive labels in
the appearance's ink color instead of muted gray, and a slightly larger Manage
dot with a ring in the bar's surface color.

- Original, `index.html`, inside the existing `max-width: 640px` block. White
  bar with a blue-tinted outline (`--brand-blue` mixed into `--surface`) and a
  shadow in the same blue-gray the other Original shadows use. Selected tab is
  a `--brand-blue-deep` to `--brand-blue-dark` fill with a white label, the same
  family as the selected "All" chip. Original had no icons, so every tab gets a
  small icon over its label. The icons are the four shapes the Navy & Cream
  adapter already draws (calendar, checklist, music, sliders), embedded as
  inline SVG masks in the stylesheet, colored by the label color, no external
  files, no emoji, no markup or `app.js` change. The icon rule is scoped to
  `body:not(.aurora)` so Prism and Aurora (which add their own icons) never
  double up, and Navy & Cream switches it off in its own block.
- Prism, `prototype-prism/prism.css`, the F4 `max-width: 600px` bar block.
  Accent-tinted outline, deeper shadow, and the solid Prism accent gradient
  selection with a white label and an accent glow, which is what Prism's
  wide-screen tabs already use. Dark mode uses the same selection through the
  existing `.prism.dark` selector (the light gradient literal is used in both,
  because the dark gradient's lighter end fails AA contrast with white 10px
  labels).
- Navy & Cream, `design-gallery/navy.css`, the F4 `max-width: 800px` block.
  Cream bar with a gold-tinted outline (`--gold` mixed into `--surface`) and a
  deeper shadow. Selected tab is solid burgundy `--action` with a white label
  and a gold icon (`#e5c68c`), the same treatment as the selected date tile.
  The slide-up keyframes keep Navy's centering transform. The dark scheme
  follows through the existing `data-nc-scheme=dark` tokens.
- Aurora, `prototype/workspaces.css`, the F4 `max-width: 600px` rail block.
  Navy rail and blur kept. Selected tab is solid indigo `#5565de` with a white
  label, which Aurora's wide-screen rail already uses. Indigo outline and a
  deeper shadow so the rail separates from the page in dark mode too. The inner
  `nav.tabs` explicitly clears the shadow and animation that Original's phone
  rule would otherwise pass down.

Motion: every transition is 180ms (Navy keeps its existing 220ms color fade),
the entrance is 220ms and runs once when the bar appears (it also plays when
the bar returns after the keyboard closes). Nothing loops. The existing global
rules already switch all animation and transition off for
`prefers-reduced-motion: reduce`, for Prism and Aurora `body.still`, and for
Navy `data-nc-motion=off`; no new motion rule escapes them.

## Verification

- `node --check app.js`: passed (file unchanged).
- `node design-gallery/build.mjs`: passed, all four appearances built. Not
  deployed.
- Mocked browser run. A scratch driver reused the setup half of
  `design-gallery/test.mjs` (its fixture block is read from that file, mock
  Firebase modules, every other network request blocked), signed in as the
  fixture leader "E. Simon" so all four tabs show. Zero page errors, zero
  external requests. Results:
  - 375x812, all four: bar fixed at the bottom (top edge 725 to 738, bottom
    edge 802 to 803), tabs 79 to 82px wide and 53 to 54px tall, no label
    clipped, exactly one icon per tab in every appearance.
  - 320x640, all four (run with reduced motion on): `scrollWidth` equals 320,
    tabs 65 to 68px wide and 52 to 54px tall, labels visible, entrance
    animation reports `none`.
  - Tapping Manage in the bar switches screens and moves the solid selection
    to Manage in all four.
  - Manage red dot visible on the new surface in all four, light and dark. The
    app only draws the dot on a tab that is not selected (`app.js` line 1903),
    so the dot never sits on the solid fill.
  - Contrast of white labels on the selected fills, calculated: Original 6.8:1
    or better, Prism 4.55:1 at the lightest point of the gradient, Navy & Cream
    light and dark above 9:1, Aurora 4.9:1. Inactive labels use each
    appearance's ink color and are well above 4.5:1.

Screenshots (mock data only, the transient "design enabled" toast hidden), in
`/Users/anthony/Projects/worship-duty-app-worktrees/f4b-bar-standout/docs/runs/keep-look-features/F4b-screens/`:
`after-original.png`, `after-prism.png`, `after-navy-cream.png`,
`after-aurora.png`, `after-prism-dark.png`, `after-aurora-dark.png`,
`after-navy-cream-dark.png`, `after-original-320px.png`,
`after-prism-320px.png`, `after-navy-cream-320px.png`,
`after-aurora-320px.png`, and `bars-close-up.png` (every bar stacked in one
image, including each appearance with Manage selected). Compare with the F4
versions in `docs/runs/keep-look-features/F4-screens/after-*.png`.

## Not verified

- A real phone. Safe-area spacing, the keyboard hide, and how the slide-up
  feels on a real device are unchecked.
- The entrance, lift, and press animations were not recorded as video; still
  screenshots show only the resting states. Reduced motion was confirmed by the
  computed `animation-name: none` at 320px, not by eye.
- Dark mode was switched on in the driver by setting the existing `dark` body
  class and `data-nc-scheme=dark` directly, not through the header toggles
  (the F6 lane owns those).
- `color-mix()` is used for the tinted outlines. Browsers from before 2023
  ignore it and keep the plain `--line` outline declared just before it (Navy
  & Cream and Prism keep their F4 border the same way).
- Tablet widths between 601px and 800px were not screenshotted.
- The full `design-gallery/test.mjs` suite was not run (plan says build and
  syntax checks only).
- Nothing was checked against production data or a signed-in production
  account.

## Judgment calls for the coordinator

- Bars stay light in Original, Prism, and Navy & Cream (white or cream surface
  with a solid selected tab) instead of becoming fully brand-filled. A fully
  filled bar was weighed and rejected because those three appearances are
  light designs and a dark slab would stop looking like them. Aurora's bar was
  already dark, so it keeps that.
- Original icons are CSS masks, not markup, so `app.js` and the tab HTML stay
  untouched and the F6 header lane cannot conflict.
- Prism dark uses the light-mode gradient for the selected tab to hold AA
  contrast.
- No sliding indicator: it would need script or markup changes, which this
  lane was told not to make.
- Merge note for F6: all edits sit inside the F4 bar blocks (one line each in
  `prism.css`, `navy.css`, `workspaces.css`; the bar lines of the phone block in
  `index.html`). The comment above each block was extended in place.

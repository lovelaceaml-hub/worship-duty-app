# F4: Floating bottom main navigation on phones

Branch: `claude/f4-bottom-bar`, from commit `58253ee` (live source plus F1, F2,
F3). Worktree:
`/Users/anthony/Projects/worship-duty-app-worktrees/f4-bottom-bar`.
Writer: Fable 5.1 (single writer for this lane). Status: committed on the
branch, not merged, not on any preview channel, not live. No deploy of any kind
was run.

## Goal-line check

Plan goal line: "Preserve Original, Prism, Navy & Cream, and Aurora as four
distinct layouts." Plan product decision: "Always-visible floating bottom
navigation with labeled main destinations appropriate to the account."

Checked against both. No screen, card, color, font, or appearance source was
replaced. The only visible change is where the existing main tabs sit at phone
widths. It is the same single `nav.tabs` element with the same four buttons
(Schedule, My Duties, Presider, Manage), the same `data-act="tab"` click
handling, the same permission rules that hide Presider and Manage, and the
same red dots on My Duties and Manage. There is no second navigation system.
Each appearance styles the bar with its own existing tokens, so the four
layouts stay distinct (see the screenshots).

## Key finding

Prism, Navy & Cream, and Aurora were each originally designed with a bottom
phone navigation in their own stylesheets. Commit `1a674f3` (2026-09-13, "Keep
worship design navigation at the top") added overrides in
`design-gallery/choice.css` and at the end of `design-gallery/navy.css` that
forced the tabs to the top on phones. The approved plan (2026-09-15) and
`AGENTS.md` later decided on the floating bottom bar, so this lane removes
those phone overrides and lets each appearance's own bottom navigation return,
adjusted to float. Original never had one, so it gets a new phone rule built
from its own variables.

## What changed and where

- `index.html` (Original, inside the existing `max-width: 640px` block): the
  tabs become a fixed bar 10px above the bottom edge plus
  `env(safe-area-inset-bottom)`, 12px from each side. White `--surface`,
  `--line` border, `--r-lg` radius, the existing but previously unused
  `--shadow-bar`. Active tab keeps the blue-deep text and gets the
  `--accent-soft` fill already used for the "You" pill. `.wrap` bottom padding
  grows from 28px to 96px plus the safe area.
- `prototype-prism/prism.css` (Prism, compiled into `prism-live.css`): Prism's
  own phone bar (surface, accent-soft selection, icons over labels) now floats
  with a 22px pill radius and `--line` border. Prism's own
  `.prism-page` padding (100px plus safe area) already reserves the room.
  Labels go from 9px to 10px (9px under 360px wide).
- `design-gallery/navy.css` (Navy & Cream, compiled into `navy-live.css`):
  the "never at the bottom edge" override is now limited to screens wider than
  800px. At 800px and below Navy's own floating cream bar (burgundy selection,
  19px radius, safe-area aware) applies again, and `.wrap` reserves 104px plus
  the safe area.
- `prototype/workspaces.css` (Aurora only, compiled into `aurora-live.css`):
  Aurora's navy rail floats 10px above the edge with an 18px radius and its
  existing colors and blur. It lives here, not in `prototype/aurora.css`,
  because `aurora.css` is also compiled into Prism. Aurora's own workspace
  padding (97px plus safe area) already reserves the room.
- `design-gallery/choice.css`: removed the phone block that pinned Prism and
  Aurora tabs to the top; the appearance toast (`#wd-design-status`) now sits
  above the bar at 800px and below. The Appearance button rules are unchanged.
- `app.js` (three small, separate edits, none near notification code):
  `renderLoading()` adds a `nav-loading` class to the tabs, `render()` removes
  it on its first line, and a 12-line `watchKeyboardForTabBar()` just above
  `init();` sets `html[data-keyboard="open"]` while the visual viewport is more
  than 150px shorter than the window (pinch zoom is excluded by multiplying by
  `visualViewport.scale`). Each stylesheet hides the bar for `.hidden`,
  `.nav-loading`, and the keyboard flag.
- `design-gallery/README.md` and `docs/USER-GUIDE.md`: one sentence each that
  said the tabs stay at the top on phones now describes the bottom bar.

`design-gallery/build.mjs` was not changed. It has no `verifyLayouts` function
and no check on navigation placement (searched the repository for the name: no
match). `design-gallery/test.mjs` also has no top-placement assertion, so it
was not changed either.

Desktop choice: wide screens keep the current top navigation in all four
appearances (Original above 640px, Prism and Aurora above 600px, Navy & Cream
above 800px, each appearance's own existing phone breakpoint). Measured at
1280px: positions identical to the before build.

Sticky save bars: the live app has none. The only fixed bottom elements are
the appearance toast and the Prism and Aurora toasts, all of which sit above
the bar.

## Verification

- `node --check app.js`: passed.
- `node design-gallery/build.mjs`: passed, built Original + Prism + Navy &
  Cream + Aurora. Not deployed.
- Mocked browser walkthrough. A scratch driver reused the setup half of
  `design-gallery/test.mjs` (mock Firebase modules, every other network request
  blocked, fixture members only) against two builds: a `git archive 58253ee`
  copy (before) and this worktree (after). Signed in as the fixture leader
  "E. Simon" so all four tabs show. Zero page errors, zero external requests.
  Results for the after build, all four appearances:
  - 375x812: bar is fixed at the bottom (top edge 732 to 740, bottom edge 795
    to 803), tabs 79 to 82px wide and 50 to 54px tall, no label clipped.
  - 320x640: `scrollWidth` equals 320 in all four (no horizontal overflow),
    tabs 65 to 68px wide and 50 to 54px tall, labels visible.
  - Scrolled to the end of Schedule: last content ends 52px or more above the
    bar in every appearance.
  - Tapping My Duties and Manage in the bar switches screens as before; the
    Manage red dot shows.
  - Site lock and sign-in screens: bar not visible. Simulated `hidden`,
    `nav-loading`, and `data-keyboard="open"` each hide the bar (and Aurora's
    whole rail) in all four, and it returns afterward.
  - 1280x800: tabs at the top, same coordinates as before.

Screenshots (375x812, mock data only, the transient "design enabled" toast
hidden for a clear view), in
`/Users/anthony/Projects/worship-duty-app-worktrees/f4-bottom-bar/docs/runs/keep-look-features/F4-screens/`:
`before-original.png`, `after-original.png`, `before-prism.png`,
`after-prism.png`, `before-navy-cream.png`, `after-navy-cream.png`,
`before-aurora.png`, `after-aurora.png`, plus `after-original-320px.png` and
`after-aurora-320px.png`.

## Not verified

- A real phone. The keyboard hide was only simulated by setting the flag; the
  `visualViewport` trigger itself needs one check on an iPhone and an Android
  phone. The safe-area inset is 0 in desktop Chromium, so the home-indicator
  spacing is unverified.
- The maintenance screen was not re-screenshotted; it hides `.wrap` entirely
  and `render()` still adds `hidden` to the tabs, unchanged code paths.
- Prism and Aurora dark mode with the floating bar were not screenshotted.
  They use the same variables and rules as before.
- The full `design-gallery/test.mjs` suite was not run (the plan says no test
  gates beyond build and syntax checks; only its setup half was reused).
- Nothing was checked against production data or a signed-in production
  account.

## Judgment calls for the coordinator

- This reverses the 2026-09-13 "keep tabs at the top on phones" change, because
  the later approved plan and `AGENTS.md` call for the bottom bar. `README.md`
  line 15 and `docs/HANDOFF.md` near line 90 still describe top tabs; they are
  coordinator-owned status text and were left alone.
- Navy & Cream floats up to 800px wide (its own breakpoint), the others up to
  600 or 640px. Tablets in portrait therefore differ by appearance.
- Prism's phone header is no longer sticky (that is Prism's own phone design);
  it held the tabs before, and now holds only the brand and member name.
- Follow-up candidate: none blocking. The keyboard hide was small enough to
  include.

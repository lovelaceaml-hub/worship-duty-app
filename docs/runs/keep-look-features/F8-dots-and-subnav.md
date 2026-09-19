# F8: green new-duty dot on My Duties, and secondary menus at the top on phones

Date: 2026-09-19. Branch: `claude/f8-dots-subnav`, from `fce8e4e` (the source of
the live app). Worktree:
`/Users/anthony/Projects/worship-duty-app-worktrees/f8-dots-subnav`.
Writer: Claude Fable 5.1 (single writer for this lane, assigned by the
coordinator). Status: committed on the branch, not merged, not on any preview
channel, not live. No deploy of any kind was run. Lanes F7 (header account
menu, "Signed in as" banner, appearance toast) and F9 (README, HANDOFF, Prism
dark attention banner, `departmentAttribution`) ran at the same time in their
own worktrees; none of their areas was touched here.

## Anthony's words

1. "change conflicts and notification display. conflicts should be a right
   circle showing on manage (how it is now). notification for new duties should
   have. a green circle on My Duties" ("right circle" read as "red circle").
2. "If a screen has secondary menu options, put them at the top below header.
   e.g. presider (bottom); home, library, services, insights (top)."

## Goal-line check

Plan goal line: "Preserve Original, Prism, Navy & Cream, and Aurora as four
distinct layouts." Plan decision: "Compact secondary tabs below workspace
headings."

Checked. No appearance source, adapter, header, main tab, destination, label,
permission, or handler was replaced. The top menu row is drawn with each
appearance's own existing `.subnav` sub-tab style (Original blue bordered
buttons, Prism accent pills over a hairline, Navy & Cream burgundy selection on
cream, Aurora segmented tray), so the four layouts stay distinct; see the
screenshots. One deliberate difference from the plan sentence: Anthony's newer
words say "at the top below header", so in Prism and Aurora the row sits above
the big workspace heading, not below it. In Original and Navy & Cream there is
no workspace heading, so the row is directly under the header in all four.
Wide screens are unchanged.

## Part 1: the dots

### The new-duty signal that already existed (reused, not rebuilt)

`checkNewDuties()` in `app.js` already does exactly what was asked:

- It keeps, per member and per device, the set of duty keys already seen in
  `localStorage` (`wds-seen-<member>`).
- On the first run for a member (no saved set), after a name switch, or when
  the **New-duty alerts** feature is off, it saves the current duties silently
  and raises nothing. So existing duties never light the dot on first use.
- When a later schedule update contains a duty key that is not in the set, it
  adds a "New duty" line to Recent updates, shows the "You have N new duties"
  banner, and, if the member is not on My Duties, increases
  `wds-unread-<member>`.
- `render()` already drew a dot on the My Duties tab while that unread count is
  above zero and the tab is not selected, and opening My Duties (or Clear in
  Recent updates) sets it back to zero.

So the live app already had a My Duties dot; it was simply the same red as the
Manage dot. This lane keeps that logic untouched and changes only the color and
the announcement. No server, Firestore, rules, or functions change. Nothing new
is stored.

### What changed

- `index.html`, one base rule next to the existing dot rule:
  `nav.tabs button#tab-my .dot { background: var(--ok); }`. It is keyed on the
  button id, not on a class on the dot, because the Prism, Aurora and gallery
  adapters redraw the dot as a bare `<span class="dot">`. Every appearance
  loads this base rule and supplies its own `--ok`: Original `#16734c`, Prism
  `#246b53` light and `#9bddba` dark, Navy & Cream `#2c6a50` light and `#a0d2b8`
  dark. Position, size and the F4b ring are inherited from each appearance's
  existing `.dot` rules, so the green dot is the same size and place as the
  Manage dot (measured: identical offsets and sizes in all four).
- `prototype/workspaces.css` (Aurora only): Aurora's `--ok` (`#20705c`) is too
  dark on Aurora's navy bar, which is navy in light and dark mode alike, so
  Aurora uses `#b0e2cc`, the mint Aurora already uses for its dark "sung" status
  pill. Aurora's Manage dot stays its existing peach.
- `app.js`, `render()`: the two dot lines are unchanged. Six lines after them
  set `aria-label="My Duties, new duty"` or `aria-label="Manage, needs
  attention"` on the tab button while its dot shows, and remove it otherwise.
  Finding: the Manage dot had no accessible text at all before (an empty span),
  so there was nothing to mirror; both dots now announce the same way. The
  label sits on the button because the adapters rewrite the button's inner HTML
  but not its attributes.
- The Manage dot logic (`actionableCountsForViewer().total`, requests plus
  conflicts) is unchanged. The pink "needs your attention" banner and the "new
  duties" banner are unchanged and do not interact with the dots.

## Part 2: secondary menus

### Inventory (all four appearances, phone widths)

| Screen | Secondary menu | Where it was on a 375 px phone (page position of its top edge) | Now |
|---|---|---|---|
| Presider (song planner) | Home, Library, Services, Insights (`.ns-tabs` in `song-app.js`) | Original 402 px, Prism 516, Navy & Cream 472, Aurora 532 (570 at 320 px): below the banners, the back button and the presider card, so at or past the middle of the screen | Moved to the top, all four |
| Manage | Departments, Services, Planning, Requests, plus Leader config, Features, Data & Sync by role, plus Sign out (`.subnav` in `renderManage`) | Original 364 px (2 rows, 3 rows at 320), Prism 497 (2 rows), Navy & Cream 539 (1 scrolling row), Aurora 534 (2 rows) | Moved to the top, all four |
| Schedule | Department chips (All, Worship, ...) `.subnav.chips` | Top of the Schedule view | Left alone: it is a filter on one screen, not a menu of sub-screens |
| Schedule, Aurora | Day and list `view-switch` | In the schedule toolbar | Left alone: a view toggle beside the thing it controls |
| Schedule, Navy & Cream | "Day view" and "Full schedule" `nc-view-switch` | In the schedule area | Left alone, same reason |
| Presider Home | "My Services" and "All Services" scope toggle | Inside the Home view | Left alone: a filter inside one sub-screen |
| My Duties | None | | |

Finding on "presider (bottom)": the song planner never had its own bottom bar
in any appearance (searched `song-app.css` and every appearance stylesheet for
fixed positioning: none). I read Anthony's example as "Presider is in the
bottom bar; Home, Library, Services, Insights belong at the top". What he saw
near the bottom was the row sitting 400 to 570 px down the page.

### How it works

- `app.js`, new `watchTopSubnav()` just above `init();` (about 65 lines). It
  watches `#view` and, whenever the Presider row or the Manage row is present,
  mirrors its buttons into one `<nav id="subnav-top" class="subnav">` placed
  directly below the shared header: before the page heading in Prism and
  Aurora, before the banners in Original and Navy & Cream. It re-homes itself
  when an appearance rebuilds its shell.
- A mirrored button only presses its original (looked up again at click time),
  so labels, order, counts such as "Planning (2)", permissions, the Sign out
  item and every handler stay exactly those of the original row.
  `song-app.js`, `song-app.css` and `song-lib.js` are untouched; swipe between
  song tabs still works and the top row follows it.
- The original rows stay in the page. The stylesheets show one copy or the
  other: at phone widths (640 px and below, 800 px and below in Navy & Cream to
  match its bottom bar) the top row shows and the in-page copy is hidden, and
  only when the script has set `html[data-subnav-top="on"]`, so a browser
  without the script still gets the original menu. Wide screens keep the
  original menus where they were (measured at 1280 px and 700 px).
- One row, never wraps, scrolls sideways with a hidden scrollbar. Buttons
  stretch to fill the row when there are few (the four Presider items fill the
  width), and the selected item is scrolled into view when it changes. Keyboard
  focus is restored to the same item after the row redraws. Not sticky (the
  old rows were not sticky either).
- Styling comes from each appearance's existing `.subnav` rules. Added CSS:
  `index.html` base block (layout of the row, the hide rule, 9 px side padding
  under 380 px so the four Presider items fit at 320 px without scrolling) and
  the same rules in the Navy & Cream phone block in `design-gallery/navy.css`
  with its 20 px side margins.
- The row is above the page content and the floating bar is fixed at the
  bottom, so they cannot collide.

## Verification

- `node --check app.js`: passed. No other JS file was touched.
- `node design-gallery/build.mjs`: passed, all four appearances built. Not
  deployed.
- Mocked browser run. A scratch driver (session scratchpad, not in the repo)
  reused the fixture block and the mock Firebase modules from
  `design-gallery/test.mjs`, with every name replaced by an invented one
  ("E. Example", "B. Sample", "D. Demo", "S. Tester"), every non-mock network
  request blocked (only the blocked Google Sheet and Apps Script calls were
  attempted), reduced motion on. Before build: `git archive` of `fce8e4e`. All
  four appearances, signed in as the fixture leader and presider "E. Example".
  Zero page errors. Results for the after build:
  - First run after sign-in: no My Duties dot, Manage dot present.
  - A fixture duty added for the member through the mock live channel: green
    dot appears on My Duties, red (Aurora: peach, as before) stays on Manage.
    Computed colors: Original `rgb(22,115,76)`, Prism `rgb(36,107,83)` and dark
    `rgb(155,221,186)`, Navy & Cream `rgb(44,106,80)`, Aurora
    `rgb(176,226,204)` light and dark. Same offset, size and ring as the Manage
    dot in each appearance. `aria-label` values present while the dot shows.
  - Reload before opening My Duties: dot still there. Open My Duties: dot gone.
    Back to Schedule: still gone. Reload: does not reappear.
  - Presider: top row is 12 px below the header in Original and Prism, 14 px in
    Navy & Cream, and under Aurora's one-line caption (row top at 103 px, was
    532). One row in all four. Tapping Library, Services, Insights, Home in the
    top row switched the sub-screen each time and moved the selection in both
    copies.
  - Manage: one row in all four (was 2 rows in three of them). Tapping
    Services, Planning, Requests, Departments in the top row switched each
    time. With Requests selected the row scrolled so Requests was fully in
    view.
  - 320x640: no horizontal page overflow on Schedule, Presider and Manage in
    all four (`scrollWidth` 320). Presider row fits without scrolling in all
    four; Manage row scrolls inside itself.
  - 1280 px and 700 px: top row hidden and original menus shown, except Navy &
    Cream at 700 px, which shows the top row because its bottom bar is also
    active there.

Screenshots (375x812 unless named, fixture data only), in
`/Users/anthony/Projects/worship-duty-app-worktrees/f8-dots-subnav/docs/runs/keep-look-features/F8-screens/`,
for each of `original`, `prism`, `navy-cream`, `aurora`:

- `before-<appearance>-schedule-dots.png` (both dots red) and
  `after-<appearance>-schedule-dots.png`, plus
  `after-<appearance>-bar-closeup.png`.
- `after-<appearance>-my-duties.png` (My Duties opened, dot cleared).
- `before-<appearance>-presider.png`, `after-<appearance>-presider.png`,
  `after-<appearance>-presider-insights.png`.
- `before-<appearance>-manage.png`, `after-<appearance>-manage.png`,
  `after-<appearance>-manage-requests.png`, `after-<appearance>-manage-320px.png`.
- 320 px Presider: `before-` and `after-original-presider-320px.png`,
  `before-` and `after-aurora-presider-320px.png`.
- Dark: `after-prism-dark-schedule-dots.png`, `after-prism-dark-bar-closeup.png`,
  `after-prism-dark-presider.png`, `after-prism-dark-manage.png`, and the same
  four for `aurora`.

## Judgment calls for the coordinator

- Phones only. Anthony's sentence does not mention screen size, but the live
  look is the authority on wide screens and this plan is the phone plan, so
  wide screens keep their menus in place. Easy to widen later: the breakpoints
  are two media queries.
- Row above the workspace heading in Prism and Aurora (his newer words) rather
  than below it (the older plan sentence). To put it below the heading instead,
  change one line in `watchTopSubnav()` (the `anchor`).
- A mirror, not a move. Moving the song row out of `#song-root` would break the
  song planner's own click handling and would mean editing `song-app.js`.
- The Manage "Sign out" item is carried into the top row because it is part of
  that menu today. If F7's account menu makes it redundant, removing it from
  `renderManage` removes it from the top row automatically.
- Accessible names were added to both dots, including Manage, which had none.
  This does not change how the Manage dot looks or when it shows.
- Aurora's green is a lighter mint than the other three because its bar is
  navy. It is an existing Aurora color, not a new one.
- The dot follows the existing **New-duty alerts** feature switch (on by
  default). If an administrator turns that off, no green dot, as today.
- Merge notes: `app.js` edits are six lines after the two dot lines in
  `render()` and one new function directly above `init();`. `index.html` edits
  are CSS only (no header or markup change). F7 and F9 areas untouched.

## Not verified

- A real phone, the installed PWA, touch scrolling of the row, and a screen
  reader reading the new labels.
- `node design-gallery/test.mjs` was not run (the plan selects no suites, and
  Playwright is not installed in this worktree). It runs at 390 px wide and
  clicks `[data-act="sub"]` and `#song-root .ns-tabs` buttons directly; those
  originals are now hidden at that width, so those steps will need to click the
  visible top row (or run wider) the next time someone runs the suite.
  Follow-up candidate, not done here because the lane was told no test work.
- Whether **New-duty alerts** is currently on in production (it defaults to
  on).
- Tablet widths between 641 px and 800 px other than the Navy & Cream 700 px
  check. Administrator-only items (Leader config, Features, Data & Sync) were
  not screenshotted; they come through the same mirror.
- Dark mode was driven by the browser's `prefers-color-scheme: dark`, which is
  how F6 switches Prism and Aurora; Navy & Cream dark was not screenshotted.
- Nothing was checked against production data or a signed-in production
  account. No preview channel, no deploy.

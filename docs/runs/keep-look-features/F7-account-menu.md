# F7: Account menu on the member name, banners removed

Branch: `claude/f7-account-menu`. Worktree:
`/Users/anthony/Projects/worship-duty-app-worktrees/f7-account-menu`.
Writer: Fable 5.1 (single writer for this lane, assigned by the coordinator; the
2026-09-18 and 2026-09-19 Build log entries record Anthony assigning lanes to
Fable). Status: committed on the branch, not merged, not on any preview channel,
not live. No deploy of any kind was run. Two other writers ran at the same time:
`f8-dots-subnav` (bottom bar dots, secondary menus) and `f9-cleanup` (README,
HANDOFF, Prism dark attention banner colors, `departmentAttribution`). This lane
touched none of those.

## Goal-line check

Plan goal line: "Preserve Original, Prism, Navy & Cream, and Aurora as four
distinct layouts." The live look is the visual authority except for changes
Anthony names. He named these, verbatim:

1. "remove the "signed in as B. Anthony sign out" cards since the name is
   already in the header."
2. "when design changes, remove the "Your schedules, duties, permissions and
   song plans are unchanged.""
3. "availibility and settings and logging out should go in a drop down menu when
   you click the person's name."
4. (Added mid-lane through the coordinator) remove the pink "N request(s) and N
   conflicts need your attention" banner, "the red dot on Manage is enough".

Checked: the change is one menu on the existing member chip, two plain views
built from existing cards, two banners no longer rendered, and one sentence cut
from a toast. The menu is styled separately for each appearance with that
appearance's own surface, border, corner radius, shadow and accent (see the
screenshots). No layout, navigation bar, or screen below the header was
restyled. The four layouts stay distinct.

## What existed before (discovery)

- Availability: the "Your availability" card(s), one per department profile,
  rendered by `renderOwnAvailability()` and `renderOwnAvailabilityProfile()` in
  `app.js`, shown on My Duties between "Recent updates" and the duty list. A
  member with no department profile saw nothing there.
- Member-level settings that exist today: the notifications button and the
  calendar button (plus the "How it works" disclosure and "Copy calendar link")
  at the top of My Duties, and the Appearance chooser (palette icon in the
  header). That is all. There is no voluntary "change my PIN" for members:
  `memberChangePin()` only runs on the forced PIN change screen, and a PIN is
  otherwise changed by a leader or administrator pressing Reset PIN (F2), after
  which the member picks a new PIN at the next sign-in. Everything else
  configurable lives in Manage and is administrator or leader scope.
- Sign out: `data-act="member-logout"`, handled by `memberLogout()`, no
  confirmation. It was rendered in three places: the "Signed in as" banner in
  `renderBanners()`, a button on the forced PIN change screen
  (`renderForcedPinChange()`), and a `lock-btn` in Manage. No appearance adapter
  moved or restyled the banner; it was plain `.banner` styling in all four.
- The member chip was `data-act="tab" data-tab="my"` (jumped to My Duties).

## What was built

### A. The menu

`index.html`: the chip (`.wd-head-member`) is now a menu button
(`aria-haspopup="menu"`, `aria-expanded`), with no `data-act`. Next to it, inside
`.wd-head-tools`, sits `.wd-account-menu` (`role="menu"`, hidden by default)
with three real buttons, each `role="menuitem"`: Availability
(`data-act="account" data-view="availability"`), Settings
(`data-act="account" data-view="settings"`), Sign out
(`data-act="member-logout"`, the existing action, unchanged). Structure and
Original's look are in `index.html`; Prism, Navy & Cream and Aurora restyle it
in their own marked sections of `design-gallery/header.css` (including dark
variants for Prism and Aurora, where Sign out turns a lighter rose so it stays
readable). `design-gallery/build.mjs`: the regular expression that lifts the
tools block out of `index.html` now runs to the end of the menu, with a drift
error if the menu is missing, so Prism's and Aurora's shells receive the same
markup.

`app.js`, right after `paintHeader()`: `accountView()`, `accountMenuOpen()`,
`setAccountMenu()`, one click listener and one keydown listener.

- Opens and closes on the chip. Closes on any tap outside the chip (this also
  covers choosing an item and changing tabs), on Escape (focus returns to the
  chip), on Tab, and whenever the header is painted signed-out.
- Keyboard: focus moves to the first item on open; ArrowDown, ArrowUp, Home and
  End move between items; ArrowDown or ArrowUp on the closed chip opens it.
- Items are at least 44 pixels tall (46 in Navy & Cream). `z-index: 120`, above
  the floating bar (50 to 90 across the appearances) and the appearance toast
  (110). Width is capped at the viewport minus 24 pixels.
- At 359 pixels and below the chip shows initials only, so the menu shows the
  member's name as a small first line (also in Prism between 601 and 1000
  pixels, where Prism hides the name). Screen readers get the name from the
  chip's label ("Signed in as <name>. Account menu").
- Not rendered before sign-in: the chip is hidden there, and the menu is forced
  closed.

### The two destinations

Both are views inside My Duties: `ui.tab` stays `'my'` and a new `ui.account`
holds `'availability'` or `'settings'`. `render()` calls the new
`renderAccount()` instead of `renderMy()` when one is open, clears `ui.account`
whenever the tab is not My Duties, and the `tab` action clears it too, so
tapping My Duties always returns to the duty list. The header's second line
reads "Availability" or "Settings". No bottom tab is highlighted while one is
open, because the screen is not My Duties.

- Availability: the same `renderOwnAvailability()` cards, same handlers, same
  save path. If the member has no department profile it says so plainly instead
  of showing a blank screen.
- Settings: "Notifications and calendar" (the exact block from My Duties, now
  one function, `renderNotifyControls()`, used in both places), "Appearance" (a
  button that opens the existing chooser; shown only when the chooser script is
  present), and "Member PIN" (one sentence: ask a leader or administrator to
  reset it). No Manage or administrator settings.
- Prism and Aurora put the view's name in their own page heading
  (`paintAccountHeading()` in `design-gallery/host-bridge.js`); Navy & Cream
  shows its own "Your account" panel instead of the "next duty" hero (two lines
  in `design-gallery/navy-adapter.js`); Original shows a plain title. In the
  three styled appearances the view's own title is kept for screen readers only,
  so nothing is said twice on screen.

### C. "Signed in as" banner removed

Deleted from `renderBanners()`. Sign-out paths now: the menu on every signed-in
screen (the header is always present once signed in, in all four appearances,
including the Presider song screens and Manage); the forced PIN change screen
keeps its own Sign out button (checked: chip hidden there, button visible and
working); the Manage `lock-btn` is unchanged. Site lock, sign-in and
maintenance have nobody signed in.

### D. Toast sentence removed

`design-gallery/choice.js`: the toast now reads "<Name> design enabled." plus
the existing "This browser cannot save the preference." when that applies. No
doc or test asserted on the removed sentence. `live-design/choice.js` (the older
two-design build, not released) has different wording and was left alone.

### E. "Need your attention" banner removed (added mid-lane)

`renderBanners()` no longer pushes the `.banner.alert` item.
`actionableCountsForViewer()`, its `message`, and the `open-manage-queue` action
and permission check are untouched; the Manage tab dot still uses the same
count. `#banners` is empty when there is nothing to show: measured height 0 in
Original and Navy & Cream, `display: none` in Prism and Aurora (their own
`#banners:empty` rule). Reminder, save and error banners from `addBanner()` are
unchanged. Note for the coordinator: this makes F9's Prism dark attention banner
color work apply only to `addBanner(..., true)` error banners, which still use
`.banner.alert`.

## Judgment calls

1. The availability card was moved, not copied: it no longer appears on My
   Duties. Anthony's words were that it "should go in" the menu, a full editor
   in two places is clearly redundant, and it was the largest block pushing the
   duty list down. To put it back, restore one line in `renderMy()`:
   `html += renderOwnAvailability();`.
2. Notifications and calendar stay on My Duties and also appear in Settings,
   from one shared function. They are the prompt that gets members to turn
   notifications on, and Anthony approved that area's layout in F5 this week, so
   removing it from My Duties looked like a regression rather than redundancy.
3. Settings is a view, not a new main tab, so every appearance's tab-keyed
   logic keeps working untouched.
4. No member "change my PIN" was added; none exists today and adding one is a
   feature, not a move. Settings says how a PIN gets changed.
5. No bottom tab is highlighted on Availability or Settings.
6. Menu CSS for Prism, Navy and Aurora sits mid-section in `header.css` (after
   each caret rule), not at the section ends, to stay clear of F9's likely
   edits. Two small non-header rules (hiding the duplicate view title) also live
   there because it is the only per-appearance file this lane could touch
   safely.
7. `design-gallery/test.mjs`: two assertions updated minimally (availability now
   opened through the menu; the attention banner assertion now checks it is
   absent). No new suite.
8. The screenshot harness is kept in `F7-tools/` (it reuses the setup half of
   `design-gallery/test.mjs` and borrows Playwright from
   `/Users/anthony/Projects/season-map/node_modules`; run `node gen.mjs` then
   `node run.mjs`; `run.mjs` is generated).

## Verification

- `node --check`: `app.js`, `design-gallery/choice.js`,
  `design-gallery/host-bridge.js`, `design-gallery/navy-adapter.js`,
  `design-gallery/build.mjs`, `design-gallery/test.mjs`, and the compiled
  `.hosting-gallery/app.js`: passed.
- `node design-gallery/build.mjs`: passed, four appearances. Not deployed.
  `node live-design/build.mjs` still builds.
- `tests/department-runtime-contract.test.mjs` and
  `tests/department-workflows.test.mjs`: 30 of 30 pass.
- Mocked browser walkthrough (mock Firebase, fixture members "S. Lisa" and
  "E. Simon" only, 375 by 812), 82 checks, all passed, zero page errors, zero
  blocked external requests. For each of the four appearances: no "Signed in as"
  banner; chip has `aria-haspopup="menu"` and `aria-expanded` flips; menu sits
  inside the viewport, three items, each at least 44 pixels and on top at its
  center point (`elementFromPoint`); ArrowDown moves focus; Escape closes and
  returns focus; outside tap closes; tab change closes; My Duties has no
  availability card; Availability opens the editor and a change still saves
  through `updateMemberAvailability`; Settings shows notifications, calendar and
  Appearance, and its Appearance button opens the chooser; My Duties tab leaves
  the view; `scrollWidth` equals the viewport; Sign out lands on the sign-in
  screen with the chip gone; the toast reads "<Name> design enabled." only.
  Plus: 320 pixels in Original and Aurora (menu inside the viewport, name line
  shown); Prism and Aurora with the browser emulating dark; forced PIN change
  keeps a working Sign out; a leader with pending items sees no attention
  banner, a collapsed `#banners`, and the Manage dot, in all four.
- Also checked, not saved: 1280 pixels in all four (menu under the chip, on
  top), and the empty Availability message for a member with no profile.

Screenshots (fixture data only) in
`/Users/anthony/Projects/worship-duty-app-worktrees/f7-account-menu/docs/runs/keep-look-features/F7-screens/`:
for each of `original`, `prism`, `navy-cream`, `aurora`:
`<name>-1-schedule-menu-closed.png`, `<name>-2-menu-open.png`,
`<name>-3-availability.png` (and `-full`), `<name>-4-settings.png` (and
`-full`), `<name>-8-leader-no-attention-banner.png`; plus
`original-5-menu-open-320px.png`, `aurora-5-menu-open-320px.png`,
`prism-6-menu-open-dark.png`, `aurora-6-menu-open-dark.png`,
`original-7-forced-pin-sign-out.png`. In the `-full` images the floating bar
appears mid-page; that is how full-page capture draws a fixed bar, not a defect.

## Not verified

- A real phone, a real screen reader, touch behavior, the safe-area inset.
- The full `design-gallery/test.mjs` suite was not run (plan: no test gates
  beyond build and syntax checks); only its two touched assertions were read.
- Production data or a production account; the Presider song screens with the
  menu open (the header is the same element there).
- Merging with `f8-dots-subnav` and `f9-cleanup` was not attempted. Likely
  touch points: `render()` near the tab `active` toggle in `app.js` (F8 dots are
  a few lines below), `design-gallery/header.css`, `design-gallery/navy-adapter.js`.

## Side observation (not this lane)

Navy & Cream's Schedule heading shows an empty rounded square at the top right
on phones (the month arrows container, `.nc-arrows`). It is already in the F6b
screenshots, so it is live today. Follow-up candidate.

`README.md`, `docs/HANDOFF.md` and the plan's Build log are coordinator-owned and
were not edited.

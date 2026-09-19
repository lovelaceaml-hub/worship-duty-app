# F10: Floating feedback button, feedback sheet, and administrator list

Branch: `claude/f10-feedback` (from `fce8e4e`, the source of the live app).
Worktree: `/Users/anthony/Projects/worship-duty-app-worktrees/f10-feedback`.
Writer: Fable 5.1 (single writer for this lane). Status: committed on the
branch, not merged, not on any preview channel, not live. No deploy of any kind
was run. `firestore.rules`, `functions/`, `README.md`, `docs/HANDOFF.md` and the
plan's Build log were not edited. Lanes F7, F8 and F9 ran at the same time on
sibling branches; this lane touched no header, `renderBanners`, `nav.tabs`,
sub-tab placement, or song app code.

Anthony's request, verbatim: "A small floating circle for submitting feedback,
reporting bugs, suggesting changes should be slightly above the bottom right
(above the floating bottom header)". He chose that feedback is saved in the app
and administrators read it in a Feedback list under Manage.

## Goal-line check

Plan goal line: "Preserve Original, Prism, Navy & Cream, and Aurora as four
distinct layouts."

Checked. This is a change Anthony named. Nothing existing was restyled or
moved. The new button, sheet and list are drawn by each appearance with its own
tokens and its own "selected" language (see the screenshots), so the four
layouts stay distinct:

- Original: round blue gradient button (the same fill as the header's "LV"
  badge), white sheet, solid blue selected choice (as in Original's sub-tabs).
- Prism: Prism accent gradient button with the accent glow, 9 to 16 pixel
  corners, solid accent selected choice, spaced uppercase field label.
- Navy & Cream: the header's navy with a gold icon and gold hairline, cream
  sheet, Georgia serif title, burgundy selected choice.
- Aurora: the badge's indigo gradient button, segmented choices in a soft tray
  (as in Aurora's sub-tabs), canvas-tinted text box.
- Prism and Aurora follow the device's dark mode through the existing tokens.

## What was built, and where

- `app.js`, one contiguous block headed `feedback (F10)`, placed just above the
  "Upcoming setlists" comment:
  - `syncFeedbackButton()` creates the button once on `<body>` and shows it only
    when `feedbackReady()` is true: not maintenance, site lock open, verified
    member session, not a forced PIN change. `render` is wrapped once at the
    end of the block (`renderBeforeFeedback`), the same way the appearance
    bridge wraps it, so no line inside `render()` changed. When the session is
    no longer ready the sheet closes and the cached administrator list is
    dropped.
  - `openFeedbackSheet()` builds a native `<dialog>` (the Appearance chooser
    already uses one), `aria-modal="true"`, labelled by its title, opened with
    `showModal()`, focus goes to the text box with `preventScroll`. Escape,
    Cancel and a tap on the backdrop close it; focus returns to the button.
    Three radio choices (Feedback, Report a bug, Suggest a change; Feedback is
    the default), a required text box with `maxlength="2000"`, Send and Cancel.
  - The button and the sheet live on `<body>`, outside `#view`, so the app's
    live-sync re-renders never touch them. The draft and the chosen kind are
    also kept in `feedbackUi` on every keystroke, so closing and reopening keeps
    the text. It is cleared only after a successful send.
  - `sendFeedback()` ignores a second tap while a send is in flight. Success:
    close, `addBanner('Thank you. Your feedback was sent.')`. Failure: the text
    stays, the sheet shows "That did not send. Your message is still here, so
    you can try again." and the Send button reads Retry. If the device reports
    it is offline the same plain message appears at once instead of waiting. If
    the member closed the sheet before a failure arrived, a banner tells them
    the message is still there. With Firebase disabled (`fb` is null) the send
    resolves locally into an in-memory list so the whole flow can be tried.
  - `renderManageFeedback()`, `loadFeedbackList()`, `renderFeedbackEntry()`,
    `changeFeedbackEntry()`: the administrator list. A one-time `getDocs` of
    `feedback`, `orderBy('createdAt','desc')`, `limit(100)`, grouped New and
    Done ("Show done (n)" toggle), Refresh, Mark done (`updateDoc` with only
    `{status: 'done'}`), Delete (`deleteDoc` after a `confirm`). Loading, empty
    ("No feedback yet."), and error states; a `permission-denied` error reads
    "The feedback list is not available yet.". Every function returns early
    unless `canPermission('isAdmin', authActor())`, so the read is never
    attempted for anyone else.
  - Its own `document` click listener on `data-fbk` attributes, so
    `handleAct()` and `canRunAction()` were not edited.
- `app.js`, three small hooks outside the block: one line adding
  `['feedback', 'Feedback']` to the Manage sub-tab list for administrators, one
  `else if` line routing `ui.sub === 'feedback'` to `renderManageFeedback()`
  (administrators only), and `orderBy` plus `limit` exposed on the `fb` object.
- `index.html`: one contiguous CSS block (`.wd-fbk-*`), placed just above the
  reduced-motion rule. It is Original's look and the shared structure. Button
  46 by 46 pixels, `z-index: 60` (above page content and the bar at 50, below
  the appearance toast at 110 and Aurora's toast at 120; the sheet itself is in
  the browser's top layer). Hidden by `[hidden]` and by
  `html[data-keyboard="open"]`, hidden in print.
- `design-gallery/feedback.css` (new): one marked section per appearance
  (`@prism`, `@navy`, `@aurora`), same convention as `header.css`.
- `design-gallery/build.mjs`: three added lines that append each section to
  `prism-live.css`, `navy-live.css` and `aurora-live.css`. No existing line
  changed.
- `prototype/workspaces.js`: one added line in `awManageCopy` so Aurora's
  Manage heading reads "Member feedback" instead of falling back to "Service
  assignments".
- `docs/USER-GUIDE.md` ("Sending feedback") and `docs/USER-MANUAL.md` ("Member
  feedback (administrators)").

Position: on phones the button sits 10 pixels above the floating bar in every
appearance (Original `86px`, Prism `85px`, Navy & Cream `84px`, Aurora `97px`
from the bottom edge, each plus `env(safe-area-inset-bottom)`), 14 to 18 pixels
from the right edge. On wide screens, where the tabs are at the top, it sits in
the bottom right corner (20 to 24 pixels in). Each appearance switches at its
own existing phone breakpoint (640, 600, 800, 600 pixels).

## Exact document shape written

Collection `feedback`, document id generated in the browser
(`<createdAt in base 36>-<8 random characters>`, for example
`mr30a9m4-xnjmr4vl`), written with `setDoc` through `fbWrite()`:

```
{
  uid:        fb.auth.currentUser.uid          // falls back to currentMemberUid(); same value
  name:       memberLabel(ui.me)               // signed-in member's display name
  kind:       'feedback' | 'bug' | 'suggestion'
  message:    trimmed text, 1 to 2000 characters
  screen:     ui.tab                           // 'schedule' | 'my' | 'songs' | 'manage'
  createdAt:  Date.now()                       // number
  status:     'new'
  appearance: 'classic' | 'prism' | 'navy' | 'aurora'   // omitted when the appearance bridge is absent
}
```

No other key is ever written on create. Administrator update writes only
`{status: 'done'}` with `updateDoc`. Captured from the mocked run:
`{"uid":"member:A. Sample","name":"A. Sample","kind":"bug","message":"...","screen":"schedule","createdAt":1782966610732,"status":"new","appearance":"classic"}`.

## Judgment calls for the coordinator

- The sheet is a native `<dialog>`. It gives the focus trap, Escape and the top
  layer for free, and the app already depends on it for the Appearance chooser.
- On phones the sheet hugs the top of the screen instead of rising from the
  bottom, so the keyboard cannot cover the text box or the Send button.
- Original only: the phone page gets 142 pixels of bottom padding (was 96) so
  the last card can scroll clear of the button. Scoped with
  `html:not([data-nc-scheme]) div.wrap` so Navy & Cream, which already leaves
  room, is unchanged. Prism and Aurora already cleared it.
- Cancel keeps the draft (friendlier than losing it); only a successful send
  clears it.
- No send timeout. Firestore queues writes while offline, and a timeout plus
  Retry could create duplicates, so the offline case is caught up front with
  `navigator.onLine` instead.
- The list is not live; it loads on open and on Refresh, as the brief asked.
- The entry's status chip reuses the existing `pending` and `approved` chip
  colors for New and Done, so no new chip styles were needed.
- The button also shows on the Presider (song) screen. F8 owns that screen's
  navigation; if it adds a bottom control there, check the two do not collide.
- Merge notes: F8 may touch the `subs` lines in `renderManage()` and
  `prototype/workspaces.js`; this lane's edits there are one added line each.

## Verification

- `node --check` on `app.js`, `design-gallery/build.mjs` and
  `prototype/workspaces.js`: passed.
- `node design-gallery/build.mjs`: passed, four appearances. Not deployed.
- Mocked browser run (scratch driver reusing the setup half of
  `design-gallery/test.mjs`, mock Firebase modules, every other network request
  blocked, zero blocked external requests). The fixture administrator was
  renamed to the fictional "A. Sample" inside the driver, and three fictional
  feedback entries were added. The mock was extended so a create on `feedback`
  succeeds or fails on demand, `getDocs` is recorded, and `orderBy` and `limit`
  exist. Eleven runs, zero page errors in all of them. Results, all four
  appearances at 375 by 812 unless noted:
  - Button absent on site lock and on sign-in; visible after sign-in; 46 by 46;
    accessible name "Send feedback"; 10 pixels above the bar; it is the top
    element at its own center; hidden when `html[data-keyboard="open"]` is set.
  - Scrolled to the end of Schedule: the last line of content ends above the
    button in all four.
  - Sheet: `dialog`, `aria-modal="true"`, labelled "Send feedback", focus in
    the text box, Feedback preselected, `maxlength` 2000, required.
  - Typed 107 characters, then pushed two live snapshots (`app/settings`,
    `app/members`) to force re-renders: text kept, sheet still open.
  - Failure path: message shown, 107 characters kept, button reads Retry,
    sheet stays open. Escape closes and focus returns to the button. Reopening
    shows the same text and the chosen kind. Backdrop tap closes. Cancel closes.
  - Success path with three rapid sends (two clicks plus a form submit): exactly
    one write, shape as above, banner "Thank you. Your feedback was sent.",
    sheet closed, focus on the button, text box empty on the next open.
  - Administrator list: three New entries newest first (the one just sent is on
    top), "Show done (1)". Mark done wrote `{status: 'done'}` only; Delete
    (confirm accepted) issued one delete and the entry left the list. With the
    read denied: "The feedback list is not available yet."
  - Department leader (fixture "E. Simon", not an administrator): sub-tabs are
    Departments, Services, Planning, Requests; no Feedback entry; zero `getDocs`
    calls on `feedback`; the feedback button itself is visible.
  - 320 by 640, Original and Aurora, sheet open: `scrollWidth` equals 320, the
    sheet has no inner horizontal overflow.
  - 1280 by 800, Original and Navy & Cream: button in the bottom right corner.
  - Prism and Aurora in emulated dark (`prefers-color-scheme: dark`): button
    and sheet follow the dark tokens.

Screenshots (mock data only), in
`/Users/anthony/Projects/worship-duty-app-worktrees/f10-feedback/docs/runs/keep-look-features/F10-screens/`:
for each of `original`, `prism`, `navy-cream`, `aurora`:
`schedule-*.png`, `schedule-end-*.png`, `sheet-*.png`, `sheet-failed-*.png`,
`sent-*.png`, `admin-menu-*.png`, `admin-list-*.png`; plus
`sheet-original-320px.png`, `sheet-aurora-320px.png`,
`schedule-prism-dark.png`, `sheet-prism-dark.png`, `schedule-aurora-dark.png`,
`sheet-aurora-dark.png`, `schedule-original-1280px.png`,
`schedule-navy-cream-1280px.png`, `admin-list-unavailable-original.png`.

## Not verified

- The real server rule. The write shape was checked against the contract text
  in the brief, not against deployed rules or the emulator. In particular the
  real `orderBy` plus `limit` list query by an administrator was only run
  against the mock.
- A real phone: safe-area spacing, the real keyboard hiding the button, and how
  the top-hugging sheet sits above the iOS and Android keyboards.
- Maintenance screen and forced PIN change were covered by the same
  `feedbackReady()` condition as site lock and sign-in, but only lock and
  sign-in were observed in the browser.
- Local demo mode (no Firebase) was read through, not clicked through.
- Tablet widths between 601 and 800 pixels were not screenshotted.
- The full `design-gallery/test.mjs` suite was not run (plan says build and
  syntax checks only). Its Firestore mock has no `orderBy` or `limit`; nothing
  in that suite opens the Feedback list, so it is unaffected.
- The driver's sign-in step is flaky (it retried four or five times per full
  run, always before any feedback code is involved); earlier lanes' drivers
  carry the same retry loop.
- Seen in passing, not from this lane: Navy & Cream's "Next service" card at
  the end of Schedule draws a very large chevron in the mocked fixture
  (`schedule-end-navy-cream.png`).
- Nothing was checked against production data or a signed-in production
  account.

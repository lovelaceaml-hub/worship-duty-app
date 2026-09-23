# F9: small follow-up cleanup (2026-09-19)

Lane F9, single writer (Claude, Fable 5.1, assigned by Anthony's coordinator),
worktree `/Users/anthony/Projects/worship-duty-app-worktrees/f9-cleanup`,
branch `claude/f9-cleanup`, started from `fce8e4e` (the source of the live app).
Scope: the "Known follow-ups" list in `RELEASE-2026-09-19-F4-F5-F6.md`. Lanes
F7 (account menu) and F8 (dots and secondary menus) ran at the same time; F9
stayed out of their files and passages. Nothing was deployed.

## Goal-line check

Plan goal line: "Preserve Original, Prism, Navy & Cream, and Aurora as four
distinct layouts."

Checked against it: the only style change is one dark-only Prism rule that uses
Prism's own dark blue token, so Prism light, Original, Navy & Cream and Aurora
render exactly as before (Prism light before and after screenshots are
byte-identical). The `app.js` change only alters wording inside an existing
paragraph and list. No layout, markup structure, navigation or appearance
source changed. The goal line holds.

## 1. Prism dark attention banner contrast

- Cause: the banner's link (`.linkish`) took Prism's dark accent `#829bff`
  (rgb 130,155,255) on the dark warning fill `--ps-warning-bg` `#453c2e`
  (rgb 69,60,46). Measured in the browser: 4.17 to 1.
- Winning banner rule: `prototype-prism/all-pages.css`,
  `.prism :is(.banner.alert,#song-root .banner.alert)`. It sits on its own
  line, not a long shared line, so the fix went directly beneath it instead of
  into `design-gallery/header.css`.
- Change (2 added lines, a comment and one rule):
  `.prism.dark .banner.alert .linkish {color:var(--ps-blue);}`.
  `--ps-blue` in `.prism.dark` is `#a7bcff`, already part of Prism's dark
  palette. The fill is unchanged.
- Measured after (computed styles, WCAG relative luminance):

| Shot | Fill | Link text | Ratio |
| --- | --- | --- | --- |
| Prism dark, before | rgb(69,60,46) | rgb(130,155,255) | 4.17 to 1 |
| Prism dark, after | rgb(69,60,46) | rgb(167,188,255) | 5.82 to 1 |
| Prism light, before | rgb(255,245,229) | rgb(49,83,237) | 5.42 to 1 |
| Prism light, after | rgb(255,245,229) | rgb(49,83,237) | 5.42 to 1 |

- `cmp` reports the Prism light before and after full-page screenshots as
  identical files.

## 2. "Last changed by" never shows an account ID

All in `app.js`, display only. Nothing stored or sent changed.

- New helper `attributionName(value, isId)` just above
  `departmentAttribution`. It resolves an ID to a member name using data the
  client already holds, in this order: loaded department profiles
  (`departmentRuntime.rosters` and the member's own profiles), the signed-in
  account (`currentMemberUid()` and the verified session name), and a
  `member:<name>` ID whose name is in the loaded member list. A value that is
  an ID (forced for `updatedByUid`, or shaped like `member:...` or a 20 plus
  character token) and cannot be resolved returns empty. A plain name passes
  through unchanged.
- `departmentAttribution(profile)`: tries `updatedBy`, then
  `attribution.updatedBy`, then `updatedByUid`, all through the helper. The
  server can also fall back to an ID inside `updatedBy`
  (`functions/department-handlers.js` line 204), so that path is covered too.
  Unresolved wording: "Last changed by a department leader or administrator on
  Jun 22, 2026, 4:00 AM." (date kept). The old "account unavailable" text is
  gone.
- Field-level list under "Who changed the profile": it printed `decision.by`,
  which the server always writes as the actor's account ID. It now goes through
  the same helper. Resolved: "availability: member by M. Chloe". Unresolved:
  "status: leader, name not available". "system by system" rows are unchanged.
- The "Your availability" card reuses `departmentAttribution`, so it is covered
  by the same change.

Rendered check (mocked Firebase, fixture data only, signed in as fixture leader
"E. Simon", Media department):

- Fixture profile with only `updatedByUid` set to an unknown ID, plus a field
  row with the same unknown ID:
  "Last changed by a department leader or administrator on Jun 22, 2026, 4:00 AM."
  and "status: leader, name not available". No ID text anywhere in the view.
- Fixture profile with only `updatedByUid: 'member:E. Simon'`:
  "Last changed by E. Simon on Jun 22, 2026, 3:00 AM."
- Zero page errors.

## 3. Stale docs

Each statement was checked against this worktree first: bottom bar
(`design-gallery/navy.css`, the appearance stylesheets, `design-gallery/README.md`),
shared header (`index.html` `wd-head-*`, `paintHeader()`, `design-gallery/header.css`),
system dark mode (`design-gallery/host-bridge.js`, `prefers-color-scheme`),
reduce-motion (`index.html`, `design-gallery/navy-adapter.js`), sync dot
(`header.css`, `header.app.wd-head .sync-pill` at 640px and below), name search
(`searchDepartmentCandidates` in `app.js`), release markers and branch (the
release record and Build log).

- `README.md`: the "Active refactor" quick link no longer says production is
  unchanged; the Status block drops the "tabs stay at the top on phones" and
  "top Appearance button" sentence and adds a 19 September 2026 entry with the
  truth listed in the task.
- `docs/HANDOFF.md`: a "Current state, 2026-09-19" paragraph now leads the
  "Active compact-phone refactor" section, and the old paragraph is labeled as
  the 2026-09-15 state; the paragraph about release `gallery1789363204402`
  (around line 90) is rewritten to describe today's navigation and header, and
  names that release as the one it replaced.
- `docs/PLAN-COMPACT-PHONE-REFACTOR.md`: only the `Status:` line changed
  ("Package 0 active; prototype approval pending" was plainly false). Build log
  untouched.
- `docs/PLAYBOOK.md`: no stale claim found. Its dark mode text is an old work
  brief, not a description of the app. Left alone.
- `design-gallery/README.md`: already correct (updated in F4 and F6). Left alone.

## Verification

- `node --check app.js`: passed.
- `node design-gallery/build.mjs`: passed, four appearances.
- Screenshots, 375x812, mocked Firebase, fixture data only, in
  `docs/runs/keep-look-features/F9-screens/`: `before-prism-dark.png`,
  `after-prism-dark.png`, `before-prism-light.png`, `after-prism-light.png`,
  a `-banner-closeup.png` for each, `attribution-unresolved-id.png`,
  `attribution-resolved-id.png`.
- The harness was a throwaway script in the session scratch folder that reuses
  the setup half of `design-gallery/test.mjs`. No test suite was added or
  changed.

## Unverified or left for later

- Not checked on a real phone, with real system dark switching, or on any
  signed-in production screen.
- Other Prism dark text on the warning fill was not audited; only the attention
  banner link named in the follow-up list was measured.
- The full `design-gallery/test.mjs` suite was not run (plan: no test gates).
  Its check "Leader member profile exposes UID keyed identity" expects UID text
  that F3 already removed, so that suite was stale before this lane.
- The field-level list still prints raw field keys such as `eligibleDuties`.
  Not an ID, outside this lane.
- `AGENTS.md` still says "Prototype and integrated-preview approval checkpoints
  remain pending." Outside this lane's named files, left for the coordinator.
- Still open from the release record: dead utility-row and header rules in the
  appearance stylesheets (F8 is editing those files now, so F9 did not touch
  them).

# F2: Reset PIN button

Branch: `claude/keep-look-features`, from commit `864a1f7` (the live app's
source plus F1). Worktree:
`/Users/anthony/Projects/worship-duty-app-worktrees/keep-look-features`.

## What changed

`app.js` already had the `reset-member-pin` handler (confirms, calls the
`resetMemberPin` callable, shows a banner) and the `canRunAction` permission
gate (`canResetPin`, about line 3300), but nothing rendered a button for it.

Investigation before editing: the task described an existing rendered
`del-member` control in the member roster to place the button beside. That
control turned out to be dead code, `del-member` and `add-member` only exist
as `canRunAction`/`handleAct` branches; no current render function emits
them. The live Manage → People screen is `renderDepartmentWorkspace()` →
`renderManageDepartment()` → `renderDepartmentRosterGroup()` →
`renderDepartmentProfileRow()` (`app.js`), whose roster rows already carry an
"Archive"/"Restore" button (`class="ghost mini"`, `data-act="department-status"`)
gated by `canEdit`. That is the actual current roster-row control, so the new
Reset PIN button was added beside it, reusing the same button class:

- `renderDepartmentProfileRow(profile, options)`: added a `canReset` check
  using the same `canPermission('canResetPin', ...)` call the existing
  handler already required, with `{ name: profile.memberName, departments:
  [department] }` as the target (matching the shape built in
  `canRunAction` for `reset-member-pin`). When true, renders
  `<button class="ghost mini" data-act="reset-member-pin" data-name="..."
  data-dept="...">Reset PIN</button>`, same markup and class as the existing
  Archive/Restore button beside it.
- `renderDepartmentRosterGroup` and its two call sites in
  `renderManageDepartment` now thread the `department` string through so
  `renderDepartmentProfileRow` can build the permission target and the
  button's `data-dept`.

No new CSS, no new classes, no markup restructuring, no navigation change.
The confirmation text and banner in the existing `reset-member-pin` handler
(`app.js`, about line 3716) were not touched.

### Goal-line check

Plan goal line: "Preserve Original, Prism, Navy & Cream, and Aurora as four
distinct layouts." `git diff --stat` for this change touches only `app.js`
(7 insertions, 4 deletions) plus this record and the plan's Build log. No
stylesheet, no appearance source (`design-gallery/`), no navigation. Since
all four appearances render through the shared `renderDepartmentProfileRow`
via the design-gallery compiler, one change covers all four. Goal line
intact.

## Verification

- `node --check app.js`: passed.
- `node design-gallery/build.mjs`: passed (`verifyLayouts()` clean, built
  `.hosting-gallery` for Original + Prism + Navy & Cream + Aurora).
- `git diff --stat`: `app.js` only (plus docs).
- Browser walkthrough: attempted via a local static preview server
  (`worship-keep-look-features`, port 8124, added to
  `/Users/anthony/Projects/.claude/launch.json`) serving this worktree's
  built `.hosting-gallery`. The `?wdPreview=1` Firebase-disabled preview
  flag named in the task does not exist anywhere in this codebase (checked
  `app.js`, `firebase-config.js`, `index.html`, and `docs/`), so it had no
  effect; the page loaded the real site-passcode lock screen with live
  Firestore sync on ("Live sync on" pill), because no local demo/bypass
  flag is wired up. Reaching the signed-in admin Manage screen would
  require the real production site passcode and an administrator or leader
  account PIN, which this session does not hold and will not guess.
  Confirmed instead: no console errors on the lock screen itself, and the
  served `app.js` (both the local build and, after release, the live one)
  contains `reset-member-pin` in the expected function.
- Not independently re-run in this session: `node design-gallery/test.mjs`
  (the Playwright-based mocked-Firebase suite). It is historical guidance
  per `AGENTS.md`, not a required gate for the active compact-phone plan,
  and was not run to keep the change bounded; `node --check` and
  `design-gallery/build.mjs` are the plan's stated gates and both passed.

## Live release, 2026-09-17 (Pacific)

Anthony approved shipping F2 to the live PWA with the maintenance message
shown during the change, following PLAYBOOK section 8a exactly as F1 did.

### Sequence and markers

| Step | Live marker | Maintenance |
| --- | --- | --- |
| Before | `gallery1789697177680` (built 2026-09-18T02:06:17.705Z) | OFF |
| Release 1: F2 + maintenance line | `gallery1789701029336` (built 2026-09-18T03:10:29.362Z) | ON |
| Release 2: maintenance line removed | `gallery1789701070255` (built 2026-09-18T03:11:10.280Z) | OFF (restored) |

Both releases ran `node design-gallery/release.mjs --publish` from this
worktree with `npm_config_cache=/tmp/npm-cache`. Hosting only: the
publisher's guarded Hosting deploy, staged through `.hosting-gallery`. No
functions, no Firestore rules, no bare `firebase deploy`, no schedule or
account records touched.

### Verification

- Live site HTTP 200 on every check (before, with maintenance, after).
- Release 1: `curl` of the served `index.html` contained
  `dataset.maintenance = 'active';` (1 occurrence).
- Release 2: `curl` of the served `index.html` contained 0 occurrences of
  that line; working tree confirmed clean for `index.html`
  (`git checkout -- index.html` before the second publish), so the
  maintenance line exists in no commit on this branch.
- Appearance assets, all HTTP 200 after release 2: `design-choice.css`,
  `prism-live.css`, `navy-live.css`, `aurora-live.css`. The publisher's own
  post-deploy check printed "Verified live: ... Original + Prism + Navy &
  Cream + Aurora" on both releases.
- Served `app.js` after release 2 contains `reset-member-pin` (4
  occurrences: the `canRunAction` gate, the `handleAct` handler, and the two
  new render sites), confirming the button code shipped live.
- This session did not sign in to the live site (no production passcode
  held here), so the Reset PIN button's on-screen appearance in the real
  Manage → People roster was not visually confirmed in a browser. Anthony
  should open https://lv-zion-duties.web.app, sign in as an administrator
  or an authorized department leader, open Manage → Departments → a
  department, and confirm the "Reset PIN" button appears beside "Archive"
  in each active/inactive member row, in at least two appearances
  (Appearance switch is in Manage → Features or the app's appearance
  control).

### Rollback

1. Hosting rollback (preferred, one click, no build): open
   https://console.firebase.google.com/project/lv-zion-duties/hosting/sites/lv-zion-duties
   and use the row menu → Rollback on the release dated before this one,
   marker `gallery1789697177680`.
2. Source rollback, if a rebuild is wanted instead:
   ```
   cd /Users/anthony/Projects/worship-duty-app-worktrees/keep-look-features
   git log --oneline -- app.js | head -5
   git checkout <commit-before-F2> -- app.js
   npm_config_cache=/tmp/npm-cache node design-gallery/release.mjs --publish
   ```
3. Maintenance message toggle, same procedure as F1
   (`docs/runs/keep-look-features/F1-schedule-default.md`, section "Rollback",
   item 3).

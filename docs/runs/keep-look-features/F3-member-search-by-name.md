# F3: Add a department member by name search

Branch: `claude/keep-look-features`, from commit `b946b2e` (live source plus F1
and F2). Worktree:
`/Users/anthony/Projects/worship-duty-app-worktrees/keep-look-features`.
Writer: Fable 5.1 (Anthony assigned each lane to Fable for this session,
2026-09-18). Status: on the preview channel, awaiting Anthony's approval. Not
live.

## Goal-line check

Plan goal line: "Preserve Original, Prism, Navy & Cream, and Aurora as four
distinct layouts." `git diff --stat` touches only `app.js`, the two user
guides, this record, and the plan's Build log. No stylesheet, no appearance
source, no navigation, no new CSS class. The plan's Membership decision,
"Replace UID entry with registered-member search by name", and Anthony's
2026-09-18 instruction, "no UID is needed. that shouldnt exist", are what this
feature delivers.

## What changed (`app.js`)

- The "Add by verified member UID" form in `renderManageDepartment` (two text
  inputs: Member UID, Display name) is replaced by
  `renderDepartmentMemberSearch(department)`: same card, same
  `department-add-form`, `department-eyebrow`, `hint`, `department-form-grid`,
  and `primary` button classes, now with one "Member name" input and a Search
  button.
- Results reuse the roster's `department-member-row` and `ghost mini` markup:
  each match shows the name and an Add button; people already in the department
  show "Already in <department>" instead. More than ten matches get Previous
  and Next buttons (server page size is ten).
- `searchDepartmentMembers` calls the live `searchDepartmentCandidates`
  callable (`{ departmentId, query, page }`), validates the response, and
  ignores a stale response if a newer search started.
- `department-member-add` now takes the member from the search result the
  leader tapped, never from typed text, then calls the existing
  `createDepartmentProfile` exactly as before. Double taps are ignored while
  one add is in flight.
- The typed name survives a live-sync re-render (`ui.departmentSearchDraft`).
- `canRunAction` gates the two new actions with the same
  `canManageSelectedDepartment` check as the old form.
- On-screen UID text removed: the "UID: ..." line on the member profile page,
  and two notes reworded ("loaded by department", "record who made them and
  when"). Known remainder: `departmentAttribution` can still fall back to
  showing `updatedByUid` when the server returns no name; left for a later
  feature.

No functions, rules, or Firestore changes. Both callables were confirmed
deployed with `firebase-tools functions:list --project lv-zion-duties`.

## Verification

- `node --check app.js`: passed.
- `node design-gallery/release.mjs --preview`: built Original + Prism + Navy &
  Cream + Aurora and published the preview channel
  https://lv-zion-duties--design-gallery-review-rtm2fa8h.web.app (expires
  2026-09-25).
- Preview serves HTTP 200, its `app.js` contains `searchDepartmentCandidates`
  and "Find a member by name", and contains no "Member UID" text. All four
  appearance stylesheets return 200. Live `app.js` still has no
  `searchDepartmentCandidates`, so live is unchanged.
- Not verified: the signed-in screen itself. This session holds no site
  passcode or PIN. The preview reads and writes REAL records, so tapping Add
  there really adds the member to the department.

## Live release, 2026-09-19

Anthony approved F3 and ran both PLAYBOOK section 8a commands himself from
this worktree, because the Claude Code auto mode classifier denied the
production release to Claude. Hosting only, through
`node design-gallery/release.mjs --publish`.

| Step | Live marker | Maintenance |
| --- | --- | --- |
| Release 1: F3 + maintenance line | `gallery1789826273949` (built 2026-09-19T13:57:54.112Z) | ON |
| Release 2: maintenance line removed | `gallery1789826356791` (built 2026-09-19T13:59:18.209Z) | OFF (restored) |

Verified by Claude after each release: HTTP 200; maintenance line present
after release 1 and absent after release 2; live `app.js` contains
`searchDepartmentCandidates` and "Find a member by name" and no "Member UID";
`design-choice.css`, `prism-live.css`, `navy-live.css`, `aurora-live.css` all
200; working tree clean, so the maintenance line is in no commit. Not
verified: the signed-in roster screen on live (no passcode held here).

Rollback: Hosting console
https://console.firebase.google.com/project/lv-zion-duties/hosting/sites/lv-zion-duties
row menu, Rollback, to the release before `gallery1789826273949` (F2 marker
`gallery1789701070255`). Source rollback and maintenance toggle: same steps
as `F2-reset-pin-button.md`, section "Rollback".

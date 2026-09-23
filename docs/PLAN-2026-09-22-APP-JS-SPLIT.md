# Worship Duty app.js split (September 2026)

Plan id: `2026-09-22-app-js-split`. Status: **Sections 0 through 4 complete, Section 4 pending review before merge to `main`; Section 5 next.** Written 2026-09-22. Mode: **Steps** (Anthony, 2026-09-22): one plan unit per fresh chat, starting with Section 0. The original blocking condition was removed when Anthony retired the compact phone refactor on 2026-09-22.

**Goal line (efficiency sweep 2026-09-22, Anthony's refactor list):** split `app.js` into modules with zero behavior change. Every work order in this plan quotes that line before anything else.

Origin: [efficiency sweep summary](/Users/anthony/Projects/docs/runs/2026-09-22-efficiency-sweep/SUMMARY.md), refactor row: "Worship duty app.js (4,314 lines, 'all logic') | Every change today touches one huge file | Own plan, after the compact-phone plan hands off; tests first; look must stay identical".

Working model: the [Lane Planner split](/Users/anthony/Projects/ai-usage-dashboard/docs/PLAN-2026-09-LANE-PLANNER-SPLIT.md), which finished five sections and its integration on 2026-09-22. Its structure (pure code motion, a manifest checker, recorded journeys, screenshot parity, merge per section) is reused here and adapted to this repository's two hard differences: a source-rewriting Hosting build, and real church data.

Live app and visual authority: https://lv-zion-duties.web.app

---

## Section 0: Baseline and boundary

**The compact phone refactor is retired.** Anthony, 2026-09-22: "compact phone refactor is outdated. no longer needed." This plan's original blocking condition is gone and it can start. The evidence that produced that block is kept under "Retired: the compact phone refactor" below, because it is the only record of why `shared/`, `layouts/` and `styles/` exist on unmerged branches and where that work is preserved.

### Code baseline

The **code baseline is `app.js` blob `ab50d2dadc91b70bf5f7f1992e34c0d41498bb0e`, 4,314 lines**, unchanged since `1e0b6fd` where the Interfaces were measured. Every commit since has been documentation only, so each section branches from `main` at whatever its tip is and checks that blob rather than a commit SHA. Section 0 confirmed it and froze the Interfaces below; they are binding, not provisional.

Every section's first act is that check: if `app.js` is not 4,314 lines with that blob, stop and report.

### The trunk, now cleaned up

Anthony fast-forwarded `main` on 2026-09-22. `origin/main`, local `main` and the working branch are identical, 0 ahead and 0 behind each other. The trunk carries the live code and is safe to branch from.

The state that made the cleanup necessary, measured 2026-09-22 before it:

| Ref | `app.js` | `firestore.rules` | Relationship |
|---|---|---|---|
| `origin/main` (`8b0c06c`, Sep 14) | 4,217 lines | 1,804 lines | the real trunk; a direct ancestor of this branch |
| `codex/compact-phone-refactor` (baseline) | 4,314 lines | 1,804 lines | 18 commits ahead of `origin/main`, a clean fast-forward, 0 behind |
| local `main` (`6ed1ebb`, Sep 13) | 2,476 lines | 30 lines | **stale and diverged**: 4 unpushed commits, 85 behind `origin/main`. Archived as the tag `archive/local-main-2026-09-13` and then reset |

The 18 commits ahead of `origin/main` are two groups:

- **Shipped production fixes, already live**: presider song tracking restored, presider services advanced by time, leader config repair, the read-only maintenance page, the unified Schedule current-or-next default, and its release receipts (`3b4280d` through `86a476f`). `docs/HANDOFF.md` records the matching Hosting stamps. These belong on the trunk.
- **Compact phone artifacts**: the retired plan's record, design prototypes, the unwired standalone membership module and run records (`c44d021` through `1e0b6fd`), plus this plan (`12481e9`).

**Answered and done, 2026-09-22: trunk first.** Section 0 archived the four local-only `main` commits as the pushed tag `archive/local-main-2026-09-13`, then reset local `main` to `origin/main`. Anthony then ran the remote fast-forward himself (`8b0c06c..e3deb1b`, no merge commit, no force). `origin/main`, local `main` and the working branch have stayed identical since. Sections branch from `main`.

### Retired: the compact phone refactor

Kept as the record of what was decided and what is preserved. [PLAN-COMPACT-PHONE-REFACTOR.md](PLAN-COMPACT-PHONE-REFACTOR.md) is superseded by this ruling and is historical.

What it had produced before retirement, all **unmerged** and left on their branches, nothing deleted:

| Branch | Contents |
|---|---|
| `claude/compact-runtime` (`a1246a6`, `db8f610`) | Section 2: `app.js` changed by 814 lines to 4,920, 340 lines cut from `index.html`, `design-gallery/build.mjs` rewritten by 303 lines into a directory copier, `design-gallery/choice.js` deleted, and `shared/` (7 modules), `layouts/` (6), `styles/` (6) created |
| `claude/compact-server` | Section 3: `functions/revision.js`, `functions/song-history.js`, `functions/compact-workflows.js` and the version-aware save and atomic resolution work, reviewed, never deployed |

Consequences for this plan, all simplifying:

1. `app.js` has one owner again. There is no competing writer and no rebase risk.
2. The parity baseline is now recordable, because the app's look is no longer scheduled to change. The live appearance at https://lv-zion-duties.web.app is the authority, and it stays the authority for the whole plan.
3. `design-gallery/build.mjs` has one writer, this plan.
4. The `shared/`, `layouts/` and `styles/` directory convention that Section 2 introduced is **not** in the baseline tree. This plan therefore creates its own `core/`, `views/` and `actions/` directories and does not inherit that layout. If Anthony later wants the compact phone work revived, it rebases onto the split rather than the other way round, which is the easier direction.

**Section 0 has no worktree, no writer and no production code.** It is the controller confirming the baseline, settling the trunk question with Anthony, and freezing the Interfaces below.

Setup: frontier · high · Lane: Claude (controller) · Review: none
  Claude: Opus 5 · high
Worktree: none
Depends on: nothing
Agents: none
Reviewers: none

Deliverables: the working tree confirmed clean at the code baseline and the baseline SHA recorded in the Build log; the trunk question answered by Anthony and recorded; the Interfaces below re-verified against the baseline with the checker's own inventory pass and marked frozen; `AGENTS.md` updated so this is the named active plan.

---

## Fixed decisions

These hold at any baseline and do not change when Section 0 re-derives the numbers.

1. **Pure code motion.** Every function and constant keeps its name, parameters and body. The only allowed body edits are (a) import and export lines, and (b) setter substitutions for a cross-module `let` assignment, each one named in the allowlist with the setter it adds. No renames, no "while we are here" fixes, no formatting sweeps, no dead-code removal.
2. **The live app is the visual authority.** The four appearances (Original, Prism, Navy & Cream, Aurora) must come out pixel-identical. `index.html`, `song-app.css` and the appearance stylesheets do not change except where a section's manifest says so. No redesign.
3. **No production deploy inside this refactor.** This plan ends at a merged, verified `main`. Release is a separate decision by Anthony afterwards, through `design-gallery/release.mjs` as the contract requires.
4. **`app.js` stays the entry script.** `index.html` keeps `<script type="module" src="app.js?v=DEV">` unchanged, and `app.js` keeps every name the gallery build injects against in its own top-level scope (see Gallery scope contract).
5. **Tests first.** Every existing assertion that reads `app.js` as source text is moved onto the whole module set before any code moves, with the pattern unchanged, so moving code between files cannot silently weaken a check.
6. **No new church data anywhere.** `app.js` already contains a seed roster (`DEPARTMENTS_SEED`) that is in Git today; this plan moves it and adds no new copy. No new fixture, screenshot, baseline, log or review packet may contain a real member name or a real assignment. The parity harness runs against `design-gallery/test.mjs`'s existing mocked Firebase and fictional fixtures, never against production. No section reads production Firestore.
7. **No new features, no new tests beyond the safety net.** The safety net in Section 1 is the only new test code. The compact phone plan's "no new test cases" directive applied to that plan; this plan's safety net is the explicit exception and is scoped to parity, not to new behavior coverage.
8. **Text rule.** No file this plan writes or edits contains an em dash or an en dash. `design-gallery/test.mjs` already enforces this on owned paths and will enforce it on the new modules.

---

## Interfaces (frozen by Section 0, measured at the code baseline `codex/compact-phone-refactor@f876565`)

Everything in this section was measured on 2026-09-22 against the 4,314 line `app.js` at the code baseline. `12481e9` is a docs-only commit on top of `1e0b6fd`, so every line number below is exact for the tree the split starts from. With the compact phone refactor retired, nothing is scheduled to change this file before Section 1 runs, so this section is binding. Section 0 re-verifies it and freezes it.

### What `app.js` is at the baseline

- 4,314 lines, 250 top-level declarations, 14 section banners.
- **19** module-level `let` bindings (mutable shared state): `sharedNameMap`, `state`, `fb`, `authReady`, `authUser`, `verifiedSession`, `authStatus`, `requestUnsub`, `settingsLoaded`, `departmentsLoaded`, `membersLoaded`, `renderQueued`, `sheetSyncTried`, `autoSyncWaits`, `sheetSyncScheduled`, `songApp`, `songAppLoading`, `songAssetsLoading`, `setlistIndex`. The `pulseInFlight` `const` Set is mutable state too but needs no setter, since it is mutated rather than reassigned, so the checker counts 19 reassignable bindings and 1 mutated const.
- Zero `export` statements and zero `window.` assignments. It is a `type="module"` script whose entire surface is its own top-level scope.
- Its only dynamic imports are two Firebase CDN modules inside `initFirebase`.

### Provisional module map

All paths relative to the repository root. The retired compact phone plan's `shared/` and `layouts/` directories are not in the baseline tree, so this plan creates `core/`, `views/` and `actions/` of its own.

| Module | Holds (line range at the baseline) |
|---|---|
| `core/constants.js` | categories, service labels, seed roster, storage keys, asset stamp, default site hash, sheet URL, name-unify map, `sharedNameMap` and its setter, `memberLabel`, `feat`, `sha256`, `siteHash`, `siteUnlocked`, `sheetUrl` (3 to 118) |
| `core/format.js` | `esc`, `pad`, `toISO`, `todayISO`, `isoDaysAgo`, `fmtDate`, `fmtTime`, `dateBadge`, `svcId`, `slugify`, `requestId`, `svcDateTime`, `dutyCategory`, `sortDuties`, `sameDuties` (119 to 163) |
| `core/conflicts.js` | `isPrayerDuty`, `isUsherDuty`, `hasNonExemptPair`, `conflictsFor`, `activeConflicts`, `conflictBadge` (164 to 228) |
| `core/planning.js` | `weeksAgoISO`, `workloadStats`, `suggestSubs` (229 to 280) |
| `core/sheet-parse.js` | `parseCSV`, `validDutySet`, `parseSheetDate`, `inferYearISO`, `parseSheetTime`, `sheetRowsToServices` (281 to 422) |
| `core/state.js` | `state`, the Firebase handle and load flags, `seedState`, `loadLocal`, `saveLocal`, `canonicalMemberName`, `canonicalizeStateNames`, the `persist*` family, `resolveRequest`, `persistAll` (423 to 436, 493 to 543, 971 to 1109) |
| `core/auth.js` | `isVerifiedSession`, `isForcedSession`, `authActor`, `permissionApi`, `permissionConfig`, `canPermission`, `authorizedDepartments`, `canManageAnyDepartment`, `selectedManageDepartment`, `canManageSelectedDepartment` (437 to 492) |
| `core/departments.js` | the department runtime: normalization, profiles, availability, roster loading, profile saves, assignment writes (544 to 970) |
| `core/schedule.js` | `sortedServices`, `upcomingServices`, `pastServices`, `preferredScheduleService`, `dutiesFor` (1110 to 1152) |
| `core/notify.js` | notification permission, push registration, new-duty and reminder checks, banners, `renderSoon`, `afterDataChange` (1153 to 1311) |
| `core/sheet-sync.js` | `mergeSheetServices`, `syncFromSheet`, `autoSyncOnce`, `scheduleSyncSoon` (1312 to 1466) |
| `core/calendar.js` | ICS escape, stamp, download, feed URL, subscribe, copy (1467 to 1547) |
| `core/session.js` | `safeAuthMessage`, `sessionFromClaims`, `setVerifiedSession`, `startRequestListener`, `syncAuthUser`, `authCall`, `memberLogin`, `memberChangePin`, `memberLogout` (1548 to 1785) |
| `views/shell.js` | `renderMemberLogin`, `renderForcedPinChange`, `renderMaintenanceSchedule`, `render`, `renderLoading`, `viewHasFocusedInput`, `renderBanners`, and the lock and PIN screens (1786 to 1947, 2430 to 2463) |
| `views/schedule.js` | `pillFor`, `renderCatRows`, `categoryHasAssignments`, `renderServiceCard`, `renderServiceList`, `renderDeptChips`, `renderSchedule`, `renderMy` (1948 to 2147) |
| `views/songs.js` | `loadTag`, `loadSongAssets`, `loadSongApp`, `songCtx`, `renderSongs`, `songStateFor`, `songStateTag`, `setlistIndex` (2148 to 2239, 3161 to 3186) |
| `views/requests.js` | request helpers, `renderYourRequests`, `pendingRequestsCount`, the actionable-count family (2240 to 2387) |
| `views/manage.js` | `renderManage`, manage visibility helpers, features, leader config, planning, member select, conflicts, requests, services, people, data, sheet card (2388 to 2429, 2464 to 2797, 3039 to 3105) |
| `views/departments.js` | department attribution, badges, profile rows, roster groups, department workspace, own availability, department member (2798 to 3038) |
| `actions/dispatch.js` | `findService`, `findRequest`, `requestDepartment`, song permission helpers, `canRunAction`, `saveRoleConfiguration`, `handleAct`, `handleChg`, `applyNameMap` (3106 to 3160, 3187 to 4056) |
| `app.js` keeps | the import block, the gallery scope contract re-exposure, `setSyncPill`, `pulseInFlight`, `pulse`, `initFirebase`, `init`, and `init()` as its last statement (4057 to 4314) |

Result: `app.js` goes from 4,314 lines to 258, in 21 focused modules.

**The map is a verified partition, not a sketch.** Checked at the baseline on 2026-09-22 by assigning every line to its module: **0 overlapping lines, 0 declarations unassigned, and exactly 2 uncovered lines (1 and 2, `'use strict';` and the blank line after it), which stay in `app.js`.** All 250 declarations land in exactly one module. Declarations per module: `core/departments.js` 29, `core/state.js` 28, `core/constants.js` 18, `views/manage.js` 17, `views/departments.js` 16, `core/notify.js` 14, `core/format.js` 13, `views/requests.js` 12, `views/songs.js` and `actions/dispatch.js` 11 each, `core/auth.js` and `views/shell.js` 10 each, `core/conflicts.js` and `core/session.js` 9 each, `core/sheet-sync.js` and `views/schedule.js` 8 each, `core/sheet-parse.js` and `core/calendar.js` 7 each, `core/schedule.js` and `app.js` 5 each, `core/planning.js` 3. Section 1 seeds `scripts/check-app-split.manifest.json` directly from this partition.

`actions/dispatch.js` stays one module: `handleAct` alone is 514 lines of a single string-keyed switch, and splitting a switch is not code motion. Splitting it is a later, separate plan.

### Gallery scope contract (the hardest constraint, and this plan's distinctive risk)

`design-gallery/build.mjs` does not bundle. It **injects source text into `app.js`'s top-level module scope**:

```
app = once(baseline, '\ninit();', '\n' + host + '\ninit();', 'host initialization');
```

`host` is `design-gallery/host-bridge.js` with nine slots filled from `prototype-prism/*.js`, `prototype/*.js` and `design-gallery/navy-adapter.js`. Those injected sources call `app.js`'s top-level functions directly by lexical scope. Measured on 2026-09-22 at the baseline by identifier matching against the 250 top-level declarations:

| Injected source | Distinct `app.js` names it reaches |
|---|---|
| `design-gallery/host-bridge.js` | 31 |
| `prototype-prism/all-pages.js` | 29 |
| `prototype/aurora.js` | 24 |
| `prototype-prism/prism.js` | 15 |
| `prototype/workspaces.js` | 15 |
| `prototype/presider-workspace.js` | 6 |
| `prototype-prism/song-pages.js` | 5 |
| `design-gallery/navy-adapter.js` | 1 |
| **Union** | **53** |

The 53 at the baseline: `ASSET_V`, `CATEGORIES`, `DATA_KEY`, `FEATURES`, `actionableCountsForViewer`, `actionableDepartmentForDuty`, `canManageAnyDepartment`, `categoryHasAssignments`, `conflictsFor`, `downloadICS`, `dutiesFor`, `esc`, `fb`, `feat`, `fmtDate`, `fmtTime`, `init`, `isForcedSession`, `isVerifiedSession`, `loadLocal`, `loadTag`, `manageDepartment`, `manageRequestVisible`, `manageServiceVisible`, `pad`, `pastServices`, `preferredScheduleService`, `render`, `renderCatRows`, `renderCreatePin`, `renderFeatures`, `renderManage`, `renderManageData`, `renderManagePeople`, `renderManagePlanning`, `renderManageRequests`, `renderManageServices`, `renderMy`, `renderSchedule`, `renderServiceCard`, `renderSiteLock`, `renderUnlock`, `requestIsActionable`, `seedState`, `selectedManageDepartment`, `siteUnlocked`, `songCtx`, `state`, `svcId`, `toISO`, `todayISO`, `ui`, `upcomingServices`.

**Settled rule.** After the split, `app.js` imports every name in that set into its own top-level scope, whether or not `app.js` itself calls it, so the injection point still resolves. A plain `import { esc, render, state } from ...` is enough: an imported binding is in the importing module's top-level scope and is a live binding, so `state` reassigned inside `core/state.js` is seen by the injected bridge exactly as it is today.

Enforced by `scripts/check-app-split.mjs --gallery`: it recomputes the union set from the injected sources at run time and fails if any name is missing from `app.js`'s top-level scope. That check is the thing that stops a split from silently breaking all four appearances at release time.

Two further build facts the plan must honor:

- `build.mjs` runs 13 `requireOne` anchors against `app.js` source text (`'use strict';`, `function renderMemberLogin()`, `function isVerifiedSession()`, `function songCtx()`, `data-act="member-login"`, and so on). Each anchor must be re-pointed at whichever module now holds it, and the two `once()` rewrites that patch `app.js` (`__designSettingsReady` seed, settings snapshot) must be re-pointed the same way. `design-gallery/app-fixes.mjs` has the same shape.
- `design-gallery/test.mjs` asserts the gallery build does not modify original source files, and hashes a `protectedNames` list that includes `app.js`. The new modules go on that list.

### Shared mutable state and setters

A module-level `let` lives in its owner module and is read elsewhere through the ES live binding. Section 0 confirms the list of statements that assign a `let` owned by a different module; each becomes a setter call with one added setter, and each goes into `scripts/check-app-split.allow.json` in the section that makes it. The allowlist is otherwise empty. Known cases at the baseline: `sharedNameMap` (assigned in `initFirebase`, owned by `core/constants.js`) and `setlistIndex` (assigned in the song listener, owned by `views/songs.js`).

### Load order

`app.js` is the entry, so its imports finish loading before its own body runs, and `init()` stays its last statement. Loading the page must run exactly the load-time effects it runs today and no more, recorded as a fixture in Section 1 and checked on every section.

---

## The safety net

Four layers, all recorded on the untouched tree in Section 1 before any code moves.

1. **Portable source-text assertions.** Four test files read `app.js` as text today: `tests/department-runtime-contract.test.mjs`, `tests/integration-auth-wiring.test.mjs`, `tests/schedule-default.test.mjs`, `tests/ui-qa.mjs`. Each is changed to read the concatenation of `app.js` plus every split module, with its pattern unchanged.
2. **A motion checker**, `scripts/check-app-split.mjs <baseline-sha>`: reads `app.js` at the baseline with `git show`, lists its top-level declarations, and checks that each appears exactly once across the module set with a body identical after whitespace normalization. `--manifest` checks each declaration sits in its assigned module, and that declarations assigned to a module a later section creates are still in `app.js`. `--gallery` checks the scope contract above. It has its own behavior tests.
3. **The existing four-appearance browser suite.** `design-gallery/test.mjs` already runs 103 checks in real Chromium across Original, Prism, Navy & Cream and Aurora, with a mocked Firebase SDK, every other network request blocked, and fictional member fixtures. It is the functional parity check and runs unchanged on every section, with its count never dropping.
4. **Pixel parity, added by this plan.** `design-gallery/parity.mjs` extends `test.mjs`'s harness: same mocked Firebase, same fixtures, same blocked network, `Date` frozen before any page script runs, desktop 1280 by 800 and phone 375 by 812 at scale 1. It captures each of the four appearances in five states (sign-in gate, Schedule, My duties, Manage, Presider songs), 40 screenshots in total, and records the same states as DOM facts. `--record <dir>` writes a baseline, `--compare <dir>` exits nonzero when a DOM fact differs or when more than 0.1 percent of a screenshot's pixels differ by more than 8 in any channel. Baselines live under `docs/runs/2026-09-22-app-js-split/baseline/` and contain no real member data by construction.

The maintenance schedule path and the morning-versus-evening Schedule selector boundary (AGENTS.md: a same-day 5:00 AM and 7:30 PM pair checked at 7:20 PM and 9:06 PM Pacific) are two of the recorded DOM facts, so the contract's release condition is covered by the parity run rather than by a separate manual step.

---

## Verification commands (every section, run from its worktree)

```
node --test tests/*.test.mjs
```

```
node design-gallery/test.mjs
```

```
node tests/ui-qa.mjs
```

```
node design-gallery/parity.mjs --compare docs/runs/2026-09-22-app-js-split/baseline/fixed
```

```
node scripts/check-app-split.mjs <baseline-sha> --manifest scripts/check-app-split.manifest.json --gallery
```

```
for f in app.js core/*.js views/*.js actions/*.js; do node --check "$f" || exit 1; done
```

```
git diff --stat <code-baseline-sha> -- index.html song-app.css song-app.js
```

Pass conditions: every command exits zero; the `node --test` and `design-gallery/test.mjs` counts never drop below the previous section's; the last command is empty unless that section's manifest says otherwise. `design-gallery/test.mjs` needs Playwright's Chromium and must run outside the macOS sandbox, per AGENTS.md.

---

## Model, effort, agent and reviewer choices

**Anthony's routing override, 2026-09-22: Opus 5, Sonnet 5 and Gemini 3.8 Flash only.** Codex is not used in this plan. The assignments below place each model where its strength and its pool make sense, hardest and riskiest to Opus, careful implementation and every review to Sonnet, mechanical and read-only volume to Flash.

Utilization is read live from `/Users/anthony/Projects/ai-usage-dashboard/data/status.json` at every dispatch, never from this file. Reading at 2026-09-22T21:42Z: Claude 5-hour 12 percent, Claude weekly 82 percent resetting tonight at 11:00 PM, Codex `primary` 95 percent until Saturday, Gemini weekly 77 percent resetting Wednesday 7:30 AM, Gemini 5-hour reset.

| Unit or role | Model | Why |
|---|---|---|
| Plan author, Section 0 | Opus 5 · xhigh, then · high | Plan authoring and the baseline ruling |
| Lane 0, plan critic | **Gemini 3.8 Flash · high**, read-only | Read-only, needs no worktree, and keeps Claude's weekly for the writing |
| Section 1, safety net | **Sonnet 5 · high** | Test tooling and a Playwright parity harness: careful work, but not architectural |
| Section 2, leaf modules | **Gemini 3.8 Flash · high** | The most mechanical section: five leaf modules with no cross-imports. Runs on a branch in the main checkout, not a worktree (see below) |
| Section 3, state and departments | **Sonnet 5 · high** | Touches every permission guard; needs judgment, not just motion |
| Section 4, rendering | **Opus 5 · high** | The riskiest section: roughly 30 of the 53 gallery scope names are rendering functions |
| Section 5, action dispatcher | **Opus 5 · high** | The app's entire event contract, a 925 line switch that must move byte-identical |
| Section 6, integration | **Opus 5 · high** (controller) | Completion boundary on a production surface holding real people's data |
| Every section review | **Sonnet 5 · high**, fresh, read-only | The writer never grades its own work. Sonnet writes only Sections 1 and 3, so a fresh Sonnet instance reviews those |
| Second review round, Sections 4 and 5 | **Sonnet 5 · high**, fresh, read-only | Blast radius: a church app real people use gets two landing rounds |
| Completion review, Section 6 | **Sonnet 5 · high**, fresh, read-only, one round | **Changed from Opus.** Opus now writes Sections 4 and 5, so it cannot also grade the completed work |
| Pre-review hygiene sweep | **Gemini 3.8 Flash · low** | The routing table's named alternate to Haiku 4.5; keeps Claude's weekly for substance |
| Parity baselines and browser walkthroughs | The coordinating Claude chat | Playwright and screenshot glue is coordinator work, not a writer's |

**Worktrees and Gemini.** Antigravity's headless gate cannot read files in a Git worktree, so a Flash-written section runs on its own branch in the main checkout at `/Users/anthony/Projects/worship-duty-app` instead. That is safe here and is not a weakening of the isolation rule: Steps mode is sequential, exactly one section is ever in flight, and each section still gets its own branch and its own revert point. Sections written by Opus or Sonnet keep their worktrees.

Runner: **sequential, Steps mode** (Anthony's choice, 2026-09-22). Every section edits `app.js`, so there is one writer at a time and one plan unit per fresh chat. Mixed models per section make Steps the only workable mode, since one chat cannot switch between Opus, Sonnet and Flash. Lane 0 is the only concurrent unit, and it is read-only; it launches from the Section 1 chat.

---

## Sections

### Lane 0: Plan critic

Setup: balanced · high · Lane: Antigravity (read-only) · Review: none
  Antigravity: Gemini 3.8 Flash · high, read-only (fallback: Claude Sonnet 5 · high)
Worktree: none, read-only, reads the main checkout
Depends on: Section 0 complete (launches alongside Section 1)
Agents: none
Reviewers: none (this lane is the critic)

Argue against this plan: missing decisions, unsafe assumptions, untestable acceptance, rollback gaps, and any section too ambiguous for an executor to run without asking. Pay particular attention to the gallery scope contract and to whether the parity harness can actually distinguish a broken split from a passing one. Write findings to `docs/runs/2026-09-22-app-js-split/research/L0-critique.md`. Advice only; accepted findings become revised sections before the completion review.

### Section 1: Safety net before any code moves

Setup: balanced · high · Lane: Claude · Review: controller
  Claude: Sonnet 5 · high (fallback: Opus 5 · high if the parity harness stalls)
Worktree: `.claude/worktrees/2026-09-22-app-js-split/S1`
Depends on: Section 0 (baseline frozen, trunk question answered)
Agents: none
Reviewers: controller=Sonnet 5 · high; independent=none
Hygiene: Haiku 4.5 · low sweep before review

No production code moves in this section.

1. Make the four source-text test files read the concatenation of `app.js` and every split module instead of `app.js` alone, patterns unchanged. Extend the `node --check` and no-typographic-dash checks to every module path.
2. Add `scripts/check-app-split.mjs` with `--manifest`, `--gallery` and an allowlist file, plus `scripts/check-app-split.manifest.json` seeded from Section 0's module map, plus behavior tests: a moved declaration passes, an edited body fails, a declaration in the wrong module fails, a declaration for a not-yet-created module must still be in `app.js`, and a name missing from the gallery scope contract fails.
3. Add `design-gallery/parity.mjs` per the safety net above, reusing `design-gallery/test.mjs`'s mocked Firebase, fictional fixtures and request blocking. Record the baseline with `--record docs/runs/2026-09-22-app-js-split/baseline/fixed` on the untouched tree.
4. Record the load-effects fixture from the untouched module graph.
5. Add the new module paths to `design-gallery/test.mjs`'s `protectedNames` list and its owned-path dash check, with the entries commented out or guarded until the modules exist, so the list is complete from the first move.

Acceptance: every verification command passes on the untouched tree; the checker's own behavior tests pass; 40 baseline screenshots and the DOM-fact and load-effects fixtures exist; the parity baseline contains no real member name (a grep against the seed roster's canonical names, run by the controller, finds nothing outside `app.js` and `seed-data.js`). Undo: `git revert` of the section's merge; the tooling is safe to keep.

### Section 2: Move the leaf-level modules

Setup: balanced · high · Lane: Antigravity · Review: controller
  Antigravity: Gemini 3.8 Flash · high (fallback: Sonnet 5 · high)
Worktree: **none**, branch `split/s2-leaf-modules` in the main checkout at `/Users/anthony/Projects/worship-duty-app`, because Antigravity cannot read worktree files
Depends on: Section 1 merged
Agents: none
Reviewers: controller=Sonnet 5 · high, fresh, read-only; independent=none
Hygiene: Gemini 3.8 Flash · low sweep before review

Create `core/constants.js`, `core/format.js`, `core/conflicts.js`, `core/planning.js` and `core/sheet-parse.js`. These import nothing from other split modules except `core/format.js` and `core/constants.js`, so they are acyclic by rule. `app.js` imports them. The `sharedNameMap` setter is added here if `initFirebase` is the only writer, and goes in the allowlist.

This is also the section that re-points the first `build.mjs` anchors, because `'use strict';` and the choir-song anchors move. Update `build.mjs`, `app-fixes.mjs` and the `protectedNames` list in the same commit as the move.

Acceptance: every verification command passes; the manifest check passes with these five modules created and everything else still in `app.js`; the allowlist holds at most the `sharedNameMap` setter; all 40 screenshots and every DOM fact match the baseline; `node design-gallery/build.mjs` succeeds and its output `app.js` still contains every injected slot resolved. Undo: revert the section's merge.

### Section 3: Move state, departments, sync, notifications, calendar and session

Setup: balanced · high · Lane: Claude · Review: controller
  Claude: Sonnet 5 · high (fallback: Opus 5 · high)
Worktree: `.claude/worktrees/2026-09-22-app-js-split/S3`
Depends on: Section 2 merged
Agents: none
Reviewers: controller=Sonnet 5 · high, **fresh instance**, read-only; independent=none
Hygiene: Gemini 3.8 Flash · low sweep before review

Create `core/state.js`, `core/auth.js`, `core/departments.js`, `core/schedule.js`, `core/notify.js`, `core/sheet-sync.js`, `core/calendar.js` and `core/session.js`. `state` and the Firebase handle become live bindings exported from `core/state.js`; nothing outside that module may assign them, and Section 0's setter list names any statement that does.

This is the largest data move and the one that touches department permissions, so the reviewer specifically re-checks that every permission guard (`canPermission`, `authorizedDepartments`, `canManageSelectedDepartment`, `departmentProfileAssignable`) still sits on the same call paths.

Acceptance: every verification command passes; the manifest check passes with these eight added; the gallery check passes; all 40 screenshots and every DOM fact match; the load-effects fixture matches; `node --test tests/*.test.mjs` count never drops. Undo: revert the section's merge.

### Section 4: Move rendering

Setup: frontier · high · Lane: Claude · Review: two rounds
  Claude: Opus 5 · high (fallback: Sonnet 5 · high)
Worktree: `.claude/worktrees/2026-09-22-app-js-split/S4`
Depends on: Section 3 merged
Agents: none
Reviewers: round 1 = Sonnet 5 · high, fresh, read-only; round 2 = Sonnet 5 · high, a second fresh instance, read-only
Hygiene: Gemini 3.8 Flash · low sweep before review

Create `views/shell.js`, `views/schedule.js`, `views/songs.js`, `views/requests.js`, `views/manage.js` and `views/departments.js`. Rendering is where a careless move shows, so the 40 screenshots and the DOM facts are the deciding check here, not the unit tests.

Roughly 30 of the 53 gallery scope names are rendering functions, so `--gallery` is doing most of its work in this section. Expect the `build.mjs` anchor updates for `renderMemberLogin`, `renderForcedPinChange` and the `data-act` markers to land here.

Acceptance: every verification command passes; the manifest check passes with these six added; the gallery check passes with the full union set present in `app.js`'s scope; all 40 screenshots match within the threshold and every DOM fact is identical; both review rounds close. Undo: revert the section's merge.

### Section 5: Move the action dispatcher

Setup: frontier · high · Lane: Claude · Review: two rounds
  Claude: Opus 5 · high (fallback: Sonnet 5 · high)
Worktree: `.claude/worktrees/2026-09-22-app-js-split/S5`
Depends on: Section 4 merged
Agents: none
Reviewers: round 1 = Sonnet 5 · high, fresh, read-only; round 2 = Sonnet 5 · high, a second fresh instance, read-only
Hygiene: Gemini 3.8 Flash · low sweep before review

Create `actions/dispatch.js` as one module (`canRunAction`, `handleAct`, `handleChg`, `applyNameMap`, `saveRoleConfiguration` and the lookup helpers). `handleAct` is a single large string-keyed switch and moves whole; it is not subdivided. `app.js` is left with the import block, the gallery scope contract, `setSyncPill`, `pulse`, `initFirebase`, `init` and the `init()` call.

The reviewer re-checks that every `data-act` and `data-field` string is byte-identical to the baseline, since those strings are the app's entire event contract and `build.mjs` asserts two of them.

Acceptance: every verification command passes; the manifest check passes with every module created and `app.js` reduced to the keep-list; the allowlist holds exactly the setters Section 0 named and nothing else; all 40 screenshots and every DOM fact match; both review rounds close; `app.js` is under 400 lines. Undo: revert the section's merge.

### Section 6: Integration, documentation and completion review

Setup: frontier · high · Lane: Claude (controller) · Review: Sonnet 5, one round
  Claude: Opus 5 · high (controller)
Worktree: `.claude/worktrees/2026-09-22-app-js-split/S6`
Depends on: Section 5 merged
Agents: none
Reviewers: completion=Sonnet 5 · high, fresh, read-only, one round. **Not Opus**, because Opus wrote Sections 4 and 5 and must not grade the completed work
Hygiene: Gemini 3.8 Flash · low sweep before review

1. Bring the trunk up to date per Section 0's answer, then run the full verification set on it one more time, cold. "The trunk" means `origin/main`, never the stale local `main`; if the local branch has not been reset to `origin/main` by then, do that first and say so.
2. Write the shipped module map into `docs/CODE-INDEX.md` and `docs/HANDOFF.md`, and add a README quick link. Update `docs/FEATURE-MAP.json` where it names `app.js`.
3. Update `/Users/anthony/Projects/README.md`'s worship duty line only if its status text is now wrong. No dated notes in the index.
4. Record the rollback table: each section's merge commit, and the rule that reverting goes newest first down to the target section, because later sections import earlier modules.
5. Private GitHub backup of the branch.
6. Completion review by a fresh Sonnet 5, read-only, which wrote none of Sections 4 or 5. Accepted findings are corrected by the controller and the verification set is rerun; a second round is not launched.

7. Mark the retired compact phone plan historical if Section 0 has not already, and leave `claude/compact-runtime` and `claude/compact-server` in place. No branch is deleted by this plan.

**No deploy.** The plan ends at a merged, verified trunk. Anthony decides separately whether and when to release through `design-gallery/release.mjs`. The first release after this plan is the one that proves the gallery scope contract in production, so it is worth doing while this work is fresh rather than months later.

Acceptance: every verification command passes on the trunk; the documents above are current with working links; the backup is pushed and verified private; the completion review closes with no blocking-class finding open. Undo: revert the section's merge; the code rollback table covers Sections 2 to 5.

---

## Risks and how each is caught

| Risk | Caught by |
|---|---|
| A moved function's body was silently edited | `check-app-split.mjs` body-identity check against the baseline SHA |
| A function landed in the wrong module | `--manifest` |
| The gallery injection lost a name and all four appearances break at release | `--gallery`, plus `node design-gallery/build.mjs` succeeding in every section |
| A `build.mjs` anchor no longer matches and the release path throws | `build.mjs`'s own `requireOne` drift errors, run in every section |
| A rendering move changed a pixel | 40 screenshots at 0.1 percent over 8 channels |
| A behavior change no screenshot shows (a save handler, a permission guard) | `design-gallery/test.mjs`'s 103 checks and `node --test tests/*.test.mjs` |
| A new load-time side effect from module evaluation order | the load-effects fixture |
| The Schedule current-or-next selector regressed | recorded DOM facts at the 7:20 PM and 9:06 PM Pacific boundary |
| Real member data leaks into a baseline or review packet | fixtures are `design-gallery/test.mjs`'s fictional set; controller greps every baseline for the canonical roster names in Section 1 |
| A stale branch is used as the baseline or merge target | Section 0 records that local `main` is 85 commits behind `origin/main` and must not be used; every section branches from the recorded baseline SHA |

---

## Build log

- 2026-09-22: Plan written by Opus 5 in a planning chat, no runtime code. Sequencing investigated first, per the gate in the kickoff. Findings recorded in Section 0: the compact phone plan's Section 2 is complete but **unmerged** on `claude/compact-runtime` (`a1246a6`, `db8f610`), Section 3 is reviewed on `claude/compact-server`, and Sections 4, 5A, 5B and 6 are outstanding. Section 2 already changed `app.js` by 814 lines, removed 340 lines from `index.html`, rewrote `design-gallery/build.mjs` by 303 lines into a directory copier, deleted `design-gallery/choice.js`, and created `shared/`, `layouts/` and `styles/`. Section 4 writes role screens into those same files. Decision: **this plan waits for compact phone Section 6**, on three grounds recorded in Section 0 (same-file ownership, an invalid parity baseline, and two writers on the release build). No bounded piece was found that provably cannot collide.

- 2026-09-22: Interfaces measured against `codex/compact-phone-refactor@1e0b6fd`, marked provisional because the compact phone plan will change `app.js` before this plan starts. Measured facts: 4,314 lines, 250 top-level declarations, 20 module-level `let` bindings, zero `export` statements, zero `window.` assignments, `type="module"` entry. Existing safety net found: `design-gallery/test.mjs` runs 103 checks across all four appearances in real Chromium with a mocked Firebase SDK, blocked external requests and fictional member fixtures, and asserts the gallery build does not modify source files. Four test files read `app.js` as source text.

- 2026-09-22: Gallery scope contract discovered and quantified, the plan's distinctive risk. `design-gallery/build.mjs` injects `host-bridge.js` plus nine filled slots into `app.js`'s top-level module scope immediately before `init();`, so the injected code reaches `app.js`'s functions lexically. Identifier matching against the 250 declarations found **53 distinct names** reached by the injected sources across eight files, listed in Interfaces. Settled rule: `app.js` re-imports every name in that union into its own top-level scope, enforced by `scripts/check-app-split.mjs --gallery`, which recomputes the set at run time. Without this, a correct-looking split would pass every unit test and break all four appearances only at release.

- 2026-09-22: **Section 0 complete.** Code baseline frozen at `f876565`; `app.js` byte-identical to the measurement commit (blob `ab50d2da`, 4,314 lines), working tree clean. Interfaces re-verified and frozen: 250 top-level declarations, **19** module-level `let` bindings, 0 exports, 0 `window.` assignments, the 53 name gallery scope contract unchanged, and `node design-gallery/build.mjs` green at the baseline so Section 1 has a working "before" state. The module map was checked as a partition: **0 overlapping lines, 0 unassigned declarations, 2 uncovered lines** (1 and 2, which stay in `app.js`). That check found and corrected two errors in the plan's own map: `core/session.js` and `views/shell.js` both claimed 1786 to 1814 (session is now 1548 to 1785, shell 1786 to 1947), and the `let` count was 20 rather than 19 (`pulseInFlight` is a mutated `const`, not a reassignable binding). Record: `docs/runs/2026-09-22-app-js-split/lanes/S0.md`. No production code, no deploy, no production reads or writes.

- 2026-09-22: Anthony was asked how git should work for the rest of this plan and chose "push to both", so section commits go to the section branch and to `main`. Force-pushing, merge commits and deploys stay outside this plan either way.

- 2026-09-22: **Anthony chose the full plan, all six sections, on Opus 5, Sonnet 5 and Gemini 3.8 Flash.** Codex is out of this plan. Every section's setup line was re-routed: Lane 0 critic and Section 2 to Flash, Sections 1 and 3 to Sonnet, Sections 4, 5 and 6 to Opus, every review to a fresh Sonnet, every hygiene sweep to Flash · low. Two consequences worth naming. First, the completion review moved from Opus to a fresh Sonnet 5, because Opus now writes the two riskiest sections and must not grade the finished work. Second, Section 2 runs on the branch `split/s2-leaf-modules` in the main checkout rather than a worktree, because Antigravity's headless gate cannot read worktree files; that is safe because Steps mode runs exactly one section at a time and each section still gets its own branch and revert point. Mixed models per section also confirm Steps as the only workable mode, since one chat cannot switch between three models.

- 2026-09-22: Baseline references in this plan were changed from a commit SHA to the `app.js` blob `ab50d2dadc91b70bf5f7f1992e34c0d41498bb0e` at 4,314 lines, because every commit since `1e0b6fd` has been documentation only and a SHA would go stale on each one. Each section now branches from `main` at its tip and checks the blob.

- 2026-09-22: **Section 1 lane set to Claude, writer Sonnet 5 high.** Pools read live at 21:42Z: Codex `primary` 95 percent and not refilling until Saturday 3:45 AM, Claude weekly 82 percent resetting tonight at 11:00 PM, Claude 5-hour 12 percent, Gemini weekly 77 percent. The routing table's implementation row spills from Luna at 80 percent to Gemini 3.8 Flash, but this plan excludes Gemini as a writer because Antigravity's headless gate cannot read worktree files and every section runs in a worktree, so the spill continues to Sonnet 5 high as a Claude helper. Waiting for Codex would cost 3.5 days. Execution envelope: `docs/runs/2026-09-22-app-js-split/orders/S1.md`.

- 2026-09-22: **Trunk fast-forward done by Anthony** (`8b0c06c..e3deb1b`, a clean fast-forward, no merge commit, no force). `origin/main`, local `main` and `codex/compact-phone-refactor` are now all at `e3deb1b`, 0 ahead and 0 behind each other, with a 4,314 line `app.js` and a 1,804 line `firestore.rules`. Sections branch from `main` at `e3deb1b`. Correction to the trunk table above: `firestore.rules` is 1,804 lines, not the 1,854 first recorded, which was inferred from a diff stat rather than measured.

- 2026-09-22: **Trunk cleanup, Anthony's choice of trunk first.** Local `main` was stale: `6ed1ebb`, a 2,476 line `app.js`, a 30 line `firestore.rules`, 4 local commits never pushed and 85 behind `origin/main`. Those four (`6ed1ebb`, `af89b5b`, `1f70982`, `b3084cc`, Sep 12 to 13 appearance gallery and Prism/Aurora work) were preserved as the annotated tag `archive/local-main-2026-09-13` and pushed to GitHub before local `main` was reset to `origin/main`. Nothing discarded. The remote fast-forward of `main` to `f876565` is dry-run verified and left for Anthony to run.

- 2026-09-22: **Anthony retired the compact phone refactor** ("compact phone refactor is outdated. no longer needed"), which removes this plan's only blocking condition. Status changed from blocked to ready. Section 0 rewritten from a sequencing wait into a baseline and boundary unit, keeping the retirement evidence as the record of why `shared/`, `layouts/` and `styles/` exist on unmerged branches. Nothing deleted: Section 2 stays on `claude/compact-runtime` (`a1246a6`, `db8f610`) and Section 3 on `claude/compact-server`. `PLAN-COMPACT-PHONE-REFACTOR.md` marked historical and `AGENTS.md` re-pointed at this plan.

- 2026-09-22: Interfaces promoted from provisional to **binding**, because they were measured at `1e0b6fd` and the code baseline is `12481e9`, a docs-only commit on top of it. Every line range, the 250 declaration inventory, the 20 module-level `let` bindings and the 53 name gallery scope contract are exact for the tree Section 1 starts from. The retired plan's `shared/` and `layouts/` directories are not in the baseline, so this plan creates `core/`, `views/` and `actions/` instead of inheriting that layout.

- 2026-09-22: Trunk facts measured and recorded in Section 0 after the retirement, because Section 6 had assumed `main`. `origin/main` is the real trunk at `8b0c06c` with a 4,217 line `app.js`, and is a direct ancestor of this branch, which is 18 commits ahead as a clean fast-forward and 0 behind. **Local `main` is stale and diverged**: `6ed1ebb`, a 2,476 line `app.js`, a 30 line `firestore.rules`, 4 local commits and 85 behind `origin/main`. It must not be used as a baseline or a merge target. Of the 18 commits ahead, `3b4280d` through `86a476f` are shipped production fixes that belong on the trunk and the rest are retired-plan records. Whether the trunk fast-forwards before Section 1 or at Section 6 is Anthony's open decision, carried in Section 0.

- 2026-09-22: Record tree created at `docs/runs/2026-09-22-app-js-split/`. Anthony chose **Steps** mode: one plan unit per fresh chat, Section 0 first, and Section 0 does not open until the compact phone plan's Section 6 has merged and released. Anthony also authorized committing the plan, record tree and document links onto `codex/compact-phone-refactor`. No implementation started and no follow-on chat opened.

- 2026-09-22: **Section 1 complete.** Gate confirmed before any edit: `app.js` 4,314 lines, blob `ab50d2dadc91b70bf5f7f1992e34c0d41498bb0e`, Section 0 marked complete in this log. No production code moved; `git diff --stat main -- app.js index.html song-app.js` is empty. Worktree `.claude/worktrees/2026-09-22-app-js-split/S1`, branch `claude/app-js-split-s1` from `main` at `37a80b7`.

  Built the four-layer safety net. `scripts/check-app-split.mjs` reads the baseline with `git show`, extracts all 250 top-level declarations by a column-zero regex (matching the frozen Section 0 count exactly, with 0 unassigned), and checks each appears exactly once across the current module set with an identical body after whitespace normalization; `--manifest` additionally checks each declaration sits in its assigned module or, if that module does not exist yet, that it is still in `app.js`; `--gallery` recomputes the 53-name gallery scope union at run time from the eight injected sources and checks each name is in `app.js`'s own top-level scope (declared or imported). The recomputation independently reproduced Section 0's frozen 53-name list exactly. `scripts/check-app-split.manifest.json` was seeded by assigning each of the 250 declarations to a module by the line ranges in the frozen Interfaces table; the resulting per-module counts matched Section 0's frozen breakdown exactly (`core/departments.js` 29, `core/state.js` 28, ... `core/planning.js` 3, sum 250) with 0 unassigned and 0 duplicates, an independent check that the module map is still a true partition. `scripts/check-app-split.allow.json` is `[]`. `tests/check-app-split.test.mjs` has 7 behavior tests against synthetic fixture git repos (moved declaration passes, edited body fails, wrong module fails, not-yet-created module correctly requires staying in `app.js` and its negative "premature move" case, gallery-scope-missing-name fails, gallery-scope-via-import passes, the real untouched tree passes).

  The four source-text tests (`tests/department-runtime-contract.test.mjs`, `tests/integration-auth-wiring.test.mjs`, `tests/schedule-default.test.mjs`, `tests/ui-qa.mjs`) now read the concatenation of `app.js` and every split module (in the manifest's `moduleOrder`, matching the Interfaces table's module order with `app.js`'s own remainder last), each module contributing an empty string until its section creates it, patterns unchanged. `design-gallery/parity.mjs` was added, reusing `design-gallery/test.mjs`'s mocked Firebase SDK, request blocking and `live-design/fixture-firestore.js`; it uses its own small fictional fixture (5 members, 2 services) rather than test.mjs's exact fixture, because test.mjs's own fixture happens to reuse five real roster names from `DEPARTMENTS_SEED` (`B. Anthony`, `E. Simon`, `D. Caleb`, `S. Lisa`, `M. Chloe`) and the roster grep required below is explicit that any hit is a blocker; parity.mjs's fixture uses five clearly fictional names instead (`Z. Rivera`, `Y. Nakamura`, `X. Delgado`, `W. Osei`, `V. Tran`), none of which appear anywhere in the 43-name canonical roster. `Date` is frozen with `page.clock.setSystemTime` before `page.goto`. It captured all four appearances in five states (sign-in gate, Schedule, My duties, Manage, Presider songs) at desktop 1280x800 and phone 375x812, `deviceScaleFactor: 1`: 40 screenshots, recorded to `docs/runs/2026-09-22-app-js-split/baseline/fixed/`. The Schedule state's DOM facts include the current-or-next selector checked at 7:20 PM and 9:06 PM Pacific against a same-day 5:00 AM and 7:30 PM pair (both correctly resolve to the 7:30 PM service), captured in an isolated session per appearance so the mutation cannot leak into the other screenshots, plus the maintenance-schedule title and its omission of the completed 5:00 AM service. `--compare` against its own recording passed twice in a row with 0 failures. PNG comparison (0.1 percent of pixels over an 8-per-channel threshold) is a small hand-written decoder over Node's built-in `zlib`, since no image-diff package is in `package.json` and this plan does not own that file. `tests/fixtures/app-js-split/load-effects.json` was recorded from the untouched module graph by observation only (window keys added during load, timers/rAF scheduled, localStorage keys touched, the app's own network requests), never by editing `app.js`.

  `design-gallery/test.mjs`: added the 20 new module paths to `protectedNames` (hashing skips a path that does not exist yet) and to the owned-path no-dash check (skipped the same way); its own 103-line documentation figure is stale, the suite actually runs 163 checks both before and after this change (verified by running the pristine `main` copy of the file side by side), so its count did not change. No other line in its 103 (now-163) checks was touched.

  Verification, all on the untouched tree: `node --test tests/*.test.mjs` 114 passed, 1 skipped (the Firestore rules emulator test, pre-existing, gated on `RUN_FIRESTORE_RULES_EMULATOR`), 0 failed. `node tests/ui-qa.mjs` 0 accessibility violations, 0 console errors, exit 0 (run against a plain `python3 -m http.server` on this worktree, since the registered `worship-duty-app` preview server in `~/Projects/.claude/launch.json` points at the main checkout, not this worktree). `node design-gallery/test.mjs` 163/163 checks passed, needed `npm install` and `npx playwright install chromium` in this worktree first (neither was present). `node design-gallery/parity.mjs --compare docs/runs/2026-09-22-app-js-split/baseline/fixed` passed twice consecutively. `node scripts/check-app-split.mjs main --manifest scripts/check-app-split.manifest.json --gallery` passed, 250 declarations. `node --check app.js` clean. `git diff --stat main -- app.js index.html song-app.js` empty.

  Privacy: every file under `docs/runs/2026-09-22-app-js-split/baseline/`, including the 40 PNGs read as binary, was grepped for all 43 canonical names in `DEPARTMENTS_SEED`; zero hits.

  Not done in this session, both require a runtime this Claude session cannot reach: the Gemini 3.8 Flash low hygiene sweep, and the independent fresh-instance review is being requested as a same-session read-only Sonnet 5 subagent rather than a separate chat. Record: `docs/runs/2026-09-22-app-js-split/lanes/S1.md`.

- 2026-09-22: **Section 1 reviewed.** A fresh, same-session Sonnet 5 subagent, read-only, independently re-ran the verification suite, re-extracted the roster and re-grepped the baseline itself, and spot-checked 20 manifest assignments, rather than trusting the record above. One blocking finding: `tests/department-runtime-contract.test.mjs`'s assignment-boundary test found its end marker (`function seedState(`) by an unguarded `indexOf` that only worked because of a coincidental text order in the untouched `app.js`; `core/state.js` sits before `core/departments.js` in `moduleOrder`, so once Section 3 creates both, the marker would resolve to `-1` and the slice would silently widen instead of failing, weakening the test exactly the way Rule 5 forbids. Fixed: the end marker is now `function unassignDepartmentDutyForService(`, the next declaration in the same module, with the missing `assert.ok` boundary guard added. Two non-blocking findings: the four source-text tests' module concatenation now joins with `\n` instead of `''`, guarding a theoretical cross-file boundary merge; the checker's column-zero declaration regex could in principle be confused by a multi-line template literal at column 0, but `app.js` has none today and every later section is pure code motion, so this was left as a documented, dormant risk rather than added complexity. Full verification suite re-run clean after both fixes. No other findings. Staging the fixes then surfaced a third, self-caught bug: `design-gallery/parity.mjs --compare` was unconditionally rewriting the committed `tests/fixtures/app-js-split/load-effects.json` fixture on every call (its `timersScheduled` count is not perfectly deterministic run to run), leaving the working tree dirty after every verification pass. Fixed: `recordAll()` only refreshes that fixture when `--record` asks for it. Ready for `main` to be brought up to this branch when Anthony wants it.

- 2026-09-22: **Section 2 lane switched to Claude.** The plan's setup line routed Section 2 to Antigravity (Gemini 3.8 Flash high), and its execution envelope (`docs/runs/2026-09-22-app-js-split/orders/S2.md`) was written on that basis. Anthony then said to start it in Claude with Sonnet instead. Worktree `.claude/worktrees/2026-09-22-app-js-split/S2`, branch `claude/app-js-split-s2` from `main` at `350a441` (0 ahead/behind `origin/main` at that point). Because a worktree is now in play instead of Antigravity's main-checkout branch, the envelope's "no worktree" line no longer applies; everything else in the envelope (the five leaf modules, the 14 gallery-scope names to re-import, the `sharedNameMap` setter case, the `build.mjs`/`app-fixes.mjs` anchor re-pointing) is followed as written.

- 2026-09-22: **Section 2 complete: the first production code motion.** Gate confirmed first: `app.js` still 4,314 lines, blob `ab50d2dadc91b70bf5f7f1992e34c0d41498bb0e`, Section 1 complete and merged (`543eed7`/`cd527ec`/`350a441` on `main`). Moved `core/constants.js` (18 declarations), `core/format.js` (13), `core/conflicts.js` (9), `core/planning.js` (3) and `core/sheet-parse.js` (7), 50 declarations total, out of `app.js` verbatim, using each declaration's own extracted body rather than the plan's prose line-range table (the two disagree at module boundaries where a section banner comment sits; the extracted-body boundaries are what the checker actually verifies, and were independently cross-checked against the frozen per-module counts in Section 0's Interfaces, all matching exactly, with 0 unassigned and 0 duplicates). `app.js` is now 3,916 lines. `scripts/check-app-split.mjs --manifest --gallery` passes: 250 declarations checked, the 14 gallery-scope names that land in these five modules (`ASSET_V`, `CATEGORIES`, `DATA_KEY`, `FEATURES`, `conflictsFor`, `esc`, `feat`, `fmtDate`, `fmtTime`, `pad`, `siteUnlocked`, `svcId`, `toISO`, `todayISO`) are re-imported into `app.js`'s own top-level scope and resolve correctly.

  **The plan's "acyclic by rule" claim for Section 2 was wrong**, discovered empirically, not anticipated by the plan or by Section 0's Interfaces. `memberLabel`/`feat`/`siteHash`/`sheetUrl` (`core/constants.js`) and `workloadStats`/`suggestSubs` (`core/planning.js`) all read `state`, and `suggestSubs` also calls `departmentProfiles`/`departmentProfileAssignable`, none of which move until Section 3. A straightforward `import {state} from '../app.js'` in those two leaf modules created a real ES module cycle back to the entry script; because `app.js` also directly imports all five leaf modules, that cycle pulled the *entire* leaf-module graph into one strongly-connected component, and in real Chromium execution `core/conflicts.js`'s top-level `const ALL_DUTIES_ORDER = CATEGORIES.reduce(...)` ran *before* `core/constants.js` had initialized `CATEGORIES`, throwing `ReferenceError: Cannot access 'CATEGORIES' before initialization`. Confirmed by a standalone Playwright reproduction before touching anything, and by direct testing (`node design-gallery/test.mjs`) after every candidate fix, not by theory alone.

  Fixed by removing the back-import entirely: `core/constants.js` and `core/planning.js` each declare their own private (non-exported) local of the same name (`state`, and `state`/`departmentProfiles`/`departmentProfileAssignable`) and export a setter (`setConstantsStateRef`, `setPlanningRefs`); `app.js` calls each setter once, immediately after the real values it already owns are declared (`state` itself; `departmentProfileAssignable`, the last of the three). This needed no change to any of the six affected declarations' own bodies (`memberLabel`, `feat`, `siteHash`, `sheetUrl`, `workloadStats`, `suggestSubs` all still read plain `state`/`departmentProfiles`/`departmentProfileAssignable`, now resolving to the local placeholder instead of an import), and the import graph is now a pure DAG: no module imports from `app.js`. Two new allowlist entries record the two setter-call insertions (`state`'s own declaration; `departmentProfileAssignable`'s), alongside Section 1's two `sharedNameMap` entries carried over unchanged. Every future section that needs a not-yet-moved symbol from `app.js` should use this same private-local-plus-setter pattern rather than a real import back to the entry module.

  That fix exposed a real gap in Section 1's own motion checker, found and fixed here rather than deferred: `scripts/check-app-split.mjs` initially reported the two new private locals as `duplicate: "state"` (and similarly for the shared names), because it compared *every* top-level declaration across the module set by name regardless of export status. Fixed: only `export`ed declarations (plus anything declared directly in `app.js`, which needs no `export` to be usable in its own scope) are eligible to be "the current home" of a baseline declaration; a private, non-exported local can share a name without colliding. Two more checker bugs surfaced independently while building the five modules and are fixed in the same commit: `extractTopLevelImportedNames` only matched a single-line `import {...} from '...'` statement, so app.js's own multi-line import blocks (needed for a five-to-nineteen-name list) were invisible to the `--gallery` check, which then falsely reported all 14 re-imported gallery names as missing; and `extractDeclarations`'s body-boundary logic attributed a *trailing* section-banner comment sitting between two declarations to the *preceding* declaration's body even when the module map assigns that banner's home to the *following* declaration's module, causing five false `edited: ...` failures purely from comment placement, not code. Both are now handled generally (multi-line-aware import regexes run globally over the whole source; trailing blank/comment lines, including a wrapped block comment, are trimmed off a body before comparison) and covered by three new behavior tests in `tests/check-app-split.test.mjs` (10 total, up from 7), each written to fail against the pre-fix checker and pass after.

  `design-gallery/build.mjs`: `assertSyntax` used `vm.Script`, which parses as a classic script and throws on a top-level `import`/`export`; generalized to strip both (multi-line aware) before the syntax check, for any file, replacing the old `module` boolean that only handled `song-app.js`'s specific shape. Added a generic staging step that mirrors whichever of `core/`, `views/`, `actions/` exist yet into `.hosting-gallery`, so the staged `app.js`'s relative imports resolve; none of the plan's guessed `'use strict'`/choir-song anchor moves were actually needed this section (all three choir-song anchors and `'use strict'` itself live in later sections' line ranges, confirmed by grep before assuming otherwise). `design-gallery/test.mjs` and `design-gallery/parity.mjs`: both loaded `.hosting-gallery`'s assets with a non-recursive `readdir`, so `core/*.js` requests 404'd and the page never finished loading in the browser harness; both now walk the staged tree recursively (mirrored fix, same shape in each file). `design-gallery/test.mjs`'s own edit is confined to that one asset-loading block; its checks, now 168 (163 plus one new dash-check per real leaf-module file that now exists), are otherwise untouched.

  Verification, full suite, real Chromium: `node --test tests/*.test.mjs` 117 passed, 1 skipped (pre-existing emulator gate), 0 failed. `node tests/ui-qa.mjs` 0 violations, 0 console errors, exit 0. `node design-gallery/build.mjs` succeeds, every injected gallery slot resolves. `node design-gallery/test.mjs` 168/168 checks passed. `node design-gallery/parity.mjs --compare docs/runs/2026-09-22-app-js-split/baseline/fixed` PASS, 40 states, run twice consecutively with 0 failures, and confirmed the fixture-mutation fix holds (`tests/fixtures/app-js-split/load-effects.json` stayed untouched by `--compare` both times). `node scripts/check-app-split.mjs main --manifest scripts/check-app-split.manifest.json --gallery` PASS, 250 declarations. `node --input-type=module --check` clean on `app.js` and all five new modules. `git diff --stat main -- index.html song-app.css song-app.js` empty.

  Not done in this session: the Gemini 3.8 Flash low hygiene sweep (no Gemini/Antigravity runtime reachable from this Claude session, same limitation as Section 1); review is a same-session fresh read-only Sonnet 5 subagent, not a separate chat. Record: `docs/runs/2026-09-22-app-js-split/lanes/S2.md`.

- 2026-09-22: **Section 3 complete: state, auth, departments, schedule, notify, sheet-sync, calendar, session.** Gate confirmed first: `app.js` 3,916 lines (Section 2's result), Section 2 complete and merged (`db2bf44`/`1756f72`/`99d93a8` on `main`). Anthony's "just keep going until its done" continued the session straight from Section 2's completion; lane stayed Claude per the setup line (no override needed here). Moved `core/state.js` (28), `core/auth.js` (10), `core/departments.js` (29), `core/schedule.js` (5), `core/notify.js` (14), `core/sheet-sync.js` (8), `core/calendar.js` (7), `core/session.js` (9): 110 declarations, verbatim, using each declaration's own extracted body per Section 2's precedent. `app.js` is now **2,598 lines**. `scripts/check-app-split.mjs --manifest --gallery` passes: 250 declarations, all 250 minus 160 moved so far correctly still in `app.js`.

  **Two classes of real bug, both found by actually running the app in Chromium, not by re-reading the plan.**

  First: nine module-level `let` bindings (`verifiedSession`, `authUser`, `authReady`, `authStatus`, `requestUnsub`, `fb`, `departmentsLoaded`, `membersLoaded`, and `state` itself) are not just read elsewhere, they are **reassigned** elsewhere: `handleAct`/`handleChg` (Section 5, still in `app.js`), `initFirebase`/`init` (`app.js`'s own kept tail), and now `core/session.js`'s `setVerifiedSession`/`startRequestListener`/`syncAuthUser`. An ES import binding cannot be assigned to from outside its owning module; the browser threw `TypeError: Assignment to constant variable.` at the first of these to actually run (login). The plan's "Known cases" list of expected setters (Interfaces, "Shared mutable state and setters") named only `sharedNameMap` and `setlistIndex`; `state` and these eight siblings were not anticipated. Fixed with the same setter pattern Section 1 established for `sharedNameMap`, extended: `core/state.js` now exports `setState`, `setFb`, `setAuthReady`, `setAuthStatus`, `setAuthUser`, `setRequestUnsub`, `setDepartmentsLoaded`, `setMembersLoaded`, `setVerifiedSessionRef` (named distinctly from `core/session.js`'s own higher-level `setVerifiedSession`, which does much more than assign this one binding). Sixteen call sites converted, each with its own allowlist entry (`scripts/check-app-split.allow.json` now has 18 entries total, up from 2).

  Second, more subtle: `core/constants.js` and `core/planning.js`'s Section 2 setters for `state`/`departmentProfiles`/`departmentProfileAssignable` are **left exactly as Section 2 built them**, not "cleaned up" to real imports even though `core/state.js` and `core/departments.js` now exist. A same-direction check before touching them: `core/constants.js` itself has zero top-level statements depending on `state`, but `core/state.js` (the module it would import `state` FROM) does: `ui`'s `deptFilter` field is an IIFE that calls `CATEGORIES.some(...)` immediately at module evaluation, and `CATEGORIES` comes from `core/constants.js`. If `core/constants.js` imported `state` from `core/state.js`, and `core/state.js` imports `CATEGORIES` back from `core/constants.js` (it does, for that same `ui` object), the two modules would form a 2-node cycle with `core/constants.js` at its root; ECMAScript's module evaluation algorithm executes a cycle's members in *reverse* discovery order, so `core/state.js` (discovered second, as `core/constants.js`'s own dependency) would run *before* `core/constants.js`, throwing the exact `CATEGORIES` TDZ error Section 2 already fixed once, just relocated. `core/planning.js`'s equivalent import would have been safe (nothing imports back from it), but was left alone too, for consistency and because it already worked. **The rule for every remaining section:** never import a not-yet-fully-wired binding back into a module that a currently-evaluating ancestor (however many hops away) also depends on; use the private-local-plus-setter pattern instead, and check for a top-level (non-function) statement anywhere in the importing module's transitive dependency chain before deciding a direct import is safe.

  A second, independently serious bug, again only visible in a real browser: the three Section 3 modules that need `render()` (still in `app.js`, not moved until Section 4) had their setter calls (`setNotifyRenderRefs`, `setSheetSyncRefs`, `setSessionRefs`) placed in `app.js`'s top-level "preamble" zone, right after the import block. That captures whatever `render` is *at that point in app.js's own evaluation*, which is the **plain, pre-gallery function**. `design-gallery/build.mjs`, the actual production build path, injects `host-bridge.js` immediately before the final `init();` call; that injection **monkey-patches `render`** into a version that also paints the active appearance (`design.afterRender()`, Prism/Navy/Aurora repainting). Calling the setters before that injection point froze `core/notify.js`/`core/sheet-sync.js`/`core/session.js` onto the pre-patch function forever: every notify, sheet-sync and session event (new-duty alerts, sheet pulls, login, PIN change, logout) would have silently painted only the "core" view and skipped appearance-specific repainting for every real user on Prism, Navy or Aurora, in production, after release. Caught because the design gallery's first-visit "choose your appearance" dialog never auto-opened after login in `design-gallery/test.mjs`; a manual `window.WorshipDesign.open(true)` call confirmed `isAccessible()`/permissions were correct, isolating the fault to `render()` itself never reaching `design.afterRender()`. Fixed by moving those three setter calls into `init()`'s own body (its first three statements), which runs after all top-level code, including the injected monkey-patch, has already executed; `findService`/`renderBanners`/`pulse` are never monkey-patched (confirmed by reading `host-bridge.js`'s own redefinition list, which touches only `render` and eight `renderManage*`/`renderSiteLock`/`renderFeatures` functions the split has not reached yet), so moving them cost nothing. One more allowlist entry for `init`'s new first lines.

  `design-gallery/build.mjs`: five of its 13 `requireOne` anchors (`isVerifiedSession`, `isForcedSession`, `canManageAnyDepartment`, `selectedManageDepartment`, and the `choirSongSeen` merge anchor) moved out of `app.js` this section (four to `core/auth.js`, one to `core/sheet-sync.js`); each now checks the file that actually holds it, not `app.js` unconditionally. The other eight anchors (`'use strict';`, the two forced-PIN/login renderers, `songCtx`, both `data-act` markers, and the other two choir-song anchors) stay in `app.js` untouched (checked by grep before assuming otherwise, same discipline as Section 2, where none needed moving).

  **The `main`-as-baseline verify command in this plan's own text silently breaks once any section's allowlist substitution has actually landed on `main`.** Discovered running `check-app-split.mjs main` for a routine post-merge sanity check: `main` (Section 2's result) already contains `setSharedNameMap(...)` calls in `initFirebase`'s body (Section 1's allowlisted substitution), so re-applying that same allowlist entry against `main`-as-baseline double-applies it, producing false `edited`/`allowlist` failures for declarations that never actually changed. `main` was never wrong for a section's own pre-merge verification (it is genuinely the pre-that-section state from that branch's point of view); it only breaks as a *generic* baseline reference once used after the fact. Fixed generally: `readBaselineSource` now accepts a bare 40-hex git blob hash (detected via `git cat-file -t`) and reads it directly (`git show <blob>`, no path suffix), immune to drift since a blob is content-addressed; `tests/check-app-split.test.mjs`'s self-test now uses `manifest.baseline.blob` (already recorded there since Section 1) instead of the literal string `'main'`. A new regression test proves a commit-ish baseline whose own content already has a substitution baked in produces a failure rather than silently double-applying, so the distinction cannot regress silently. **Every verification command from here forward should pass the manifest's own `baseline.blob`, not `main`,** when checking a tree that already has any section's work merged.

  Two more real checker bugs, found building these eight modules, both fixed with regression tests: (1) the backward comment-trim scan (added in Section 2's review) used `line.includes('/*')` to find a block comment's opener, which false-positives on ordinary prose containing that two-character sequence, e.g. `"firebase.json's /ics/** rewrite)"`; a real `downloadICS` doc-comment was left half-trimmed, producing a syntax error (an unterminated `/*`) in `core/calendar.js`. Fixed by requiring the opener at the start of the line (`^\s*\/\*`), matching every real comment style in this codebase. (2) `buildCurrentDeclarationIndex` compared every top-level declaration by name regardless of export status, so the new private-local setter pattern's same-named locals (`state` in `core/constants.js` and `core/planning.js`) registered as `duplicate: "state"`. Fixed: only exported declarations (plus anything in `app.js` itself, which needs no export to be usable in its own scope) are eligible to be "the current home" of a baseline declaration.

  Verification, full suite, real Chromium: `node --test tests/*.test.mjs` 118 passed, 1 skipped (pre-existing emulator gate), 0 failed (one test, `schedule-default.test.mjs`, needed its own fix: its `'\nfunction dutiesFor('` boundary marker stopped matching once that declaration gained an `export ` prefix; fixed with a regex tolerant of the optional prefix, same root cause as the `main`-baseline issue above, different surface). `node tests/ui-qa.mjs` 0 violations, 0 console errors, exit 0. `node design-gallery/build.mjs` succeeds, every injected gallery slot resolves. `node design-gallery/test.mjs` 176/176 checks passed in real Chromium (168 plus 8 new dash checks for the eight new files), including the login flow that had been silently broken. `node design-gallery/parity.mjs --compare docs/runs/2026-09-22-app-js-split/baseline/fixed` PASS, 40/40 states, run twice consecutively, `tests/fixtures/app-js-split/load-effects.json` confirmed untouched both times. `node scripts/check-app-split.mjs <manifest.baseline.blob> --manifest scripts/check-app-split.manifest.json --gallery` PASS, 250 declarations. `node --input-type=module --check` clean on `app.js` and all eight new modules. `git diff --stat main -- index.html song-app.css song-app.js` empty.

  Not done in this session: the Gemini 3.8 Flash low hygiene sweep (same limitation as Sections 1 and 2); review is a same-session fresh read-only Sonnet 5 subagent. Record: `docs/runs/2026-09-22-app-js-split/lanes/S3.md`.

- 2026-09-22: **Section 4 complete: rendering.** Gate confirmed first: `app.js` 2,598 lines (Section 3's result), Section 3 complete and merged (`8dfd3f7` on `main`). Anthony's "just keep going until its done" continued the session straight from Section 3; the setup line assigns this section to Opus 5 (its highest-risk section), but the session is running as Sonnet 5 throughout per Anthony's earlier explicit override ("just start it in claude with sonnet"), noted here rather than silently substituted. Moved `views/shell.js` (10), `views/schedule.js` (8), `views/songs.js` (11), `views/requests.js` (12), `views/manage.js` (17) and `views/departments.js` (16): 74 declarations, verbatim, using each declaration's own extracted body. `app.js` is now **1,304 lines**. `scripts/check-app-split.mjs --manifest --gallery` passes: 250 declarations, all accounted for.

  **The plan's own risk callout for this section was correct: `render` moving out of `app.js` was the hardest problem in the whole plan so far, and it turned out to be bigger than Section 3's fix for it.** Section 3 moved three setter calls into `init()` because `design-gallery/build.mjs` splices `host-bridge.js` as literal text right before `app.js`'s closing `init();` call, and that injected code monkey-patches `render` in place (`const coreRender=render; render=function(){...design.afterRender()...};`). Once `render` itself moves to `views/shell.js`, a plain `import {render} from './views/shell.js'` in `app.js` cannot be reassigned: an ES import binding is read-only from the importing module's side, and host-bridge.js's literal `render=function(){...}` would throw. A full sweep of all 8 files `design-gallery/build.mjs` splices into the built `app.js` (`host-bridge.js`, `design-gallery/navy-adapter.js`, and the `prototype`/`prototype-prism` sources that `host-bridge.js` itself splices `AURORA_CORE`/`PRISM_VIEWS`/etc. from) found the monkey-patched set is **14 names, not the 11 `host-bridge.js` reassigns on its own**: `prototype-prism/all-pages.js` also reassigns `renderUnlock` and `renderCreatePin`; `prototype/aurora.js` reassigns `songCtx`. All 14 move to `views/` this section (`render`, `renderSiteLock`, `renderUnlock`, `renderCreatePin`, `renderSchedule`, `renderMy`, `renderManage`, `renderManageServices`, `renderManagePlanning`, `renderManageRequests`, `renderManagePeople`, `renderFeatures`, `renderManageData`, `songCtx`). `renderServiceCard` looked like a fifteenth at first (`prototype-prism/song-pages.js` and `prototype/presider-workspace.js` both reassign a same-named function), and the section initially gave it the same treatment; the first independent review round traced `build.mjs` line by line and found that reassignment is appended only to `song-app.js`'s own separate build output (`songBridge`/`baseSongs`), never spliced into `app.js`'s scope at all, so `app.js`'s `renderServiceCard` is never patched and the extra machinery was pure unneeded indirection. Reverted before merge: plain import, no local shadow, no setter, no rename, in both `app.js` and `views/schedule.js`. Full verification suite re-run clean after the revert.

  Fixed with the private-local-plus-setter pattern generalized one step further: `app.js` keeps its own mutable `let` for each of the 14, seeded from the real import at the top of the file (before any of the spliced gallery code runs), so the reassignment lands on `app.js`'s own local rather than an import binding. Every *other* module whose code needs the live, possibly-patched version (not the raw, unpatched implementation) receives it through a setter called from `init()`, after the injected code has already run, exactly matching Section 3's timing fix. Four of the 14 (`renderSchedule`, `renderMy`, `renderManage`, `songCtx` via `views/songs.js`) needed no rename, since the consuming module has no declaration of its own by that name. Four needed one: `renderSiteLock` is both owned by and dispatched-to from within `views/shell.js`'s own `render()`; `renderManageServices`/`renderManagePlanning`/`renderManageRequests`/`renderFeatures`/`renderManageData` are all owned by and dispatched-to from within `views/manage.js`'s own `renderManage()`; `songCtx` is owned by and called from within `views/songs.js`'s own `renderSongs()`. A module cannot declare both the real `function renderSiteLock(){}` (needed so `app.js` can import the real implementation) and a private `let renderSiteLock` placeholder for the live dispatch target in the same scope, so each of these call sites was renamed to an `active`-prefixed local (`activeRenderSiteLock`, `activeRenderManageServices`, `activeRenderManagePlanning`, `activeRenderManageRequests`, `activeRenderFeatures`, `activeRenderManageData`, `activeSongCtx`), each backed by its own setter (`setShellRenderRefs`, `setManageActiveRenderRefs`, `setSongsActiveRenderRefs`) called from `init()`. Five allowlist entries record the renamed call sites; `renderManagePeople`, `renderUnlock` and `renderCreatePin` are reassigned by the gallery sources but never called by name anywhere in this app (confirmed by grep against the frozen baseline before assuming so), so they need only the `app.js`-local shadow for the reassignment to land on, no setter and no rename.

  This exposed a real gap in the checker, found and fixed here: `buildCurrentDeclarationIndex` treated every declaration directly inside `app.js` as automatically eligible to be "the current home" of a baseline name, regardless of export status, which was correct until this section introduced `app.js`-local `let` shadows of names the manifest assigns *elsewhere*. Fixed: an `app.js` declaration is excluded from candidacy when it is a `let`, the manifest assigns its name to a different module, and that module's file already exists; every other case (including `app.js`'s own genuinely-owned, non-exported declarations like `pulse`) is unaffected. All 11 existing behavior tests still pass unmodified.

  Two smaller, real bugs, both caught only by the real-Chromium suite, not by the checker or unit tests: `views/songs.js`'s `loadSongApp` did `import('./song-app.js' + ASSET_V)`, a module-relative dynamic import that resolved against `views/songs.js`'s own location once it moved, 404ing on `views/song-app.js` instead of the real root-level `song-app.js`; fixed to `import('../song-app.js' + ASSET_V)` (one allowlist entry). And `tests/department-runtime-contract.test.mjs`'s `memberSelect` boundary test used a section-banner comment (`/* Conflict notes for Manage cards...`) as its end marker; that comment was one of several standalone doc-comments left orphaned in `app.js` once their declarations moved out (removed during this section's own cleanup pass, along with 17 other now-stale comments describing code that no longer lives there, none of which any other test referenced), so the marker stopped resolving. Fixed the same way Section 1's review fixed the sibling boundary in this same test file: point at the next declaration in the same module (`function renderManageConflicts(`) instead of a comment that can move or disappear independently of the code it describes.

  Two gallery-scope names needed the built app.js/staged-module distinction accounted for in `design-gallery/test.mjs` rather than in application code: `manageServiceVisible`'s and `manageRequestVisible`'s real declarations moved to `views/manage.js`, a file staged separately from `app.js` in `.hosting-gallery`, so a check that only scanned the staged `app.js` text undercounted by exactly the declaration (and, for `manageRequestVisible`, its own internal call) that used to live inline when everything was one file. Fixed by scanning the concatenation of the staged `app.js` and staged `views/manage.js`, preserving the check's original intent (every appearance adapter still filters requests/services through the authorization-scoped guard) rather than lowering its threshold. `design-gallery/build.mjs`'s anchor list: `renderMemberLogin`, `renderForcedPinChange`, `data-act="member-login"`, `data-act="member-change-pin"` now check `views/shell.js`; `songCtx` and `choirSong: svc.choirSong || ''` now check `views/songs.js`; `data-field="choirSong"` now checks `views/manage.js`; the other five anchors (`'use strict';` and the four `core/`-scoped ones from Section 3) are untouched.

  Verification, full suite, real Chromium: `node --test tests/*.test.mjs` 118 passed, 1 skipped (pre-existing emulator gate), 0 failed. `node tests/ui-qa.mjs` (run against a plain `python3 -m http.server` on this worktree's own files, since the registered `worship-duty-app` preview serves the main checkout, not this worktree) 0 violations, 0 console errors, both viewports. `node design-gallery/build.mjs` succeeds, every injected gallery slot resolves, all 8 `requireOne` re-pointed anchors match. `node design-gallery/test.mjs` full pass, every check including the previously-untested Presider/song-picker flow across all four appearances, all four roles (admin/leader/member/forced-PIN), five viewports, and the per-file dash-hygiene checks for all six new modules. `node design-gallery/parity.mjs --compare docs/runs/2026-09-22-app-js-split/baseline/fixed` PASS, 40/40 states, pixel-identical and DOM-identical to the Section 1 baseline across all four appearances. `node scripts/check-app-split.mjs <manifest.baseline.blob> --manifest scripts/check-app-split.manifest.json --gallery` PASS, 250 declarations. `node --check` clean on `app.js` and all six new modules. `git diff --stat main -- index.html song-app.css song-app.js` empty.

  Not done in this session: the Gemini 3.8 Flash low hygiene sweep (same limitation as Sections 1 through 3). Review is two rounds of same-session fresh read-only Sonnet 5 subagents, per this section's setup line, not separate chats. Record: `docs/runs/2026-09-22-app-js-split/lanes/S4.md`.

# Worship Duty app.js split (September 2026)

Plan id: `2026-09-22-app-js-split`. Status: **BLOCKED ON SEQUENCING, waits for the compact phone plan's Section 6.** Written 2026-09-22. Not started. Mode: **Steps** (Anthony, 2026-09-22): one plan unit per fresh chat, starting with Section 0.

**Goal line (efficiency sweep 2026-09-22, Anthony's refactor list):** split `app.js` into modules with zero behavior change. Every work order in this plan quotes that line before anything else.

Origin: [efficiency sweep summary](/Users/anthony/Projects/docs/runs/2026-09-22-efficiency-sweep/SUMMARY.md), refactor row: "Worship duty app.js (4,314 lines, 'all logic') | Every change today touches one huge file | Own plan, after the compact-phone plan hands off; tests first; look must stay identical".

Working model: the [Lane Planner split](/Users/anthony/Projects/ai-usage-dashboard/docs/PLAN-2026-09-LANE-PLANNER-SPLIT.md), which finished five sections and its integration on 2026-09-22. Its structure (pure code motion, a manifest checker, recorded journeys, screenshot parity, merge per section) is reused here and adapted to this repository's two hard differences: a source-rewriting Hosting build, and real church data.

Live app and visual authority: https://lv-zion-duties.web.app

---

## Section 0: Sequencing decision

**Decision: this plan waits for the compact phone plan's Section 6 to merge and release. It does not take a bounded piece now.** The evidence is below, gathered from the repository on 2026-09-22.

### What the compact phone plan still owns

[PLAN-COMPACT-PHONE-REFACTOR.md](PLAN-COMPACT-PHONE-REFACTOR.md) is approved and mid-flight. Its Build log records Section 2 complete on `claude/compact-runtime` (commits `a1246a6`, `db8f610`, from `515d38e`) and Section 3 reviewed on `claude/compact-server`. Sections 4, 5A, 5B and 6 are not done. The repository is sitting on the integration branch `codex/compact-phone-refactor` at `1e0b6fd`, and **Section 2 is not merged into it**.

Its own text assigns the exact territory this split needs:

- Section 2: "One owner for root browser files, shared browser modules, appearance modules, service worker, and gallery build."
- Section 4: "Sequential member/leader/admin/presider increments in shared runtime files; no competing writers."
- Section 6: controller merges in dependency order, presents the preview, deploys named targets.

### What it has already done to the file this plan targets

`git diff --stat 515d38e claude/compact-runtime` (Section 2, unmerged):

| File | Change |
|---|---|
| `app.js` | 814 lines changed |
| `index.html` | 340 lines removed |
| `design-gallery/build.mjs` | 303 lines rewritten |
| `design-gallery/choice.js` | deleted (200 lines) |
| `shared/` (7 new modules) | 1,540 lines added |
| `layouts/` (6 new modules) | 244 lines added |
| `styles/` (6 new files) | 455 lines added |
| `appearance-boot.js`, `sw.js`, `firebase.json` | new or changed |

The compact phone plan is **already a modularization of this app**. It created `shared/`, `layouts/` and `styles/`, and it rewrote the gallery build from a fixed file list into a directory copier (`for (const source of ['appearance-boot.js', 'shared/**', 'layouts/**', 'styles/**'])`). Section 4 then writes role screens into those same files.

### Why no bounded piece is safe

Three independent collisions, any one of which is sufficient:

1. **Same file, same lines.** Every candidate slice of `app.js` sits inside the runtime owner's territory for Sections 2 and 4. A split landing first would force the compact phone lanes to rebase 814 lines of unmerged rendering and startup changes onto a moved file.
2. **The safety net cannot be recorded yet.** A parity baseline is a recording of what the app looks like and does. Sections 4 and 6 deliberately change what it looks like and does (floating bottom bar, compact tabs, new role start screens, clean startup). A baseline recorded today would be a baseline of an app that will not exist, so the split's central verification would be invalid on the day it ran.
3. **The build pipeline is mid-rewrite.** `design-gallery/build.mjs` is the release path (AGENTS.md: "Always build and release Hosting through `design-gallery/release.mjs`"). Both plans must change it. Two writers on that file is exactly the situation the shared policy's one-writer-per-shared-file rule forbids.

### The sequencing rule this plan follows

This plan starts when all three are true, verified by the controller and recorded in the Build log:

1. The compact phone plan's Section 6 has merged into `main` and released to https://lv-zion-duties.web.app, with its release stamp recorded in `docs/HANDOFF.md`.
2. `main` is clean and `git diff main codex/compact-phone-refactor` is empty.
3. The released look is captured as this plan's visual authority (Section 1), because at that point the live app's appearance is the authority per the shared policy.

Nothing in this plan runs before then. If Anthony wants the split sooner, the honest option is to pause the compact phone plan at a section boundary, not to interleave them.

**Section 0 has no worktree, no writer and no code.** It is the controller confirming the three conditions above and then re-deriving the Interfaces below against the real post-Section-6 `app.js`.

Setup: frontier · high · Lane: Claude (controller) · Review: none
  Claude: Opus 5 · high
Worktree: none
Depends on: compact phone Section 6 merged and released
Agents: none
Reviewers: none

Deliverables: the three conditions confirmed with commands and output in the Build log; the code baseline SHA recorded; the Interfaces section below replaced with the real statement inventory, module manifest and gallery scope contract measured at that SHA; Anthony told in one line if the module shape changed materially from the provisional map.

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

## Interfaces (provisional, measured at `codex/compact-phone-refactor@1e0b6fd`; Section 0 replaces this with the real baseline)

Everything in this section was measured on 2026-09-22 against the 4,314 line `app.js` on the integration branch. It proves the split is feasible and shows its expected shape. It is **not** binding, because the compact phone plan will change this file before this plan starts.

### What `app.js` is today

- 4,314 lines, 250 top-level declarations, 14 section banners.
- 20 module-level `let` bindings (mutable shared state): `sharedNameMap`, `state`, `fb`, `authReady`, `authUser`, `verifiedSession`, `authStatus`, `requestUnsub`, `settingsLoaded`, `departmentsLoaded`, `membersLoaded`, `renderQueued`, `sheetSyncTried`, `autoSyncWaits`, `sheetSyncScheduled`, `songApp`, `songAppLoading`, `songAssetsLoading`, `setlistIndex`, plus the `pulseInFlight` set.
- Zero `export` statements and zero `window.` assignments. It is a `type="module"` script whose entire surface is its own top-level scope.
- Its only dynamic imports are two Firebase CDN modules inside `initFirebase`.

### Provisional module map

All paths relative to the repository root, extending the `shared/` and `layouts/` convention the compact phone plan introduced. Line ranges are at `1e0b6fd`.

| Module | Holds (line range at 1e0b6fd) |
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
| `core/session.js` | `safeAuthMessage`, `sessionFromClaims`, `setVerifiedSession`, `startRequestListener`, `syncAuthUser`, `authCall`, `memberLogin`, `memberChangePin`, `memberLogout` (1548 to 1814) |
| `views/shell.js` | `render`, `renderLoading`, `viewHasFocusedInput`, `renderBanners`, lock and PIN screens, `renderMaintenanceSchedule` (1786 to 1814, 1815 to 1947, 2430 to 2463) |
| `views/schedule.js` | `pillFor`, `renderCatRows`, `categoryHasAssignments`, `renderServiceCard`, `renderServiceList`, `renderDeptChips`, `renderSchedule`, `renderMy` (1948 to 2147) |
| `views/songs.js` | `loadTag`, `loadSongAssets`, `loadSongApp`, `songCtx`, `renderSongs`, `songStateFor`, `songStateTag`, `setlistIndex` (2148 to 2239, 3161 to 3186) |
| `views/requests.js` | request helpers, `renderYourRequests`, `pendingRequestsCount`, the actionable-count family (2240 to 2387) |
| `views/manage.js` | `renderManage`, manage visibility helpers, features, leader config, planning, member select, conflicts, requests, services, people, data, sheet card (2388 to 2429, 2464 to 2797, 3039 to 3105) |
| `views/departments.js` | department attribution, badges, profile rows, roster groups, department workspace, own availability, department member (2798 to 3038) |
| `actions/dispatch.js` | `findService`, `findRequest`, `requestDepartment`, song permission helpers, `canRunAction`, `saveRoleConfiguration`, `handleAct`, `handleChg`, `applyNameMap` (3106 to 3160, 3187 to 4056) |
| `app.js` keeps | the import block, the gallery scope contract re-exposure, `setSyncPill`, `pulseInFlight`, `pulse`, `initFirebase`, `init`, and `init()` as its last statement (4057 to 4314) |

Provisional result: `app.js` goes from 4,314 lines to roughly 300, in 21 focused modules.

`actions/dispatch.js` stays one module: `handleAct` alone is 514 lines of a single string-keyed switch, and splitting a switch is not code motion. Splitting it is a later, separate plan.

### Gallery scope contract (the hardest constraint, and this plan's distinctive risk)

`design-gallery/build.mjs` does not bundle. It **injects source text into `app.js`'s top-level module scope**:

```
app = once(baseline, '\ninit();', '\n' + host + '\ninit();', 'host initialization');
```

`host` is `design-gallery/host-bridge.js` with nine slots filled from `prototype-prism/*.js`, `prototype/*.js` and `design-gallery/navy-adapter.js`. Those injected sources call `app.js`'s top-level functions directly by lexical scope. Measured on 2026-09-22 by identifier matching against the 250 top-level declarations:

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

The 53 at `1e0b6fd`: `ASSET_V`, `CATEGORIES`, `DATA_KEY`, `FEATURES`, `actionableCountsForViewer`, `actionableDepartmentForDuty`, `canManageAnyDepartment`, `categoryHasAssignments`, `conflictsFor`, `downloadICS`, `dutiesFor`, `esc`, `fb`, `feat`, `fmtDate`, `fmtTime`, `init`, `isForcedSession`, `isVerifiedSession`, `loadLocal`, `loadTag`, `manageDepartment`, `manageRequestVisible`, `manageServiceVisible`, `pad`, `pastServices`, `preferredScheduleService`, `render`, `renderCatRows`, `renderCreatePin`, `renderFeatures`, `renderManage`, `renderManageData`, `renderManagePeople`, `renderManagePlanning`, `renderManageRequests`, `renderManageServices`, `renderMy`, `renderSchedule`, `renderServiceCard`, `renderSiteLock`, `renderUnlock`, `requestIsActionable`, `seedState`, `selectedManageDepartment`, `siteUnlocked`, `songCtx`, `state`, `svcId`, `toISO`, `todayISO`, `ui`, `upcomingServices`.

**Settled rule.** After the split, `app.js` imports every name in that set into its own top-level scope, whether or not `app.js` itself calls it, so the injection point still resolves. A plain `import { esc, render, state } from ...` is enough: an imported binding is in the importing module's top-level scope and is a live binding, so `state` reassigned inside `core/state.js` is seen by the injected bridge exactly as it is today.

Enforced by `scripts/check-app-split.mjs --gallery`: it recomputes the union set from the injected sources at run time and fails if any name is missing from `app.js`'s top-level scope. That check is the thing that stops a split from silently breaking all four appearances at release time.

Two further build facts the plan must honor:

- `build.mjs` runs 13 `requireOne` anchors against `app.js` source text (`'use strict';`, `function renderMemberLogin()`, `function isVerifiedSession()`, `function songCtx()`, `data-act="member-login"`, and so on). Each anchor must be re-pointed at whichever module now holds it, and the two `once()` rewrites that patch `app.js` (`__designSettingsReady` seed, settings snapshot) must be re-pointed the same way. `design-gallery/app-fixes.mjs` has the same shape.
- `design-gallery/test.mjs` asserts the gallery build does not modify original source files, and hashes a `protectedNames` list that includes `app.js`. The new modules go on that list.

### Shared mutable state and setters

A module-level `let` lives in its owner module and is read elsewhere through the ES live binding. Section 0 lists every statement that assigns a `let` owned by a different module; each becomes a setter call with one added setter, and each goes into `scripts/check-app-split.allow.json` in the section that makes it. The allowlist is otherwise empty. Known cases at `1e0b6fd`: `sharedNameMap` (assigned in `initFirebase`, owned by `core/constants.js`) and `setlistIndex` (assigned in the song listener, owned by `views/songs.js`).

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
for f in app.js core/*.js views/*.js actions/*.js shared/*.js layouts/*.js; do node --check "$f" || exit 1; done
```

```
git diff --stat main -- index.html song-app.css styles/
```

Pass conditions: every command exits zero; the `node --test` and `design-gallery/test.mjs` counts never drop below the previous section's; the last command is empty unless that section's manifest says otherwise. `design-gallery/test.mjs` needs Playwright's Chromium and must run outside the macOS sandbox, per AGENTS.md.

---

## Model, effort, agent and reviewer choices

Utilization is read live from `/Users/anthony/Projects/ai-usage-dashboard/data/status.json` at every dispatch, never from this file. The reading on 2026-09-22 at 20:47Z was: Claude weekly 80 percent, Fable weekly 97 percent, Codex primary 95 percent, Gemini weekly 67 percent. This plan does not start for at least several days, so those numbers are an example, not a routing input.

| Role | Choice | Why |
|---|---|---|
| Plan author | Opus 5 · xhigh (this chat) | Routing table: plan authoring |
| Controller, integration, Section 0 and 6 | Opus 5 · high | Routing table: adjudication and completion boundary; this repository is a church app holding real people's data |
| Writer, Sections 1 to 5 | `gpt-5.6-luna` · high via `codex-dispatch` | Routing table default implementer. Spill order when Codex `primary` is at or above 80 percent: Sonnet 5 · high as a Claude helper in the same worktree. **Gemini 3.8 Flash is skipped as a writer here**: Antigravity's headless gate cannot read worktree files, and every section of this plan runs in a worktree |
| Section review, round 1 | Haiku 4.5 · low hygiene sweep, then Sonnet 5 · high read-only | The writer never grades its own work. Codex-written diffs are reviewed Claude-side |
| Section review, round 2 | Sonnet 5 · high, fresh instance, read-only, on Sections 4 and 5 only | Blast radius: a church app real people use gets two landing rounds. Sections 4 and 5 move rendering and the action dispatcher, where a careless move shows |
| Completion review | Opus 5 · high, fresh, read-only, one round | Full-plan completion boundary on a production surface holding other people's data |
| Plan critic (Lane 0) | `gpt-5.6-sol` · high, read-only (fallback Sonnet 5 · high) | Plan-review gate: three or more sections |
| Parity baselines and browser walkthroughs | The coordinating Claude chat | Playwright and screenshot glue is coordinator work, not a writer's |

Runner: **sequential, Steps mode** (Anthony's choice, 2026-09-22). Every section edits `app.js`, so there is one writer at a time and one plan unit per fresh chat. Lane 0 is the only concurrent unit, and it is read-only; it launches from the Section 1 chat.

---

## Sections

### Lane 0: Plan critic

Setup: frontier · high · Lane: Codex (read-only) · Review: none
  Codex: `gpt-5.6-sol` · high (fallback: Claude Sonnet 5 · high)
  Claude: Sonnet 5 · high (fallback)
Worktree: none, read-only
Depends on: Section 0 complete (launches alongside Section 1)
Agents: none
Reviewers: none (this lane is the critic)

Argue against this plan: missing decisions, unsafe assumptions, untestable acceptance, rollback gaps, and any section too ambiguous for an executor to run without asking. Pay particular attention to the gallery scope contract and to whether the parity harness can actually distinguish a broken split from a passing one. Write findings to `docs/runs/2026-09-22-app-js-split/research/L0-critique.md`. Advice only; accepted findings become revised sections before the completion review.

### Section 1: Safety net before any code moves

Setup: frontier · high · Lane: Codex · Review: controller
  Codex: executor `gpt-5.6-luna` · high (fallback: `gpt-5.6-terra` · high)
  Claude: Sonnet 5 · high (spill writer if Codex `primary` is at or above 80 percent)
Worktree: `/Users/anthony/.claude/worktrees/2026-09-22-app-js-split/S1`
Depends on: Section 0
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

Setup: frontier · high · Lane: Codex · Review: controller
  Codex: executor `gpt-5.6-luna` · high (fallback: `gpt-5.6-terra` · high)
  Claude: Sonnet 5 · high (spill writer)
Worktree: `/Users/anthony/.claude/worktrees/2026-09-22-app-js-split/S2`
Depends on: Section 1 merged
Agents: none
Reviewers: controller=Sonnet 5 · high; independent=none
Hygiene: Haiku 4.5 · low sweep before review

Create `core/constants.js`, `core/format.js`, `core/conflicts.js`, `core/planning.js` and `core/sheet-parse.js`. These import nothing from other split modules except `core/format.js` and `core/constants.js`, so they are acyclic by rule. `app.js` imports them. The `sharedNameMap` setter is added here if `initFirebase` is the only writer, and goes in the allowlist.

This is also the section that re-points the first `build.mjs` anchors, because `'use strict';` and the choir-song anchors move. Update `build.mjs`, `app-fixes.mjs` and the `protectedNames` list in the same commit as the move.

Acceptance: every verification command passes; the manifest check passes with these five modules created and everything else still in `app.js`; the allowlist holds at most the `sharedNameMap` setter; all 40 screenshots and every DOM fact match the baseline; `node design-gallery/build.mjs` succeeds and its output `app.js` still contains every injected slot resolved. Undo: revert the section's merge.

### Section 3: Move state, departments, sync, notifications, calendar and session

Setup: frontier · high · Lane: Codex · Review: controller
  Codex: executor `gpt-5.6-luna` · high (fallback: `gpt-5.6-terra` · high)
  Claude: Sonnet 5 · high (spill writer)
Worktree: `/Users/anthony/.claude/worktrees/2026-09-22-app-js-split/S3`
Depends on: Section 2 merged
Agents: none
Reviewers: controller=Sonnet 5 · high; independent=none
Hygiene: Haiku 4.5 · low sweep before review

Create `core/state.js`, `core/auth.js`, `core/departments.js`, `core/schedule.js`, `core/notify.js`, `core/sheet-sync.js`, `core/calendar.js` and `core/session.js`. `state` and the Firebase handle become live bindings exported from `core/state.js`; nothing outside that module may assign them, and Section 0's setter list names any statement that does.

This is the largest data move and the one that touches department permissions, so the reviewer specifically re-checks that every permission guard (`canPermission`, `authorizedDepartments`, `canManageSelectedDepartment`, `departmentProfileAssignable`) still sits on the same call paths.

Acceptance: every verification command passes; the manifest check passes with these eight added; the gallery check passes; all 40 screenshots and every DOM fact match; the load-effects fixture matches; `node --test tests/*.test.mjs` count never drops. Undo: revert the section's merge.

### Section 4: Move rendering

Setup: frontier · high · Lane: Codex · Review: controller plus one independent round
  Codex: executor `gpt-5.6-luna` · high (fallback: `gpt-5.6-terra` · high)
  Claude: Sonnet 5 · high (spill writer)
Worktree: `/Users/anthony/.claude/worktrees/2026-09-22-app-js-split/S4`
Depends on: Section 3 merged
Agents: none
Reviewers: controller=Sonnet 5 · high; independent=Sonnet 5 · high, fresh instance, read-only
Hygiene: Haiku 4.5 · low sweep before review

Create `views/shell.js`, `views/schedule.js`, `views/songs.js`, `views/requests.js`, `views/manage.js` and `views/departments.js`. Rendering is where a careless move shows, so the 40 screenshots and the DOM facts are the deciding check here, not the unit tests.

Roughly 30 of the 53 gallery scope names are rendering functions, so `--gallery` is doing most of its work in this section. Expect the `build.mjs` anchor updates for `renderMemberLogin`, `renderForcedPinChange` and the `data-act` markers to land here.

Acceptance: every verification command passes; the manifest check passes with these six added; the gallery check passes with the full union set present in `app.js`'s scope; all 40 screenshots match within the threshold and every DOM fact is identical; both review rounds close. Undo: revert the section's merge.

### Section 5: Move the action dispatcher

Setup: frontier · high · Lane: Codex · Review: controller plus one independent round
  Codex: executor `gpt-5.6-luna` · high (fallback: `gpt-5.6-terra` · high)
  Claude: Sonnet 5 · high (spill writer)
Worktree: `/Users/anthony/.claude/worktrees/2026-09-22-app-js-split/S5`
Depends on: Section 4 merged
Agents: none
Reviewers: controller=Sonnet 5 · high; independent=Sonnet 5 · high, fresh instance, read-only
Hygiene: Haiku 4.5 · low sweep before review

Create `actions/dispatch.js` as one module (`canRunAction`, `handleAct`, `handleChg`, `applyNameMap`, `saveRoleConfiguration` and the lookup helpers). `handleAct` is a single large string-keyed switch and moves whole; it is not subdivided. `app.js` is left with the import block, the gallery scope contract, `setSyncPill`, `pulse`, `initFirebase`, `init` and the `init()` call.

The reviewer re-checks that every `data-act` and `data-field` string is byte-identical to the baseline, since those strings are the app's entire event contract and `build.mjs` asserts two of them.

Acceptance: every verification command passes; the manifest check passes with every module created and `app.js` reduced to the keep-list; the allowlist holds exactly the setters Section 0 named and nothing else; all 40 screenshots and every DOM fact match; both review rounds close; `app.js` is under 400 lines. Undo: revert the section's merge.

### Section 6: Integration, documentation and completion review

Setup: frontier · high · Lane: Claude (controller) · Review: Opus 5, one round
  Claude: Opus 5 · high
Worktree: `/Users/anthony/.claude/worktrees/2026-09-22-app-js-split/S6`
Depends on: Section 5 merged
Agents: none
Reviewers: completion=Opus 5 · high, fresh, read-only, one round

1. Run the full verification set on merged `main` one more time, cold.
2. Write the shipped module map into `docs/CODE-INDEX.md` and `docs/HANDOFF.md`, and add a README quick link. Update `docs/FEATURE-MAP.json` where it names `app.js`.
3. Update `/Users/anthony/Projects/README.md`'s worship duty line only if its status text is now wrong. No dated notes in the index.
4. Record the rollback table: each section's merge commit, and the rule that reverting goes newest first down to the target section, because later sections import earlier modules.
5. Private GitHub backup of the branch.
6. Completion review by a fresh Opus 5, read-only. Accepted findings are corrected by the controller and the verification set is rerun; a second Opus round is not launched.

**No deploy.** The plan ends at a merged, verified `main`. Anthony decides separately whether and when to release through `design-gallery/release.mjs`.

Acceptance: every verification command passes on `main`; the documents above are current with working links; the backup is pushed and verified private; the completion review closes with no blocking-class finding open. Undo: revert the section's merge; the code rollback table covers Sections 2 to 5.

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
| The compact phone plan is not actually finished when this starts | Section 0's three conditions, confirmed with command output in the Build log |

---

## Build log

- 2026-09-22: Plan written by Opus 5 in a planning chat, no runtime code. Sequencing investigated first, per the gate in the kickoff. Findings recorded in Section 0: the compact phone plan's Section 2 is complete but **unmerged** on `claude/compact-runtime` (`a1246a6`, `db8f610`), Section 3 is reviewed on `claude/compact-server`, and Sections 4, 5A, 5B and 6 are outstanding. Section 2 already changed `app.js` by 814 lines, removed 340 lines from `index.html`, rewrote `design-gallery/build.mjs` by 303 lines into a directory copier, deleted `design-gallery/choice.js`, and created `shared/`, `layouts/` and `styles/`. Section 4 writes role screens into those same files. Decision: **this plan waits for compact phone Section 6**, on three grounds recorded in Section 0 (same-file ownership, an invalid parity baseline, and two writers on the release build). No bounded piece was found that provably cannot collide.

- 2026-09-22: Interfaces measured against `codex/compact-phone-refactor@1e0b6fd`, marked provisional because the compact phone plan will change `app.js` before this plan starts. Measured facts: 4,314 lines, 250 top-level declarations, 20 module-level `let` bindings, zero `export` statements, zero `window.` assignments, `type="module"` entry. Existing safety net found: `design-gallery/test.mjs` runs 103 checks across all four appearances in real Chromium with a mocked Firebase SDK, blocked external requests and fictional member fixtures, and asserts the gallery build does not modify source files. Four test files read `app.js` as source text.

- 2026-09-22: Gallery scope contract discovered and quantified, the plan's distinctive risk. `design-gallery/build.mjs` injects `host-bridge.js` plus nine filled slots into `app.js`'s top-level module scope immediately before `init();`, so the injected code reaches `app.js`'s functions lexically. Identifier matching against the 250 declarations found **53 distinct names** reached by the injected sources across eight files, listed in Interfaces. Settled rule: `app.js` re-imports every name in that union into its own top-level scope, enforced by `scripts/check-app-split.mjs --gallery`, which recomputes the set at run time. Without this, a correct-looking split would pass every unit test and break all four appearances only at release.

- 2026-09-22: Record tree created at `docs/runs/2026-09-22-app-js-split/`. Anthony chose **Steps** mode: one plan unit per fresh chat, Section 0 first, and Section 0 does not open until the compact phone plan's Section 6 has merged and released. Anthony also authorized committing the plan, record tree and document links onto `codex/compact-phone-refactor`. No implementation started and no follow-on chat opened.

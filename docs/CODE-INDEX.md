# Worship Duty code index

This is a navigation aid for the compact-phone refactor. As of 2026-09-17, Section 2 (shared runtime) and Section 3 (server workflows) are **built and reviewed on their own lane branches**, not yet merged into the integration branch (`codex/compact-phone-refactor`). Section 4 (role screens) has not started. This worktree (`codex/compact-index`, Section 5B) only has the plan and doc files checked out; the built runtime and server code described below lives in the two lane worktrees named next to each entry, and the claims here are checked against those worktrees' actual files and git history, not copied from memory.

See `docs/FEATURE-MAP.json` for the structured version of everything in this file, including the full four-layout placement table.

## Start here

1. `docs/PLAN-COMPACT-PHONE-REFACTOR.md` — the approved plan, decisions, ownership, and Build log.
2. `docs/runs/compact-phone-refactor/decisions/S2-LAYOUT-INTERFACE.md` — binding shared-runtime architecture (Fable ruling, 2026-09-16).
3. `docs/runs/compact-phone-refactor/decisions/S3-SERVER-INTERFACE.md` and `S3-MEMBERSHIP-INTERFACE.md` — binding server-workflow architecture (Fable rulings, 2026-09-16 and 2026-09-17).
4. Legacy runtime still live in production: `app.js`, `song-app.js`, `song-lib.js`, `permissions.js`, `department-profile.js`, `department-workflows.js`, `functions/index.js`, `functions/member-auth.js`, `functions/department-auth.js`, `functions/department-handlers.js`, `design-gallery/build.mjs`.

## Section 2: shared runtime foundation — built, not merged

Branch `claude/compact-runtime`, worktree `/Users/anthony/Projects/worship-duty-app-worktrees/compact-runtime`. Commits `a1246a6` (foundation) and `db8f610` (review corrections). Lane record populated at `docs/runs/compact-phone-refactor/lanes/S2.md` inside that worktree (the copy in this worktree is still the original unfilled template — the two worktrees have independent copies of that file on different branches).

| Path (in the compact-runtime worktree) | Purpose | Status |
| --- | --- | --- |
| `appearance-boot.js` | Classic script, first in `<head>`; pre-paint appearance selection, no Original-then-switch repaint | built |
| `shared/state.js` | Route store, per-route memory, drafts, pending saves, unsaved-edit guard, pending destination | built |
| `shared/nav.js` | `buildNavigation(account)`: main destinations and secondary tabs from capabilities | built |
| `shared/save-state.js` | `createSave({ key, run })`: Unsaved/Saving/Saved/Failed/Stale controller | built |
| `shared/components.js` | Pure HTML-string components (`mainNav`, `secondaryTabs`, `pager`, `saveBar`, `memberPicker`, etc.) | built |
| `shared/screens.js` | Screen registry; `buildScheduleInfo`, `buildAppearanceInfo` implemented; role-screen builders are Section 4 scope | partially built |
| `shared/shell.js` | `startShell(host)`: render loop, delegated events, history, layout dispatch | built |
| `layouts/original.js`, `layouts/prism.js`, `layouts/navy.js`, `layouts/aurora.js`, `layouts/_common.js` | One explicit renderer per appearance, per the layout renderer contract in `S2-LAYOUT-INTERFACE.md` section 5 | built |
| `layouts/index.js` | Registry plus `verifyLayouts()`, which the gallery build runs and fails on a gap | built |
| `styles/shared.css`, `styles/legacy.css`, `styles/original.css`, `styles/prism.css`, `styles/navy.css`, `styles/aurora.css` | Shared controls, a legacy-bridge stylesheet, then one arrangement sheet per appearance | built |

Screens shipped in all four layouts: `#schedule` (read-only Weekbook: search, month navigation, week groups, restored month/scroll), `#appearance`, `#unavailable`, and the six startup phases (maintenance, locked, signin, forcedPin, loading, recovery). My duties, Manage, and the Presider planner still run through one `legacy` compatibility screen (`.wd-legacy`, wrapping the existing `renderMy`/`renderManage`/`renderSongs` output) until Section 4 replaces them screen by screen — this is the one compatibility wrapper the plan allows.

Known limitations recorded by the writer: lock/sign-in/PIN screens reuse the Original card inside each appearance frame rather than four bespoke cards; Prism/Aurora live light/dark and motion toggles were not rebuilt (not in the approved prototype, open item for Anthony before Section 6); `design-gallery/test.mjs` and `live-design/` target the retired compiler and are superseded, not repaired.

## Section 3: server workflows — built, not merged

Branch `claude/compact-server`, worktree `/Users/anthony/Projects/worship-duty-app-worktrees/compact-server-claude`. Commits `1083e4b` (server workflows) and `fdd8dd8` (Build log record). Lane record populated at `docs/runs/compact-phone-refactor/lanes/S3.md` inside that worktree.

An earlier, superseded first pass at Section 3 (membership module only, `gpt-5.6-luna`) exists on branch `codex/compact-server` / worktree `compact-server`; its `S3.md` there is stale and describes only the membership module, not the complete section. `claude/compact-server` is the complete, reviewed build.

| Path (in the compact-server-claude worktree) | Purpose | Status |
| --- | --- | --- |
| `functions/revision.js` | Pure. `currentRevision`, `nextRevision`, `assertFresh` — the version-aware-save primitive shared by every write path | new, built |
| `functions/song-history.js` | Pure server copies of `song-lib.js`'s `serviceIdFor`/`recompute`/`applySung`/`removeHistoryEntry`, plus `applyCorrection`; does not `require` the root `song-lib.js` | new, built |
| `functions/compact-workflows.js` | Factory `createCompactWorkflowHandlers({ db, now, permissionConfig, logger })`: `saveMemberAvailability`, `resolveDutyAttention`, `saveSongService`, `correctSongHistory`, `recordSongHistory` | new, built |
| `functions/compact-membership.js` | `searchDepartmentCandidates`, `createDepartmentInvitation`, `revokeDepartmentInvitation`, `acceptDepartmentInvitation` (earlier bounded unit, per `S3-MEMBERSHIP-INTERFACE.md`) | built |
| `functions/department-auth.js` | Extended: `revision` in `PROFILE_METADATA_FIELDS`/`PROFILE_ALLOWED_FIELDS`; exported `effectiveAvailability` (grep-confirmed, line 25) | extended |
| `functions/department-handlers.js` | Extended: `updateProfile` transactional with `assertFresh`/`revision`; assignment primitives accept `expectedRevision`/`expectedMemberName`, bump `schedule/{id}.assignmentRevisions[duty]`, return `revision` | extended |
| `functions/index.js` | Extended: `exposeDepartmentCallable` forwards `error.details`; wires `saveMemberAvailability`/`resolveDutyAttention`/`saveSongService`/`correctSongHistory` (grep-confirmed, lines 417-427); adds `songHistoryRecorder` (`onSchedule`, every 30 minutes, line 434); `reconcileScheduleAssignmentProjection` gains marker self-healing | extended |
| `firestore.rules` | `revision` added to `departmentProfileKeysSafe` and `assignmentKeysSafe` allowlists (grep-confirmed, lines 381, 629) | extended |

Verification: 56/56 existing `functions/test/*.test.js` passing unchanged, `node --check` on every changed file, and a hand-written in-memory Firestore/transaction smoke script (not the real emulator — no Java on this Mac) covering revision bumps, stale-write rejection, conflict acknowledgement, the availability Needs-replacement fan-out, automatic-recorder idempotency, and corrections. No live/authenticated walkthrough — Section 3 ships no client-observable behavior by itself. Not deployed, no production writes, no migrations. Full callable input/output shapes and the Needs-attention predicate table are in `docs/runs/compact-phone-refactor/decisions/S3-SERVER-INTERFACE.md` (read that file directly rather than duplicating its tables here).

## Section 4: role screens — not shipped

Not started as of this indexing pass; the task brief says it is running in parallel elsewhere. Its target shape is fully specified by `S2-LAYOUT-INTERFACE.md` section 5 (layout renderer contract) and `S3-SERVER-INTERFACE.md` section 5 (callables ready to consume), but no client information builders, layout screens, or routes beyond the Section 2 three exist yet. See `docs/FEATURE-MAP.json` → `four_layout_placement` for the per-route built/legacy-bridge/planned table.

## Legacy runtime (still live in production, unchanged by Sections 2-3)

| Area | Current source and symbols | Data or action boundary |
| --- | --- | --- |
| Access and startup | `app.js` `render`, `renderSiteLock`, `renderMemberLogin`, `renderForcedPinChange`, `memberLogin`, `memberChangePin`, `memberLogout`, `init`, `initFirebase` | Site passcode and verified member session gate the visible app. `fbWrite` rejects writes without a verified session or while a forced PIN remains. |
| Roles and scope | `app.js` `authActor`, `permissionConfig`, `canPermission`, `authorizedDepartments`, `canManageAnyDepartment`; `permissions.js` `createPermissions`, `canManageDepartment`, `canEditDuty`, `canEditSongs` | Browser checks are presentation/action guards; Firestore rules and callable authorization remain the security boundary. |
| Schedule (legacy adapters) | `app.js` `sortedServices`, `upcomingServices`, `pastServices`, `preferredScheduleService`, `renderSchedule`, `renderServiceCard`, `renderMaintenanceSchedule` | Superseded for `#schedule` by `shared/screens.js` `buildScheduleInfo` in Section 2, not yet merged. |
| Own duties | `app.js` `dutiesFor`, `renderMy`, `renderYourRequests`, `checkNewDuties`, `checkReminders` | Reachable today through the Section 2 `.wd-legacy` bridge once merged; Section 4 scope to replace. |
| Availability and profiles | `app.js` `normalizeDepartmentProfile`, `loadDepartmentRoster`, `loadOwnDepartmentProfiles`, `departmentPatch`, `saveDepartmentProfile`, `saveOwnDepartmentAvailability`; `department-profile.js` `normalizeDepartmentProfile`, `updateDepartmentProfile`, `effectiveAvailability`, `isAvailable` | Server side extended in Section 3 (`saveMemberAvailability`); client-side still legacy until Section 4. |
| Assignment | `app.js` `departmentAssignmentPayload`, `assignDepartmentDutyForService`, `unassignDepartmentDutyForService`, `applyScheduleAssignment`; `department-workflows.js` `departmentForDuty`, `activeDepartmentMembers`; `functions/department-handlers.js` assignment handlers | Server side extended in Section 3 with the revision contract; client callers not yet updated. |
| Requests and conflicts | `app.js` `conflictsFor`, `activeConflicts`, `findPendingRequest`, `requestIsActionable`, `effectiveRequestStatus`, `actionableCountsForViewer`, `renderManageRequests`, `renderManageConflicts`; `department-workflows.js` `createChangeRequest`, `transitionRequestStatus`, `composeConflicts`, `actionableCounts` | Server side gains `resolveDutyAttention` in Section 3 (atomic); the multiple client-side count implementations remain the drift point Section 4 must resolve into one predicate table (`S3-SERVER-INTERFACE.md` section 2.1). |
| Presider host | `app.js` `loadSongAssets`, `loadSongApp`, `songCtx`, `renderSongs`, `canEditSongService`, `canManagePresiders` | Server side gains `saveSongService`/`correctSongHistory`/`songHistoryRecorder` in Section 3; client (`song-app.js`) not yet wired. |
| Persistence | `app.js` `saveLocal`, `loadLocal`, `persistService`, `persistMembers`, `persistSettings`, `persistDepartments`, `persistRequest`, `persistAll`, `fbWrite`, `afterDataChange` | Local fallback uses `wds-data-v2`. Live writes use Firestore and require a verified session. |

## Server and storage map (legacy, extended by Section 3 where noted)

| Capability | Source symbols | Durable paths |
| --- | --- | --- |
| Member authentication | `functions/index.js` `verifyMemberPin`, `changeMemberPin`, `resetMemberPin`, `readCurrentAccount`, `callableActor`; `functions/member-auth.js` `createMemberAuthCallables` | `accounts/{memberId}`, Firebase Auth custom-token session |
| Department authorization | `functions/department-auth.js` `authorizeProfileRead`, `authorizeProfileUpdate`, `authorizeAssignment`, `authorizeAssignmentOverride` (extended with `revision`, Section 3); `functions/department-handlers.js` `createDepartmentHandlers`, `listDepartmentRoster`, `updateDepartmentProfile`, `updateMemberAvailability`, assignment handlers | `departments/{department}/members/{memberUid}` (+`revision`), `departmentAssignments/{assignmentId}` (+`revision`), `audit` |
| Membership and invitations | `functions/compact-membership.js` `searchDepartmentCandidates`, `createDepartmentInvitation`, `revokeDepartmentInvitation`, `acceptDepartmentInvitation` (Section 3) | `departmentInvitations/{tokenDigest}` |
| Compact workflows (Section 3) | `functions/compact-workflows.js` `saveMemberAvailability`, `resolveDutyAttention`, `saveSongService`, `correctSongHistory`, `recordSongHistory`; `functions/revision.js`; `functions/song-history.js` | `schedule/{id}.needsReplacement`, `schedule/{id}.assignmentRevisions`, `setlists/{id}` (+provenance fields), `songStats/{songId}.history[]` (+`source`) |
| Sheet import | `app.js` `parseCSV`, `sheetRowsToServices`, `mergeSheetServices`, `syncFromSheet`; `functions/sheet-lib.js`; `functions/index.js` `scheduledSheetSync` | Published Google Sheet is input; Firestore `schedule` is runtime source; no Firestore-to-Sheet write path |
| Push and reminders | `app.js` `registerPush`, `unregisterPush`, `sysNotify`, `checkNewDuties`, `checkReminders`; `functions/index.js` `onScheduleWrite`, `dutyReminders`, `loadTokenTargets`, `sendToTargets` | `tokens/{fcmToken}`, `sent/{markerId}` |
| Request routing | `functions/index.js` `onRequestCreated`, `onRequestResolved`; `department-workflows.js` `routeRequest`, `routeChangeRequest` | `requests/{requestId}` (+`assignmentId` on Section 3 resolutions) |
| Calendar | `app.js` `downloadICS`, `subscribeICS`, `icsFeedUrl`; `functions/index.js` `ics`; `functions/ics-lib.js` | Hosting rewrite `/ics/{member}` |
| Song history | `song-app.js` `updateSetlist`, `confirmSetlist`, `markSetlistSung`, `undoSetlistSung`, `ensureSetlist`; `song-lib.js` `serviceIdFor`, `applySung`, `applyUndo`, `applyBackfill`, `removeHistoryEntry` | `setlists/{serviceId}`, `songStats/{songId}` |
| Rules | `firestore.rules` `match /schedule/{scheduleId}`, `match /requests/{requestId}`, department profile and assignment matches (extended with `revision`, Section 3) | Rules constrain direct reads/writes; trusted Functions perform server workflows |

## Current four appearances (legacy adapters, pre-Section-2)

The `design-gallery/README.md` in the main checkout is the current source of truth for the live four-choice integration until Section 2 merges. `design-gallery/choice.js` is the chooser/switch boundary today; Section 2's `appearance-boot.js` and `shared/state.js` replace it once merged.

## Compact design prototype (Section 1, handoff only)

`docs/design/prototype/compact-phone/` (Weekbook direction, four appearances, role screen studies) is the visual authority Sections 2 and 4 build against — reference only, never read or extracted at runtime. See `docs/COMPACT-DESIGN-HANDOFF.md` when present (5A-owned) and `docs/runs/compact-phone-refactor/lanes/S1.md`.

## Plan and operating docs

- `docs/PLAN-COMPACT-PHONE-REFACTOR.md` — approved decisions, ownership, planned interfaces, verification, and Build log.
- `docs/HANDOFF.md` — live architecture and release history.
- `docs/FEATURES.md` — shared settings and feature gates.
- `docs/USER-JOURNEYS.md` — observable member, presider, and coordinator flows.
- `docs/PLAYBOOK.md` — operations and release procedures.
- `docs/runs/compact-phone-refactor/decisions/S2-LAYOUT-INTERFACE.md` — Section 2/4 binding architecture.
- `docs/runs/compact-phone-refactor/decisions/S3-SERVER-INTERFACE.md`, `S3-MEMBERSHIP-INTERFACE.md` — Section 3/4 binding architecture.
- `docs/runs/compact-phone-refactor/lanes/S2.md` (in the compact-runtime worktree), `S3.md` (in the compact-server-claude worktree) — full result/verification records for the built sections.
- `docs/runs/compact-phone-refactor/lanes/S5B.md` — this indexing lane's own record.

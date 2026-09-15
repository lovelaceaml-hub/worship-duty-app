# Worship Duty code index

This is a navigation aid for the approved compact-phone refactor. It records current source boundaries and symbols. The compact runtime interfaces described in the plan are planned work, not existing modules.

## Start here

1. [app.js](../app.js) owns browser state, access gates, schedule rendering, writes, notifications, and event delegation.
2. [song-app.js](../song-app.js) is the lazy Presider module. [song-lib.js](../song-lib.js) is the pure history and setlist helper shared with the Signal ingest daemon.
3. [permissions.js](../permissions.js), [department-profile.js](../department-profile.js), and [department-workflows.js](../department-workflows.js) define browser-side permission, profile, roster, request, conflict, and attention rules.
4. [functions/index.js](../functions/index.js), [functions/member-auth.js](../functions/member-auth.js), [functions/department-auth.js](../functions/department-auth.js), and [functions/department-handlers.js](../functions/department-handlers.js) are the server callables, triggers, scheduled jobs, and authorization boundary.
5. [design-gallery/build.mjs](../design-gallery/build.mjs) assembles the current four-appearance Hosting candidate from the shared runtime and adapter sources.

## Shared browser runtime

| Area | Current source and symbols | Data or action boundary |
| --- | --- | --- |
| Access and startup | [app.js](../app.js) `render`, `renderSiteLock`, `renderMemberLogin`, `renderForcedPinChange`, `memberLogin`, `memberChangePin`, `memberLogout`, `init`, `initFirebase` | Site passcode and verified member session gate the visible app. `fbWrite` rejects writes without a verified session or while a forced PIN remains. |
| Roles and scope | [app.js](../app.js) `authActor`, `permissionConfig`, `canPermission`, `authorizedDepartments`, `canManageAnyDepartment`; [permissions.js](../permissions.js) `createPermissions`, `canManageDepartment`, `canEditDuty`, `canEditSongs` | Browser checks are presentation and action guards. Firestore rules and callable authorization remain the security boundary. |
| Schedule | [app.js](../app.js) `sortedServices`, `upcomingServices`, `pastServices`, `preferredScheduleService`, `renderSchedule`, `renderServiceCard`, `renderMaintenanceSchedule` | Reads `schedule` documents. The shared Pacific-time default is current code, while each appearance still arranges selection and cards separately. |
| Own duties | [app.js](../app.js) `dutiesFor`, `renderMy`, `renderYourRequests`, `checkNewDuties`, `checkReminders` | Uses `ui.me`, `wds-me`, schedule assignments, local alert keys, and own profile data. |
| Availability and profiles | [app.js](../app.js) `normalizeDepartmentProfile`, `loadDepartmentRoster`, `loadOwnDepartmentProfiles`, `departmentPatch`, `saveDepartmentProfile`, `saveOwnDepartmentAvailability`; [department-profile.js](../department-profile.js) `normalizeDepartmentProfile`, `updateDepartmentProfile`, `effectiveAvailability`, `isAvailable` | Secure UID-keyed profile data is loaded through department callables in live mode. Local mode builds a clearly weaker fallback roster. |
| Assignment | [app.js](../app.js) `departmentAssignmentPayload`, `assignDepartmentDutyForService`, `unassignDepartmentDutyForService`, `applyScheduleAssignment`; [department-workflows.js](../department-workflows.js) `departmentForDuty`, `activeDepartmentMembers`; [functions/department-handlers.js](../functions/department-handlers.js) assignment handlers | Normal assignment requires active, eligible, schedulable, available profile and avoids same-service double duty. Override carries a reason and is separately authorized. |
| Requests and conflicts | [app.js](../app.js) `conflictsFor`, `activeConflicts`, `findPendingRequest`, `requestIsActionable`, `effectiveRequestStatus`, `actionableCountsForViewer`, `renderManageRequests`, `renderManageConflicts`; [department-workflows.js](../department-workflows.js) `createChangeRequest`, `transitionRequestStatus`, `composeConflicts`, `actionableCounts` | Requests remain in history. A request stops being actionable when the requested duty no longer belongs to the requester. A prayer plus usher pair is the intentional conflict exception. |
| Presider host | [app.js](../app.js) `loadSongAssets`, `loadSongApp`, `songCtx`, `renderSongs`, `canEditSongService`, `canManagePresiders` | Mounts `song-app.js` into `#song-root`, passes shared Firebase, member, service, name-map, and authorization context. |
| Persistence | [app.js](../app.js) `saveLocal`, `loadLocal`, `persistService`, `persistMembers`, `persistSettings`, `persistDepartments`, `persistRequest`, `persistAll`, `fbWrite`, `afterDataChange` | Local fallback uses `wds-data-v2`. Live writes use Firestore documents and require the verified session. `persistAll` batches seed/import writes. |

## Server and storage map

| Capability | Source symbols | Durable paths |
| --- | --- | --- |
| Member authentication | [functions/index.js](../functions/index.js) `verifyMemberPin`, `changeMemberPin`, `resetMemberPin`, `readCurrentAccount`, `callableActor`; [functions/member-auth.js](../functions/member-auth.js) `createMemberAuthCallables` | `accounts/{memberId}`, Firebase Auth custom-token session |
| Department authorization | [functions/department-auth.js](../functions/department-auth.js) `authorizeProfileRead`, `authorizeProfileUpdate`, `authorizeAssignment`, `authorizeAssignmentOverride`; [functions/department-handlers.js](../functions/department-handlers.js) `createDepartmentHandlers`, `listDepartmentRoster`, `updateDepartmentProfile`, `updateMemberAvailability`, assignment handlers | `departments/{department}/members/{memberUid}`, `departmentAssignments/{assignmentId}`, `audit` |
| Leader and membership administration | [functions/index.js](../functions/index.js) `updateDepartmentMembership`, `updateRoleConfiguration`; [permissions.js](../permissions.js) `canManageLeaders`, `canManageDepartmentMember` | `app/departments`, `memberships`, `app/leaderConfig`, `app/roles` |
| Sheet import | [app.js](../app.js) `parseCSV`, `sheetRowsToServices`, `mergeSheetServices`, `syncFromSheet`; [functions/sheet-lib.js](../functions/sheet-lib.js) `parseCSV`, `sheetRowsToServices`, `planMerge`; [functions/index.js](../functions/index.js) `scheduledSheetSync` | Published Google Sheet is input. Firestore `schedule` is runtime source. |
| Push and reminders | [app.js](../app.js) `registerPush`, `unregisterPush`, `sysNotify`, `checkNewDuties`, `checkReminders`; [functions/index.js](../functions/index.js) `onScheduleWrite`, `dutyReminders`, `loadTokenTargets`, `sendToTargets` | `tokens/{fcmToken}`, `sent/{markerId}`, local `wds-alerts`, `wds-seen`, and `wds-unread` keys |
| Request routing | [functions/index.js](../functions/index.js) `onRequestCreated`, `onRequestResolved`; [department-workflows.js](../department-workflows.js) `routeRequest`, `routeChangeRequest` | `requests/{requestId}`, scheduler and requester token targets |
| Calendar | [app.js](../app.js) `downloadICS`, `subscribeICS`, `icsFeedUrl`; [functions/index.js](../functions/index.js) `ics`; [functions/ics-lib.js](../functions/ics-lib.js) `buildIcsForMember`, `dutiesForMember` | Hosting rewrite `/ics/{member}` reads schedule and name map |
| Song history | [song-app.js](../song-app.js) `updateSetlist`, `confirmSetlist`, `markSetlistSung`, `undoSetlistSung`, `ensureSetlist`, `syncPresiderSchedule`; [song-lib.js](../song-lib.js) `serviceIdFor`, `applySung`, `applyUndo`, `applyBackfill`, `removeHistoryEntry` | `setlists/{serviceId}`, `songStats/{songId}`, `app/presiders`, `app/songEditors` |
| Rules | [firestore.rules](../firestore.rules) `match /schedule/{scheduleId}`, `match /requests/{requestId}`, department profile and assignment matches, notification and token matches | Rules constrain direct reads and writes. Trusted Functions perform server workflows and projection writes. |

## Current four appearances

The [design gallery README](../design-gallery/README.md) is the current source of truth for the four-choice integration. The older [live-design README](../live-design/README.md) describes the earlier two-choice candidate and is historical.

| Appearance | Current adapter sources | Existing transform and drift boundary |
| --- | --- | --- |
| Original | [app.js](../app.js), [index.html](../index.html) | Direct `render()` dispatches `renderSchedule`, `renderMy`, `renderSongs`, and `renderManage`. Inline styles and base markup are the reference controls. |
| Prism | [prototype-prism/prism.js](../prototype-prism/prism.js), [prototype-prism/all-pages.js](../prototype-prism/all-pages.js), [prototype-prism/song-pages.js](../prototype-prism/song-pages.js) | `design-gallery/build.mjs` compiles these into [design-gallery/host-bridge.js](../design-gallery/host-bridge.js). Prism owns `aui`, calendar and inspector markup, Manage page wrappers, and a song library layout. |
| Navy & Cream | [design-gallery/navy-adapter.js](../design-gallery/navy-adapter.js), [design-gallery/navy.css](../design-gallery/navy.css) | `NavyDesign.paint` prepends generated hero, date rail, time controls, and Manage headings, then hides or marks base cards. It computes its own assigned-duty and people counts. |
| Aurora | [prototype/aurora.js](../prototype/aurora.js), [prototype/workspaces.js](../prototype/workspaces.js), [prototype/presider-workspace.js](../prototype/presider-workspace.js) | `design-gallery/build.mjs` compiles these into the gallery host. Aurora replaces schedule rendering and wraps My Duties, Manage, and song renderers. It keeps a separate `aui` selection and context-rail metrics. |

The chooser and switch boundary is [design-gallery/choice.js](../design-gallery/choice.js), using `MODES`, `NAMES`, `migrate`, `change`, and `window.WorshipDesign`. [design-gallery/host-bridge.js](../design-gallery/host-bridge.js) preserves one DOM state and restores field values across switches. The plan's floating bottom navigation and compact secondary tabs are planned replacement interfaces, not current adapter behavior.

## Known drift points to check before changing runtime

- Counts are calculated in multiple places: `pendingRequestsCount` and `actionableCountsForViewer` in [app.js](../app.js), `actionableCounts` and `aggregateAuthorizedOutstanding` in [department-workflows.js](../department-workflows.js), plus adapter metrics in Prism, Navy, and Aurora.
- Schedule selection has one shared default helper but separate adapter state: `preferredScheduleService` in [app.js](../app.js), `aui` in Prism and Aurora, and `month`, `selected`, `full`, and `manualSelection` in [design-gallery/navy-adapter.js](../design-gallery/navy-adapter.js).
- Layout transforms are source-specific: Prism wraps renderer functions, Aurora replaces and wraps renderer functions, and Navy inserts generated DOM over base cards. A markup change can therefore affect one appearance only.
- The lazy song module has a separate `mount` and render contract. `songCtx()` in [app.js](../app.js) is the host interface for identity, schedule, Firebase, and authorization.
- Local department fallback profiles in [app.js](../app.js) do not carry the same security evidence as callable-backed UID profiles. Keep their source and state visible in any shared interface.

## Plan and operating docs

- [Complete compact-phone plan](PLAN-COMPACT-PHONE-REFACTOR.md), approved decisions, ownership, planned interfaces, verification, and Build log.
- [Handoff](HANDOFF.md), live architecture and release history.
- [Feature toggles](FEATURES.md), shared settings and feature gates.
- [User journeys](USER-JOURNEYS.md), observable member, presider, and coordinator flows.
- [Playbook](PLAYBOOK.md), operations and release procedures.
- [S5B lane record](runs/compact-phone-refactor/lanes/S5B.md), indexing ownership and coordinator result slot.

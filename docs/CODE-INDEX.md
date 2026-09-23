# Worship Duty code index

This is a navigation aid for the approved compact-phone refactor. It records current source boundaries and symbols. The compact runtime interfaces described in the plan are planned work, not existing modules.

## Start here

1. `app.js` is the entry script; as of the [app.js split](#the-appjs-split-2026-09-22) it imports 20 modules under `core/`, `views/` and `actions/` rather than owning everything itself.
2. [song-app.js](../song-app.js) is the lazy Presider module. [song-lib.js](../song-lib.js) is the pure history and setlist helper shared with the Signal ingest daemon.
3. [permissions.js](../permissions.js), [department-profile.js](../department-profile.js), and [department-workflows.js](../department-workflows.js) define browser-side permission, profile, roster, request, conflict, and attention rules.
4. [functions/index.js](../functions/index.js), [functions/member-auth.js](../functions/member-auth.js), [functions/department-auth.js](../functions/department-auth.js), and [functions/department-handlers.js](../functions/department-handlers.js) are the server callables, triggers, scheduled jobs, and authorization boundary.
5. [design-gallery/build.mjs](../design-gallery/build.mjs) assembles the current four-appearance Hosting candidate from the shared runtime and adapter sources.

## The app.js split (2026-09-22)

`app.js` was a single 4,314-line file. [PLAN-2026-09-22-APP-JS-SPLIT.md](PLAN-2026-09-22-APP-JS-SPLIT.md) split it into 21 ES modules with zero behavior change (its Build log is the full record of how). `app.js` is now 384 lines: an import block, the design-gallery monkey-patch shadow locals (below), and its own kept tail (`setSyncPill`, `pulse`, `initFirebase`, `init`).

| Module | Owns |
| --- | --- |
| [core/constants.js](../core/constants.js) | Categories, service labels, feature flags, site hash/unlock, shared name map |
| [core/format.js](../core/format.js) | Date/time/ID formatting helpers |
| [core/conflicts.js](../core/conflicts.js) | Duty conflict detection |
| [core/planning.js](../core/planning.js) | Coordinator Planning View math (workload, substitutes) |
| [core/sheet-parse.js](../core/sheet-parse.js) | Google Sheet CSV parsing |
| [core/state.js](../core/state.js) | `state`, `ui`, `departmentRuntime`, Firebase handle, persistence |
| [core/auth.js](../core/auth.js) | Permission and role scope helpers |
| [core/departments.js](../core/departments.js) | Department roster/profile/availability data and writes |
| [core/schedule.js](../core/schedule.js) | Service sorting and the shared Pacific-time default |
| [core/notify.js](../core/notify.js) | Banners, push, reminders |
| [core/sheet-sync.js](../core/sheet-sync.js) | Google Sheet auto-sync |
| [core/calendar.js](../core/calendar.js) | ICS export/subscribe |
| [core/session.js](../core/session.js) | Member login/PIN change/logout |
| [views/shell.js](../views/shell.js) | `render()` (the appearance-dispatch root), site lock, member login/forced-PIN screens |
| [views/schedule.js](../views/schedule.js) | Schedule tab rendering |
| [views/songs.js](../views/songs.js) | Presider song-picker host (`songCtx`, lazy `song-app.js` loader) |
| [views/requests.js](../views/requests.js) | Change-request and attention-count rendering |
| [views/manage.js](../views/manage.js) | Manage tab (services, planning, requests, people, features, data) |
| [views/departments.js](../views/departments.js) | Manage → Departments rendering |
| [actions/dispatch.js](../actions/dispatch.js) | `handleAct`/`handleChg`, the app's entire click/change event contract |

**The monkey-patch shadow pattern**: `design-gallery/build.mjs` splices `host-bridge.js` as literal text right before `app.js`'s closing `init();` call, and that injected code reassigns 11 rendering functions in place (`render`, `renderSchedule`, `renderMy`, `renderManage`, `renderManageServices`, `renderManagePlanning`, `renderManageRequests`, `renderManagePeople`, `renderFeatures`, `renderManageData`, `renderSiteLock`) so Prism/Navy/Aurora repaint after every core render. Since those functions now live in `views/`, `app.js` keeps its own mutable `let` shadow of each, seeded from the real import, and pushes the live (possibly patched) value out to every other module that calls one of the 11 by name, via a setter called from `init()` after the injection has run. Anyone adding a new caller of `render` (or one of its siblings) from a new module must wire it the same way, not with a direct import; see the plan's Section 4 Build log entry for the two review rounds that found and corrected an over-application of this pattern.

## Shared browser runtime

| Area | Current source and symbols | Data or action boundary |
| --- | --- | --- |
| Access and startup | [views/shell.js](../views/shell.js) `render`, `renderSiteLock`, `renderMemberLogin`, `renderForcedPinChange`; [core/session.js](../core/session.js) `memberLogin`, `memberChangePin`, `memberLogout`; [app.js](../app.js) `init`, `initFirebase` | Site passcode and verified member session gate the visible app. `fbWrite` rejects writes without a verified session or while a forced PIN remains. |
| Roles and scope | [core/auth.js](../core/auth.js) `authActor`, `permissionConfig`, `canPermission`, `authorizedDepartments`, `canManageAnyDepartment`; [permissions.js](../permissions.js) `createPermissions`, `canManageDepartment`, `canEditDuty`, `canEditSongs` | Browser checks are presentation and action guards. Firestore rules and callable authorization remain the security boundary. |
| Schedule | [core/schedule.js](../core/schedule.js) `sortedServices`, `upcomingServices`, `pastServices`, `preferredScheduleService`, `dutiesFor`; [views/schedule.js](../views/schedule.js) `renderSchedule`, `renderServiceCard`; [views/shell.js](../views/shell.js) `renderMaintenanceSchedule` | Reads `schedule` documents. The shared Pacific-time default is current code, while each appearance still arranges selection and cards separately. |
| Own duties | [core/schedule.js](../core/schedule.js) `dutiesFor`; [views/schedule.js](../views/schedule.js) `renderMy`; [views/requests.js](../views/requests.js) `renderYourRequests`; [core/notify.js](../core/notify.js) `checkNewDuties`, `checkReminders` | Uses `ui.me`, `wds-me`, schedule assignments, local alert keys, and own profile data. |
| Availability and profiles | [core/departments.js](../core/departments.js) `normalizeDepartmentProfile`, `loadDepartmentRoster`, `loadOwnDepartmentProfiles`, `departmentPatch`, `saveDepartmentProfile`, `saveOwnDepartmentAvailability`; [department-profile.js](../department-profile.js) `normalizeDepartmentProfile`, `updateDepartmentProfile`, `effectiveAvailability`, `isAvailable` | Secure UID-keyed profile data is loaded through department callables in live mode. Local mode builds a clearly weaker fallback roster. |
| Assignment | [core/departments.js](../core/departments.js) `departmentAssignmentPayload`, `assignDepartmentDutyForService`, `unassignDepartmentDutyForService`, `applyScheduleAssignment`; [department-workflows.js](../department-workflows.js) `departmentForDuty`, `activeDepartmentMembers`; [functions/department-handlers.js](../functions/department-handlers.js) assignment handlers | Normal assignment requires active, eligible, schedulable, available profile and avoids same-service double duty. Override carries a reason and is separately authorized. |
| Requests and conflicts | [core/conflicts.js](../core/conflicts.js) `conflictsFor`, `activeConflicts`; [views/requests.js](../views/requests.js) `findPendingRequest`, `requestIsActionable`, `effectiveRequestStatus`, `actionableCountsForViewer`; [views/manage.js](../views/manage.js) `renderManageRequests`, `renderManageConflicts`; [department-workflows.js](../department-workflows.js) `createChangeRequest`, `transitionRequestStatus`, `composeConflicts`, `actionableCounts` | Requests remain in history. A request stops being actionable when the requested duty no longer belongs to the requester. A prayer plus usher pair is the intentional conflict exception. |
| Presider host | [views/songs.js](../views/songs.js) `loadSongAssets`, `loadSongApp`, `songCtx`, `renderSongs`; [actions/dispatch.js](../actions/dispatch.js) `canEditSongService`, `canManagePresiders` | Mounts `song-app.js` into `#song-root`, passes shared Firebase, member, service, name-map, and authorization context. |
| Persistence | [core/state.js](../core/state.js) `saveLocal`, `loadLocal`, `persistService`, `persistMembers`, `persistSettings`, `persistDepartments`, `persistRequest`, `persistAll`, `fbWrite`; [core/notify.js](../core/notify.js) `afterDataChange` | Local fallback uses `wds-data-v2`. Live writes use Firestore documents and require the verified session. `persistAll` batches seed/import writes. |

## Server and storage map

| Capability | Source symbols | Durable paths |
| --- | --- | --- |
| Member authentication | [functions/index.js](../functions/index.js) `verifyMemberPin`, `changeMemberPin`, `resetMemberPin`, `readCurrentAccount`, `callableActor`; [functions/member-auth.js](../functions/member-auth.js) `createMemberAuthCallables` | `accounts/{memberId}`, Firebase Auth custom-token session |
| Department authorization | [functions/department-auth.js](../functions/department-auth.js) `authorizeProfileRead`, `authorizeProfileUpdate`, `authorizeAssignment`, `authorizeAssignmentOverride`; [functions/department-handlers.js](../functions/department-handlers.js) `createDepartmentHandlers`, `listDepartmentRoster`, `updateDepartmentProfile`, `updateMemberAvailability`, assignment handlers | `departments/{department}/members/{memberUid}`, `departmentAssignments/{assignmentId}`, `audit` |
| Leader and membership administration | [functions/index.js](../functions/index.js) `updateDepartmentMembership`, `updateRoleConfiguration`; [permissions.js](../permissions.js) `canManageLeaders`, `canManageDepartmentMember` | `app/departments`, `memberships`, `app/leaderConfig`, `app/roles` |
| Sheet import | [core/sheet-parse.js](../core/sheet-parse.js) `parseCSV`, `sheetRowsToServices`; [core/sheet-sync.js](../core/sheet-sync.js) `mergeSheetServices`, `syncFromSheet`; [functions/sheet-lib.js](../functions/sheet-lib.js) `parseCSV`, `sheetRowsToServices`, `planMerge`; [functions/index.js](../functions/index.js) `scheduledSheetSync` | Published Google Sheet is input. Firestore `schedule` is runtime source. |
| Push and reminders | [core/notify.js](../core/notify.js) `registerPush`, `unregisterPush`, `sysNotify`, `checkNewDuties`, `checkReminders`; [functions/index.js](../functions/index.js) `onScheduleWrite`, `dutyReminders`, `loadTokenTargets`, `sendToTargets` | `tokens/{fcmToken}`, `sent/{markerId}`, local `wds-alerts`, `wds-seen`, and `wds-unread` keys |
| Request routing | [functions/index.js](../functions/index.js) `onRequestCreated`, `onRequestResolved`; [department-workflows.js](../department-workflows.js) `routeRequest`, `routeChangeRequest` | `requests/{requestId}`, scheduler and requester token targets |
| Calendar | [core/calendar.js](../core/calendar.js) `downloadICS`, `subscribeICS`, `icsFeedUrl`; [functions/index.js](../functions/index.js) `ics`; [functions/ics-lib.js](../functions/ics-lib.js) `buildIcsForMember`, `dutiesForMember` | Hosting rewrite `/ics/{member}` reads schedule and name map |
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

## Compact design prototype handoff

The compact-phone prototype is a design handoff boundary. It is not a released feature and does not replace the four current appearance adapters above.

| Artifact | Role and evidence boundary |
| --- | --- |
| `docs/design/prototype/compact-phone/index.html` | Direction chooser for Service Ledger and Weekbook. |
| `docs/design/prototype/compact-phone/weekbook.html` | Weekbook route shell and prototype entry page. |
| `docs/design/prototype/compact-phone/app.js` | Shared current-snapshot adapter, four layout renderers, role routes and browser-local demonstrations. No embedded record fixtures. |
| `docs/design/prototype/compact-phone/styles.css` | Shared styling for the compact direction studies. |
| `scripts/refresh-compact-preview.cjs` | Integration helper that writes one current-service and public-song snapshot outside Git. |
| `scripts/serve-compact-designs.py` | Integration helper that serves the explicitly allowed design assets and `/preview-data.js`. |

The preview reads one `/preview-data.js` current snapshot outside Git. There is no fallback to `seed-data.js`. Read-only verification on September 15, 2026 found 180 services from May through December, including 42 in September and 21 in October. The preview boundary is service dates, labels and times plus 537 public catalog songs, without member names or assignments, and records must not be copied into this index.

Anthony approved Weekbook month navigation below search and above weekly cards, then asked for the designs to be finished and handed off. That placement is an approved design decision, not a released runtime interface. The [design placement map](design/prototype/compact-phone/HANDOFF-MAP.md) records all four layouts and screen dependencies; `docs/COMPACT-DESIGN-HANDOFF.md` is the integration handoff document when present. Shared production runtime work remains planned.

## Known drift points to check before changing runtime

- Counts are calculated in multiple places: `pendingRequestsCount` and `actionableCountsForViewer` in [views/requests.js](../views/requests.js), `actionableCounts` and `aggregateAuthorizedOutstanding` in [department-workflows.js](../department-workflows.js), plus adapter metrics in Prism, Navy, and Aurora.
- Schedule selection has one shared default helper but separate adapter state: `preferredScheduleService` in [core/schedule.js](../core/schedule.js), `aui` in Prism and Aurora, and `month`, `selected`, `full`, and `manualSelection` in [design-gallery/navy-adapter.js](../design-gallery/navy-adapter.js).
- Layout transforms are source-specific: Prism wraps renderer functions, Aurora replaces and wraps renderer functions, and Navy inserts generated DOM over base cards. A markup change can therefore affect one appearance only.
- The lazy song module has a separate `mount` and render contract. `songCtx()` in [views/songs.js](../views/songs.js) is the host interface for identity, schedule, Firebase, and authorization.
- Local department fallback profiles in [core/departments.js](../core/departments.js) do not carry the same security evidence as callable-backed UID profiles. Keep their source and state visible in any shared interface.

## Plan and operating docs

- [Complete compact-phone plan](PLAN-COMPACT-PHONE-REFACTOR.md), approved decisions, ownership, planned interfaces, verification, and Build log.
- [Handoff](HANDOFF.md), live architecture and release history.
- [Feature toggles](FEATURES.md), shared settings and feature gates.
- [User journeys](USER-JOURNEYS.md), observable member, presider, and coordinator flows.
- [Playbook](PLAYBOOK.md), operations and release procedures.
- [S5B lane record](runs/compact-phone-refactor/lanes/S5B.md), indexing ownership and coordinator result slot.

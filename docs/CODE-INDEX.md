# Worship Duty code index

Last updated: 2026-09-20. This is a navigation aid: where things live in the code of the live app (branch `claude/keep-look-f4f5`). It was first written on 2026-09-15 for the compact-phone refactor; the new-shell part of that plan was rejected on 2026-09-17, and the rows below were rechecked against the code after features F1 to F11.

Warning: `functions/` and `firestore.rules` on this branch are OLDER than what is live. The live server code and rules are on branch `claude/compact-integration` (see [HANDOFF.md](HANDOFF.md) section 6). Rows below that name server files describe this branch's copy.

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
| Schedule | [app.js](../app.js) `sortedServices`, `upcomingServices`, `pastServices`, `preferredScheduleService`, `renderSchedule`, `renderServiceCard`, `renderMaintenanceSchedule` | Reads `schedule` documents. The shared Pacific-time default advances at each service's start minute (F1), while each appearance still arranges selection and cards separately. |
| Shared header and account menu (F6, F7) | [index.html](../index.html) header markup (`wd-head-brand`, `wd-head-tools`, `data-wd-head` hooks); [app.js](../app.js) `SCREEN_TITLES`, `ACCOUNT_TITLES`, `paintHeader`, `accountView`, `setAccountMenu`, `renderAccount`, `setSyncPill`; [design-gallery/header.css](../design-gallery/header.css) | One header for all four appearances. The member chip opens Availability, Settings, Sign out. Availability and Settings are personal views inside My Duties (`ui.account`). |
| Phone navigation (F4, F8) | [index.html](../index.html) `nav.tabs` styles at 640 pixels or less; [app.js](../app.js) `watchKeyboardForTabBar`, `watchTopSubnav`, tab dots in `render` | Floating bottom bar, secondary menus mirrored under the header, green My Duties dot, red Manage dot. |
| Own duties | [app.js](../app.js) `dutiesFor`, `renderMy`, `renderNotifyControls`, `renderYourRequests`, `checkNewDuties`, `checkReminders` | Uses `ui.me`, `wds-me`, schedule assignments, and local alert keys. The availability editor is no longer here (see the account menu row). |
| Feedback (F10) | [app.js](../app.js) `feedbackReady`, `syncFeedbackButton`, `openFeedbackSheet`, `sendFeedback`, `loadFeedbackList`, `renderManageFeedback`, `changeFeedbackEntry`; [design-gallery/feedback.css](../design-gallery/feedback.css) | Writes `feedback/{id}`. Members create only; administrators read, mark done, delete. The matching rule exists only in the live rules on `claude/compact-integration`. |
| Availability and profiles | [app.js](../app.js) `normalizeDepartmentProfile`, `loadDepartmentRoster`, `loadOwnDepartmentProfiles`, `departmentPatch`, `saveDepartmentProfile`, `saveOwnDepartmentAvailability`, `renderOwnAvailability`, `renderDepartmentMemberSearch`, `searchDepartmentMembers`, `renderDepartmentProfileRow` (Archive, Restore, Reset PIN); [department-profile.js](../department-profile.js) `normalizeDepartmentProfile`, `updateDepartmentProfile`, `effectiveAvailability`, `isAvailable` | Secure profile data, keyed by account, is loaded through department callables in live mode. Members are added by name search (`searchDepartmentCandidates`, F3); no account ID is shown on screen. Local mode builds a clearly weaker fallback roster. |
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

The chooser and switch boundary is [design-gallery/choice.js](../design-gallery/choice.js), using `MODES`, `NAMES`, `migrate`, `change`, and `window.WorshipDesign`. [design-gallery/host-bridge.js](../design-gallery/host-bridge.js) preserves one DOM state, restores field values across switches, and follows the system dark setting for Prism and Aurora. The floating bottom bar and the secondary menu row are live in all four appearances (F4, F8), built into the existing app rather than into a new shell.

## Compact design prototype handoff (historical)

Superseded on 2026-09-17: Anthony rejected the new shell built from these Weekbook designs. They are kept as design evidence only. Nothing in this section is live or planned for release.

| Artifact | Role and evidence boundary |
| --- | --- |
| `docs/design/prototype/compact-phone/index.html` | Direction chooser for Service Ledger and Weekbook. |
| `docs/design/prototype/compact-phone/weekbook.html` | Weekbook route shell and prototype entry page. |
| `docs/design/prototype/compact-phone/app.js` | Shared current-snapshot adapter, four layout renderers, role routes and browser-local demonstrations. No embedded record fixtures. |
| `docs/design/prototype/compact-phone/styles.css` | Shared styling for the compact direction studies. |
| `scripts/refresh-compact-preview.cjs` | Integration helper that writes one current-service and public-song snapshot outside Git. |
| `scripts/serve-compact-designs.py` | Integration helper that serves the explicitly allowed design assets and `/preview-data.js`. |

The preview reads one `/preview-data.js` current snapshot outside Git. There is no fallback to `seed-data.js`. Read-only verification on September 15, 2026 found 180 services from May through December, including 42 in September and 21 in October. The preview boundary is service dates, labels and times plus 537 public catalog songs, without member names or assignments, and records must not be copied into this index.

Anthony approved Weekbook month navigation below search and above weekly cards, then asked for the designs to be finished and handed off. That placement was an approved design decision at the time; it was never released. The [design placement map](design/prototype/compact-phone/HANDOFF-MAP.md) records all four layouts and screen dependencies; `docs/COMPACT-DESIGN-HANDOFF.md` is the integration handoff document when present. The shared production runtime built from it was rejected.

## Known drift points to check before changing runtime

- Counts are calculated in multiple places: `pendingRequestsCount` and `actionableCountsForViewer` in [app.js](../app.js), `actionableCounts` and `aggregateAuthorizedOutstanding` in [department-workflows.js](../department-workflows.js), plus adapter metrics in Prism, Navy, and Aurora.
- Schedule selection has one shared default helper but separate adapter state: `preferredScheduleService` in [app.js](../app.js), `aui` in Prism and Aurora, and `month`, `selected`, `full`, and `manualSelection` in [design-gallery/navy-adapter.js](../design-gallery/navy-adapter.js).
- Layout transforms are source-specific: Prism wraps renderer functions, Aurora replaces and wraps renderer functions, and Navy inserts generated DOM over base cards. A markup change can therefore affect one appearance only.
- The lazy song module has a separate `mount` and render contract. `songCtx()` in [app.js](../app.js) is the host interface for identity, schedule, Firebase, and authorization.
- Local department fallback profiles in [app.js](../app.js) do not carry the same security evidence as callable-backed UID profiles. Keep their source and state visible in any shared interface.

## Plan and operating docs

- [Complete compact-phone plan](PLAN-COMPACT-PHONE-REFACTOR.md), approved decisions, superseded sections, and the Build log.
- [Handoff](HANDOFF.md), current state, branches, release history F1 to F11, open items, and architecture.
- [Feature run records](runs/keep-look-features/), one file per feature and release.
- [Feature map](FEATURE-MAP.json), the same areas as this index in JSON, with the F1 to F11 sources.
- [Feature toggles](FEATURES.md), shared settings and feature gates.
- [User journeys](USER-JOURNEYS.md), observable member, presider, and leader flows.
- [Playbook](PLAYBOOK.md), operations and release procedures.
- [S5B lane record](runs/compact-phone-refactor/lanes/S5B.md), indexing ownership and coordinator result slot.

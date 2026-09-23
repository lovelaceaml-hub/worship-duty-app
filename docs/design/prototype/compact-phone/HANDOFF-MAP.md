# Weekbook design placement and source map

> Historical as of 2026-09-17. The new shell built from this placement map was rejected. Kept as design evidence only. Current state: [docs/HANDOFF.md](../../../HANDOFF.md).

This map is the design-worker handoff within the owned artifact directory. The controller owns the repository-level handoff, review disposition, integration, and backup. Anthony selected Weekbook; runtime implementation and release are outside this final design task.

## Entry and state

Base URL: `http://127.0.0.1:8099/docs/design/prototype/compact-phone/weekbook.html`.

Query controls:

- `appearance=original`, `prism`, `navy`, or `aurora` selects the explicit layout.
- `role=member`, `leader`, `admin`, or `presider` selects the role preview and its default route.
- Member starts at `#duties`; leader at `#manage/schedule`; administrator at `#manage/attention`; presider at `#songs/my-service`.

Appearance is read before initial paint. The selected appearance, current month, searches, selected service, and local draft values are shared across renderers. The monthly list restores scroll on return from an editor. History navigation has an unsaved-edit guard. Song workspace browsing preserves its selected service and demonstration status.

## Placement families

| Layout | Header and secondary navigation | Schedule arrangement | Detail and editor arrangement | Desktop composition |
| --- | --- | --- | --- | --- |
| Original | Left title over a blue divider; outlined compact tabs; Appearance top right | Full-width weekly strips, date column, aligned name/status rows | Quiet bordered service summary; one-column label/value assignment form | Left orientation area with a broad workspace; detail summary beside fields |
| Prism | Title against vertical accent; underline tabs | Date spine beside stepped weekly surfaces | Shaped service header; paired assignment cells with top rules | Date-spine week groups in two columns; compact side orientation |
| Navy & Cream | Modest serif title; underline tabs; top Appearance | Bounded paper week groups and inset date tiles | Filled service summary with date stamp; paired assignment cards | Editorial side rail and centered paper workspace |
| Aurora | Compact rounded header treatment; pill tabs | Date ribbons inside separate rounded service rows | Soft service summary; stacked wide assignment fields | Broad workspace, two week columns, summary beside the editor |

All layouts use the same labeled floating main destinations. Management tabs are Schedule, Needs attention, Members, plus Settings for administrator. Member tabs separate Upcoming, Availability, and Reminders. Presider tabs are My service, Songs, and History. Save feedback remains next to the primary action above the floating bar.

## Screen coverage and dependencies

Every route below is rendered in all four appearances. The Original, Prism, Navy & Cream, and Aurora placements refer to the explicit composition families above, not four copies of business logic.

| Screen family and route | Controls and placement across layouts | Current data dependency and practical limit |
| --- | --- | --- |
| Member next duty: `#duties` | Member tabs; next-duty panel; upcoming service groups; availability/reminder links. Uses each layout's schedule rows. | Needs a selected loaded member and assignments. Unknown personal duty is stated explicitly; no invented assignment. |
| Global schedule: `#schedule` | Search; month navigation immediately below search; week groups; dedicated service links. | Current service metadata from `/preview-data.js`. All actual source months reachable; no schedule numeric pagination. |
| Management schedule: `#manage/schedule` | Same monthly structure; Open only; administrator department selection. | Omitted assignments remain unknown. Open only counts explicitly unassigned duty values. |
| Service details: `#service/{encoded-service-id}` | Back; service/date/time summary; department assignment sections; authorized edit link. | Snapshot service and optional assignment object. Never assume omitted fields are open. |
| Service editor: `#edit/{encoded-service-id}` | Back; layout-specific service summary and assignment form; replacement action; sticky Save/status. | Four Worship duties, or selected administrator department duties. Local demonstration only; live eligibility, versions, and save endpoints are absent. |
| Availability: `#availability` | Separate member tab; all-department/selected-department scope; recurring service times; date exception; Save availability. Original/Prism/Navy/Aurora field styles and panels apply. | Actual profile and department membership unavailable. Inputs describe a local draft, not current availability. Existing assignments must become Needs replacement in implementation. |
| Reminders: `#reminders` | Separate tab; preference and timing selectors; calendar action; Save reminders. | Preferences, notification permission, and personal calendar feed not loaded. Calendar action explains unavailable dependency. |
| Needs attention: `#manage/attention` | Requests/Open duties/Conflicts/History filters; search or selected-month groups; resolution dialog. | Current request, conflict, completion history, and account state unavailable. No fabricated counts or rows. Open category uses only explicit empty assignment fields. |
| Replacement/resolution dialogs | Search above candidate area; unchanged-duty option; advisory copy; Save and resolve placement. Layout tokens and native dialog remain consistent. | Eligible/available candidates and atomic-resolution interface missing. Snapshot name matches are explicitly not eligible-candidate claims. |
| Members: `#manage/members` | Registered-member search; ten-name pages when names exist; profile links; Add registered member; Invite. | Optional snapshot names only. Registered status and department eligibility require runtime lookup. |
| Add member: `#manage/add-member` and `#manage/add-member/{member-id}` | Search, selection, department summary, add-member draft confirmation. | Account match and membership checks not connected. Demonstration does not create a member or grant authority. |
| Profile: `#manage/profile/{member-id}` or `#manage/profile/preview` | Name/detail header; status and schedulability; eligibility checkboxes; availability/history; Save profile. | Current profile data is unknown. Visible checkbox edits are local demonstrations. |
| Invite: `#manage/invite` | Department summary; seven-day/single-use explanation; Prepare draft; Share/Copy draft; Revoke draft. | No invitation creation or acceptance endpoint. Draft text only, no usable invitation link or outside message. |
| Administrator exceptions: `#manage/exceptions` | Search; unavailable list; exception detail/search/resolve-control dialog. | Real exception and verified account lookup missing. No case data is invented. |
| Authorized settings: `#manage/settings` | Administrator-only preview route; compact settings selectors; exception/appearance links; Save settings. | Authorization represented by preview role only. Real permissions and settings must load in implementation. |
| Presider My service: `#songs/my-service` | Service selector; layout-specific service summary; song-list area; separate Save draft and Confirm songs. | Personal presider assignment requires selected member plus loaded assignments. Browsed service is labeled accordingly. Existing service setlists are not loaded. Public-catalog selections can be added, removed, reordered, saved, and confirmed in a browser-local draft. |
| Songs: `#songs/library` | Retained service selector; song search; All/Recently sung/Planned controls; return to service. | Real public catalog rows, title/number/category search, and ten-song pages are loaded. Recently sung and Planned usage remain unknown; those filters explicitly say so. |
| Song detail: `#songs/song-detail` | Back; last-sung/planned-use fields; advisory repeat placement; Add to draft; Play. | A selected real catalog song supplies number, title, category, and duration. Add to draft is browser-only. Media and usage are not supplied, and Play explains that dependency. |
| History: `#songs/history` | Search; All/Automatic/Corrected source selector; history list area; recording explanation. | Historical setlists and usage statistics absent. No fake rows or zero-count metrics. |
| History detail: `#songs/history-detail` | Service/song/source details; correction dialog. | Loaded history record and authorized correction interface missing. Correction flow is a layout demonstration. |
| Appearance: `#appearance` | Four explicit layout choices; mini arrangement diagrams; Return to workspace. | Shared state preserved; browser preference only. No production appearance files modified. |
| Site lock: `#lock` | Appearance-matched lock card; passcode field placement; Continue to sign-in preview. | Credential input disabled. No site-lock/authentication calls. |
| Sign in: `#sign-in` | Appearance-matched member-account selection and numeric 4 to 6 digit Member PIN fields; Continue to role preview and required-PIN-change preview. | Input disabled; no credentials collected or sign-in attempted. |
| Required PIN change: `#change-pin` | Appearance-matched New PIN and Repeat new PIN fields; continuation control. | Both numeric PIN fields are disabled. No credential values are collected, stored, or changed. |
| Loading/recovery: Preview controls, Loading and recovery | Matching skeleton surfaces; Retry; explicit Original recovery action. | Visual preview only. Original recovery does not overwrite the saved appearance. Actual asset-loading recovery remains runtime work. |
| Unavailable notification destination: `#unavailable` | Message plus role-appropriate workspace link. | No notification payload or auth deep-link transport is implemented. |

## Save and failure presentation

A single visibly separate Preview controls dialog demonstrates Unsaved, Saving, Saved, Failed, and Stale states. The state banners say simulated, and draft/save bars say Demonstration only. Failed and stale examples retain drafts and expose Retry or Review changes. Review changes does not invent a newer version. Normal form saves write browser storage only and report Saved in this browser after local storage succeeds.

Loaded public songs support actual browser-local draft selection, saving, and local confirmation. Changes to a confirmed local selection require confirmation again. Separate Preview controls can also demonstrate Draft saved, Confirmed, or Changed states; those explicitly include preview simulation. Neither path claims a live setlist or automatic history record. The intended runtime rule remains explicit: save draft separately from confirmation, require confirmation after edits, and record only confirmed lists after the service window.

## Shared source and action locations

- `/Users/anthony/Projects/worship-duty-app-worktrees/compact-design/docs/design/prototype/compact-phone/weekbook.html`: pre-paint appearance selection, shared dialogs, current-data reference.
- `/Users/anthony/Projects/worship-duty-app-worktrees/compact-design/docs/design/prototype/compact-phone/app.js`: source adapter, per-record unknown-state handling, routes, four named shell renderers, explicit week compositions, local drafts, click handlers, preview controls.
- `/Users/anthony/Projects/worship-duty-app-worktrees/compact-design/docs/design/prototype/compact-phone/styles.css`: shared controls plus clearly marked Original, Prism, Navy & Cream, Aurora arrangement sections; phone and desktop rules.
- `/Users/anthony/Projects/worship-duty-app-worktrees/compact-design/docs/design/prototype/compact-phone/index.html`: central four-choice entry and role selector.
- `/preview-data.js`: controller-owned local-only current schedule and public-catalog resource. Never copy its contents into this artifact, review packet, or Git.

## Handoff boundary

This unit hands off a clickable design artifact and documented unavailable-data states. It does not prove backend behavior, real permissions, atomic request resolution, profile validity, usable invitations, real song history, notification deep linking, production cache/startup behavior, or live saves. Those dependencies must be implemented against approved source contracts after any later runtime authorization. The controller's final record should include the actual walkthrough/review result and any remaining findings rather than treating this writer's syntax check as approval.

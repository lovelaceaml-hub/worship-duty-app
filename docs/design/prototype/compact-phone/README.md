# Weekbook: four-appearance design artifact

Anthony selected Weekbook and requested finished clickable designs followed by a handoff. This artifact completes the bounded design screen families described below. It is not a runtime implementation, release, or authentication system. Controller browser verification, affected review, and the final handoff record are separate from this writer's delivery.

## Open the designs

The controller's narrow allow-listed server serves the prototype and one private current-data resource on port 8099.

- [Central chooser](http://127.0.0.1:8099/docs/design/prototype/compact-phone/index.html)
- [Original](http://127.0.0.1:8099/docs/design/prototype/compact-phone/weekbook.html?appearance=original&role=leader)
- [Prism](http://127.0.0.1:8099/docs/design/prototype/compact-phone/weekbook.html?appearance=prism&role=leader)
- [Navy & Cream](http://127.0.0.1:8099/docs/design/prototype/compact-phone/weekbook.html?appearance=navy&role=leader)
- [Aurora](http://127.0.0.1:8099/docs/design/prototype/compact-phone/weekbook.html?appearance=aurora&role=leader)

Use the chooser's role selector, or change the URL's role value to `member`, `leader`, `admin`, or `presider`. Within a design, Preview controls switches roles and shows simulation states. Appearance is available from every app header. A query appearance is applied before the stylesheet and the first rendered screen. Appearance changes preserve the shared route, filters, month, and draft state.

The controller maintains the narrow preview runner and data refresh tooling outside this owned directory. Do not serve the entire repository or place the private data snapshot in this folder. The completed artifact uses the same executable allowlist filenames as before: `/index.html`, `/weekbook.html`, `/ledger.html`, `/styles.css`, and `/app.js` beneath the prototype prefix, plus root `/preview-data.js`.

## Current data contract

The only data script is `/preview-data.js`, supplied by the local server as `window.PREVIEW_DATA`. Expected metadata is `capturedAt`, `source`, `assignmentsIncluded`, optional `assignmentMonths`, `members`, `services`, and `songs` with `catalogSource` / `catalogCapturedAt` metadata. Each service includes `id`, `date`, `service`, `worship`, and `time`; approved records can additionally include `assignments`.

The controller verified a snapshot of 180 services spanning May through December 2026, including September and October. Those numbers are not hardcoded in the renderer. The renderer defaults to the current Pacific calendar month if present, otherwise the latest actual source month. It derives all month options and records from the snapshot. Month navigation sits immediately below search and above the week cards. Every service in the selected month is displayed, with cross-month weeks clipped to that month. There is no numeric schedule-page footer.

Assignment availability is determined per service by the actual presence of an assignments object, not the global metadata flag. If a service omits assignments, the UI says Assignments not loaded. A missing duty key inside an assignment object also remains unknown. Only an explicitly empty or null duty value is treated as unassigned. Omitted assignments never become fabricated open duties, personal next duties, or request counts. Actual member display names retain the supplied format. No names or service records are copied into the artifact files.

The public catalog is supplied as songs with id, number, title, category, and durationSec. Source membership, eligibility, current requests, conflicts, invitations, profile history, preferences, existing service setlists, song usage/history, playable media, authentication, permissions, and notifications are not supplied by this snapshot. Their screens show explicit unavailable-data states and their intended controls. A loaded source member name is not claimed as a verified registered account or department member.

## Design and route coverage

The [placement map](HANDOFF-MAP.md) lists every screen family, direct route, four-layout placement, and missing source dependency.

- Member: My next duty, full monthly schedule, service details, separate availability and reminder pages.
- Leader: monthly management schedule, dedicated assignment editor, categorized Needs attention, member search, profile, add-member draft, invitation share/copy draft.
- Administrator: Needs attention start, department selection, members, exceptions, and authorized-settings layout.
- Presider: My service, service selection, Songs, song detail, History, history detail/correction, and separate Save draft versus Confirm songs states.
- Shared: four appearances, main floating navigation, compact secondary tabs, month/search/scroll restoration, unsaved-change protection, explicit local save status, and preview simulations for Unsaved, Saving, Saved, Failed, and Stale. Startup previews include site lock, member-account/PIN sign-in, required member PIN change, loading, Original recovery, and unavailable notification destination.

Original uses straight week strips and a single-column assignment form. Prism uses a date spine and stepped weekly surfaces, with paired form cells and desktop week columns. Navy & Cream preserves the selected paper-group Weekbook and paired editor. Aurora uses date ribbons and rounded service cards, stacked wide fields on phones, and a broad two-area desktop layout. Four named shell renderers and explicit week compositions share information and handlers. This artifact is design evidence; its renderer is not proposed production architecture.

## Local interactions and limits

The floating main destinations are My duties, Schedule, Songs, and Manage, restricted to relevant preview roles. Management sections remain in compact tabs below the heading. The role selector is clearly outside the app UI and grants no real permissions.

Assignment fields are read-only until Enable browser-only demonstration assignment editing is checked in Preview controls. Local form changes, status feedback, draft retention, and browser storage can be exercised. Browser storage uses `weekbook-design-drafts-v4`; no previous historical or invented fixture overlay is read. Source records are not changed. Saves acknowledge localStorage only, never a server. Failed local saves retain edits; explicit failed/stale preview states are labeled simulations. Returning to services restores the shared month/search/selection and list scroll. Switching appearance retains the same draft.

Invitations create wording-only drafts. Copy draft uses the clipboard after a click, with a manual-copy fallback. Share draft opens an in-preview sheet and sends nothing. No active invitation link is generated. No member, account, role, request, replacement, calendar subscription, song, or history entry is created or changed.

The public song catalog is loaded from the controller resource, with real title/number/category search, ten-song pagination, detail fields, and browser-local add/remove/reorder draft selections. Save draft and Confirm songs are separate browser-only actions. Editing confirmed local selections requires confirmation again. Existing live setlists, usage history, media playback, and history correction remain unavailable; their controls explain the missing dependency. Explicit confirmation simulations remain available separately in Preview controls. Member next-duty and presider next-assigned-service views require a selected loaded member and matching assignments; otherwise they explicitly state that the personal assignment is unknown. A browsed service is not claimed as the person's next assigned service.

The replacement and request-resolution dialogs show search and decision placement with unknown eligibility and availability. They cannot perform a valid replacement or atomic resolution. Permissions are represented only by the selected design role; backend enforcement is not implemented.

## Verification and ownership

JavaScript syntax check: `node --check /Users/anthony/Projects/worship-duty-app-worktrees/compact-design/docs/design/prototype/compact-phone/app.js` passed. No test files or automated test suites were created or run. The controller owns browser walkthroughs, the bounded affected review, integration documentation, backup, and final handoff.

All changed artifacts remain in `/Users/anthony/Projects/worship-duty-app-worktrees/compact-design/docs/design/prototype/compact-phone/`: `index.html`, `weekbook.html`, `ledger.html`, `app.js`, `styles.css`, `README.md`, and `HANDOFF-MAP.md`. No Git, production files, source snapshot contents, or other lanes were changed. The earlier Ledger route now points users to the selected Weekbook designs, rather than continuing an unselected alternative.

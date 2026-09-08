# Service layout revision 2

Authorized local prototype revision from Anthony on 8 September 2026. Baseline: 02cd552. Production implementation is authorized by the later speed-delivery decision. Do not store real manager names or records in source, fixtures, logs, screenshots or board. All six initial questions are answered below. No design or prototype approval gate applies; use necessary affected checks.

## Models and ownership

Controller: observed current session gpt-6-astra high, integration and verification. The approved plan requested gpt-5.6-sol high for this role; the runtime mismatch was disclosed to Anthony on 8 September 2026. Native review remains gpt-5.6-sol high. Implementation: executor_luna max. Coordination: coordinator_terra high, no edits. Critic: planner_sol max, read-only. Production cumulative Opus review is deferred until full-plan completion.

- LSU: one writer at /Users/anthony/Projects/worship-refactor-worktrees/service-layout-v2 owns prototype app.js, index.html, styles.css, optional new UI-only modules in that prototype folder and its own lane/log files.
- LST: one writer at /Users/anthony/Projects/worship-refactor-worktrees/service-layout-tests-v2 owns tests/service-layout-v2.mjs and its own lane/log files. Fictional scenarios only.
- LMC: read-only architecture critic at /Users/anthony/Projects/worship-refactor-worktrees/manager-contract-v2 investigates existing manager, roster, choir, song search and name correction contracts. No edits or production access.
- Root owns shared docs, canonical integration, Git and previews. Screen production files, server, Firebase and importer are untouched.

## Visible acceptance

Home: all selected-month date groups expanded by default, past/completed groups collapsed. Saturday, Tuesday and other days have distinct labeled colors. Duty/person stays close. Preserve manual disclosure after rerender.

My Duties: one date card. Header service/combined feast label left, full date right. Second row unique service count and duty count left, View full team right. Rows Time | Worship | Duty | Person. Same-date services remain distinct source records. Full team toggles expanded assignments without duplicate personal rows.

Presider: whole selected month always listed; calendar day click scrolls to date without filtering. Highlight personal presiding dates accessibly. My presiding / All services filter retained. Date/service header then compact service summary (time, worship, presider, song count, total duration, View). Prayer grid and choir summary visible. View expands preparation rows followed by separated Glory, Thanks and Choir. Persistent actions Select Songs, Order of Worship, Copy Text, Request Change stay outside disclosure.

Song selection: opens dedicated selected-service workspace with prominent member/service context, total duration, count and Confirm Songs. Selected rows allow preparation/glory/thanks roles, reorder prep and removal. Empty Glory/Thanks slots are add triggers. Library below includes number/title/duration/sung-count/last-sung/add. Search number, title and title word; Appendix category immediately after All, Appendix numbers A##. Preserve failure, retry, confirmation, changed and sung-history behavior.

Manage: department first. Department Roster with add/remove/edit duty qualifications and availability; monthly assignments grouped by service with duty/assigned/remove and inline selection; auto assignment interface. Choir manual title with library suggestions and optional custom entry. The existing passcode and selected-name flow remains. New qualification and availability controls use fictional state until connected through reviewed additive storage. Real-data preview stays read-only and must accurately say controls are unavailable. Use fictional data to demonstrate mutations.

Settings: accessible button, multiple restrained themes with identical layout, stored local preference only. No Firebase or record changes. Keyboard focus, phone layout, readable text, no emoji or religious imagery.

## Clarifications received

- Manager access keeps existing passcodes and selected names. Department interface gating does not introduce verified identity or change Firestore rules.
- The previously unspecified department manager has been supplied in the owner conversation. Actual manager names stay out of committed artifacts and fictional fixtures.

- Auto assignment proposes a balanced schedule first; a manager explicitly saves it. Preserve existing assignments and expose unresolved slots.
- The owner-authorized title correction includes historical records. This is a narrow exception to the original no-migration scope. Real names stay outside committed artifacts. Root must preserve old calendar URLs and matching through a reviewed alias/rename path; the loopback preview remains GET-only.

- A service starts collapsed 30 minutes after its scheduled start in America/Los_Angeles. A date starts collapsed when all its services crossed the cutoff. This display rule never marks songs sung or changes saved service records. Explicit disclosure choices survive rerenders.
- Choir custom titles are saved only to the service and never added to the song library. Existing scalar choirSong format remains compatible.

## Controller adjudication of architecture critique

The critic confirmed global passcode/anonymous-auth behavior, department roster-only storage, scalar choir titles and one-slot assignment suggestions. User answers override the critic's older pending-policy recommendations. Keep existing authentication as chosen. Treat department access as the chosen interface gate, without claiming stronger verified identity. Use per-duty qualification and service/date availability controls as bounded technical defaults. Generated assignments fill only empty slots, preserve existing assignments, require explicit save and expose conflicts/unresolved slots. Song totals show preparation plus Glory and Thanks, with choir separated when duration is unknown. Changing a presider retains songs and requires reconfirmation.

The original calendar-redesign assertions remain historical coverage for candidate02cd552. Revision2 tests must cover the current month-jump semantics and retain failure, history, focus, read-only and accessibility protections without disabling assertions. No retroactive change to historical evidence.

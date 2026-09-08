# Calendar and service workspace redesign

Anthony requested this revision on 8 September 2026. It supersedes the earlier instruction to preserve original B geometry and a white/blue-only palette. No Stitch. Use modest typography, restrained department colors, accessible controls, and no religious imagery or emoji.

## Acceptance

1. Prominent shared member selector at top right, replacing the read-only badge location. Keep a smaller truthful view-only indicator elsewhere.
2. Home: small clickable calendar with previous/next month controls. Separate department controls below it. Upcoming schedule has labeled, visually distinct departments and closely aligned duty/person rows. Remove bottom navigation tiles. Include the whole selected month schedule below upcoming services.
3. My Duties: same month calendar, group duties by date, combine coincident feast/worship date labels without merging distinct source service IDs or times, and allow opening the complete team for each service.
4. Presider: upcoming presiding services by default; same calendar; My presiding/All services filter. Prominent service/date/presider and confirmation state. Prayer and choir information. Preparation, Glory and Thanks song sections in that order with dropdowns and clear separation. Appendix numbers display A##, without changing IDs.
5. Manage: department selection comes first.

## Delivery and boundaries

Revise the local fictional prototype and loopback real-data preview. Real records remain memory-only and read-only. Never capture real screenshots, record text, traces or logs. Preserve every source service ID, saved plan, assignment, confirmation and sung-history meaning. Preserve fictional editing and existing capabilities. Production interface approval remains pending. Existing original references remain historical and immutable.

## Model and ownership

Controller/integration: Sol high with native Sol high review. Nonediting coordinator: coordinator_terra high. UI writer: executor_luna max in /Users/anthony/Projects/worship-refactor-worktrees/calendar-redesign, exclusively owns docs/design/prototype/open-bulletin/app.js, index.html, styles.css and real-preview.js there. Verification writer: executor_luna max in /Users/anthony/Projects/worship-refactor-worktrees/calendar-verification, owns only tests/calendar-redesign.mjs there. Each may write its named lane record and timestamped log in its own worktree. Root owns shared documentation, canonical integration, Git, servers and final checks. No new server modules or data contracts are planned.

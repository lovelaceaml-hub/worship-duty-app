# Real-data preview correction checks

Status: controller checks passed; native source review in progress. This report contains no member information.

## Duplicate rendering

Controller headless browser checks passed on the current design worktree at phone width 430 and desktop width 1280. Using fictional fixtures only, the nearest card contained 22 unique duty rows under All, four unique rows under Worship, and no redundant Full team expander for the four-row filter. Collapse and reopen succeeded. Both views returned zero Axe violations and zero browser errors.

## Read-only source investigation

Unauthenticated HTTPS GET access to the canonical Worship Service Firestore schedule, members, departments, requests, setlists and songStats endpoints succeeded. No credentials or tokens were read. Current schedule coverage includes upcoming services. The local song catalog exactly matches the deployed song catalog. Saved plans include records without corresponding schedule documents, which the preview must preserve. No production write was issued.

## Pending

Six fictional adapter/server tests passed, including pagination, schema normalization, GET-only methods, Host/Origin restrictions, asset allowlisting and generic read failures. Actual phone and desktop smoke passed all four tabs without browser errors, overflow, external requests or writes. No screenshots or personal-text output were collected. Final fictional phone/desktop tests passed eight Axe views, both confirmation states, all four empty-data views and fail-closed data loading. Duplicate-row checks were repeated after the final browser changes and passed. Native source review remains in progress.

## Review correction checks

Six updated fictional server checks passed. Controller browser checks passed on phone and desktop with eight Axe views, empty and failed-load states, pending request metadata for removed services, actual saved-presider labels without name selection, service switching through a missing plan, partial song history with preserved totals, plain-text choir title escaping, blank-assignment protection, standalone date isolation and a bounded desktop library.

The controller compared the local payload against current source records without emitting record contents. All service assignments and saved song order matched. Excluded credential/token and updater fields were absent, and real song statistics were present. Only aggregate verification results were printed.

The final integrated six source files match the frozen lane files. Port 8100 now runs the canonical server and canonical browser source. No production deployment or record write occurred. Native correction review2 remains pending.

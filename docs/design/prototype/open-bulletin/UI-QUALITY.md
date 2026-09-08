# Open Bulletin prototype quality receipt

## Scope

This receipt covers the local fictional prototype at http://127.0.0.1:8099/open-bulletin/index.html. The existing controller server was observed on loopback port 8099 with PID 92999, session 19894. No production source or external service was used.

## Correction 2 browser verification

Command:

    node docs/runs/worship-refactor-20260907/research/design/prototype/correction-2/verify-prototype.cjs

The owned check used the installed Playwright package from /Users/anthony/Projects/worship-duty-app/node_modules/playwright and the local axe package from /Users/anthony/Projects/worship-duty-app/node_modules/@axe-core/playwright. Each browser context installed a route before page creation and aborted every non-loopback request. The check used fictional September 2026 fixtures only and did not restart the server.

Results:

- 9 of 9 bounded correction checks passed.
- Phone search opened as a dialog, focused search, kept Tab inside the panel, returned focus after Escape and Close, and preserved the selected service and query.
- Desktop retained the side library. Calendar feed subscription, reserved example URL copy, and one-time snapshot stayed local with no new page.
- Name impact preview, Cancel, confirmed canonical consolidation, strict fictional backup rejection and acceptance, distinct reset and restore confirmations, and Cancel state preservation passed.
- Site lock remained active after header navigation and Return Home until the fictional passcode was entered.
- Planning conflicts, gaps, suggestions, workload, and service count followed the selected range.
- Sung history passed duplicate occurrence, repeated mark idempotence, service date, cross-service undo, count and last date recomputation, and recreate-outline checks.
- The open phone song panel and the checked desktop and phone views passed axe checks after the panel semantic fix. No page errors, console errors, or non-loopback requests were recorded.
- 9 changed-view screenshots were captured at scroll position zero. Their exact paths are recorded in /Users/anthony/Projects/worship-refactor-worktrees/design/docs/runs/worship-refactor-20260907/research/design/prototype/correction-2/results.json.

## Baseline browser and screenshot verification

Command:

    node /tmp/proto-verify.cjs

The command used the local Playwright package at /Users/anthony/Projects/worship-duty-app/node_modules/playwright, the local axe package at /Users/anthony/Projects/worship-duty-app/node_modules/@axe-core/playwright, and the served prototype URL. It captured the page from scroll position zero.

Results:

- Home, My Duties, Presider, and Manage passed at 390 by 844 and 1440 by 1000.
- Empty, Loading, Offline, Error, and Success passed at 390 by 844.
- All checked pages had equal document and viewport widths. No horizontal overflow was found.
- Axe reported zero violations on Home at both sizes, My Duties phone, Presider phone, Manage at both sizes, and all five state routes.
- Console and page error capture was empty for every checked page.
- Main navigation, duty note open and close, later service details, calendar text, request submit and approval, occurrence reorder, song add, save, confirm, changed-after-confirmation, outline copy, runsheet, sung, undo, people, roster, planning, sync, settings, passcode change, editor unlock, state recovery, and keyboard focus all passed.
- Calendar and outline copy text used real newline characters. The read-only local copy area remained visible even if browser clipboard permission is unavailable.
- Secondary lifecycle checks passed for calendar copy, backup export and import, empty service assignments, feature-gated sync, service field editing, blank service creation, delete confirmation, conflict acknowledge and reopen, person rename and remove confirmation, the no Presider role gate, site lock and unlock, song history backfill and remove, and setlist delete confirmation.
- Resource inspection found only the loopback stylesheet, fixtures, and app scripts. No external request was recorded.

## Captured artifacts

- open-bulletin-390x844.png
- open-bulletin-1440x1000.png
- duty-390x844.png
- duty-1440x1000.png
- presider-390x844.png
- presider-1440x1000.png
- manage-390x844.png
- manage-1440x1000.png
- state-empty-390x844.png
- state-loading-390x844.png
- state-offline-390x844.png
- state-error-390x844.png
- state-success-390x844.png

All files are in /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/open-bulletin/screenshots/.

## Contract verification

Commands:

    node --check docs/design/prototype/open-bulletin/app.js
    node --check docs/design/prototype/open-bulletin/fixtures.js
    node docs/design/prototype/contract/scripts/design-contract.mjs docs/design/prototype/contract/design-contract.config.mjs

Syntax checks passed. The contract validator loaded after adapting its import to the installed local Playwright package, then stopped at the required committed-artifact gate:

    direction-a.phone: Design artifact must be committed and unchanged before approval

The validator result is therefore pending controller Git integration. No Git state was changed in this lane.

## Review status

The selected original Open Bulletin direction remains the visual anchor. Full prototype approval, contract approval, and production implementation remain pending Anthony and controller review. This receipt does not claim design approval.

## Correction3 controller checkpoint

Three actual UI journeys passed after the source freeze: marking newly added songs without duplicating pairs, removing every outline song followed by complete service-wide Undo, and rejection without mutation of marker-bearing backups with mismatched setlist identity/date/type/label. The original visual geometry and typography are unchanged. Evidence: docs/runs/worship-refactor-20260907/research/design/prototype/correction-3 in the project root. Earlier correction2 screenshots are retained; the controller's site-locked-phone capture shows the lock before unlock, whereas the correction2 site-lock named capture is after successful unlock. Native Sol review3 is pending.

## Final reviewed candidate

Native Sol review4 passed with no actionable findings after the empty-outline guard. Root's final source-bound browser proof passed all three empty/mark/Undo checks and empty-view Axe with zero violations. The committed phone/desktop contract passed. No HTML, stylesheet, fixture or visual layout changed in these final corrections. Approval remains recorded separately as pending in ../APPROVAL.md. This is a reviewed fictional prototype, not production completion.

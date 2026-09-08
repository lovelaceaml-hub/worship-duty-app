# Open Bulletin prototype quality receipt

## Scope

This receipt covers the local fictional prototype at http://127.0.0.1:8099/open-bulletin/index.html. The existing controller server was observed on loopback port 8099 with PID 92999, session 19894. No production source or external service was used.

## Browser and screenshot verification

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

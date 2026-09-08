# Lane LD: Local design directions

- Task ID: `WORSHIP-D-20260907`
- Lane: Codex
- Runtime: `executor_luna`, max
- Review: Controller review pending
- State: completed for the proposal artifact
- Worktree: `/Users/anthony/Projects/worship-refactor-worktrees/design`

## Outcome

Created a local comparison board with three self-contained responsive HTML and CSS directions. The board links full pages and embeds phone and desktop previews for Service Ledger, Open Bulletin, and Service Desk. All three use the same fictional selected member, next duty, Sabbath Day service times, Third Day date, real department labels, and real duty labels.

## Changed paths

- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/index.html`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/service-ledger/index.html`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/service-ledger/styles.css`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/service-ledger/app.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/service-ledger/screenshots/service-ledger-390x844.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/service-ledger/screenshots/service-ledger-1440x1000.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/service-ledger/screenshots/service-ledger-390x844-full.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/service-ledger/screenshots/service-ledger-1440x1000-full.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/open-bulletin/index.html`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/open-bulletin/styles.css`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/open-bulletin/app.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/open-bulletin/screenshots/open-bulletin-390x844.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/open-bulletin/screenshots/open-bulletin-1440x1000.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/open-bulletin/screenshots/open-bulletin-390x844-full.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/open-bulletin/screenshots/open-bulletin-1440x1000-full.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/service-desk/index.html`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/service-desk/styles.css`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/service-desk/app.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/service-desk/screenshots/service-desk-390x844.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/service-desk/screenshots/service-desk-1440x1000.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/service-desk/screenshots/service-desk-390x844-full.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/service-desk/screenshots/service-desk-1440x1000-full.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/screenshots/comparison-1440x1000.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/screenshots/comparison-full.png`

## Verification

Static server command, launched from the directions root:

```sh
cd /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions
python3 -m http.server 8098 --bind 127.0.0.1
```

Playwright verification and capture command:

```sh
cd /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions
node --input-type=commonjs -
```

The command received the bounded local Playwright harness on standard input. It loaded each direction at 390 x 844 and 1440 x 1000, checked content and local-only resources, captured exact and full-page screenshots at scroll position zero, and exercised navigation, duty notes, details, and Service Desk filters. The harness used the read-only installed Playwright package at `/Users/anthony/Projects/worship-duty-app/node_modules/playwright`.

Results:

- Service Ledger 390 x 844: PASS, first assignment y `440.47px`, visible text `14px`.
- Service Ledger 1440 x 1000: PASS, first assignment y `637.42px`.
- Open Bulletin 390 x 844: PASS, first assignment y `471.66px`, visible text `14px`.
- Open Bulletin 1440 x 1000: PASS, first assignment y `852.05px`.
- Service Desk 390 x 844: PASS, first assignment y `493.28px`, visible text `14px`.
- Service Desk 1440 x 1000: PASS, first assignment y `803.73px`.
- Comparison index 1440 x 1000: PASS, all three local page links and iframe previews present.
- Interaction checks: PASS for main navigation, duty note open and close, nearest service details collapse and reopen, and Service Desk Later and All filters.
- Resource check: PASS, no external resources.
- Console and page error checks: PASS for all direction pages and the comparison index.
- Content scan: PASS, no invented duty labels, prohibited date labels, fake readiness claims, or em dash and en dash characters.
- JavaScript syntax: PASS with `node --check` for all three direction scripts.
- Screenshot inspection: PASS for all three phone captures and desktop captures. Phone captures show the next duty, nearest service, and at least four readable assignment rows without horizontal overflow.

## Handoff and limits

This is a local proposal artifact. Direction selection remains pending before a complete prototype. Production files were not changed. The `*-full.png` files are full-page inspection captures in addition to the six exact viewport captures. The comparison board is available at `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/directions/index.html` and through `http://127.0.0.1:8098/index.html` while the bounded server remains running.

Component suggestions for root: preserve the shared shell and selected-member line, choose one of the three schedule composition patterns, keep the expanded nearest service as the first content block, and retain a reusable assignment row or team table with the real department and duty vocabulary.

The plan Build log and Git state remain controller-owned. This lane did not mutate Git, deploy, publish, merge, or touch protected production areas. Controller review is pending.

## Type refinement receipt

- Task: `WORSHIP-D-20260907`, selected Direction B follow-up
- State: completed for the bounded type-refinement artifact, controller review pending
- Source copied from: `/Users/anthony/Projects/worship-duty-app/docs/design/directions/open-bulletin/`
- Preview URL: `http://127.0.0.1:8099/type-refinement/index.html`
- Server: existing root Python server on loopback port `8099`, process `92999` observed listening

The owned type-refinement folder is a faithful local copy of the original Open Bulletin page. It retains the original layout, blue filled nearest service card, pale-blue later cards, date strip, whitespace, content, inline SVG mark, and duty-note and details interactions. The only source changes are modest reductions to the large heading, next-duty role, duty time, schedule heading, service time, and service title declarations. The original direction folder was not edited.

Changed and generated absolute paths:

- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/type-refinement/index.html`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/type-refinement/app.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/type-refinement/styles.css`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/type-refinement/screenshots/open-bulletin-390x844.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/type-refinement/screenshots/open-bulletin-1440x1000.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/type-refinement/screenshots/type-refinement-390x844.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/type-refinement/screenshots/type-refinement-390x844-full.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/type-refinement/screenshots/type-refinement-1440x1000.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/type-refinement/screenshots/type-refinement-1440x1000-full.png`

Verification command:

```sh
cd /Users/anthony/Projects/worship-refactor-worktrees/design
node --check docs/design/prototype/type-refinement/app.js
node --input-type=commonjs -
```

The bounded Playwright harness used the installed local Playwright package, loaded `http://127.0.0.1:8099/type-refinement/index.html` at 390 x 844 and 1440 x 1000, reset scroll to y0 before each screenshot, checked `scrollWidth` against `clientWidth`, captured viewport and full-page screenshots, and exercised duty-note open and close plus nearest service details toggle. Results: JavaScript syntax PASS, phone overflow false, desktop overflow false, both duty-note transitions PASS, nearest details toggle PASS, page and console errors none, screenshot inspection PASS. Measured phone service card top y371.08 and desktop service card top y578.06 after the typography-only change.

This is a local proposal artifact only. No Git state, production source, deploy, publish, external tool, or external asset was changed. The type-refinement preview does not implement the larger selected prototype journeys, which remain a separate controller-owned decision after visual review.

## Full Open Bulletin prototype receipt

- Task: WORSHIP-D-20260907, selected Direction B prototype capsule
- Runtime: executor_luna
- State: implementation complete for controller review, Anthony full prototype approval pending
- Preview URL: http://127.0.0.1:8099/open-bulletin/index.html
- Server: existing controller loopback server, session 19894, PID 92999 observed on port 8099

### Changed absolute paths

- /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/open-bulletin/index.html
- /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/open-bulletin/app.js
- /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/open-bulletin/fixtures.js
- /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/open-bulletin/styles.css
- /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/open-bulletin/README.md
- /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/open-bulletin/CAPABILITY-MAP.md
- /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/open-bulletin/STATE-COVERAGE.md
- /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/open-bulletin/UI-QUALITY.md
- /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/contract/README.md
- /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/contract/design-contract.config.mjs
- /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/contract/scripts/design-contract.mjs
- /Users/anthony/Projects/worship-refactor-worktrees/design/docs/PRODUCT-BRIEF.md
- /Users/anthony/Projects/worship-refactor-worktrees/design/docs/USER-JOURNEYS.md
- /Users/anthony/Projects/worship-refactor-worktrees/design/docs/HOSTING-DECISION.md
- /Users/anthony/Projects/worship-refactor-worktrees/design/docs/ASSET-SOURCES.md
- /Users/anthony/Projects/worship-refactor-worktrees/design/docs/DESIGN-CANDIDATES.json
- /Users/anthony/Projects/worship-refactor-worktrees/design/docs/runs/worship-refactor-20260907/research/design/prototype/open-bulletin-receipt.md

Earlier versions of Product Brief, User Journeys, and Asset Sources were preserved in /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/archive/. The current prototype contract files remain in the owned prototype subtree.

### Screenshot paths

All captures are in /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/open-bulletin/screenshots/:

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

### Verification

Commands:

    node --check docs/design/prototype/open-bulletin/app.js
    node --check docs/design/prototype/open-bulletin/fixtures.js
    node /tmp/proto-verify.cjs
    node docs/design/prototype/contract/scripts/design-contract.mjs docs/design/prototype/contract/design-contract.config.mjs

Results:

- JavaScript syntax passed.
- Served Playwright pages passed at 390 by 844 and 1440 by 1000.
- Home, My Duties, Presider, Manage, Empty, Loading, Offline, Error, and Success had no page errors or horizontal overflow.
- Axe reported zero violations on all checked main and state pages.
- Local journeys passed for navigation, duty note, service details, calendar text, request submit and approval, Presider service selection, occurrence reorder, song add, save and retry, confirm, changed-after-confirmation, runsheet, copy text, sung and undo, People, roster, Planning, Sync, Settings, passcode change and unlock, state recovery, and keyboard focus.
- Secondary lifecycle checks passed for calendar copy, backup export and import, empty service assignments, feature-gated sync, service field editing, blank service creation, delete confirmation, conflict acknowledge and reopen, person rename and remove confirmation, the no Presider role gate, site lock and unlock, song history backfill and remove, and setlist delete confirmation.
- Contract validation loaded the local Playwright package and stopped at the required committed-artifact gate for direction-a phone evidence. This lane did not mutate Git state.

### Limitations and review

This is a local fictional proposal artifact. Clipboard writing is attempted only as a browser convenience, while the generated multiline text remains visible in a read-only text area. The contract validator needs controller Git integration before its committed-artifact gate can pass. The prototype has not been approved for production implementation. Controller review is pending.

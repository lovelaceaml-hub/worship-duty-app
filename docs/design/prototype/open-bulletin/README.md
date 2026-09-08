# Open Bulletin prototype

This folder contains the complete fictional clickable prototype for the selected Open Bulletin direction.

## Open locally

With the existing local server running:

http://127.0.0.1:8099/open-bulletin/index.html

The prototype is self contained. It uses local HTML, CSS, JavaScript, inline markup, Georgia, Arial, and fictional September 2026 fixtures. It does not call Firebase, a spreadsheet, a remote URL, or a font or icon service.

## Screens and review routes

- Home: ?screen=home
- My Duties: ?screen=duty
- Presider: ?screen=presider
- Manage: ?screen=manage
- Empty, Loading, Offline, Error, and Success: ?screen=empty, ?screen=loading, ?screen=offline, ?screen=error, ?screen=success
- Save failure review route: ?screen=presider&review=save-failure

The review toolbar is closed at the bottom of the page so it does not alter the product shell. It exposes the named route states for review only.

## Local validation

From /Users/anthony/Projects/worship-refactor-worktrees/design:

    node --check docs/design/prototype/open-bulletin/app.js
    node --check docs/design/prototype/open-bulletin/fixtures.js
    node docs/runs/worship-refactor-20260907/research/design/prototype/correction-2/verify-prototype.cjs
    node docs/design/prototype/contract/scripts/design-contract.mjs

The correction receipt uses the installed Playwright package from /Users/anthony/Projects/worship-duty-app/node_modules/playwright and the local axe package from /Users/anthony/Projects/worship-duty-app/node_modules/@axe-core/playwright. It installs loopback-only request routes before creating each page, uses fictional fixtures, and writes its results to /Users/anthony/Projects/worship-refactor-worktrees/design/docs/runs/worship-refactor-20260907/research/design/prototype/correction-2/results.json. The prototype server is the existing loopback server on port 8099.

## Scope and approval

The source visual anchor is /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/type-refinement/. This prototype extends that layout with local journeys and state changes. It remains a proposal artifact pending Anthony's full prototype approval. It is not production UI.

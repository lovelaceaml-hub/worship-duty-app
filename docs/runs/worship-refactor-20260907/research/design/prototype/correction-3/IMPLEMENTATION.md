# Correction 3 prototype handoff

The source correction is frozen for root integration. The original B Open Bulletin layout, spacing, white and blue character, and typography-only direction remain unchanged.

The bounded source changes in /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/open-bulletin/app.js are:

- service completion now requires a history entry for every current unique song in the selected service.
- applySung keeps one idempotent song and service history pair and adds only missing pairs after an outline edit.
- Undo remains reachable whenever any song history exists for the service, including an empty edited outline, and removes matching histories across the stats map so removed songs are included.
- import validation matches each setlist id, date, worship type, and service label to its owning service before state mutation.
- the sung confirmation text describes songs in the service rather than occurrences.

The targeted runner is /Users/anthony/Projects/worship-refactor-worktrees/design/docs/runs/worship-refactor-20260907/research/design/prototype/correction-3/verify-prototype.cjs. It retains the nine correction2 journeys and covers the added song, removed and empty outline Undo, and mismatched setlist identity import paths. Root independently exercised those paths in /private/tmp/worship-prototype-round3-controller.cjs with results at /private/tmp/worship-prototype-round3-controller.json. The retained correction2 receipt is /Users/anthony/Projects/worship-refactor-worktrees/design/docs/runs/worship-refactor-20260907/research/design/prototype/correction-2/results.json.

The contract-only selector correction is in /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/contract/design-contract.config.mjs. Three Home actions now target the visible data-nav duty link. The focused selector check passed prototype interactions, primary journeys, and required states.

This is a correction handoff. Root owns final verification, review3, integration, backup, and the pending full prototype approval decision.

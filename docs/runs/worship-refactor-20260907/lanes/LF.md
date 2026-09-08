---
lane: LF
title: Foundation
state: deployed
model: gpt-5.6-luna
runner: Codex
worktree: /Users/anthony/Projects/worship-refactor-worktrees/foundation
review: Sol-pass
depends_on: none
updated: 2026-09-08T01:47Z
---

# LF: Foundation

## Work order

Extract the first buildless Foundation boundary while preserving current app
startup, rendering, local keys, function and service IDs, full-snapshot sync
ownership, authReady write waiting, and the existing open-rule song writes.
Keep app.js as the composition root. Add frozen UMD APIs with injected data and
dependencies under src/core, src/domain, and src/services. Load every new local
runtime script in explicit order with ?v=DEV. Use fictional fixtures only in the
Foundation harness.

## Result

Completed the coherent extraction. The composition root now consumes frozen
constants, schedule transforms, sheet parsing, storage persistence, and a
Firebase write gateway. The gateway keeps app-owned writes behind authReady and
continues after an anonymous auth failure through the existing caught promise.
The shared core namespace contains only non-sensitive catalogs and the local
data key. Legacy member seed, name map, passcode fallback, Sheet URL, and
release version declarations remain in app.js at their original boundary.
The raw fb object and song-app integration remain available with their current
open-rule policy. Sheet merge behavior preserves manual fields, blank member
cells clear assignments, blank choir cells retain the title, and name-map
transforms return new state without implicit storage or time access. The
departments fallback deep-clones the frozen seed catalog before assigning it to
mutable app state.

Changed absolute paths:

- /Users/anthony/Projects/worship-refactor-worktrees/foundation/app.js
- /Users/anthony/Projects/worship-refactor-worktrees/foundation/index.html
- /Users/anthony/Projects/worship-refactor-worktrees/foundation/src/core/constants.js
- /Users/anthony/Projects/worship-refactor-worktrees/foundation/src/domain/schedule.js
- /Users/anthony/Projects/worship-refactor-worktrees/foundation/src/domain/sheet.js
- /Users/anthony/Projects/worship-refactor-worktrees/foundation/src/services/storage.js
- /Users/anthony/Projects/worship-refactor-worktrees/foundation/src/services/firebase.js
- /Users/anthony/Projects/worship-refactor-worktrees/foundation/docs/runs/worship-refactor-20260907/research/foundation/foundation-harness.cjs
- /Users/anthony/Projects/worship-refactor-worktrees/foundation/docs/runs/worship-refactor-20260907/research/foundation/FOUNDATION-INTERFACES.md
- /Users/anthony/Projects/worship-refactor-worktrees/foundation/docs/runs/worship-refactor-20260907/lanes/LF.md

Verification passed:

- `node --check app.js`
- `node --check src/core/constants.js`
- `node --check src/domain/schedule.js`
- `node --check src/domain/sheet.js`
- `node --check src/services/storage.js`
- `node --check src/services/firebase.js`
- `node --check docs/runs/worship-refactor-20260907/research/foundation/foundation-harness.cjs`
- `node docs/runs/worship-refactor-20260907/research/foundation/foundation-harness.cjs`
  Result: `Foundation harness passed: pure domains, sheet merge semantics, immutable name map, and auth-gated storage writes.`
- The index order and `?v=DEV` stamp assertion passed for all runtime, manifest,
  and icon references.
- `git diff --check` passed.
- `rg -n 'fb\.(setDoc|deleteDoc|writeBatch)' app.js` returned no matches, as
  expected after routing app-owned writes through the gateway.
- New Foundation files contain no em dash or en dash characters.
- The private and release value scan returned no matches in new src or research
  files.
- The core namespace boundary assertion passed, with legacy private and release
  values absent from the shared module.

The lane record path is
/Users/anthony/Projects/worship-refactor-worktrees/foundation/docs/runs/worship-refactor-20260907/lanes/LF.md.
No browser visual check, release staging, deployment, or Git mutation was
performed. Release must stage the five new src runtime files and the existing
manifest.json and icon.svg with the seven stamped references documented in
/Users/anthony/Projects/worship-refactor-worktrees/foundation/docs/runs/worship-refactor-20260907/research/foundation/FOUNDATION-INTERFACES.md.
The later song transfer should consume the injected document, batch, and
transaction methods while retaining the host auth attempt and open-rule write
policy. Central subscription lifecycle management and app state or screen mount
cleanup remain later refactor work in app.js.

## Review

Controller review pending. Git commit and push remain controller-owned.

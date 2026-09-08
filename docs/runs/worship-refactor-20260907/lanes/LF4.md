---
lane: LF4
title: Setlist domain extraction
state: ready-for-review
model: gpt-5.6-luna
runner: Codex
worktree: /Users/anthony/Projects/worship-refactor-worktrees/foundation-setlist-state
review: pending, root-owned native gpt-5.6-sol high
depends_on: LF3
updated: 2026-09-08T21:47Z
---

# LF4 implementation receipt

Task ID: LF4. The approved nonvisual setlist-domain capsule is implemented from
baseline `02cd552ef55d74e2560b06cf871e7592ebefd73b`. Source is frozen for root
copy and native review. Root owns integration, Git, release, and completion.

## Behavior

`WorshipApp.domain.setlist` now owns `isConfirmed(setlist)`,
`isChanged(setlist)`, `status(setlist)`, and
`summary(setlistsById, serviceId)`. The timestamp predicates retain the
truthy guards and direct `>=` and `<` comparisons, including comparable
Firestore timestamp values. Status preserves sung precedence, empty handling,
confirmed and changed states, and picked fallback. Summary preserves the
existing null or `{ count, confirmed, changed }` shape and false flags for zero
count. Inputs are read without mutation or timestamp normalization.

`member.setlistSummary` and `member.songStateFor` remain compatibility wrappers
over the extracted summary. `song-app.js` delegates predicates and status to
the domain, then maps semantic codes to the existing exact labels and classes.
The lazy song module statically imports the version-stamped setlist module so an
older host index can load the new dependency before module evaluation. The
module is also loaded before `member.js` in `index.html` and all active browser
boot lists. Rendered markup, styles, copy, Firebase access, subscriptions,
importer contracts, and song files are unchanged.

## Exact changed paths

- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-setlist-state/src/domain/setlist.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-setlist-state/src/domain/member.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-setlist-state/song-app.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-setlist-state/index.html`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-setlist-state/tests/setlist-domain.test.cjs`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-setlist-state/tests/fixture-baseline.mjs`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-setlist-state/docs/runs/worship-refactor-20260907/research/foundation/foundation-harness.cjs`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-setlist-state/docs/runs/worship-refactor-20260907/research/foundation-2/state-subscriptions.test.cjs`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-setlist-state/docs/runs/worship-refactor-20260907/research/foundation-3/actual-source-parity.test.cjs`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-setlist-state/docs/runs/worship-refactor-20260907/lanes/LF4.md`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-setlist-state/docs/runs/worship-refactor-20260907/logs/2026-09-08T21-20Z-LF4-setlist-domain-frozen.md`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-setlist-state/docs/runs/worship-refactor-20260907/logs/2026-09-08T21-29Z-LF4-review-correction.md`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-setlist-state/docs/runs/worship-refactor-20260907/logs/2026-09-08T21-47Z-LF4-mixed-release-static-import.md`

## Verification

- `node --check src/domain/setlist.js && node --check src/domain/member.js && node --check song-app.js`: passed.
- `node --test tests/setlist-domain.test.cjs`: 7 passed, 0 failed. Coverage includes CommonJS exports, equal and later timestamps, changed timestamps, comparable timestamp values, sung and empty status, malformed and missing input, exact summary shape, no mutation, member delegates, and the fictional mixed-release static import.
- `node docs/runs/worship-refactor-20260907/research/foundation/foundation-harness.cjs`: passed. Pure domains, sheet merge semantics, immutable name map, auth-gated storage writes, and browser module exposure passed.
- `WORSHIP_EVIDENCE_ROOT=/private/tmp/lf4-fixture-evidence-20260908-static-import WORSHIP_EVIDENCE_SCOPE=lf4-mixed-release-static-import node tests/fixture-baseline.mjs`: passed through the approved escalated loopback boundary. All 19 fictional scenarios passed on phone and desktop, with zero unexpected external requests.
- `node --test tests/release/staging.test.mjs`: 8 passed, 0 failed.
- Actual worktree staging via `stageRelease` with stamp `20990102030405`: passed. The plan contained `src/domain/setlist.js`, staged 21 runtime artifacts, rewrote both the lazy song module import and the index reference to `src/domain/setlist.js?v=20990102030405`, and removed the temporary stage.
- `node --test docs/runs/worship-refactor-20260907/research/foundation-2/state-subscriptions.test.cjs`: 6 passed, 0 failed after adding the setlist module to the active browser evaluator order.
- `node --test docs/runs/worship-refactor-20260907/research/foundation-3/actual-source-parity.test.cjs`: 4 passed, 0 failed after adding the stamped setlist module to the active HTML order and frozen namespace assertions.
- Active module-list scan: `index.html`, `tests/fixture-baseline.mjs`, `research/foundation/foundation-harness.cjs`, `research/foundation-2/state-subscriptions.test.cjs`, and `research/foundation-3/actual-source-parity.test.cjs` all include `src/domain/setlist.js` before `src/domain/member.js`. Matches in lane notes and historical verification receipts were preserved.
- `git diff --check`: passed.
- The mixed-release test models an old host with no `WorshipApp.domain.setlist`, evaluates the stamped side-effect import before `song-app.js`, confirms the frozen namespace and existing labels, and records zero reloads.

## Scope and safety

No Git mutation, deployment, network access, live data, emulator/provider,
Firebase or importer change was performed. No protected file was edited. The
loopback fixture used synthetic data only and wrote evidence under
`/private/tmp`. No active helper descendants exist.

## Handoff

Root may copy this frozen source into the read-only review worktree and retry
the native gpt-5.6-sol high review with a fresh snapshot. Review remains
pending. Keep LF4 ownership active for any bounded correction; do not release
ownership until root directs the next iteration.

Implemented-by: Codex/gpt-5.6-luna · Reviewed-by: pending LF4 native Sol high

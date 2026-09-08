---
lane: LF2
title: Foundation state and subscriptions
state: reviewed
model: gpt-5.6-luna
runner: Codex
worktree: /Users/anthony/Projects/worship-refactor-worktrees/foundation-state
review: Sol-pass
depends_on: LF,LR
updated: 2026-09-08T02:26Z
---

# Foundation 2 work order

Read the run INDEX and active plan first. Architecture critic approved this bounded continuation after the combined Foundation and Release review passed. One Luna max writer owns the isolated foundation-state worktree. No production interface changes.

Own app.js, index.html, new src/core/state.js and src/services/subscriptions.js, this lane receipt, and research/foundation-2 only. Keep all existing domain/storage/Firebase modules, song files, styles, functions, rules, release tooling, Git and production outside this capsule.

The state store exposes createStore(initial), get(), replace(next), setReady(key,value), areReady(keys). Preserve reference replacement, with a compatibility state alias refreshed through replaceState. Readiness lives independently of cached state and marks only members and departments; preserve explicit local/fallback readiness.

The subscription manager accepts injected raw Firebase, db, recentSince, setlistsSince, and emit. It owns idempotent start/stop, generation guards, and preview-to-full takeover, with no auth, storage, rendering, DOM, or writes. Register preview schedule, full schedule, members, settings, departments, name map, requests, setlists in that order. First full success retires preview before emitting; first empty full emits initial-empty once, later empty is authoritative. Errors leave preview alive. Emit known IDs for full snapshots. Missing document behavior stays identical.

Events: schedule-preview {services}; schedule-initial-empty {}; schedule-authoritative {services,knownIds}; schedule-error {error}; members {exists,list}; settings {exists,value}; departments {exists,map}; name-map {exists,map}; requests {items}; setlists {byId}.

App keeps exact callback ordering, writes, seeding, rendering and sync decisions. Protect render, renderSoon, afterDataChange, focus guard, ui drafts, scrolling, event delegation, renderSongs, songCtx and raw song Firebase. Do not add pagehide-only teardown or stop authoritative listeners on tab navigation. Explicit stop is for tests and true teardown. Song mount cleanup remains separate work.

Tests in research/foundation-2 verify exact replacement identity, readiness independence, listeners registering without auth waiting, preview/full ownership and late callback suppression, initial/later empty distinction, full IDs, missing docs, and start/stop/restart. Run syntax, these unit tests, existing Foundation harness, release tests and staging dry-run. Root runs fixture browser regressions before integrating or releasing. No Git/deploy by worker.

## Result

Task ID: WORSHIP-F2-20260907
Iteration: 1
State: completed

Implemented the state store and subscription manager while keeping the visible
screens unchanged. The store preserves object identity through replacement and
keeps member and department readiness independent of cached state. The manager
registers preview schedule, full schedule, members, settings, departments, name
map, requests, and setlists in the required order. It supports idempotent start
and stop, generation guards, preview retirement after full success, the initial
empty event, later authoritative empty snapshots, full snapshot IDs, and
missing document events. Subscription code contains no application side effects.

Changed absolute paths:

- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-state/app.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-state/index.html`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-state/src/core/state.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-state/src/services/subscriptions.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-state/docs/runs/worship-refactor-20260907/research/foundation-2/state-subscriptions.test.cjs`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-state/docs/runs/worship-refactor-20260907/lanes/LF2.md`

Validation from `/Users/anthony/Projects/worship-refactor-worktrees/foundation-state`:

- `node --test docs/runs/worship-refactor-20260907/research/foundation-2/*.test.cjs`: 4 passed, 0 failed.
- `node docs/runs/worship-refactor-20260907/research/foundation/foundation-harness.cjs`: passed.
- `node --check app.js && node --check src/core/state.js && node --check src/domain/schedule.js && node --check src/domain/sheet.js && node --check src/services/storage.js && node --check src/services/firebase.js && node --check src/services/subscriptions.js`: passed.
- `node --test tests/release/*.test.mjs`: 8 passed, 0 failed.
- `bash scripts/deploy.sh --dry-run`: passed. Staging produced 18 runtime artifacts and started no Firebase command.
- `git diff --check`: passed.

Review remains pending controller review. Git, deployment, integration, and
production remain controller owned. No protected paths were changed. Source is
frozen for root integration and fixture browser regression.

## Correction round 1

The native Sol review reproduced a partial startup failure: when a listener
registration threw synchronously after preview registration, only the failing
entry was removed. The manager stayed active, earlier callbacks remained live,
and a later start was skipped. Startup now rolls back every accumulated entry
once, invalidates the failed generation, resets manager references, and
rethrows the original error. Query and reference construction errors inside
startup receive the same cleanup path.

The focused regression injects a registration throw, verifies earlier listener
cancellation and late callback suppression, then clears the injected failure
and verifies a successful restart with the normal event order.

Correction validation from `/Users/anthony/Projects/worship-refactor-worktrees/foundation-state`:

- `node --test docs/runs/worship-refactor-20260907/research/foundation-2/*.test.cjs`: 5 passed, 0 failed.
- `node --check src/services/subscriptions.js && node --check docs/runs/worship-refactor-20260907/research/foundation-2/state-subscriptions.test.cjs`: passed.
- `bash scripts/deploy.sh --dry-run`: passed. Staging produced 18 runtime artifacts and started no Firebase command.
- `git diff --check`: passed.

Review status remains pending Sol round 2 and controller review. Root reported
13 combined release and LF2 tests passed. The native reviewer PWA check was
sandbox socket blocked only. No Git, deployment, integration, or production
actions were taken. Source is frozen for root copy.

## Correction round 2

The native Sol review found that the new subscriptions service was absent from
the initial Foundation dependency guard. The guard now requires a callable
`createManager` before any app state, Firebase, or persistence setup runs. The
focused regression supplies every older dependency but omits subscriptions and
confirms the app fails at the guard with zero adapter calls.

Correction validation from `/Users/anthony/Projects/worship-refactor-worktrees/foundation-state`:

- `node --test docs/runs/worship-refactor-20260907/research/foundation-2/*.test.cjs`: 6 passed, 0 failed.
- `node --check app.js && node --check docs/runs/worship-refactor-20260907/research/foundation-2/state-subscriptions.test.cjs`: passed.
- `git diff --check`: passed.

The older Foundation harness does not load the new subscriptions module and
now stops at the intended dependency guard. It was not edited because this
round owns only app.js, the LF2 research tests, and this receipt. Root should
load the new runtime module in that harness before using it as a full check.
Review remains pending controller review. No Git, deployment, integration, or
production actions were taken. Source is frozen for root copy.

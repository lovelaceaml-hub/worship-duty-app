# Verification correction round 4

Recorded: 2026-09-08

This round corrected fixture determinism and emulator isolation after native
Sol round 3. Production source, Git state, deployment state, and the original
baseline artifacts were left unchanged in this lane. The canonical browser
run used the reviewed Foundation source from `/Users/anthony/Projects/worship-duty-app`.

## Browser checks

The fixture page keeps the fixed September calendar for all journeys. The
confirmation scenario then installs an isolated advancing `Date.now` class.
The immutable baseline is expected to expose the old double-stamp behavior,
while the canonical source must confirm with one timestamp. The setlist race
uses an explicit deferred snapshot callback released after the Library picker
mounts. It has no timer-based race delay. Manage records edit-before-release
state and logical auth event order, so equal `performance.now` values do not
invalidate the ordering proof. Real performance timings remain recorded.

Baseline command:

```text
npm_config_cache=/tmp/npm-cache WORSHIP_EXPECT_CONFIRMATION_REGRESSION=1 WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round4-baseline WORSHIP_EVIDENCE_SCOPE=round4-baseline-advancing-confirmation-deferred-snapshot npm run test:ui
```

Result: `passed-with-expected-regression`, 15 scenarios, zero unexpected
requests. Phone ready time was 55.38 ms and desktop ready time was 53.50 ms.
The confirmation result was `confirmed=0`, `changed=1`, two advancing Date
calls, `confirmedAt=1788807600001`, and `updatedAt=1788807600002`. The race
released two deferred setlist listeners explicitly. Evidence is at
`round4-baseline/fixture-baseline.json` and `round4-baseline/fixture-baseline.md`.

Canonical Foundation command:

```text
npm_config_cache=/tmp/npm-cache WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round4-foundation WORSHIP_EVIDENCE_SCOPE=round4-foundation-advancing-confirmation-deferred-snapshot npm run test:ui
```

Result: `passed`, 15 scenarios, zero unexpected requests. Phone ready time was
58.01 ms and desktop ready time was 56.58 ms. The confirmation result was
`confirmed=1`, `changed=0`, one advancing Date call, and equal timestamps
`confirmedAt=updatedAt=1788807600001`. Evidence is at
`round4-foundation/fixture-baseline.json` and
`round4-foundation/fixture-baseline.md`.

Both runs recorded zero axe violations in schedule, My Duties, Presider,
site-lock, and unlocked captures. My Duties reported one incomplete check per
viewport. Manage retained critical `label` and `select-name` violations. Those
Manage findings remain redesign input and are not included in the clean-view
claim.

## Emulator checks

The bounded emulator used the cached CLI at
`/tmp/npm-cache/_npx/ba4f1959e38407b5/node_modules/firebase-tools/lib/bin/firebase.js`,
Java at `/Users/anthony/tools/jdk/Contents/Home/bin/java`, temporary rules at
`/private/tmp/worship-emulator-round4/firestore.rules`, and Firestore at
`127.0.0.1:8193` in fictional project `demo-worship-refactor`. Functions
emulation was disabled. Each run generated a unique suffix, touched only its
own `setlists` documents, and cleaned only those documents. Two runs executed
concurrently and their intervals overlapped.

Baseline emulator command:

```text
WORSHIP_EMULATOR_PROJECT=demo-worship-refactor FIRESTORE_EMULATOR_HOST=127.0.0.1:8193 WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round4-emulator-baseline WORSHIP_EVIDENCE_SCOPE=round4-emulator-baseline-unique-concurrent node /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/emulator-setlist-baseline.mjs
```

Result: passed two concurrent runs. Alpha existing/missing timings were
31.79/14.93 ms. Beta existing/missing timings were 32.24/14.30 ms. Evidence
is at `round4-emulator-baseline/emulator-setlist-baseline.json` and
`round4-emulator-baseline/emulator-setlist-baseline.md`.

Canonical emulator command:

```text
WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EMULATOR_PROJECT=demo-worship-refactor FIRESTORE_EMULATOR_HOST=127.0.0.1:8193 WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round4-emulator-foundation WORSHIP_EVIDENCE_SCOPE=round4-emulator-foundation-unique-concurrent node /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/emulator-setlist-baseline.mjs
```

Result: passed two concurrent runs. Alpha existing/missing timings were
16.11/10.84 ms. Beta existing/missing timings were 16.67/11.23 ms. Evidence
is at `round4-emulator-foundation/emulator-setlist-baseline.json` and
`round4-emulator-foundation/emulator-setlist-baseline.md`.

The emulator source digest uses the same sorted method label as the browser
harness. Both emulator reports record two unique document paths and overlapping
run intervals. The emulator was stopped after both checks.

Native Sol round 4 review is pending. No Git, merge, push, or deployment was
performed by this lane.

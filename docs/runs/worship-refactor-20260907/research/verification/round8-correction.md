# Verification correction round 8

Recorded 2026-09-08. This round addresses the three bounded P2 findings from
native Sol round 7. Browser fixtures remain fictional and loopback-only.

## Changes

- `emulator-setlist-baseline.mjs` now reads one immutable runtime byte snapshot
  before hashing. The same snapshot supplies `song-app.js` to both concurrent
  actual-function evaluations, so the receipt digest cannot describe bytes
  different from the function under test.
- Browser screenshots are written under `screenshots/<run-id>/`. The running
  receipt creates and records that directory before source discovery. The
  failure replacement probe invokes the actual lifecycle wrapper after a
  prior green receipt and proves the old run screenshot remains separate and
  unchanged while the new run receives an empty directory.
- The pure Sheet fixture includes a `Closing Prayer` row with a blank `Member`
  cell and an existing fictional assignment. The parser and merge assertions
  require that assignment to become an empty value while the seeded fictional
  unmanaged `Media Booth #1` assignment remains.

## Browser results

Baseline command:

```text
WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round8-baseline WORSHIP_EVIDENCE_SCOPE=immutable-baseline-round8 WORSHIP_EXPECT_CONFIRMATION_REGRESSION=1 node /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/fixture-baseline.mjs
```

Result: `passed-with-expected-regression`, 19 scenarios, 17 Axe views, zero
unexpected aggregate requests, and zero unexpected browser errors. The
explicit baseline confirmation regression remains expected. Digest:
`ec7ff363e5e142ad9c64f81c8d09c0ed485a12a5db6ac85a994cf33cdbdeed62`.
Ready timings were 52.51 ms on phone and 54.53 ms on desktop. Run ID:
`fixture-run-ffde93e9-0105-474d-bdf7-ef7f9d454e35`. Evidence:

- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round8-baseline/fixture-baseline.json`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round8-baseline/fixture-baseline.md`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round8-baseline/screenshots/fixture-run-ffde93e9-0105-474d-bdf7-ef7f9d454e35/`

Canonical command:

```text
WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round8-canonical WORSHIP_EVIDENCE_SCOPE=current-canonical-round8 node /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/fixture-baseline.mjs
```

Result: `passed`, 19 scenarios, 17 Axe views, zero unexpected aggregate
requests, and zero unexpected browser errors. Digest:
`37af96cb1f58d3b5e061f255910269bb0ff4a896873b204703ca52215de3f7f5` over 16
sorted runtime files. Ready timings were 57.46 ms on phone and 57.52 ms on
desktop. Run ID: `fixture-run-fa3ce710-8bd9-4c5b-b3a0-818f81db2835`. Evidence:

- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round8-canonical/fixture-baseline.json`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round8-canonical/fixture-baseline.md`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round8-canonical/screenshots/fixture-run-fa3ce710-8bd9-4c5b-b3a0-818f81db2835/`

Both reports retain the exact per-view Manage Axe allowlist: 33 known critical
findings on each Manage view, 66 total. The other 15 views have no known
baseline findings. These are guarded fixture results, not full accessibility
passes. The original baseline reports remain unchanged. Emulator execution is
deferred to root on the already running fictional project and loopback host.

## Focused checks

- `node --check /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/fixture-baseline.mjs`, passed.
- `node --check /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/emulator-setlist-baseline.mjs`, passed.
- `git diff --check -- /Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/lanes/LV.md`, passed.

Changed verification sources:

- `/Users/anthony/Projects/worship-refactor-worktrees/verification/tests/fixture-baseline.mjs`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/tests/emulator-setlist-baseline.mjs`

Native Sol round 8 review is pending. No production source, Git, deployment,
or emulator changes were made by this lane.

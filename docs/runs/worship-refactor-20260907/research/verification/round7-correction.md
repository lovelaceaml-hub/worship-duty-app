# Verification correction round 7

Recorded 2026-09-08. This round closes the three harness findings from the
native Sol round 6 review. The fixture source, browser data, and network probes
remain fictional and loopback-only.

## Changes

- `closeFixtureRun` now classifies every captured blocked request and denied
  fetch. The only aggregate expected external records are the intentional
  Google Docs and Apps Script guard probes. The synthetic popup is recorded in
  `expectedFixtureBlocks`. Any other origin is placed in `unexpected` and
  fails the run.
- The same run close path rejects captured console errors and page errors.
  The launch scenario injects a real `console.error` and a dynamically
  executed throwing script, then proves both event handlers recorded the
  errors and rejected the isolated run. The separate unapproved fetch and
  resource probe proves that both fetch denial and resource blocking are
  classified as unexpected.
- `runWithEvidenceLifecycle` writes a run identity with `running` status before
  source discovery, browser launch, or assertions. Its catch path writes the
  `failed` receipt before rethrowing. The failure replacement scenario runs
  this same wrapper after a prior green receipt and verifies that the old green
  JSON and Markdown become a failed receipt without changing the old screenshot
  or source digest.

## Results

The immutable baseline command was:

```text
WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round7-baseline WORSHIP_EVIDENCE_SCOPE=immutable-baseline-round7 WORSHIP_EXPECT_CONFIRMATION_REGRESSION=1 node /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/fixture-baseline.mjs
```

It exited 0 with `passed-with-expected-regression`, 19 scenarios, 17 Axe
views, zero unexpected aggregate requests, and zero captured unexpected
browser errors. The confirmation scenario remains the known baseline defect,
with the explicit expected regression flag. Source digest:
`ec7ff363e5e142ad9c64f81c8d09c0ed485a12a5db6ac85a994cf33cdbdeed62`.
Navigation and ready timings were 23.52 ms and 53.72 ms on phone, and 28.09
ms and 52.38 ms on desktop. Evidence:

- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round7-baseline/fixture-baseline.json`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round7-baseline/fixture-baseline.md`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round7-baseline/screenshots/`

The canonical command was:

```text
WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round7-canonical WORSHIP_EVIDENCE_SCOPE=current-canonical-round7 node /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/fixture-baseline.mjs
```

It exited 0 with `passed`, 19 scenarios, 17 Axe views, zero unexpected
aggregate requests, and zero captured unexpected browser errors. Source
digest:
`37af96cb1f58d3b5e061f255910269bb0ff4a896873b204703ca52215de3f7f5` over 16
sorted runtime files. Navigation and ready timings were 30.26 ms and 55.31 ms
on phone, and 29.44 ms and 56.28 ms on desktop. Evidence:

- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round7-canonical/fixture-baseline.json`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round7-canonical/fixture-baseline.md`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round7-canonical/screenshots/`

Both JSON records include the source digest method
`sha256-v2:path-null-byte-and-file-bytes;order=lexicographic-relative-path`,
the sorted file list, the run identity, final status, and the classified
network records. The temporary wrapper compatibility check also passed:

```text
UI_BASE_URL=https://fixture-live.invalid npm_config_cache=/tmp/npm-cache WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_ROOT=/private/tmp/worship-wrapper-round7 WORSHIP_EVIDENCE_SCOPE=wrapper-compatibility-round7 npm run test:ui
```

It printed that fixture-only mode was active and that `UI_BASE_URL` was
ignored, then exited 0 with 19 scenarios and 17 Axe views.

## Accessibility and limitations

The Axe guard ran for every captured view and all impacts. The baseline and
canonical records retain 33 known critical `label` and `select-name` findings
on each Manage view, 66 total, under separate exact target allowlists. The
other 15 captured views have no known baseline findings. This is a guarded
fixture result, not a full accessibility pass. The known confirmation defect
is expected only for the immutable baseline. No emulator was rerun in this
round. Native Sol round 7 review is pending.

Changed verification source: `/Users/anthony/Projects/worship-refactor-worktrees/verification/tests/fixture-baseline.mjs`.

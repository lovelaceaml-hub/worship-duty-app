# Verification correction round 6

Recorded 2026-09-08. The fixture harness now reads one immutable runtime
snapshot before starting its loopback server. The source digest and static
responses use that same byte map, and pure helper evaluation uses the same
map. A temporary isolated copy is edited after snapshot creation to prove
that the disk edit changes a fresh disk digest while the served and evaluated
snapshot stays unchanged. The temporary isolated copy is removed after the
check. Browser data used by the harness remains fictional; the copied source
bytes are runtime input used only for this integrity check.

The browser network guard is installed on the browser context before its first
page is created. A real harness context opens `https://fixture-popup.invalid/initial`.
The request is recorded as a blocked synthetic origin in a separate expected
fixture-block list and fails with `net::ERR_BLOCKED_BY_CLIENT`. It is not
counted as unexpected production traffic. The browser launch failure probe
also confirms that its loopback server closes when launch fails.

The local seed scenario starts with no `wds-data-v2` value. It asserts that the
fictional member list and both fictional services are initialized from
`seed-data.js`, and records the app's default site lock before enabling the
fixture view through the test-only QA state hook. The pure merge scenario
seeds an unmanaged `Media Booth Fixture` duty before applying a fictional
sheet row and asserts that the duty remains.

## Browser commands and results

Baseline command:

```text
WORSHIP_EXPECT_CONFIRMATION_REGRESSION=1 WORSHIP_EVIDENCE_SCOPE=immutable-baseline-round6 WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round6-baseline npm_config_cache=/tmp/npm-cache npm run test:ui
```

Result: `passed-with-expected-regression`, all 19 scenarios, zero unexpected
requests. The expected result is the unchanged baseline confirmation defect:
two advancing Date calls, distinct metadata timestamps, and a changed
confirmation state. Source digest:
`ec7ff363e5e142ad9c64f81c8d09c0ed485a12a5db6ac85a994cf33cdbdeed62`.
Phone ready time was 51.98 ms and desktop ready time was 56.20 ms.

Canonical command:

```text
WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_SCOPE=canonical-round6 WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round6-canonical npm_config_cache=/tmp/npm-cache npm run test:ui
```

Result: `passed`, all 19 scenarios, zero unexpected requests. Confirmation
used one metadata timestamp and entered the completed state. Source digest:
`37af96cb1f58d3b5e061f255910269bb0ff4a896873b204703ca52215de3f7f5`.
Phone ready time was 58.13 ms and desktop ready time was 237.40 ms.

Evidence files:

- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round6-baseline/fixture-baseline.json`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round6-canonical/fixture-baseline.json`

Both reports record 17 captured views, per-view Axe guard output, the popup
block, empty-storage initialization, the preserved unmanaged duty, and only
fictional fixture values. Network records retain origins and categories only,
with the synthetic popup block listed separately from unexpected traffic.
The Manage accessibility findings remain the documented exact baseline
allowlist, so these reports are not a full accessibility pass. The emulator
checks were intentionally not rerun in this correction round.

Native Sol review 6 is pending. This lane made no production, Git, deploy, or
emulator changes.

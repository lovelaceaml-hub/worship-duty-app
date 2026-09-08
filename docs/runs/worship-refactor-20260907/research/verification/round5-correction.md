# Verification correction round 5

Recorded 2026-09-08. This round kept the fixture browser isolation, fixed
September calendar, reduced-motion context, advancing confirmation clock,
explicit setlist snapshot release, logical auth ordering, and unique emulator
document behavior from the previous correction.

The compatibility entrypoint now prints fixture-only mode and states that a
supplied `UI_BASE_URL` is ignored. The browser harness now checks every Axe
capture across every impact. Each finding is compared by view, rule ID,
impact, and exact fixture-stable target. The only allowlisted baseline debt is
the 33 critical Manage editor findings for `label` and `select-name`. The
guard self-check rejects new serious, moderate, and critical findings, a
finding on another view, and an extra copy of a known node. Evidence marks
`fullAccessibilityPass` false and lists the per-view allowlist, including
empty lists for clean views.

The original immutable baseline artifacts were not overwritten. New evidence
was written under the round5 folders below. The fixture suite also restored the
original fictional Library no-match empty state, Services view, and Insights
view checks on phone and desktop. Pure helper evaluation now optionally loads
`src/domain/member.js` and `src/domain/coordinator.js` in the canonical
`index.html` script order, while the baseline source remains valid when those
files are absent.

The `WORSHIP_EXPECT_CONFIRMATION_REGRESSION=1` override is accepted only when
the discovered runtime source digest matches the immutable baseline digest. A
current or arbitrary source cannot use the baseline exception to report a
clean result. Verification with the canonical source and the override exited
1 with `WORSHIP_EXPECT_CONFIRMATION_REGRESSION=1 is restricted to the immutable
baseline source digest` before opening the fixture server.

## Baseline browser result

Command:

```text
UI_BASE_URL=https://invalid.example.invalid npm_config_cache=/tmp/npm-cache WORSHIP_EXPECT_CONFIRMATION_REGRESSION=1 WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-baseline WORSHIP_EVIDENCE_SCOPE=round5-baseline-axe-all-journeys npm run test:ui
```

Result: exit 0 with `passed-with-expected-regression`, 19 scenarios, zero
unexpected requests, and the wrapper disclosure that `UI_BASE_URL` was not
used. Phone ready time was 55.69 ms and desktop ready time was 55.18 ms.
The advancing confirmation check recorded `confirmed=0`, `changed=1`, two
Date calls, and distinct timestamps. Evidence is at
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-baseline/fixture-baseline.json`.

Sixteen Axe views were captured. Fifteen had no violations. The Manage view
matched the exact 33 finding allowlist. My Duties retained one incomplete Axe
check per viewport. No view was reported as a full accessibility pass.

## Canonical Foundation result

Command:

```text
npm_config_cache=/tmp/npm-cache WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-foundation WORSHIP_EVIDENCE_SCOPE=round5-foundation-axe-all-journeys npm run test:ui
```

Result: exit 0 with `passed`, 19 scenarios, zero unexpected requests, phone
ready time 54.75 ms, and desktop ready time 55.65 ms. Confirmation passed with
one Date call and equal metadata timestamps. Evidence is at
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-foundation/fixture-baseline.json`.

## F3 source result

Command:

```text
npm_config_cache=/tmp/npm-cache WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/foundation-domain WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-f3-foundation WORSHIP_EVIDENCE_SCOPE=round5-f3-foundation-axe-all-journeys npm run test:ui
```

Result: exit 0 with `passed`, 19 scenarios, zero unexpected requests, phone
ready time 59.98 ms, and desktop ready time 55.70 ms. The optional member and
coordinator modules loaded successfully in the F3 script order. Evidence is
at
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-f3-foundation/fixture-baseline.json`.

The fixed calendar remains test-only. The baseline confirmation defect is
still an expected regression in the immutable source, while canonical
Foundation and F3 pass the advancing-clock check. No production source was
edited. Native Sol round 5 review remains pending.

## Final Manage viewport correction

The Manage journey now runs at phone 390x844 and desktop 1440x1000. The
immutable baseline desktop probe found 33 exact critical `label` and
`select-name` findings. They are listed separately under `manage-desktop`, so
the per-view Axe guard does not use a global ID exception.

Final baseline command:

```text
npm_config_cache=/tmp/npm-cache WORSHIP_EXPECT_CONFIRMATION_REGRESSION=1 WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-final-baseline WORSHIP_EVIDENCE_SCOPE=round5-final-baseline-manage-phone-desktop npm run test:ui
```

Result: `passed-with-expected-regression`, 19 scenarios, 17 captured Axe
views, 66 allowlisted Manage findings, zero unexpected requests, phone ready
56.88 ms, and desktop ready 55.59 ms. Both Manage viewports proved zero
pre-auth application attempts and edit-before-release ordering. Evidence:
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-final-baseline/fixture-baseline.json`.

Final canonical command:

```text
npm_config_cache=/tmp/npm-cache WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-final-canonical WORSHIP_EVIDENCE_SCOPE=round5-final-canonical-manage-phone-desktop npm run test:ui
```

Result: `passed`, 19 scenarios, 17 captured Axe views, zero unexpected
requests, phone ready 55.53 ms, and desktop ready 57.72 ms. The canonical
source was already updated to the frozen F3 runtime. Evidence:
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-final-canonical/fixture-baseline.json`.

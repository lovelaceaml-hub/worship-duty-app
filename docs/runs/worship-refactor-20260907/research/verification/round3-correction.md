# Verification correction round 3

Recorded: 2026-09-08T02:44:02Z

This round corrected fixture evidence determinism only. It did not change
production source, Git state, deployment state, or the committed original
baseline artifacts. The browser still receives fictional schedule, member,
song, and passcode fixtures through the loopback server.

## Harness corrections

- Each fixture browser context now uses `reducedMotion: 'reduce'` before any
  axe run or screenshot.
- Each fixture page calls
  `page.clock.setFixedTime(new Date('2026-09-07T12:00:00-07:00'))` before
  navigation. This fixes the fixture calendar date while Playwright keeps
  timers and performance clocks real. The fixed calendar does not address the
  separate production confirmation metadata defect described below.
- Runtime paths are sorted lexicographically before hashing. Evidence labels
  the method as
  `sha256-v2:path-null-byte-and-file-bytes;order=lexicographic-relative-path`
  and records the file order explicitly.

## Verification commands and results

Baseline command:

```text
npm_config_cache=/tmp/npm-cache WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round3-baseline WORSHIP_EVIDENCE_SCOPE=round3-baseline-fixed-date-motion npm run test:ui
```

Result: passed all 15 fictional scenarios, with zero unexpected requests.
Evidence: `round3-baseline/fixture-baseline.json` and
`round3-baseline/fixture-baseline.md`. Phone ready time was 53.76 ms and
desktop ready time was 54.02 ms. The sorted source digest was
`ec7ff363e5e142ad9c64f81c8d09c0ed485a12a5db6ac85a994cf33cdbdeed62`.

Canonical Foundation command:

```text
npm_config_cache=/tmp/npm-cache WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round3-foundation WORSHIP_EVIDENCE_SCOPE=round3-foundation-fixed-date-motion npm run test:ui
```

Result: passed all 15 fictional scenarios, with zero unexpected requests.
Evidence: `round3-foundation/fixture-baseline.json` and
`round3-foundation/fixture-baseline.md`. Phone ready time was 58.50 ms and
desktop ready time was 57.48 ms. The sorted source digest was
`46f2fa08d56dc7470be3b35afe756ef637282c45c0246f0cb88146b36bd0ed3c`.

## Accessibility findings

Both runs recorded zero axe violations for schedule, My Duties, and presider
views at phone and desktop sizes. Each My Duties capture reported one
incomplete axe check, with no violation, and all other captured views reported
zero incomplete checks. The fictional site-lock and unlocked captures also
reported zero violations and zero incomplete checks. The Manage capture
retained critical `label` and `select-name` violations, which remain redesign
input. No critical axe violations were recorded in the schedule, My Duties,
Presider, site-lock, or unlocked captures.

## Confirmation investigation

The earlier one-off timeout waiting for `Songs confirmed` was not reproduced
by ten baseline attempts, ten canonical attempts, or three canonical attempts
with a 1500 ms delayed setlist snapshot. The delayed run showed that `.ns-tabs`
can mount before setlist rows and the confirm button exist, but the existing
Playwright text click auto-waited and all attempts passed. The source behavior
still has a separate defect: `confirmSetlist` stamps metadata, then
`updateSetlist` stamps the same patch again. With an advancing `now()` this can
produce `confirmedAt=101`, `updatedAt=102`, and `isConfirmed=false`. This is a
production source correction owned by the root lane. The fixed browser Date is
only for calendar determinism and can conceal this double-stamp because both
calls return one value. An advancing-clock regression is still required.

The minimal harness readiness improvement, if needed after the source fix, is
to wait for the confirm button selector before clicking and then wait for the
fake `setlists/updateDoc` write before asserting `Songs confirmed`. It was not
added in this round because the existing click passed the targeted delayed
probe and the current source remains under native review.

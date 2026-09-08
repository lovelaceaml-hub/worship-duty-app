---
lane: LVC
title: Calendar redesign fictional acceptance verification
state: merged
model: gpt-5.6-luna
runner: Codex
worktree: /Users/anthony/Projects/worship-refactor-worktrees/calendar-verification
review: Sol-pass
depends_on: LDU calendar redesign prototype
updated: 2026-09-08T18:53Z
---

# LVC: Calendar redesign fictional acceptance verification

## Work order

Create deterministic Playwright and axe acceptance checks for the approved
local calendar redesign. Use the canonical preview server with an injected
fictional payload, point `prototypeRoot` at the LDU calendar redesign
prototype, cover phone and desktop journeys, and prove that real mode remains
view-only with no external requests or browser writes.

## Result

The test source is in
`/Users/anthony/Projects/worship-refactor-worktrees/calendar-verification/tests/calendar-redesign.mjs`.
It uses canonical Playwright, Axe, and
`/Users/anthony/Projects/worship-duty-app/scripts/real-preview.cjs` imports.
The default prototype root is portable for canonical integration and can be
overridden with `WORSHIP_PROTOTYPE_ROOT`; the loopback port can be overridden
with `WORSHIP_PREVIEW_TEST_PORT`.

The fictional payload covers direct department rosters, a standalone service
shell, coincident same-date services, a later selected member presider, a
legacy `status: confirmed` setlist without a boolean, changed and sung plans,
no-plan services, `Appx. 3` in Glory and Thanks, choir context, save failure
and retry, confirmation followed by an edit, song search, and Preparation
song add and reorder. Real mode uses the same shape as an injected fixture
but remains guarded against all browser writes and non-loopback requests.

The active selector contract uses `#header-member-select`, `[data-calendar]`,
`[data-action="calendar-prev|calendar-next|calendar-day|calendar-clear"]`,
`[data-calendar-day]`, `#home-department`, `#duty-department`,
`#manage-department-choice`, `[data-duty-date]`, `[data-duty-service]`,
`[data-action="open-duty-team"]`, `.complete-team[data-complete-team]`,
`#presider-filter`, `#presider-service`,
`[data-service-summary][data-service-id]`, `[data-confirmation-state]`,
`[data-song-group]`, `select[data-change="glory-song"]`,
`select[data-change="thanks-song"]`, `[data-action="save-setlist"]`,
`[data-action="retry-save"]`, `[data-action="confirm-songs"]`,
`#song-library-panel`, `#song-search`, `[data-month-service-list]`,
`[data-preview-state="unavailable"]`, and the Manage assignment row classes.

## Verification

`node --check /Users/anthony/Projects/worship-refactor-worktrees/calendar-verification/tests/calendar-redesign.mjs` passed. The strict enabled run against
the LDU prototype used:

```text
WORSHIP_PREVIEW_TEST_PORT=8122 WORSHIP_PROTOTYPE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/calendar-redesign/docs/design/prototype/open-bulletin node /Users/anthony/Projects/worship-refactor-worktrees/calendar-verification/tests/calendar-redesign.mjs
```

The run reached the first phone Home axe gate and failed on two UI findings:
color contrast for several muted labels and duplicate landmark names for the
January 2027 calendar and month schedule regions. This is a UI dependency
finding, not a weakened test assertion. A prior diagnostic run with axe
temporarily bypassed passed the functional journey, but it is not acceptance
evidence and no bypass remains in the source. Root's later full enabled run
reproduced the same two Axe findings.

The guard rejects every non-loopback request and every non-GET request. It was
installed before navigation; the strict run stopped at Axe before the final
aggregate guard assertion. The payload contains only fictional names,
services, assignments, songs, and statuses. No real records, external
network, screenshots, traces, Git state, server ownership, deployment, or
production source were touched.

Review remains pending controller Sol high review. Root must rerun the full
enabled command after the bounded LDU Axe corrections and record the final
result.

## Root integration result

Integrated canonical source passed the fully enabled comprehensive journey suite, final fictional reference Axe checks, aggregate-only real smoke and native Sol high review2. All accepted findings are corrected. Lane source is frozen; full-prototype production approval remains pending.

Implemented-by: Codex/gpt-5.6-luna · Reviewed-by: Codex/gpt-5.6-sol (native, high)

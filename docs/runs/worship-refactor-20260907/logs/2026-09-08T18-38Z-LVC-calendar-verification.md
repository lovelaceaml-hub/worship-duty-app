# 2026-09-08T18:38Z LVC calendar verification

Task ID: `LVC-CALENDAR-VERIFICATION-20260908`

The acceptance source is
`/Users/anthony/Projects/worship-refactor-worktrees/calendar-verification/tests/calendar-redesign.mjs`.
It is limited to fictional injected data and the canonical local preview
server. `WORSHIP_PROTOTYPE_ROOT` points to the LDU prototype for this run and
`WORSHIP_PREVIEW_TEST_PORT=8122` avoids the controller's baseline port.

Checks include phone and desktop Home and My Duties journeys, header name
selection and focus, calendar arrows across December 2026 and January 2027,
keyboard month changes with retained focus, date and whole-month selection,
department filtering and filtered month counts, compact month services with
expanded assignment rows, grouped same-date duties with distinct service IDs
and times, full-team expansion, past month behavior, Presider filters and
status predicates, no-plan context, `Appx. 3` in read-only Glory and Thanks,
fictional Glory and Thanks editing, Preparation add and reorder, save failure
and retry, confirmation then changed state, song search panel close and
reopen, Manage department-first filtering, empty state, and unavailable state.

The request guard is installed before navigation and rejects non-loopback and
non-GET requests. The strict run stopped at the first Axe gate before its
final aggregate guard assertion. The error-state test permits only the
expected local 503 console message. The test source has no disabled `if
(false)` acceptance blocks and no Axe bypass.

Verification:

- `node --check /Users/anthony/Projects/worship-refactor-worktrees/calendar-verification/tests/calendar-redesign.mjs`: passed.
- `WORSHIP_PREVIEW_TEST_PORT=8122 WORSHIP_PROTOTYPE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/calendar-redesign/docs/design/prototype/open-bulletin node /Users/anthony/Projects/worship-refactor-worktrees/calendar-verification/tests/calendar-redesign.mjs`: blocked at `home 430 has accessibility violations`.
- Exact first findings were muted-label color-contrast failures and duplicate January 2027 landmark names for calendar and month schedule. Root reproduced the same findings with all assertions enabled.

The earlier functional-only diagnostic passed, but it had Axe disabled and is
not acceptance evidence. No Git, production source, server ownership,
deployment, real-data read, screenshot, trace, or external network action was
performed. Controller Sol high review remains pending; rerun after LDU fixes.

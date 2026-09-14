# Design Gallery and Authentication Reconciliation

Status: In progress

Baseline: `5d270003afe9cdeb72299cbb0157ed7075b16668`

## Setup

- Runner: coordinator
- Controller: Sol, integration and production release
- Writers: Luna, high reasoning through the pinned executor role
- Review: proportional Luna peer checks, then one independent completion review only after integration
- Release: real-data test site first, then replace the current production appearance after Anthony confirms the combined preview

## Frozen design targets

- Target ID: `WDS-GALLERY-ORIGINAL-PRISM-NAVY-AURORA`
- Anthony selection: restore all four preserved designs as replacements for the current single appearance, 13 September 2026
- Sources: `design-gallery/`, `prototype-prism/`, `live-design/`, and `prototype/` from `origin/feature/design-gallery-opt-in`
- Canonical viewports: phone and desktop
- Allowed deviation: compatibility changes required for the released authentication and permission architecture
- Material visual changes require Anthony approval

## Lanes

### Lane V: Preserved visual sources

Owns `prototype/`, `live-design/`, and non-test `prototype-prism/` files.

- Model: `executor_luna`, high reasoning
- Worktree: `/Users/anthony/Projects/worship-duty-app-worktrees/design-gallery-visuals`
- Review: one fresh read-only Luna peer after implementation, only if the lane changes behavior

### Lane R: Gallery runtime

Owns the chooser, adapters, gallery build, and release tooling under `design-gallery/`, excluding tests and docs.

- Model: `executor_luna`, high reasoning
- Worktree: `/Users/anthony/Projects/worship-duty-app-worktrees/design-gallery-runtime`
- Review: one fresh read-only Luna peer after implementation

### Lane T: Gallery verification

Owns focused gallery behavior tests, status documentation, and its CI workflow.

- Model: `executor_luna`, high reasoning
- Worktree: `/Users/anthony/Projects/worship-duty-app-worktrees/design-gallery-tests`
- Review: controller inspection, no extra peer unless a material defect is found

### Lane I: Integration and release

Sol owns shared integration, current-main reconciliation, test-site release, browser verification, production release, and final records.

- Model: Sol controller
- Worktree: `/Users/anthony/Projects/worship-duty-app-worktrees/design-gallery-reconcile`
- Review: one external Opus completion review after all Luna work and integration are complete

## Acceptance criteria

- Original, Prism, Navy & Cream, and Aurora are selectable on Mac and phone.
- Every appearance uses the same released Firebase project, member session, permission helpers, schedules, requests, conflicts, notifications, and canonical choir-song values.
- Unauthorized users never receive Manage, and leaders see only their configured departments.
- Presider Home, My Services and All Services, song editing permissions, Prism calendar navigation, and top alerts remain functional in every appearance.
- Switching appearance does not reload, fork, or lose in-progress app state.
- The combined build passes focused automated checks and real browser smoke checks before replacing production.

## Build log

- 2026-09-13: Anthony requested restoration of the preserved four-design chooser after the authentication release and required every design to carry the complete released feature set.
- 2026-09-13: Confirmed Original, Prism, Navy & Cream, and Aurora remain on `origin/feature/design-gallery-opt-in`; no design source was deleted. Started three disjoint Luna implementation lanes from production main `5d27000`.
- 2026-09-13: Initial Lane V and Lane R handoffs were rejected before edits because execution-envelope fields were incomplete. Added exact lane, model, worktree, review, acceptance, verification, and completion-output requirements before relaunch.
- 2026-09-13: Lane V landed as `1a0d268`; its fresh Luna review passed with no material findings.
- 2026-09-13: Lane T landed as `0713b38`. Integration restored `permissions.js` to the Hosting allowlist and corrected its current Prism date selectors.
- 2026-09-13: Lane R landed as `c72b4b2`. Integration corrected Prism month and date event handling so month navigation does not snap back to the next service.
- 2026-09-13: The integrated isolated browser suite passed all authentication, forced PIN, four-design switching, state preservation, scoped Manage, alerts, Presider Home, Prism navigation, canonical choir-song, and 320 to 1440 pixel overflow checks. No production or test data was read or written by the suite.
- 2026-09-13: Lane R peer review found two material issues: `permissions.js` was absent from the staged Hosting build, and Prism/Aurora Manage summary counts were global. Sol corrected both, added focused contracts, fixed Prism date/month event routing, and reran the complete browser suite successfully.
- 2026-09-13: Published Hosting only to `https://lv-zion-duties-test.web.app`. It uses the existing test Firebase project and real copied test data. Production remains unchanged.
- 2026-09-13: Anthony directed the completed chooser straight to production and requested consistent member labels. Added canonical fixes for malformed title punctuation, obvious duplicate spellings, and last initials only where first-name collisions require them. Focused migration tests passed 18 of 18 and the full four-design browser suite passed again.

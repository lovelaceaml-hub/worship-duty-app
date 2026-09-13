# Authentication, Department, Notifications, Prism, Presider, and Choir Song Upgrade

Status: Implementation complete, pull request pending

Baseline: `694a538d8c48b154ead681e10605c29f52fea850`

Branch: `feature/auth-department-notifications-presider`

Production boundary: Build, review, and open a pull request only. Do not deploy.

## Setup

- Runner: coordinator
- Controller: Sol, integration and completion
- Writers: Luna, high reasoning
- Lane peer review: one Luna review only where it materially reduces integration risk
- Completion review: one Opus review after all implementation, records, and minimum checks are complete
- Failed lane rule: repair or explicitly leave the plan incomplete before Opus. Do not ask Opus to certify an incomplete implementation.
- Testing: smallest behavior tests that cover the required security and regression scenarios, plus one representative phone smoke check

## Completion evidence

- Member login verifies PIN server-side and privileged accounts cannot bypass forced PIN change.
- Firestore and callable functions enforce the same centralized permission concepts as the UI.
- Department-scoped membership, assignments, requests, conflicts, alerts, and PIN reset boundaries match the requested matrix.
- Prism date navigation, Presider navigation and filters, song editing permissions, and canonical choir-song sync work as specified.
- An idempotent production migration exists and is dry-run tested without wiping schedules.
- Documentation includes architecture, permission matrix, migration, verification, risks, and exact post-review deployment steps.
- A non-production feature branch is pushed and a pull request is opened.

## Lanes

### Lane L1: Authorization model

Owns new pure authorization and department configuration modules and their direct unit tests. No UI or backend wiring.

### Lane L2: Secure member authentication

Owns new callable authentication and PIN service modules plus direct tests. No shared entrypoint or lockfile edits.

### Lane L3: Firestore security boundary

Owns Firestore rules and focused rules-test artifacts. Uses authenticated claims and denies direct privileged bypass.

### Lane L4: Department workflow model

Owns new pure modules for department membership, request routing, conflict routing, actionable counts, and direct tests.

### Lane L5: Notification routing

Owns new server notification routing and deduplication modules plus direct tests. No shared function entrypoint edits.

### Lane L6: Prism calendar behavior

Owns Prism source modules and focused date-navigation behavior tests.

### Lane L7: Presider and song experience

Owns Presider navigation, My Services and All Services, song-edit permission hooks, and focused tests in song-specific files.

### Lane L8: Spreadsheet choir-song synchronization

Owns sheet parsing and merge logic plus regressions for blank clearing, service identity, duplicates, and calendar-date safety.

### Lane L9: Canonical identity and migration

Owns member-access cleanup, the idempotent migration implementation, and migration tests, including `D. Chloe` to `M. Chloe`.

### Lane LI: Integration, minimum verification, review, and PR

Sol owns shared entrypoints, `app.js`, `index.html`, shared manifests and lockfiles, documentation, lane merges, end-to-end wiring, minimum acceptance checks, the single Opus completion review, fixes, push, and PR creation.

## Build log

- 2026-09-13: Confirmed remote `main` at required merge commit `694a538`. Preserved the original local checkout with three unrelated commits and untracked release folders. Created the isolated feature worktree and branch.
- 2026-09-13: Accepted Anthony's speed and usage boundary. Nine disjoint Luna high implementation lanes, proportional peer review only, one Opus completion review, no production deployment.
- 2026-09-13: Integrated all Luna lanes and their proportional Luna peer reviews. Added runtime callable wiring, verified member login, fail-closed Manage visibility, scoped department selection, actionable counts, and canonical song wiring.
- 2026-09-13: Completed 110 focused checks with one optional Firestore emulator matrix skipped. Completed real Chromium site-lock and member-login smoke checks at desktop and phone sizes with no accessibility, console, or failed-response findings.
- 2026-09-13: The one Opus completion review returned changes required. Sol corrected server-enforced forced-PIN state, stale-role token invalidation, role configuration escalation, protected PIN reset boundaries, login throttling, migration hash compatibility and idempotence, cross-department conflict acknowledgement, failed-write feedback, and role-config response wiring.
- 2026-09-13: Per Anthony's one-review instruction, the Opus findings moved to one Sol correction pass. No second external review was launched.

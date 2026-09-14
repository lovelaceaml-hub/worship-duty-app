# Department Roster, Duty Eligibility, and Availability

Status: Product decisions complete, awaiting implementation-mode selection

Live baseline: `1fc07f4`

Mode: Parallel

Runner: coordinator

Review economy: Each implementation lane uses one Luna High writer and one separate Luna High reviewer. A failed lane review escalates once to a new Luna Max writer, with a separate Luna Max reviewer only if needed to confirm that escalated lane is complete. After all lanes are assembled, one Opus review examines the combined work. Opus findings go directly to Sol for correction and finalization, never back to Luna. No repeated external review rounds. Testing stays at the acceptable minimum needed to prove permissions, migration safety, the primary journey, and existing scheduling still work.

Release: preview and production only after the feature journey, migration, permissions, and all four appearances pass

## Desired outcome

Department leaders see only the departments they lead. Each department shows its actual leaders and the members who serve there, separated into active and inactive groups. Leaders can add or remove department members, mark a member inactive, select the duties each member can perform, control whether the member can currently be scheduled, and record service-time availability.

Historical assignments seed the first roster and duty eligibility. Leaders remain authoritative after that seed, so a later schedule import must not silently undo their changes.

Availability uses both recurring service-time choices and date-specific exceptions. Members and their department leaders can update one shared availability record. Every change records who changed it and when.

## Primary journey

1. A department leader opens Manage and sees only their assigned department or departments.
2. They open one department and see leaders, active members, and inactive members without the congregation-wide roster.
3. They open one member and review historical duty suggestions.
4. They confirm eligible duties, current schedulability, recurring service-time availability, and date-specific exceptions.
5. The scheduling controls offer only eligible, active, available members for each duty while preserving a clear override path for administrators.

## Planned sections

### Section 0: Adversarial plan critique

Setup: gpt-5.6-luna, high effort, Lane: Codex, Review: none, Orchestration: solo read-only critic
Worktree: read-only against `/Users/anthony/Projects/worship-duty-app`
Depends on: none
Agents: none
Reviewers: none, this section is the critic
Hygiene: none

Argue against the schema, permissions, migration, availability ownership, override behavior, and release plan. Record accepted findings before final integration without blocking Sections 1 and 2.

### Section 1: Department profile model and migration planner

Setup: gpt-5.6-luna, high effort, Lane: Codex, Review: one separate Luna High, Orchestration: parallel writer
Worktree: `/Users/anthony/Projects/worship-duty-app-worktrees/department-model`
Depends on: none
Agents: none
Reviewers: peer=gpt-5.6-luna high; escalation writer=gpt-5.6-luna max plus one separate Luna Max reviewer after a failed peer verdict
Hygiene: included in the single peer pass

Own new pure department-profile and migration modules plus direct tests. Define active status, eligible duties, current schedulability, recurring service-time availability, date-specific exceptions, change attribution, and history-seed provenance. Do not edit shared runtime entrypoints.

### Section 2: Clickable department journey prototype

Setup: gpt-5.6-luna, high effort, Lane: Codex, Review: one separate Luna High, Orchestration: parallel writer
Worktree: `/Users/anthony/Projects/worship-duty-app-worktrees/department-prototype`
Depends on: none
Agents: none
Reviewers: peer=gpt-5.6-luna high; escalation writer=gpt-5.6-luna max plus one separate Luna Max reviewer after a failed peer verdict
Hygiene: included in the single peer pass

Own a privacy-safe phone and desktop prototype under `docs/design/prototype/department-management/`. Preserve the four existing appearances, top navigation, and Appearance control. Cover department list, leader list, active and inactive roster, member detail, duty eligibility, recurring availability, date exceptions, loading, empty, error, success, keyboard, and reduced-motion states. Anthony approves this prototype before Section 4 changes production UI.

### Section 3: Authorization and Firestore boundary

Setup: gpt-5.6-luna, high effort, Lane: Codex, Review: one separate Luna High, Orchestration: dependency-started writer
Worktree: `/Users/anthony/Projects/worship-duty-app-worktrees/department-auth`
Depends on: Section 1
Agents: none
Reviewers: peer=gpt-5.6-luna high; escalation writer=gpt-5.6-luna max plus one separate Luna Max reviewer after a failed peer verdict
Hygiene: included in the single peer pass

Own server permission modules, named callable handlers, Firestore rules, and focused emulator or pure authorization tests. A leader may edit only a department they lead. Members may edit only their own shared availability. Neither path may grant roles or cross-department access. Administrators retain recovery controls.

### Section 4: Shared runtime and four appearance adapters

Setup: gpt-5.6-luna, high effort, Lane: Codex, Review: one separate Luna High, Orchestration: dependency-started integration writer
Worktree: `/Users/anthony/Projects/worship-duty-app-worktrees/department-runtime`
Depends on: Sections 1, 2, and 3
Agents: none
Reviewers: peer=gpt-5.6-luna high; escalation writer=gpt-5.6-luna max plus one separate Luna Max reviewer after a failed peer verdict
Hygiene: included in the single peer pass

Own `app.js`, shared integration points, and the four appearance adapters. Build the approved journey and make duty assignment choices prefer active, eligible, schedulable, available members. Keep a clearly labeled administrator override that never silently changes a member profile.

### Section 5: History seed and sheet-sync protection

Setup: gpt-5.6-luna, high effort, Lane: Codex, Review: one separate Luna High, Orchestration: dependency-started writer
Worktree: `/Users/anthony/Projects/worship-duty-app-worktrees/department-seed`
Depends on: Sections 1 and 3
Agents: none
Reviewers: peer=gpt-5.6-luna high; escalation writer=gpt-5.6-luna max plus one separate Luna Max reviewer after a failed peer verdict
Hygiene: included in the single peer pass

Own the idempotent history-seed and import protection. Existing schedule assignments create initial department membership and suggested eligible duties. Once a leader or member edits a profile, later sheet sync may add evidence but must not reactivate, re-enable, or overwrite that decision. Provide a read-only production dry run and rollback-safe write plan.

### Section 6: Integration, verification, migration, and release

Setup: gpt-5.6-sol, high effort, Lane: Codex, Review: one Opus completion review, Orchestration: solo controller
Worktree: `/Users/anthony/Projects/worship-duty-app`
Depends on: Sections 0 through 5
Agents: none
Reviewers: external=Claude Opus 5 high exactly once; final corrections and completion=gpt-5.6-sol high
Hygiene: Sol performs the minimum pre-Opus completeness check

Land the peer-reviewed sections sequentially, resolve accepted critique findings, run the minimum functional and security checks, verify the primary phone and desktop journey in all four appearances, build a production backup and migration dry run, and send the combined work through one Opus review. Sol alone corrects Opus findings, finalizes implementation, obtains Anthony's release approval, deploys only named resources, applies the migration, verifies the real leader/member/admin journeys, updates documentation, and pushes the final receipts.

## Completion evidence

- Leader Configuration lists departments and assigned leaders only.
- Department pages never default to the full congregation roster.
- Historical assignments produce correct initial members and duty suggestions.
- Active status, duty eligibility, schedulability, recurring availability, and date exceptions persist and affect scheduling.
- Department leaders cannot edit another department.
- Members and leaders cannot grant themselves elevated roles.
- Administrators retain recovery and override controls.
- Existing schedules, member login, requests, notifications, Presider, and all four appearances remain intact.
- A shared availability change shows the last editor and timestamp, regardless of whether a member or department leader made it.

## Build log

- 2026-09-14: Anthony selected recurring service-time availability plus date-specific exceptions.
- 2026-09-14: Recorded the requested leader-only configuration list, department-scoped active and inactive rosters, history-seeded duty eligibility, schedulability, and availability editing.
- 2026-09-14: Anthony selected shared availability ownership. Members and their department leaders may update one record, with editor and timestamp attribution.
- 2026-09-14: Finalized six implementation sections plus the read-only Section 0 critic. Sections 1 and 2 are independent and make Parallel mode the recommended execution choice. No implementation starts in this planning chat.
- 2026-09-14: Anthony selected Parallel mode and overrode the standard review routing for speed and usage. Each lane gets one Luna High writer and one separate Luna High peer review. A failed lane escalates once to a new Luna Max writer and one separate Luna Max reviewer. One Opus review runs only after all work is assembled, then Sol receives the findings, corrects them, and completes the project without another review loop.
- 2026-09-14: Parallel execution started from clean baseline `b31ae73`. Sol created isolated Section 1 and Section 2 worktrees at the plan's declared paths. Terra coordinator launched Section 0, Section 1, and Section 2 concurrently with Luna High. Production deployment and production-data mutation remain prohibited pending Anthony's explicit approval.
- 2026-09-14: Section 0 completed its read-only critique. Sol accepted six integration requirements: least-privilege department reads, server-authoritative assignment checks with explicit admin override, availability field and actor allowlists, UID-keyed profiles, human-edit precedence over sync evidence, and congregation-timezone exception precedence. Rulings are recorded under `docs/runs/department-roster-availability/decisions/S0-rulings.md`.
- 2026-09-14: Section 1 writer landed commit `e88526d` in its isolated worktree. Its focused pure-model test passed 8 of 8, the worktree is clean, and the required single Luna High peer review is pending. No production access occurred.
- 2026-09-14: Section 1's single Luna High review found three material pure-model defects: frozen nested attribution mutation, punctuation-sensitive identity collisions, and case-sensitive availability lookup. Per Anthony's locked route, Sol launched the one allowed new Luna Max writer. No repeated Luna High review will run.
- 2026-09-14: Section 2 writer landed prototype commit `24496d3`. Its direct test passed 7 of 7, phone and desktop checks passed in all four appearances, and the single Luna High peer review is pending. Section 4 remains held for Anthony's prototype approval.
- 2026-09-14: The one allowed Section 1 Luna Max writer corrected all three peer findings in commit `9951c43`; focused coverage now passes 10 of 10. The single separate Luna Max confirmation review is running, with no further lane review permitted afterward.
- 2026-09-14: Section 2's single Luna High review found six material prototype defects covering interaction, schedulability invariants, override isolation, attribution, Aurora contrast, and switch semantics. Per Anthony's locked route, Sol launched the one allowed new Luna Max writer. No repeated Luna High review will run.
- 2026-09-14: Section 1's final allowed Luna Max review found two further defects: history-seeded duties were not cumulative and mismatched supplied profile IDs were trusted. Sol corrected both in commit `6b50526`; focused tests remain 10 of 10. No additional lane review was launched. Section 3 then started from the corrected Section 1 head.
- 2026-09-14: The one allowed Section 2 Luna Max writer corrected all six peer findings in commit `8de1edf`; direct tests now pass 11 of 11, Aurora primary contrast measures 4.91 to 1, and the focused four-appearance browser smoke passed. The single separate Luna Max confirmation review is running.
- 2026-09-14: Section 2's final allowed Luna Max review returned `NO_MATERIAL_FINDINGS`. Its review budget is closed. The approved artifact is ready for Anthony's design decision before Section 4 runtime work starts.
- 2026-09-14: Anthony approved the reviewed Section 2 department-management prototype. Section 4's design gate is unlocked, but its authorization dependency remains held until Section 3 is reviewed.
- 2026-09-14: Section 3 writer landed authorization commit `fb6568b` within its six-file boundary. Its focused and regression suites passed 84 tests total. The Firebase emulator matrix was unavailable and remains an integration limitation. The single Luna High peer review is pending.
- 2026-09-14: Section 3's single Luna High review found six material authorization defects: stale-role bypass, missing manual field attribution, cross-department administrator override, availability alias fail-open behavior, no secure scoped roster listing, and forgeable attribution. Per Anthony's locked route, Sol launched the one allowed new Luna Max writer. No repeated Luna High review will run.
- 2026-09-14: The one allowed Section 3 Luna Max writer corrected all six security findings in commit `c98fd1a`; focused tests now pass 17 of 17 and the broader set passes 74 with one emulator matrix skipped. The single separate Luna Max confirmation review is running.
- 2026-09-14: Section 3's final allowed Luna Max review found four more security issues. Sol corrected them in commit `3a5aebd`: current active accounts are required, assignment IDs are server-derived, administrator override and audit are atomic, and profile mutations are callable-only so malformed nested availability cannot enter through direct clients. The focused and regression suites pass 104 tests total. No additional lane review was launched.
- 2026-09-14: Sections 4 and 5 started concurrently in isolated worktrees from the corrected dependencies. Section 4 also contains Anthony's approved Section 2 prototype commits. Production remains unchanged.
- 2026-09-14: Section 5 writer landed commit `b7ea27e` within five new seed, protection, dry-run, and test files. Its 74 focused and regression tests passed, the dry-run defaults to local read-only behavior, and the single Luna High peer review is pending. No production or migration write occurred.
- 2026-09-14: Section 4 writer landed runtime commit `0c11be6` within four owned files. Focused runtime, gallery, and compatibility checks passed. The single Luna High peer review is pending. No deployment or production access occurred.
- 2026-09-14: Section 5's single Luna High review found four material migration-safety issues: no atomic preconditions, unsafe rollback, conflicting UID aliases, and a Functions packaging blocker. Per Anthony's locked route, Sol launched the one allowed new Luna Max writer. No repeated Luna High review will run.
- 2026-09-14: Section 4's single Luna High review found three material runtime defects: a direct assignment-write bypass, unreadable raw history evidence, and no member-accessible availability editor. Per Anthony's locked route, Sol launched the one allowed new Luna Max writer. No repeated Luna High review will run.
- 2026-09-14: The one allowed Section 5 Luna Max writer corrected all four migration-safety findings in commit `efdecc5`; 77 focused and regression tests pass. The migration executor now requires an atomic adapter, and the final allowed separate Luna Max review is running.
- 2026-09-14: Section 5's final allowed Luna Max review returned `NO_MATERIAL_FINDINGS`. Its review budget is closed. Actual Firestore adapter and production migration behavior remain untested until integration and explicit release approval.
- 2026-09-14: The one allowed Section 4 Luna Max writer corrected all three runtime findings in commit `c98418b`; runtime, authorization, rules, final gallery, syntax, and diff checks pass. The final allowed separate Luna Max review is running. Existing blank-value unassign remains unchanged because no protected unassign callable exists.
- 2026-09-14: Section 4's final allowed Luna Max review found three further defects: schedule projections were not written atomically, blank unassignment bypassed the callable, and substitute suggestions used ambiguous display-name lookup. No further lane review ran. Sol corrected all three in the assembled work, closed direct client assignment writes, and passed 128 focused and regression tests. Section 4 is reviewed and Section 6 integration is running.
- 2026-09-14: The one required external Opus review ran over the complete `b31ae73` to `8c9f84b` change and returned `CHANGES_REQUIRED` with seven findings. All findings went directly to Sol. No Luna correction and no second Opus review will run. Sol corrected server trust and transaction gaps, double-booking, seeded availability, administrator bulk-write compatibility and projection reconciliation, roster retry behavior, the stale rules test, unresolved alias targets, and the release-order documentation. Final verification is running; production remains unchanged.
- 2026-09-14: Sol's final local verification passed 159 Node tests with only the declared Firestore emulator matrix skipped. The complete four-appearance browser gallery passed at phone, tablet, and desktop widths, and syntax and diff checks passed. The candidate is release ready locally. Production backup, migration, deployment, live verification, receipts, and push remain held for Anthony's explicit approval.
- 2026-09-14: The reviewed local candidate was backed up to the private GitHub branch `change/top-navigation-secure` through commit `7e9f4a8`. The push has no deployment workflow and production remains unchanged. Release approval is still required before any production backup read, migration, Functions deployment, rules deployment, or Hosting deployment.

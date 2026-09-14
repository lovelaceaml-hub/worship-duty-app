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

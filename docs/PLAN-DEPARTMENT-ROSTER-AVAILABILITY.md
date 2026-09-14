# Department Roster, Duty Eligibility, and Availability

Status: Product decisions complete, awaiting implementation-mode selection

Live baseline: `1fc07f4`

Runner: coordinator for Parallel mode, fresh chat for Steps or Full project mode

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

Setup: gpt-5.6-sol, high effort, Lane: Codex, Review: none, Orchestration: solo read-only critic
Worktree: read-only against `/Users/anthony/Projects/worship-duty-app`
Depends on: none
Agents: none
Reviewers: none, this section is the critic
Hygiene: none

Argue against the schema, permissions, migration, availability ownership, override behavior, and release plan. Record accepted findings before final integration without blocking Sections 1 and 2.

### Section 1: Department profile model and migration planner

Setup: gpt-5.6-luna, max effort, Lane: Codex, Review: controller + independent, Orchestration: solo writer
Worktree: `/Users/anthony/Projects/worship-duty-app-worktrees/department-model`
Depends on: none
Agents: none
Reviewers: controller=gpt-5.6-sol high; independent=Claude Sonnet 5 high
Hygiene: Haiku 4.5 low before review

Own new pure department-profile and migration modules plus direct tests. Define active status, eligible duties, current schedulability, recurring service-time availability, date-specific exceptions, change attribution, and history-seed provenance. Do not edit shared runtime entrypoints.

### Section 2: Clickable department journey prototype

Setup: gpt-5.6-luna, high effort, Lane: Codex, Review: controller, Orchestration: solo writer
Worktree: `/Users/anthony/Projects/worship-duty-app-worktrees/department-prototype`
Depends on: none
Agents: none
Reviewers: controller=gpt-5.6-sol high; independent=none
Hygiene: Haiku 4.5 low before review

Own a privacy-safe phone and desktop prototype under `docs/design/prototype/department-management/`. Preserve the four existing appearances, top navigation, and Appearance control. Cover department list, leader list, active and inactive roster, member detail, duty eligibility, recurring availability, date exceptions, loading, empty, error, success, keyboard, and reduced-motion states. Anthony approves this prototype before Section 4 changes production UI.

### Section 3: Authorization and Firestore boundary

Setup: gpt-5.6-luna, max effort, Lane: Codex, Review: controller + independent, Orchestration: solo writer
Worktree: `/Users/anthony/Projects/worship-duty-app-worktrees/department-auth`
Depends on: Section 1
Agents: none
Reviewers: controller=gpt-5.6-sol high; independent=Claude Sonnet 5 high
Hygiene: Haiku 4.5 low before review

Own server permission modules, named callable handlers, Firestore rules, and focused emulator or pure authorization tests. A leader may edit only a department they lead. Members may edit only their own shared availability. Neither path may grant roles or cross-department access. Administrators retain recovery controls.

### Section 4: Shared runtime and four appearance adapters

Setup: gpt-5.6-luna, max effort, Lane: Codex, Review: controller, Orchestration: solo integration writer
Worktree: `/Users/anthony/Projects/worship-duty-app-worktrees/department-runtime`
Depends on: Sections 1, 2, and 3
Agents: none
Reviewers: controller=gpt-5.6-sol high; independent=none
Hygiene: Haiku 4.5 low before review

Own `app.js`, shared integration points, and the four appearance adapters. Build the approved journey and make duty assignment choices prefer active, eligible, schedulable, available members. Keep a clearly labeled administrator override that never silently changes a member profile.

### Section 5: History seed and sheet-sync protection

Setup: gpt-5.6-luna, max effort, Lane: Codex, Review: controller + independent, Orchestration: solo writer
Worktree: `/Users/anthony/Projects/worship-duty-app-worktrees/department-seed`
Depends on: Sections 1 and 3
Agents: none
Reviewers: controller=gpt-5.6-sol high; independent=Claude Sonnet 5 high
Hygiene: Haiku 4.5 low before review

Own the idempotent history-seed and import protection. Existing schedule assignments create initial department membership and suggested eligible duties. Once a leader or member edits a profile, later sheet sync may add evidence but must not reactivate, re-enable, or overwrite that decision. Provide a read-only production dry run and rollback-safe write plan.

### Section 6: Integration, verification, migration, and release

Setup: gpt-5.6-sol, xhigh effort, Lane: Codex, Review: controller + independent, Orchestration: solo controller
Worktree: `/Users/anthony/Projects/worship-duty-app`
Depends on: Sections 0 through 5
Agents: none
Reviewers: controller=gpt-5.6-sol xhigh; independent=Claude Opus 5 high
Hygiene: Haiku 4.5 low before review

Land the reviewed sections sequentially, resolve accepted critique findings, run complete functional and security checks, verify phone and desktop behavior in all four appearances, build a production backup and migration dry run, obtain Anthony's release approval, deploy only named resources, apply the migration, verify real leader/member/admin journeys, update documentation, and push the final receipts.

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

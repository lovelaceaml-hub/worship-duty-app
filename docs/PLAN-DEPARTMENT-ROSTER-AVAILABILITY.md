# Department Roster, Duty Eligibility, and Availability

Status: Product interview in progress

Live baseline: `1fc07f4`

## Setup

- Controller and writer: Sol, solo implementation
- Model and effort: current Sol controller, high reasoning
- Reviewer: independent security review for authorization and migration changes, plus controller UI review
- Release: preview and production only after the feature journey, migration, permissions, and all four appearances pass

## Desired outcome

Department leaders see only the departments they lead. Each department shows its actual leaders and the members who serve there, separated into active and inactive groups. Leaders can add or remove department members, mark a member inactive, select the duties each member can perform, control whether the member can currently be scheduled, and record service-time availability.

Historical assignments seed the first roster and duty eligibility. Leaders remain authoritative after that seed, so a later schedule import must not silently undo their changes.

Availability uses both recurring service-time choices and date-specific exceptions. The remaining ownership question is whether members can update their own availability in addition to department leaders.

## Primary journey

1. A department leader opens Manage and sees only their assigned department or departments.
2. They open one department and see leaders, active members, and inactive members without the congregation-wide roster.
3. They open one member and review historical duty suggestions.
4. They confirm eligible duties, current schedulability, recurring service-time availability, and date-specific exceptions.
5. The scheduling controls offer only eligible, active, available members for each duty while preserving a clear override path for administrators.

## Planned sections

1. Finish product decisions and freeze the department-management journey.
2. Define the migration-safe department membership, duty eligibility, schedulability, and availability model.
3. Build a clickable phone and desktop prototype inside the existing approved appearance system.
4. Implement server authorization and Firestore rules for leader-scoped edits.
5. Implement the shared runtime and all four appearance adapters.
6. Seed profiles from schedule history without overwriting later leader decisions.
7. Verify active/inactive filtering, duty suggestions, availability filtering, administrative override, accessibility, and mobile behavior.
8. Review, migrate with a dry run, deploy named resources, and verify production.

## Completion evidence

- Leader Configuration lists departments and assigned leaders only.
- Department pages never default to the full congregation roster.
- Historical assignments produce correct initial members and duty suggestions.
- Active status, duty eligibility, schedulability, recurring availability, and date exceptions persist and affect scheduling.
- Department leaders cannot edit another department.
- Members and leaders cannot grant themselves elevated roles.
- Administrators retain recovery and override controls.
- Existing schedules, member login, requests, notifications, Presider, and all four appearances remain intact.

## Build log

- 2026-09-14: Anthony selected recurring service-time availability plus date-specific exceptions.
- 2026-09-14: Recorded the requested leader-only configuration list, department-scoped active and inactive rosters, history-seeded duty eligibility, schedulability, and availability editing. Product ownership of availability remains to be confirmed before implementation.

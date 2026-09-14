# Run: department-roster-availability

Plan ID: department-roster-availability
Plan file: /Users/anthony/Projects/worship-duty-app/docs/PLAN-DEPARTMENT-ROSTER-AVAILABILITY.md
Runner: coordinator
Started: 2026-09-14T08:38Z
Coordinator: Terra coordinator, non-editing; Sol owns integration and user communication

## Baselines

| Repo | Path | Branch | Baseline HEAD |
|---|---|---|---|
| worship-duty-app | /Users/anthony/Projects/worship-duty-app | change/top-navigation-secure | b31ae73 |

## Lanes

| Lane | Title | State | Model | Worktree | Review | Depends on |
|---|---|---|---|---|---|---|
| S0 | Adversarial plan critique | reviewed | gpt-5.6-luna high | read-only canonical repo | none | none |
| S1 | Department profile model and migration planner | reviewed | gpt-5.6-luna max escalation | /Users/anthony/Projects/worship-duty-app-worktrees/department-model | High failed; Max failed; Sol corrected | none |
| S2 | Clickable department journey prototype | reviewed | gpt-5.6-luna max escalation | /Users/anthony/Projects/worship-duty-app-worktrees/department-prototype | Luna High failed; Luna Max passed | none |
| S3 | Authorization and Firestore boundary | reviewed | gpt-5.6-luna max escalation | /Users/anthony/Projects/worship-duty-app-worktrees/department-auth | High failed; Max failed; Sol corrected | S1 reviewed |
| S4 | Shared runtime and four appearance adapters | reviewed | gpt-5.6-luna max escalation | /Users/anthony/Projects/worship-duty-app-worktrees/department-runtime | Luna High failed; Luna Max failed; Sol corrected | S1, S2 approved, S3 reviewed |
| S5 | History seed and sheet-sync protection | reviewed | gpt-5.6-luna max escalation | /Users/anthony/Projects/worship-duty-app-worktrees/department-seed | Luna High failed; Luna Max passed | S1 and S3 reviewed |
| S6 | Integration, verification, migration, and release | complete | gpt-5.6-sol high | /Users/anthony/Projects/worship-duty-app | one Opus review complete; Sol corrected all findings | S0 through S5 reviewed |

## Folders

- lanes/: one file per lane (work order, result, review). Front matter fields: lane, title, state, model, runner, worktree, review, depends_on, updated.
- research/: attacker output and critique briefs.
- decisions/: decisions log and integration rulings.
- logs/: coordinator events, one file per event.
- board/: rule diagram page and generated lane board.

## Artifacts

- Rule diagram: `board/rule-diagram.md`
- Lane board: `board/INDEX.md`

<!-- lane: S0 state: reviewed model: gpt-5.6-luna-high worktree: read-only-canonical-repo review: none updated: 2026-09-14T08:51Z -->
<!-- lane: S1 state: reviewed model: gpt-5.6-luna-max worktree: /Users/anthony/Projects/worship-duty-app-worktrees/department-model review: High-failed-Max-failed-Sol-corrected updated: 2026-09-14T09:38Z -->
<!-- lane: S2 state: reviewed model: gpt-5.6-luna-max worktree: /Users/anthony/Projects/worship-duty-app-worktrees/department-prototype review: Luna-High-failed-Luna-Max-passed updated: 2026-09-14T09:57Z -->
<!-- lane: S3 state: reviewed model: gpt-5.6-luna-max worktree: /Users/anthony/Projects/worship-duty-app-worktrees/department-auth review: High-failed-Max-failed-Sol-corrected updated: 2026-09-14T11:36Z -->
<!-- lane: S4 state: reviewed model: gpt-5.6-luna-max worktree: /Users/anthony/Projects/worship-duty-app-worktrees/department-runtime review: Luna-High-failed-Luna-Max-failed-Sol-corrected updated: 2026-09-14T15:04Z -->
<!-- lane: S5 state: reviewed model: gpt-5.6-luna-max worktree: /Users/anthony/Projects/worship-duty-app-worktrees/department-seed review: Luna-High-failed-Luna-Max-passed updated: 2026-09-14T13:52Z -->
<!-- lane: S6 state: running model: gpt-5.6-sol-high worktree: /Users/anthony/Projects/worship-duty-app review: one-Opus-complete-Sol-corrected-all-findings updated: 2026-09-14T15:42Z -->

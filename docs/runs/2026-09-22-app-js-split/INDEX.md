# Run: 2026-09-22-app-js-split

Plan ID: 2026-09-22-app-js-split
Plan file: /Users/anthony/Projects/worship-duty-app/docs/PLAN-2026-09-22-APP-JS-SPLIT.md
Runner: Steps (Anthony, 2026-09-22), one unit per fresh chat, sequential
Started: 2026-09-22T20:56Z
Coordinator: pending (Opus 5 high, assigned at Section 0)

## Baselines

| Repo | Path | Branch | Baseline HEAD |
|---|---|---|---|
| worship-duty-app | /Users/anthony/Projects/worship-duty-app | codex/compact-phone-refactor | f876565 (app.js 4,314 lines, blob ab50d2da) |

## Lanes

| Lane | Title | State | Model | Worktree | Review | Depends on |
|---|---|---|---|---|---|---|
| S0 | Baseline and boundary | complete | Opus 5 high (controller) | none | none | nothing |
| L0 | Plan critic | planned | gpt-5.6-sol high read-only | none | none | S0 |
| S1 | Safety net before any code moves | planned | gpt-5.6-luna high | worktrees/2026-09-22-app-js-split/S1 | Sonnet 5 high | S0 |
| S2 | Move the leaf-level modules | planned | gpt-5.6-luna high | worktrees/2026-09-22-app-js-split/S2 | Sonnet 5 high | S1 merged |
| S3 | Move state, departments, sync, notifications, calendar and session | planned | gpt-5.6-luna high | worktrees/2026-09-22-app-js-split/S3 | Sonnet 5 high | S2 merged |
| S4 | Move rendering | planned | gpt-5.6-luna high | worktrees/2026-09-22-app-js-split/S4 | Sonnet 5 high x2 | S3 merged |
| S5 | Move the action dispatcher | planned | gpt-5.6-luna high | worktrees/2026-09-22-app-js-split/S5 | Sonnet 5 high x2 | S4 merged |
| S6 | Integration, documentation and completion review | planned | Opus 5 high (controller) | worktrees/2026-09-22-app-js-split/S6 | Opus 5 high | S5 merged |

## Folders

- lanes/: one file per lane (work order, result, review). Front matter fields: lane, title, state, model, runner, worktree, review, depends_on, updated.
- research/: attacker output and critique briefs.
- decisions/: decisions log and integration rulings.
- logs/: coordinator events, one file per event.
- board/: rule diagram page and generated lane board.

## Artifacts

- Rule diagram: pending
- Lane board: pending

<!-- lane: S0 state: planned model: pending worktree: pending review: pending updated: 2026-09-22T20:56Z -->
<!-- lane: L0 state: planned model: pending worktree: pending review: pending updated: 2026-09-22T20:56Z -->
<!-- lane: S1 state: planned model: pending worktree: pending review: pending updated: 2026-09-22T20:56Z -->
<!-- lane: S2 state: planned model: pending worktree: pending review: pending updated: 2026-09-22T20:56Z -->
<!-- lane: S3 state: planned model: pending worktree: pending review: pending updated: 2026-09-22T20:56Z -->
<!-- lane: S4 state: planned model: pending worktree: pending review: pending updated: 2026-09-22T20:56Z -->
<!-- lane: S5 state: planned model: pending worktree: pending review: pending updated: 2026-09-22T20:56Z -->
<!-- lane: S6 state: planned model: pending worktree: pending review: pending updated: 2026-09-22T20:56Z -->

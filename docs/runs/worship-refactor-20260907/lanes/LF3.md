---
lane: LF3
title: Pure member and coordinator selectors
state: reviewed
model: gpt-5.6-luna
runner: Codex
worktree: /Users/anthony/Projects/worship-refactor-worktrees/foundation-domain
review: Sol-pass
depends_on: LF2
updated: 2026-09-08T04:08Z
---

# Foundation 3 capsule

Read INDEX.md and the project contract first. Architecture critic approved nonvisual pure selector extraction while the compact B prototype proceeds. Keep all rendered strings, CSS, DOM listeners, focus/scroll guards, UI state, mutation, persistence, auth, Firebase startup/subscriptions, song files, navigation, and data contracts intact.

One Luna max writer, supervised by non-editing coordinator_terra high. Native Sol high review. Own app.js, index.html, new src/domain/member.js, new src/domain/coordinator.js, this receipt, research/foundation-3/**, research/foundation/foundation-harness.cjs, and research/foundation-2/state-subscriptions.test.cjs only in the named isolated worktree. No Git, deployment, external data, helpers, or other lane files. Dependencies are read-only symlinks.

Extract only existing pure calculations with thin wrappers preserving renderer inputs: member duty day/service grouping, member request lookup/sort/count, setlist confirmation summary; coordinator upcoming ordering, conflicts with suggestions, expected-duty calculation, gap rows, workload ordering, pending/resolved request split, and eligible duty roster selection. Defer notification/reminder decisions, commands, access, Sheet network orchestration, and lifecycle host because those cross persistence or DOM lifetime boundaries. Do not force an extraction that requires UI or side effects. Document exact interfaces and deferred candidates. Inject current time and configuration rather than duplicating real constants. Preserve input mutation behavior and array ordering where externally observable.

Add classic scripts before app.js and callable dependency guards before Firebase initialization. Tests use fictional fixtures only. Add actual-source parity harnesses under research/foundation-3, and update only the explicitly returned Foundation/F2 harnesses to load and freeze required APIs in real browser order. Do not edit tests/**. The canonical Verification suite is still under correction; root will supply its frozen corrected command before browser release verification. Never run this worktree's legacy tests/ui-qa.mjs against live data.

Run pure tests, syntax, Foundation/F2 harnesses where compatible, release staging, and dry run. Report exact changed files, comparisons, limitations and review-ready freeze. No production interface change may be included.

## LF3 receipt

- Task: WORSHIP-F3-20260907, iteration 1.
- Result: partial. The frozen pure-domain scope is implemented and the source is frozen for root. Controller review remains pending.
- Behavior: member duty grouping, request selectors, pending count, and setlist summary now live in `src/domain/member.js`. Coordinator ordering, roster, conflict composition, gap, expected-duty, workload ordering, and request split selectors now live in `src/domain/coordinator.js`. Assignment collection, workload stats, and substitution ranking remain in the existing schedule domain. `app.js` delegates to these APIs, and `index.html` loads both classic modules before the application module.
- Correction: restored the three app wrappers to `DOMAIN`, removed duplicate duties, workload, and substitution bodies and exports, and made conflict composition call injected `schedule.activeConflicts` and `schedule.suggestSubs` helpers.

### Exact changed paths

- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-domain/app.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-domain/index.html`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-domain/src/domain/member.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-domain/src/domain/coordinator.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-domain/docs/runs/worship-refactor-20260907/research/foundation/foundation-harness.cjs`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-domain/docs/runs/worship-refactor-20260907/research/foundation-2/state-subscriptions.test.cjs`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-domain/docs/runs/worship-refactor-20260907/research/foundation-3/DOMAIN-INTERFACES.md`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-domain/docs/runs/worship-refactor-20260907/research/foundation-3/actual-source-parity.test.cjs`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-domain/docs/runs/worship-refactor-20260907/research/foundation-3/browser/screenshots/local-seeded-phone.png`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation-domain/docs/runs/worship-refactor-20260907/lanes/LF3.md`

### Verification

- Corrected syntax checks for `src/domain/member.js`, `src/domain/coordinator.js`, and `app.js`: passed.
- Corrected `node --test docs/runs/worship-refactor-20260907/research/foundation-3/actual-source-parity.test.cjs`: 4 passed, including single-source assertions and injected substitution calls.
- Corrected Foundation harness: passed, including single-source assertions.
- Corrected LF2 state and subscriptions harness: 6 passed.
- Corrected `node --test tests/release/staging.test.mjs`: 8 passed.
- `node --test tests/release/pwa-update.test.mjs`: 1 passed through the approved loopback boundary.
- `bash scripts/deploy.sh --dry-run`: passed, 20 runtime artifacts staged, no Firebase command.
- Authorized fixture baseline command: reached the actual source and wrote a fictional screenshot, then stopped before scenarios because the verification loader does not yet load the new member and coordinator modules and the dependency guard correctly rejected the incomplete foundation. No verification worktree files were edited.
- Legacy UI QA was not run. Git, deployment, production access, and dependency mutation were not performed.

### Handoff

Root should run the corrected focused checks, coordinate the verification loader update and rerun the authorized fixture command, then perform the next controller review. The source and focused harnesses are ready for that review. Commit and push remain controller-owned.

## Controller integration receipt

Native Sol high review round 2 passed with no actionable findings after single-source policy cleanup. Root independently passed 18 domain/state/staging tests, the Foundation harness, and the corrected 19-scenario fixture suite with phone and desktop Manage edits. The exact baseline accessibility exceptions remain disclosed; no new findings or unexpected network requests occurred. Twenty runtime files are release-stamped. Hosting deployment is next.

Implemented-by: Codex/gpt-5.6-luna · Reviewed-by: Codex/gpt-5.6-sol

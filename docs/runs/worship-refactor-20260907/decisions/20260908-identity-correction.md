# Historical identity correction

Owner authorized one title correction across all existing and historical Worship Service records. Exact identity values remain only in the owner conversation and provider data, never source, fixtures, commands, filenames, logs, screenshots or board.

## Model and ownership

Planning: planner_sol max, approved implementation capsule. Implementation: executor_luna max under coordinator_terra high. Root owns integration, native Sol high review, targeted deployment, private boundary verification and live execution. Independent cumulative Opus review remains at full-plan completion.

LNR owns only functions/identity-lib.js, functions/handlers.js, functions/scripts/correct-member-identity.cjs, functions/test/identity-lib.test.js, functions/test/handlers.test.js, functions/test/emulator-contract.test.cjs and functions/test/identity-correction.test.js in /Users/anthony/Projects/worship-refactor-worktrees/identity-correction, plus own lane/log files. It cannot run live operations or modify other production sources, rules, importer, frontend or shared docs.

## Approved implementation capsule

Validate nonblank exact alias mappings, reject self-links/cycles, flatten chains and expose canonical equality plus legacy aliases. Notifications compare canonical assignment identity, target both old/new registration identities and preserve request self-notification suppression. Reminder claims use a transaction to check canonical and every legacy marker, preserving existing sent records and timestamps.

Generic correction allowlist: app/nameMap.map, app/members.list, app/departments.map roster values, app/presiders.names, app/settings.schedulerName; schedule assignment values and conflictOk keys; setlists presider/confirmedBy/updatedBy; songStats history[].by; requests name/resolvedBy; tokens.name. Preserve IDs, token IDs, timestamps, notes, song/history order and counts, confirmation/sung states and unrelated fields. Merge conflict duty arrays stably; deduplicate only corrected identity list collisions.

Runner gets identity values via non-echo interactive input, not argv/env/files. Preflight holds immutable patches in memory. Unexpected exact identity occurrences outside the allowlist abort and report sanitized structural path/count only. Reread all targets with optimistic preconditions. Atomically write changes and provider backup records. Cap at200 target documents; no automatic chunks or partial mutation.

Backup collection _adminIdentityCorrections uses opaque job IDs and path-hash item IDs. Store only before/after identity fields, collection kind and precondition metadata. No settings secrets, notes, token contents or readable target paths. Rollback scans known collections, matches hashes in memory, verifies current identity fields equal after-patch before restoring. Root must prove deployed client read/write denial for this collection before any live backup, without a rules change. No real data files.

## Gates

Fictional unit and demo-project emulator tests prove zero rename notifications, old/new future targeting, old marker suppression, calendar alias compatibility, exact-field historical correction, transaction conflict abort, durable rollback with subsequent-change refusal, cycle/cap rejection and preserved contracts. Native Sol review follows frozen source and tests. Root then deploys only changed exports onScheduleWrite, dutyReminders, onRequestCreated and onRequestResolved. No rules or full deploy. Root dry-runs and verifies the provider boundary before live commit, then performs aggregate readback and rollback readiness checks. Real correction stays pending until these gates pass.

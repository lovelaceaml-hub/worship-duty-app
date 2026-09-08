# Prototype native Sol review, round 1

Result: CHANGES_REQUIRED. Findings affect the fictional proposal artifact. Correct before freezing design targets or asking for complete prototype approval.

Full review comments:

- [P1] Verify all runtime files before approving the prototype — /Users/anthony/Projects/worship-refactor-worktrees/design-review/docs/design/prototype/contract/scripts/design-contract.mjs:391-391
  When `index.html` is committed but `app.js`, `fixtures.js`, or `styles.css` remains modified or untracked, this gate still executes the dirty files and can report PASS because only `artifactPath` is checked. This permits approval against code absent from the frozen commit, so every local runtime dependency should pass `proveCommittedArtifact` before browser checks.

- [P1] Reject nonfixture backup data — /Users/anthony/Projects/worship-refactor-worktrees/design-review/docs/design/prototype/open-bulletin/app.js:928-930
  When a reviewer selects any production-shaped September 2026 backup, validation checks only that `members` and `services` are arrays and that service dates have the expected prefix. Real names and assignments can therefore replace the fictional fixtures and enter screenshots, contrary to this prototype's data boundary; require an explicit prototype marker or validate against the approved fictional dataset before assigning the payload.

- [P2] Enforce the site lock across every screen — /Users/anthony/Projects/worship-refactor-worktrees/design-review/docs/design/prototype/open-bulletin/app.js:689-692
  After Manage Settings uses Lock site, the persistent Home, My Duties, and Presider links still render those screens because `siteLocked` is checked only inside `renderManage`. The gate even provides a Return Home link, so the site passcode can be bypassed immediately; route all screens through the site gate while locked.

- [P2] Apply the selected planning window to every metric — /Users/anthony/Projects/worship-refactor-worktrees/design-review/docs/design/prototype/open-bulletin/app.js:563-570
  When Next service, Last service, or a 4 or 8 week range is selected, conflicts are still calculated from every service, gaps and suggestions from every upcoming service, and workload from every upcoming service except for Last. Only the displayed service count meaningfully changes, so the Planning page reports data outside the selected range.

- [P2] Make mark-sung idempotent per service — /Users/anthony/Projects/worship-refactor-worktrees/design-review/docs/design/prototype/open-bulletin/app.js:1205-1213
  For the morning fixture, `song-118` appears twice, and the Sung button also remains actionable after the first mark. This code increments counts per occurrence and on every invocation while adding only one history row per song per invocation, inflating counts and diverging from the canonical one-record-per-service behavior in `song-lib.js`.

- [P2] Keep undo state per service — /Users/anthony/Projects/worship-refactor-worktrees/design-review/docs/design/prototype/open-bulletin/app.js:1207-1207
  B. Daniel Reed can access two upcoming Presider services, but marking the second service sung overwrites the single global `sungSnapshot`. Returning to the first service and choosing Undo then subtracts the second service's song counts and fails to restore the first service correctly; store undo information by setlist or derive it from service-keyed history.

- [P2] Recompute last-sung metadata on undo — /Users/anthony/Projects/worship-refactor-worktrees/design-review/docs/design/prototype/open-bulletin/app.js:1226-1229
  After any Mark sung followed by Undo sung, the generated history rows and count are removed but `lastSung` remains set to the just-undone date. The song library therefore continues to report the service as the most recent use; recompute `lastSung` from the remaining history when undoing.

- [P2] Recompute stats when deleting history — /Users/anthony/Projects/worship-refactor-worktrees/design-review/docs/design/prototype/open-bulletin/app.js:1249-1252
  When Remove is used on any ordinary history row, the row disappears but `sungCount` is decremented only for backfilled entries, and `lastSung` is never updated. The visible history and song statistics consequently disagree; derive both fields from the remaining history for every deletion.

- [P2] Offer recovery after deleting a setlist — /Users/anthony/Projects/worship-refactor-worktrees/design-review/docs/design/prototype/open-bulletin/app.js:478-480
  After confirming Delete setlist, returning to that Presider service renders only "No outline for this service" with no action to rebuild it. Although a `createSetlist` handler exists, no control invokes it from this state, so the reviewer must reset the entire prototype to continue that service's workflow.

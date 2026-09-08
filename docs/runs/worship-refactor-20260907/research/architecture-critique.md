# Lane 0 architecture critique

Reviewer: planner_sol, gpt-5.6-sol, max, read-only. Verdict: APPROVED with binding compatibility invariants. This is an architecture critique, not a review of completed implementation.

## Accepted contracts

- Keep app.js as composition root. Preserve existing state, UI output, and startup ownership during Foundation.
- Extract pure transforms and injected adapter factories into explicit buildless modules, each exposing a frozen browser namespace and module.exports. Keep top-level imports free of DOM, storage, clock, Firebase, seed, and config side effects.
- Load local modules in explicit dependency order with release stamps. Release staging must validate the runtime asset graph and immutable headers, while never mutating working source or shipping tests/docs.
- Preserve the authenticated host write queue and returned promises. Do not introduce new song write gating in Foundation: importer-compatible collections currently allow writes even after anonymous sign-in failure.
- Preserve song library paths, service IDs, lazy dependency order, mount wiring, pending-setlist merging, create-if-absent transactions, update fallback, and mark/undo transactions.
- Keep functions/index.js as the exact seven-name registration surface. Separate injectable handlers from SDK registration, preserving trigger types, schedules, region, HTTP headers/payloads, and notification deduplication.
- Browser and server Sheet parsers currently differ in member-text normalization. Preserve both existing contracts during extraction; do not silently align them.

## Controller ownership rulings

- Foundation's isolated checks remain in its assigned research/foundation folder, outside shipped runtime assets. Verification owns the canonical tests tree, except Release owns tests/release. Integration may transfer the checks after both writers finish.
- Backend implementation may proceed under the frozen seven-function contract.
- New song write policy, security hardening, parser behavior alignment, and database migrations remain outside this extraction scope.

No architecture blocker remains. Production deployment still requires actual implementation verification; redesigned production screens still require Anthony's design approvals.

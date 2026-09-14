# S0 adversarial critique

## High priority

1. Existing rules and client loading expose broad roster, department, and leader data. The new journey must enforce department-scoped reads, not merely hide congregation-wide data in the interface.
2. Existing scheduling and Sheet paths do not enforce active status, duty eligibility, schedulability, or availability. The implementation needs a server-authoritative rejection or explicit administrator override contract.
3. Availability needs a declared write path, field whitelist, and actor matrix for members, department leaders, and administrators.
4. Mutable-name keyed migration can orphan roles and profiles. Canonical UID identity, alias handling, and history precedence must be explicit.
5. Sheet sync and administrator overrides need provenance and audit behavior so later imports cannot silently undo human decisions.

## Medium priority

1. Define service timezone, daylight-saving behavior, recurring-versus-date-exception precedence, and focused tests.

## Source evidence

- `firestore.rules`: lines 1025-1055, 430-598, 1128-1235, 969-986
- `app.js`: lines 3188-3215, 2083-2094, 2892-2917
- `functions/index.js`: lines 136-188 and 296-331
- `functions/sheet-lib.js`: lines 231-281

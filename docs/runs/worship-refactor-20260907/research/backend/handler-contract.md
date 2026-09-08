# Backend handler extraction

Lane B moved the seven deployed handler bodies into
`/Users/anthony/Projects/worship-refactor-worktrees/backend/functions/handlers.js`.
The factory accepts Firestore, messaging, fetch, logger, and clock adapters,
with the pure Sheet, ICS, and public schedule libraries supplied by default.
The system clock exposes epoch milliseconds, Date construction, and ISO
formatting so tests can pin every current time used by the handlers.

`/Users/anthony/Projects/worship-refactor-worktrees/backend/functions/index.js`
only initializes the Firebase Admin SDK, creates the handler set, and registers
the frozen export names. The registration contract test stubs all Firebase SDK
modules and checks the exact document, scheduler, region, timezone, and HTTP
options.

Behavior tests use fictional records and in-memory adapters. They cover changed
duty alerts, invalid token cleanup, reminder markers and retention, request
transitions, ICS and public schedule HTTP responses, canonical Sheet names,
blank duty clears, absent duty preservation, BulkWriter completion, and the
zero-service no-op.

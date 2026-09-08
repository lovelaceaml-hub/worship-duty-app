# Firestore emulator contract receipt

The new contract test is
`/Users/anthony/Projects/worship-refactor-worktrees/backend/functions/test/emulator-contract.test.cjs`.
It initializes the existing Firebase Admin SDK only after both guards pass:
`FIRESTORE_EMULATOR_HOST` must be an explicit loopback HTTP host with a port,
and `GCLOUD_PROJECT` or `GOOGLE_CLOUD_PROJECT` must be exactly
`demo-worship-refactor`. There is no production fallback.

The test calls the injected handlers directly. Fetch returns a fictional CSV,
messaging records a fictional reminder instead of sending, and the clock is
fixed. It verifies a blank Sheet duty clears one assignment, a manual duty
outside the Sheet survives, zero parsed services leave an existing document
unchanged, and the second reminder call finds the existing marker and sends
nothing.

Standard safe check when no emulator is configured:

`node --test /Users/anthony/Projects/worship-refactor-worktrees/backend/functions/test/emulator-contract.test.cjs`

Result: one test skipped with `FIRESTORE_EMULATOR_HOST is not set`.

Authorized emulator check:

`FIRESTORE_EMULATOR_HOST=127.0.0.1:8187 GCLOUD_PROJECT=demo-worship-refactor node --test /Users/anthony/Projects/worship-refactor-worktrees/backend/functions/test/emulator-contract.test.cjs`

Result: one test passed against root session 93074. The test restores only its
named `app`, `schedule`, `tokens`, and `sent` documents. It does not start a
Functions emulator, use live network data, send email or push, or delete a
collection or project.

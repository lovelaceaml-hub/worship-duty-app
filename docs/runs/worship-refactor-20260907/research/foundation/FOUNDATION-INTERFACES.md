# Foundation interfaces

This milestone keeps the browser runtime buildless. Plain scripts load in this
order, then the composition root starts:

1. `/Users/anthony/Projects/worship-refactor-worktrees/foundation/seed-data.js`
2. `/Users/anthony/Projects/worship-refactor-worktrees/foundation/firebase-config.js`
3. `/Users/anthony/Projects/worship-refactor-worktrees/foundation/src/core/constants.js?v=DEV`
4. `/Users/anthony/Projects/worship-refactor-worktrees/foundation/src/domain/schedule.js?v=DEV`
5. `/Users/anthony/Projects/worship-refactor-worktrees/foundation/src/domain/sheet.js?v=DEV`
6. `/Users/anthony/Projects/worship-refactor-worktrees/foundation/src/services/storage.js?v=DEV`
7. `/Users/anthony/Projects/worship-refactor-worktrees/foundation/src/services/firebase.js?v=DEV`
8. `/Users/anthony/Projects/worship-refactor-worktrees/foundation/app.js?v=DEV`

The shell also references `/Users/anthony/Projects/worship-refactor-worktrees/foundation/manifest.json?v=DEV`
and `/Users/anthony/Projects/worship-refactor-worktrees/foundation/icon.svg?v=DEV`.

Each Foundation file exposes one frozen API through both `module.exports` and
its browser namespace under `window.WorshipApp`.

## Pure domains

`window.WorshipApp.core` contains immutable duty, service, and feature catalogs.
`window.WorshipApp.domain.schedule` owns service IDs, duty ordering, conflict
rules, sorting, member duty lookup, workload suggestions, sheet merge transforms,
and member name-map transforms. `mergeSheetServices(input)` returns new service
and department arrays plus `addedServices`, `updatedServices`, and
`departmentsChanged`. It only applies fields represented by the incoming sheet
records, so a caller can preserve manual fields and persist changed records.
`applyNameMap(state, map)` returns a new state and precise changed-service
references without writing storage.

`window.WorshipApp.domain.sheet` owns CSV parsing and row conversion. Its
`sheetRowsToServices(rows, today, categories)` signature requires the reference
date and duty catalog explicitly. It preserves blank listed members as clears,
keeps blank choir titles unchanged, and reports unknown duties once per duty.

## Persistence gateways

`window.WorshipApp.services.storage.createAdapter(options)` accepts an injected
storage object, data key, state getter, Firebase getter, auth-ready getter, and
service-ID function. It normalizes local snapshots and exposes promise-returning
`persistService`, `persistDeleteService`, `persistMembers`, `persistSettings`,
`persistDepartments`, `persistNameMap`, `persistRequest`, and `persistAll` methods.
Firestore writes are queued behind the supplied auth-ready promise and local
mode writes the normalized state through the supplied storage object.

`window.WorshipApp.services.firebase.createAdapter(options)` accepts the raw
Firebase SDK method object and an auth-ready getter. Its `write`, document,
batch, and transaction methods return promises. The app keeps the raw `fb`
object for the lazy song module, preserving that module's existing transaction
and open-rule behavior. The Foundation gateway is for app-owned writes and does
not change song writes.

## Release handoff

The Release lane must stage and stamp these new local runtime assets alongside
the existing allowlist:

- `/Users/anthony/Projects/worship-refactor-worktrees/foundation/src/core/constants.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation/src/domain/schedule.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation/src/domain/sheet.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation/src/services/storage.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation/src/services/firebase.js`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation/manifest.json`
- `/Users/anthony/Projects/worship-refactor-worktrees/foundation/icon.svg`

All seven newly listed HTML references carry `?v=DEV` in source. The release
stamp must be applied to every staged copy and the source tree must be restored
to `DEV`.

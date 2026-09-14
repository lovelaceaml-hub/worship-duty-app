# Production dry run identity gap

Anthony approved the production release. Sol restored Firebase CLI and Google
application credentials for the authorized project account and captured an
owner-only backup of 940 documents at
`/private/tmp/worship-duty-department-backup-20260914T1400Z.json`. Its SHA-256 is
`bf9613aa9bb5dc9d91efa3172b994047cf85751267606e9da5c8d5109776bc17`.

The seven named department callables were created and `onScheduleWrite` was
updated successfully. The migration dry run planned 28 profile creates and no
updates, but skipped 1,035 historical assignment rows across 36 names because
those names have no authenticated account UID. Sol stopped the apply before any
profile write. Firestore rules and Hosting remain unchanged. Releasing the 28
UID-backed profiles now requires Anthony's explicit acceptance of the partial
history seed, with the unresolved rows retained in the owner-only dry-run
receipt for later identity matching.

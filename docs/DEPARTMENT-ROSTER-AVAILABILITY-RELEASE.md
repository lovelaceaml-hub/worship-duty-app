# Department Roster, Duty Eligibility, and Availability Release

Status: Released to production on 14 September 2026.

Live app: https://lv-zion-duties.web.app

Hosting release: `20260914142833`

## What is live

- UID-backed department rosters with active and inactive status.
- Department-scoped leader management and administrator override.
- Duty eligibility, schedulability, recurring availability, and date exceptions.
- Protected assignment and unassignment callables with audited writes.
- Schedule projection reconciliation through the updated `onScheduleWrite` trigger.
- The approved department management journey in all four appearances.

## Production evidence

- An owner-only backup captured 940 Firestore documents before any write. The
  local backup SHA-256 is
  `bf9613aa9bb5dc9d91efa3172b994047cf85751267606e9da5c8d5109776bc17`.
- Seven named department callables were created and `onScheduleWrite` was
  updated before the migration.
- Anthony explicitly approved the migration after reviewing the unmatched
  roster names.
- The atomic migration created 28 UID-backed profiles and did not roll back.
- A new dry run after migration reported 28 unchanged profiles, zero creates,
  zero updates, and zero attempted writes.
- Firestore rules compiled and released successfully.
- Hosting release `20260914142833` completed successfully.
- The live desktop and phone smoke checks found zero accessibility violations,
  console errors, and failed responses.
- The served HTML and service worker both carry release stamp
  `20260914142833`.

## Retained history

The production schedule contains 1,035 historical assignment rows across 36
abbreviated names that have no authenticated account UID. Anthony approved
releasing the 28 securely matched profiles without inventing placeholder
identities. The unmatched rows remain unchanged in the schedule and are also
preserved in the owner-only backup and migration receipts for later account
linking. `B. James S` is a distinct former duty holder and should not be merged
with `B. James`. Monica variants remain unresolved.

## Review and verification

The implementation followed the locked lane route recorded under
`docs/runs/department-roster-availability/`. Exactly one combined Opus review
ran. Its seven findings went directly to Sol and were corrected without another
review round. Local verification passed 159 Node tests, with only the declared
Firestore emulator matrix skipped, plus the complete four-appearance browser
gallery at phone, tablet, and desktop widths.

## Remaining maintenance

- Link historical names when corresponding authenticated accounts are created.
- Keep `B. James S` distinct from `B. James` and do not restore former duties.
- Resolve the Monica variants only after Anthony confirms their identities.
- Upgrade Cloud Functions from deprecated Node.js 20 before 30 October 2026.

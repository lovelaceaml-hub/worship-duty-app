# S6 release order

The department profile migration must be complete and verified before the new
Firestore rules and Hosting client become live.

1. Create and verify the production backup without changing production data.
2. Deploy only the new Cloud Functions while the current client and rules stay live.
3. Run the migration dry run against the verified backup and current production snapshot.
4. Apply the migration through the required atomic adapter, then verify profile counts, identities, availability defaults, and rollback receipts.
5. Deploy Firestore rules and Hosting.
6. Verify the real leader, member, administrator, scheduling, request, notification, song, and four-appearance journeys.

Production deployment and migration remain prohibited until Anthony explicitly
approves this release boundary.

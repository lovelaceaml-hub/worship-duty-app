# Historical identity correction runbook

## Status: PREPARED ONLY

The historical identity correction is prepared for a future owner-authorized
operation. Live execution is currently not authorized. This document contains
no member identities and no live job ID.

The runner accepts identity values only through hidden, non-echo terminal
prompts. It does not accept names in command arguments, environment variables,
or files. Dry-run and execute modes plan or apply the correction. Rollback
accepts only the opaque job ID printed by a completed execute operation and
does not prompt for identities. A rollback that detects a changed identity
scope or target refuses the operation. There is no force option.

## Commands

Run these commands from a trusted terminal. They use the absolute path to the
prepared runner and contain no identity values.

Dry-run, the default safe preparation step:

```sh
node /Users/anthony/Projects/worship-duty-app/functions/scripts/correct-member-identity.cjs --dry-run
```

Execute, only after every prerequisite below is verified and live owner
authorization is restored:

```sh
node /Users/anthony/Projects/worship-duty-app/functions/scripts/correct-member-identity.cjs --execute
```

Rollback, using the opaque job ID returned by execute:

```sh
node /Users/anthony/Projects/worship-duty-app/functions/scripts/correct-member-identity.cjs --rollback 'REPLACE_WITH_OPAQUE_JOB_ID'
```

The quoted placeholder is documentation only. Replace it with the
opaque job ID from the execute result. Do not place an identity, readable path,
or other personal data in its place.

## Required prerequisites before any future live execution

1. The changed identity-aware functions, `onScheduleWrite`, `dutyReminders`,
   `onRequestCreated`, and `onRequestResolved`, are deployed and verified for
   notification identity comparison, old and new registration targeting,
   reminder suppression, calendar aliases, and request self-notification.
2. The client has been verified to have no read or write access to the
   `_adminIdentityCorrections` backup collection. This must be proven against
   the deployed rules and client behavior without changing the rules.
3. A fictional emulator run passes the correction, transaction conflict,
   backup, rollback, and post-apply-change refusal checks.
4. A production dry-run returns only the expected aggregate count and
   collection kinds. No live write is allowed during this check.
5. The owner restores explicit authorization for the live execute operation.

The correction is capped at 200 target documents. The write and backup are
transactional. The backup stores only opaque item IDs, collection kinds,
identity fields, and precondition metadata. It excludes readable target paths,
notes, token contents, and settings secrets. Identity fields are confidential provider-only backup data and must never be exported.

## Reading results

Successful output is aggregate JSON with the mode, target count, collection
kinds, and, for execute or rollback, an opaque job ID. Error output is reduced
to an allowlisted error code and sanitized structural occurrence counts where
needed. Identity values, readable document paths, credentials, and tokens must
not be copied into logs, screenshots, tickets, or files.

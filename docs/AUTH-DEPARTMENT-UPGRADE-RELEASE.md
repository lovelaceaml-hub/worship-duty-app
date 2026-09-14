# Authentication and Department Upgrade Release Notes

Status: Reviewed implementation on a feature branch. Production is unchanged.

Pull request: https://github.com/lovelaceaml-hub/worship-duty-app/pull/10

## Architecture summary

- `permissions.js` is the shared pure authorization model for browser and server use.
- Cloud Functions verify salted PIN hashes, issue Firebase custom tokens, throttle failed login attempts, reset PINs, update department memberships, and change leader or choir-editor configuration.
- Firestore rules require a completed PIN change, a current role version, and the appropriate department or song scope for every privileged client write.
- Department memberships are soft-state records. Archiving removes a person only from the selected active roster and preserves global identity, other departments, and assignment history.
- Requests, conflicts, alerts, and push routing derive their recipients from the duty-owning departments.
- `schedule/{serviceId}.choirSong` is the runtime choir-song source used by the schedule, Prism, Presider, and Manage views.
- The spreadsheet is an import source. A supplied blank Choir Song cell clears the canonical value. An omitted field does not clear it. Later valid spreadsheet imports replace the canonical value for the exact date and service.

## Permission matrix

| Capability | B. Anthony | E. Simon | Department leader | Choir-only editor | Ordinary member |
|---|---:|---:|---:|---:|---:|
| View schedule and Prism | Yes | Yes | Yes | Yes | Yes |
| Manage assigned departments | All | Worship | Configured only | No | No |
| Change leaders and song editors | Yes | Yes | No | No | No |
| Create, delete, or structurally edit services | Yes | No | No | No | No |
| Add, archive, or reactivate department members | All | Worship | Configured only | No | No |
| Reset PINs | Any account | Any account | Non-privileged members in managed departments | No | No |
| Resolve requests or acknowledge conflicts | All | Worship scope | Affected managed departments | No | No |
| Edit choir song | Yes | When presider | When presider or song editor | Yes | When presider |
| Settings and sync tools | Yes | No | No | No | No |

## Data migration summary

The idempotent migration:

1. Canonicalizes `D. Chloe` to `M. Chloe` across members, assignments, rosters, requests, conflicts, notifications, accounts, song data, name maps, and caches.
2. Merges collisions instead of keeping two active identities.
3. Creates the requested leader and choir-editor configuration only when the runtime config does not already exist, so a rerun does not undo later authorized changes.
4. Initializes privileged accounts with a supported salted `0000` hash, `mustChangePin: true`, an active state, and a role version.
5. Preserves schedules, requests, setlists, memberships, and history. It does not wipe or reseed schedule data.
6. Supports dry-run output before any production write and requires an explicit apply confirmation flag.

## Verification

- 110 focused automated checks passed.
- One optional Firestore emulator matrix was skipped because its emulator-only dependencies were not installed.
- Chromium smoke checks passed for the site lock and member login at 1440 by 1000 and 360 by 800.
- Both rendered sizes had zero accessibility violations, console errors, and failed responses.
- JavaScript syntax, diff whitespace, and newly added forbidden dash checks passed.
- One Opus completion review was performed. Its material findings were corrected in one Sol pass, as requested.

## Remaining risks

- The Firestore emulator authorization matrix should be run immediately before production deployment. Static rules contract tests are green, but the emulator matrix is the final live-rules confidence check.
- Production migration and authentication need Google application-default credentials on the authorized release machine.
- Existing song catalog and song statistics collections retain their pre-existing direct-write boundary. The new service choir-song field is protected, but broader catalog hardening remains separate work.

## Exact production deployment steps

Run these only after the pull request is approved and merged:

1. Update the reviewed main branch and install dependencies.

   ```bash
   cd /Users/anthony/Projects/worship-duty-app
   git switch main
   git pull --ff-only origin main
   cd /Users/anthony/Projects/worship-duty-app/functions
   npm_config_cache=/tmp/npm-cache npm ci
   ```

2. Run focused checks and the Firestore emulator matrix.

   ```bash
   cd /Users/anthony/Projects/worship-duty-app
   node --test tests/permissions.test.mjs tests/department-workflows.test.mjs tests/firestore-rules-contract.test.mjs tests/member-migration.test.mjs tests/presider-permissions.test.mjs tests/integration-auth-wiring.test.mjs prototype-prism/tests/calendar-navigation.mjs functions/test/member-auth.test.js functions/test/leader-notifications.test.js functions/test/sheet-lib.test.js functions/test/index.test.js
   RUN_FIRESTORE_RULES_EMULATOR=1 node --test tests/firestore-rules-contract.test.mjs
   ```

3. Deploy the reviewed server functions first.

   ```bash
   cd /Users/anthony/Projects/worship-duty-app
   npm_config_cache=/tmp/npm-cache npx -y firebase-tools@latest deploy --project lv-zion-duties --only functions
   ```

4. Authenticate application-default credentials, then dry-run and apply the migration.

   ```bash
   gcloud auth application-default login
   cd /Users/anthony/Projects/worship-duty-app/functions
   npm run migrate:member-access -- --project lv-zion-duties --dry-run
   npm run migrate:member-access -- --project lv-zion-duties --apply --confirm-production-migration
   npm run migrate:member-access -- --project lv-zion-duties --dry-run
   ```

   The final dry run must report zero changed paths before continuing.

5. Deploy Firestore rules, then release stamped Hosting files.

   ```bash
   cd /Users/anthony/Projects/worship-duty-app
   npm_config_cache=/tmp/npm-cache npx -y firebase-tools@latest deploy --project lv-zion-duties --only firestore:rules
   bash /Users/anthony/Projects/worship-duty-app/scripts/deploy.sh
   ```

6. Verify the live login, forced PIN change, one single-department leader, one multi-department leader, E. Simon, choir-only editing, Prism empty-date advance, and one blank choir-song sync before announcing the release.

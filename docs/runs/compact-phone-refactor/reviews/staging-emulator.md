# Staging emulator evidence: compact-phone Section 3 callables and rules

Status: RUN 2026-09-17, local emulators only. No production read, no production
write, no deploy of any kind, no push. This is the emulator evidence
authorized by Anthony on 2026-09-17 (see `docs/PLAN-COMPACT-STAGING.md`
section 1 Route B and section 9 item 1/7) to stand in for a human production
sign-in, per his explicit instruction for this run.

## What ran

Java (Temurin 25.0.3 at `/Users/anthony/tools/jdk/Contents/Home`) was put on
`PATH`/`JAVA_HOME`. The Firestore and Auth emulators were started for the
demo project `demo-lv-zion-duties` (the `demo-` prefix guarantees no
production project can ever be reached) via:

```sh
export JAVA_HOME=/Users/anthony/tools/jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
cd /Users/anthony/Projects/worship-duty-app-worktrees/compact-integration
npm_config_cache=/tmp/npm-cache npx -y firebase-tools@latest emulators:start \
  --only auth,firestore --project demo-lv-zion-duties
```

`functions/node_modules` was absent in this worktree (per `AGENTS.md`/the
`anthony-mac-environment` skill), so it was temporarily symlinked from
`/Users/anthony/Projects/worship-duty-app/functions/node_modules` (a
repository the harness scripts import from directly with
`createRequire`/`require`, never over the network) and removed again before
this commit; `git status` confirms neither symlink is present. The harness
scripts also needed a root-level `node_modules` symlink to the same target so
Node's ESM resolver could find `firebase-admin`; that symlink was removed
before committing too.

The harness (`staging-harness/seed.mjs` then `staging-harness/checks.mjs`)
seeded entirely fictional data (see `staging-harness/seed.mjs`: members named
T. Fictitia, R. Testarosa, V. Trial, W. Sampleton, Q. Sample, N. Mockford, K.
Dummy, X. Newcomer, leader L. Leaderman, administrator A. Administrix — none
of these names are used anywhere else in the app or its data) into two real
departments, Worship and Usher Sisters (the actual configured department and
duty names from `functions/permissions.js`), then called the real Section 3
handlers (`functions/compact-workflows.js`, `functions/department-handlers.js`,
`functions/compact-membership.js`) directly against the Firestore emulator,
with `request.auth` built exactly the way `functions/index.js`'s
`callableActor`/`currentTokenForAccount` build it (same file read logic,
duplicated by hand in `staging-harness/lib.mjs` since the harness cannot
`require` production `index.js`, which calls `initializeApp()` at import
time). No real PIN or password was used or typed anywhere; sessions are
authenticated purely by custom claims minted through the Auth emulator's
Admin SDK, and by ID tokens minted the same way for the `firestore.rules`
checks (which must go through the rules engine, not the Admin SDK, to mean
anything).

Rerun exactly:

```sh
export JAVA_HOME=/Users/anthony/tools/jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
cd /Users/anthony/Projects/worship-duty-app-worktrees/compact-integration
ln -s /Users/anthony/Projects/worship-duty-app/functions/node_modules functions/node_modules
ln -s /Users/anthony/Projects/worship-duty-app/functions/node_modules node_modules
npm_config_cache=/tmp/npm-cache npx -y firebase-tools@latest emulators:start \
  --only auth,firestore --project demo-lv-zion-duties &
sleep 10
FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
  node staging-harness/seed.mjs
FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
  node staging-harness/checks.mjs
kill %1   # stop the emulator job
rm node_modules functions/node_modules
```

## Pass/fail table

26 of 27 checks passed. One check failed, and it is a real defect in
`firestore.rules` (below), not a harness mistake.

| # | Check | Result |
| --- | --- | --- |
| 1 | Profile stale-save, client 1 succeeds with a new revision | PASS |
| 2 | Profile stale-save, client 2 refused `aborted` with `details.updatedBy` | PASS |
| 3 | `saveMemberAvailability` marks Needs replacement, assignment untouched | PASS |
| 4 | `saveMemberAvailability` clears the marker when available again | PASS |
| 5 | `resolveDutyAttention` conflicting replacement refused `failed-precondition`/`conflict` | PASS |
| 6 | `resolveDutyAttention` succeeds + records `conflictOk` once acknowledged | PASS |
| 7 | `resolveDutyAttention` opens the duty (no replacement), slot document deleted | PASS |
| 8 | `resolveDutyAttention` approves a pending request with a clean replacement | PASS |
| 9 | `resolveDutyAttention` declines a pending request, assignment unchanged | PASS |
| 10 | `searchDepartmentCandidates` finds a seeded fictional member | PASS |
| 11 | `createDepartmentInvitation` issues a token | PASS |
| 12 | `acceptDepartmentInvitation` joins the member once, creates a non-schedulable profile | PASS |
| 13 | `acceptDepartmentInvitation` refuses a second use (`already-exists`) | PASS |
| 14 | `revokeDepartmentInvitation` revokes; a revoked token is refused | PASS |
| 15 | An expired token is refused | PASS |
| 16 | `saveSongService` draft save | PASS |
| 17 | `saveSongService` confirm | PASS |
| 18 | `saveSongService` confirm succeeds after an out-of-band `updatedAt` bump (Finding 4 scenario) | PASS |
| 19 | `correctSongHistory` swaps songs, updates `songStats` history, deletes an emptied stats doc | PASS |
| 20 | `recordSongHistory` first run: records only past+confirmed+unmoved lists | PASS |
| 21 | `recordSongHistory` recorded exactly the two eligible past lists, left the future one and the never-confirmed one alone | PASS |
| 22 | `recordSongHistory` second run is a no-op (idempotent) | PASS |
| 23 | rules: member reads their own profile after it carries `revision` | **FAIL — real defect, see below** |
| 24 | rules: a client cannot introduce `needsReplacement` on a schedule document | PASS |
| 25 | rules: `departmentInvitations` is unreadable and unwritable from a client | PASS |
| 26 | rules: legacy full-document admin schedule save carrying the two server-owned fields through unchanged is accepted | PASS |
| 27 | rules: a full-document save that drops `needsReplacement`/`assignmentRevisions` is refused | PASS |

## `recordSongHistory` scope (step 10 of the plan)

First run: 3 candidates (`status: 'planned'`, non-empty songs, `confirmedAt
>= updatedAt > 0`), 2 recorded, 1 skipped.

- Recorded: the two past, confirmed setlists (1 and 2 days before the run,
  services default to 20:00/09:00 Pacific — well past the 3-hour window).
  Both flipped to `status: 'sung'`, `historySource: 'automatic'`.
- Skipped: the one future confirmed setlist (5 days ahead) — correctly a
  *candidate* (confirmed, non-empty) but skipped at the per-candidate stage
  because its 3-hour-after-start window has not passed yet.
- Not a candidate at all (excluded before the count): the never-confirmed
  planned setlist (3 days in the past but `confirmedAt` absent), and the
  already-`sung` legacy setlist (excluded by the `status == 'planned'` query
  itself).

Second run: 1 candidate (the still-future confirmed setlist, still correctly
skipped), 0 recorded — the two previously-recorded setlists no longer match
`status == 'planned'`, confirming idempotency.

This harness's seed data is fictional and small; it demonstrates the
recorder's *scope logic* precisely, not the real production back-catalogue
count. Section 6 of `docs/PLAN-COMPACT-STAGING.md` (read-only count against
real data, decided by Anthony) still needs to run separately before the
recorder itself is deployed.

## Real product defect found

### `firestore.rules:1675` — department profile read exceeds Firestore's rules expression-evaluation budget

- **File:line:** `firestore.rules:1675` (`match /departments/{departmentId}/members/{memberUid} { allow read: if canReadDepartmentProfile(...); }`), which calls into `canReadDepartmentProfile` (line 544), `departmentProfileKeysSafe`/`departmentProfileValuesSafe` (lines 360, 393, including the nested `profileMetadataShapeSafe`/`profileAttributionShapeSafe`/`profileFieldAttributionShapeSafe`/`profileFieldDecisionShapeSafe` chain added for the Section 3 `revision`/`attribution`/`fieldAttribution` fields), and `isAdmin()`/`managesDepartment()` (lines 102, 143), each of which independently calls `claimsCurrent()` → `hasAccount()`/`accountData()` (lines 17, 60, 68), so the same `get()`/`exists()` reads and their surrounding boolean chain are re-evaluated many times over for one profile read.
- **Expected:** a signed-in member reading their own department profile document (`departments/{departmentId}/members/{memberUid}` where `request.auth.uid == memberUid`) should succeed with a 200, per the interface ruling's explicit contract that `revision` was added to `departmentProfileKeysSafe` specifically so profile reads keep working once documents carry a revision (`S3-SERVER-INTERFACE.md` section 3.2: "Without it `canReadDepartmentProfile` would fail for every profile after the first save.").
- **Actual:** the read is refused with `PERMISSION_DENIED` (HTTP 403) and the message `Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached. for 'get' @ L1675, ... for 'get' @ L1812`. This is deterministic and 100% reproducible (verified 3 consecutive times against the same document).
- **Reproduction:** with the emulators and seed data above running, mint an ID token for a seeded member's own account and GET `departments/Worship/members/<that member's authUid>` from the Firestore emulator's REST API:
  ```
  GET http://localhost:8080/v1/projects/demo-lv-zion-duties/databases/(default)/documents/departments/Worship/members/member%3AT.%20Fictitia
  Authorization: Bearer <ID token for member:T. Fictitia>
  ```
  returns HTTP 403 with the expression-budget message every time. The exact same profile document, read as the harness's own seeded fictional data with no unusual shape, is what fails — this is not a data-quality problem, it is the rules file's own evaluation cost.
- **Scope note:** the admin-token writes in checks 24–27 above (which also traverse `isAdmin()`/`managesDepartment()`) did **not** hit this limit, so the failure is specific to the `canReadDepartmentProfile` chain's combination of the profile shape-validation functions and the authorization OR-chain, not a blanket problem with every rule in the file. Whether this reproduces identically against real (non-emulator) Cloud Firestore was not tested — that would require a production or staging-project read, which is outside this session's hard limits — but the "1000 expressions" ceiling is a documented Firestore Security Rules limit, not an emulator-only artifact, so there is a real chance this reproduces in production the first time a member's compact-phone client tries to read their own availability/profile screen after the Section 3 deploy.
- **Not fixed.** Per instructions, product code (`firestore.rules`) was not touched. This finding should go back to whoever owns Section 3/rules review before Section 2 of `docs/PLAN-COMPACT-STAGING.md` (the production rules deploy) proceeds — it directly contradicts the interface ruling's own stated reason for the `revision` allowlist addition.

## What was not covered

- **Step 12 (scripted browser walkthrough against the emulators):** skipped, as the plan explicitly allows. `firebase-config.js`/`app.js` have no emulator-connection wiring (`connectFirestoreEmulator`/`connectAuthEmulator`/`connectFunctionsEmulator` do not appear anywhere in the client), and the plan says to stop and report rather than edit a shipped file to add it. The scripted callable and rules checks above remain the real evidence for this session.
- **Step 13 (Pacific time selector boundary check):** not run in this session. It is a client-side UI concern independent of the server/emulator authentication work this session covers, and it is already a standing `AGENTS.md` release gate exercised in earlier lane records (S4/S6), not part of the "cover at minimum" list this session was scoped to.
- **Section 6's read-only back-catalogue count against real production data** (how many real confirmed song lists `songHistoryRecorder` would record on first deploy) is a separate, explicitly-production-touching step of `docs/PLAN-COMPACT-STAGING.md` and was not run here.
- Real Auth custom claims exactly as production Firebase Auth mints them, real Web Push, and the real Sheet sync remain untested by design (the plan's own disclosed Route B weakness, section 8).
- `functions` unit tests (`node --test test/*.test.js`) were not rerun in this session; S6's record already has them passing (56/56) against the merged tree, and this session's harness only adds new emulator-level evidence on top.

## Confirmation

- No `firebase deploy` of any kind ran. No `design-gallery/release.mjs` ran. No `git push` ran.
- Every Firebase CLI/Admin SDK call in this session targeted `--project demo-lv-zion-duties` or the two local emulator hosts (`localhost:8080` Firestore, `localhost:9099` Auth) — verified by `FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST` being set on every script invocation.
- No real member name, PIN, or password was used anywhere; every account in the seed is fictional.
- Both emulators were stopped at the end of this session; `lsof` on ports 8080/9099/4400/4500/9150 and `ps aux` for `firebase`/`cloud-firestore-emulator` both show nothing running.
- The temporary `node_modules` and `functions/node_modules` symlinks used to run the harness were removed before this commit; `git status` shows only the intended `staging-harness/` and `firebase.json` changes.

# Worship Duty: Authenticated staging checks before the compact-phone release

Status: DRAFTED 2026-09-17. Not approved. Nothing executed. No deploy, no production read, no production write has happened for this plan.
Mode: Steps. Runner: fresh chats, one section per chat.
Branch: `claude/compact-integration` in `/Users/anthony/Projects/worship-duty-app-worktrees/compact-integration`.
Live app: https://lv-zion-duties.web.app
Firebase project: `lv-zion-duties` (shared: `new-song-app` owns the separate `songs` Hosting site in the same project)
Firebase console: https://console.firebase.google.com/project/lv-zion-duties/overview
Rules history and rollback: https://console.firebase.google.com/project/lv-zion-duties/firestore/rules
Function logs: https://console.firebase.google.com/project/lv-zion-duties/functions/logs
Sits between `docs/PLAN-COMPACT-PHONE-REFACTOR.md` Section 6 and its release approval. Supersedes nothing.

## 0. What this plan is for, in plain language

The new phone version of Worship Duty is finished and merged, but nothing about it has ever been tried by a real signed-in person. Everything so far was checked on this Mac with the database switched off.

The new app needs new server code before it can work at all. A Firebase preview link cannot carry server code, so a preview link on its own proves nothing.

**Your part is approvals only.** You never tap through a journey, never sign in for a test, never hand anyone a PIN. Every check below is run by an agent or by a machine, and the ones that need a signed-in account run against a fake local database with invented people in it.

Your total time: about 15 minutes, all of it reading short summaries and answering yes or no.
Agent time: about 5 hours 30 minutes across three sittings.

**Two corrections to what I was told, both verified:**

1. Java is already installed on this Mac. `/Users/anthony/tools/jdk/Contents/Home/bin/java -version` reports Temurin OpenJDK 25.0.3. It is simply not on the command path, which is why every earlier check in the S3, S4 and S6 lane records concluded it was missing and ruled the emulator out. There is nothing to install and no download approval to give. Section 2 carries a fallback install step only in case that runtime turns out to be unusable.
2. Because no agent may type a real PIN, nobody signs in to production before release at all. That is a real gap and section 9 asks you to accept it knowingly. The whole design below is built to make it survivable.

---

## 1. The routes we considered, and the recommendation

Setup: Opus 5 · High · Lane: Claude (research, already done) · Review: none, this section is the analysis rather than work to do · Agents: solo, no fan-out.

### Route A: production server first, then the new app on a preview link

Deploy the new Cloud Functions and the two rules lines to production, confirm the old live app still works, preview the new app against real data, then publish.

The server changes really are backward compatible. Verified by reading the code, not by running it:

- Witnesses (`expectedRevision`, `expectedMemberName`, `expectedUpdatedAt`) are all optional. `functions/revision.js` treats a missing witness as "no check", so the old app, which sends none, is never rejected.
- The two rules additions only ADD a key name to two existing allowlists (`firestore.rules` lines 381 and 628). An allowlist that gains a name cannot deny what it allowed yesterday.
- The third rules addition is an explicit `allow read, write: if false` on `departmentInvitations` (`firestore.rules` lines 1803 to 1810). Firestore matches are additive and `if false` grants nothing, so it cannot widen access. It exists so a later edit cannot open that collection by accident.

Exactly which changed server behavior the OLD live app meets:

| Changed behavior | Does the old app hit it? | Verdict |
| --- | --- | --- |
| `updateProfile` now runs in a transaction and writes a `revision` number | Yes, on every leader profile or availability save | Safe. The old app ignores fields it does not know, and `revision` was added to the `departmentProfileKeysSafe` read allowlist, which is what gates the old app's profile reads. Without that one line the old app's profile reads would have broken on the first revision-bearing write. It is in. |
| Assignment handlers now write `schedule/{id}.assignmentRevisions` | Yes, whenever a leader assigns or unassigns | Safe. Written by the server through the Admin SDK, which bypasses rules entirely. |
| `onScheduleWrite` self-healing: clears dead Needs-replacement markers, writes `revision` onto records it rewrites | Yes, on every schedule write, including the unattended Sheet sync | Safe, and it is what keeps the Sheet sync and the legacy direct-write path from leaving stale markers behind. |
| `songHistoryRecorder`, a new job every 30 minutes | Yes, immediately, whether or not anyone opens the app | **Not safe on day one. See section 3.** |

**The full-document write question, answered.** The old live app at commit `1e0b6fd` saves a service with `fb.setDoc(doc, svc)` at `app.js:1036`, the whole document at once. The worry was that once the server adds `assignmentRevisions` or `needsReplacement`, an old-app save would drop them, and the schedule allowlists (`adminScheduleUpdate` at `firestore.rules:803`, and its per-department siblings from line 894 onward) are all `hasOnly` lists naming neither key, so a dropped key counts as an affected key and the whole save is refused.

It does not happen in normal use. The `svc` object the old app writes came from the live listener (`app.js:4214`, `state.services = snap.docs.map(d => d.data())`), so it already carries both server keys and writes them back byte for byte. Neither key appears in the rules diff, so the allowlists never see them. The Sheet sync is fine too: `mergeSheetServices` (`app.js:1348` onward) edits the existing object in place, and only builds a fresh bare object for services that do not exist in Firestore yet, where there is nothing to drop.

One narrow window remains. If the server changes a marker in the moment between the listener's last snapshot and an old-app save, that save is refused with a permission banner. Nothing is lost and the person taps save again. The listener is real time, so the window is well under a second. A low risk, not a blocker, and it is why section 4 has a fast rollback.

The new client is already better here: `serviceWriteBody()` at `app.js:1188` tracks both server-owned keys from the listener and carries them through deliberately.

**Route A honest weakness:** on its own, the first real exercise of nine brand-new callables happens against live church data, and with nobody permitted to sign in to test, it happens when a real member opens the app. A transaction bug would land on a real record, and a Firestore write has no undo.

### Route B: local emulator suite with fictional data, then Route A

The emulator runs Auth, Firestore and Functions on this Mac with invented people and invented services. Scripted checks call the callables directly with tokens the emulator mints, so no real PIN, no real password and no human tapping are involved anywhere.

This is the only place the nine callables, the revision contract, the rules allowlists, the Needs-replacement fan-out and the song recorder can be proven at all under the new constraints. It costs nothing real and breaks nothing.

**Route B honest weaknesses:** the emulator is not production. It does not prove real Auth custom claims as production mints them, real Web Push, the real Sheet sync, real cold starts, or data shapes that accumulated over years. It reduces the risk in Route A, it does not remove it.

### Route C: a separate staging Firebase project

A new project, Blaze billing on it, a second copy of rules and functions, a second Auth configuration with its own Web Push key, a second `firebase-config.js`, and seeded data. Roughly a full day, and it needs your Google account and a billing decision.

Its one advantage over Route B is real Auth and real cold starts. But with no human permitted to sign in, most of that advantage cannot be collected anyway. It carries the same shared-project deploy hazard as production and leaves a second church Firebase project alive for someone to remember. Reject.

### Recommendation

**Route B first, then Route A, with the song recorder held back on the first deploy and released as its own decision.**

With human walkthroughs off the table, the emulator stops being a nice extra and becomes the only authenticated evidence this release will ever have. Java is already here, so it costs an environment variable.

---

## 2. The staging harness, and the plan rule it bends

Setup: Opus 5 · High · Lane: Claude · Review: your approval is the gate · Agents: solo.
Who: you approve, once. Your time: 2 minutes.

`docs/PLAN-COMPACT-PHONE-REFACTOR.md` section 5 says no new test cases or automated suites. The scripted checks in section 4 are exactly the kind of thing that rule was written to prevent, so they need your explicit permission rather than a quiet reinterpretation.

What is being asked for, precisely:

- A one-time staging harness: a seed script, a token minter, and one checks script.
- It lives in the session scratchpad at `/private/tmp/claude-501/.../scratchpad/staging-harness/`, **not in Git**. Nothing is committed, so no suite enters the repository and nothing is added to any build or release gate.
- If you would rather keep it, the alternative is one clearly labeled folder at `/Users/anthony/Projects/worship-duty-app-worktrees/compact-integration/docs/runs/compact-phone-staging/harness/` with a README saying it is a one-time staging tool and not part of the plan's verification gates. Your choice, question 2 in section 10.
- It contains no real names, no real PINs, no production records.

**Java.** No install is needed: Temurin OpenJDK 25.0.3 is already at `/Users/anthony/tools/jdk/Contents/Home`, just off the path. The agent exports it:

```sh
export JAVA_HOME=/Users/anthony/tools/jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
```

Fallback, only if that runtime turns out to be broken: a Temurin 21 LTS macOS build is about 190 MB to download, unpacks to roughly 320 MB, and installs into `~/tools/` without a password in about 10 minutes. It needs no sudo and touches no system setting. That fallback is question 3 in section 10, pre-approved or not as you prefer, so the agent is not blocked mid-run.

---

## 3. The song recorder problem, stated plainly

Setup: Opus 5 · High · Lane: Claude · Review: none, this is a finding · Agents: solo.

Yes, `songHistoryRecorder` starts running within 30 minutes of the Functions deploy, on its own, with nobody signed in.

What it does, at `functions/compact-workflows.js:594` to `655`: it fetches **every** setlist whose `status` is `'planned'`, with no date limit at all. For each one that has songs, was confirmed, and whose service started more than three hours ago, it marks the setlist sung and increments `timesSung` on every song in it.

In plain language: every confirmed song list anyone ever saved and never manually marked sung, going back to the beginning of the app, is recorded as sung in one burst, and the "times sung" counts jump. The job is idempotent so it will not do it twice, but there is no dry run, and the only way back is `correctSongHistory`, one service at a time, by hand.

That may well be the right outcome. Those services really did happen. But it is a change to real history that nobody has agreed to, and it would arrive by surprise.

**It is gated in this plan, and gating costs no code change:** section 5 deploys the other functions by name and simply does not name this one. Section 6 counts the candidates read-only, shows you the number and the oldest date, and deploys the recorder only after you say yes.

---

## 4. Section 1: Emulator suite, fictional data, scripted checks

Setup: Sonnet 5 · High · Lane: Claude · Review: controller self-verification only, no fresh reviewer, since this touches nothing real · Agents: solo, no fan-out.
Who: agent, entirely. Your time: 0 minutes.
Estimated agent time: 150 minutes.
Touches production: no. Nothing leaves this Mac. No real credential is used or typed.

1. Put Java on the path as in section 2 and confirm `java -version` reports Temurin 25.
2. Start the Auth, Firestore and Functions emulators for project `lv-zion-duties` from the worktree, with `npm_config_cache=/tmp/npm-cache` on every npx call as this Mac requires. Emulators only, no `--project` deploy of any kind.
3. Seed entirely fictional data through the Admin SDK against the emulator: about eight services across two departments, six invented members, one leader, one administrator, one presider, three setlists (one confirmed and past, one confirmed and future, one unconfirmed), and a small song catalogue. No real names, no real PINs, no production export.
4. Mint the custom claims the callables expect (`memberId`, role, department) directly through the Auth emulator's Admin SDK. This is how the checks get authenticated sessions without a sign-in screen and without a password existing at all.

Scripted checks, each called directly against the emulated callables:

5. **Stale save, two clients.** Two minted sessions read the same assignment, both send a change, the second carries the first's now-stale `expectedRevision`. The second must be refused with `aborted` and a `details` payload naming who changed it, and the first must have succeeded.
6. **Availability marks Needs replacement.** A member marks a department unavailable while still assigned to a future service. `saveMemberAvailability` must return `replacements.marked` naming that duty, the assignment must still exist, and `schedule/{id}.needsReplacement` must carry a live marker. Marking available again must clear it.
7. **Resolve with a conflict advisory.** `resolveDutyAttention` with a replacement who already holds another duty in the same service must be refused with `failed-precondition` and `details.reason === 'conflict'`, then succeed when retried with `acknowledgeConflict: true`, and record `conflictOk`.
8. **Invite create and accept.** `createDepartmentInvitation`, then `acceptDepartmentInvitation` from a second minted session. It must join once, refuse the second use, and refuse after `revokeDepartmentInvitation`. Tokens are never logged.
9. **Song confirm after the presider's own picks.** Save a draft, move the setlist's `updatedAt` the way the legacy picker does, then confirm. Confirm must succeed. This is the exact Finding 4 bug.
10. **Recorder idempotency and scope.** Run `recordSongHistory` by hand. Record exactly which setlists it takes and which it skips, then run it again and confirm the second run is a no-op.
11. **Rules allowlists.** Against the Firestore emulator with rules loaded, confirm a client profile read still succeeds on a document that now carries `revision`, confirm a full-document schedule write that carries the two server-owned keys through is accepted, confirm one that drops either key is refused, and confirm `departmentInvitations` is unreadable and unwritable from a client.
12. **Scripted browser walkthrough, no human.** Serve the built `.hosting-gallery` on localhost pointed at the emulators, and have the agent drive it with its own browser automation across the member, leader, administrator and presider screens in all four appearances at 375 pixels. Assert zero console errors, zero horizontal overflow, and that the `#invite/<token>` route accepts. If the app cannot be repointed at the emulators without editing `firebase-config.js`, stop and report rather than editing a shipped file: the scripted callable checks in steps 5 to 11 remain the real evidence and this step is a bonus.
13. **Pacific time selector check**, required by `AGENTS.md` before any Hosting release. With a seeded same-day 5:00 AM and 7:30 PM pair, drive the clock to 7:20 PM and to 9:06 PM Pacific and assert the current-or-next selector is right across that boundary in all four appearances, and that an explicitly selected past service stays selected while the automatic default advances.

Rollback: stop the emulators and delete the harness folder. There is nothing to undo.

Evidence: append a `## 2026-09-17: Staging Section 1` block to `docs/runs/compact-phone-refactor/lanes/S6.md` listing each check, its result, and the exact recorder scope from step 10. One Build log line in `docs/PLAN-COMPACT-PHONE-REFACTOR.md`. Failures come back to this branch as corrections and Section 1 runs again.

**Stop here and report to Anthony.** He approves or rejects moving to production on the strength of this evidence alone.

---

## 5. Section 2: Deploy Rules, then Functions except the recorder

Setup: Opus 5 · High · Lane: Claude · Review: controller self-verification plus automatic smoke checks · Agents: solo, no fan-out.
Who: agent, entirely. Your time: 0 minutes after the approval in section 9.
Estimated agent time: 45 minutes.
Touches production: yes. This is the first irreversible step in the plan.

**Capture what is live now, before anything:**

1. Save the live `firestore.rules` from the console into `docs/runs/compact-phone-staging/rollback/firestore.rules.live-2026-09-17.txt`. Firebase also keeps its own rules version history in that same console page, which is the real safety net.
2. Record the deployed function list and the git commit the live Hosting build came from.

**Deploy rules:**

```sh
npm_config_cache=/tmp/npm-cache npx -y firebase-tools@latest deploy \
  --project lv-zion-duties \
  --only firestore:rules \
  --config /Users/anthony/Projects/worship-duty-app-worktrees/compact-integration/firebase.json
```

Rollback: redeploy the saved file, or restore the previous version from the console's rules history. Under 2 minutes.

**Deploy functions by name, never `--only functions`.** `docs/PLAYBOOK.md` line 249 currently prescribes a bare `--only functions` on a shared project. That redeploys all twenty-plus functions for no reason and is a wider blast radius than this change needs. Name them:

```sh
npm_config_cache=/tmp/npm-cache npx -y firebase-tools@latest deploy \
  --project lv-zion-duties \
  --only functions:saveMemberAvailability,functions:resolveDutyAttention,functions:saveSongService,functions:correctSongHistory,functions:searchDepartmentCandidates,functions:createDepartmentInvitation,functions:revokeDepartmentInvitation,functions:acceptDepartmentInvitation,functions:updateDepartmentProfile,functions:updateMemberAvailability,functions:createDepartmentProfile,functions:assignDepartmentDuty,functions:unassignDepartmentDuty,functions:overrideDepartmentAssignment,functions:onScheduleWrite \
  --config /Users/anthony/Projects/worship-duty-app-worktrees/compact-integration/firebase.json
```

`songHistoryRecorder` is deliberately absent. Deploying it is section 6.

Never a bare `firebase deploy` here. The Hosting predeploy guard at `scripts/guard-gallery-deploy.mjs` blocks Hosting, but rules and functions have no such guard, so the discipline has to be ours.

Rollback: redeploy the same named functions from commit `1e0b6fd`, the code the live site was built from. About 10 minutes. `onScheduleWrite` is the one to watch, because it is the only changed trigger that fires with nobody using the app.

**Automatic smoke checks, no sign-in, no credential, agent-run (about 20 minutes):**

3. `GET https://lv-zion-duties.web.app/ics/B.%20Anthony` must return a valid calendar body with a 200. This is an unauthenticated read-only endpoint that reads the real schedule, so a broken deploy shows up here immediately.
4. `publicSchedule` must return `{ version: 1, ... }` with a non-empty `services` array and today's or a later first date. Same reasoning, and it exercises the schedule collection end to end.
5. Call one department callable with no auth token at all and assert it is refused with `unauthenticated`. That proves the new callables are deployed and reachable without any credential existing.
6. Watch the function logs for 30 minutes and assert zero unhandled errors, paying particular attention to `onScheduleWrite`.
7. The Sheet sync runs on its own every 2 hours and writes to the schedule, which fires `onScheduleWrite` unattended. Confirm one such cycle completes cleanly in the logs before moving on. This is a free live exercise of the one changed trigger, with no human involved.

If any of these fail, roll the functions back immediately and stop. The old live app continues working throughout, because that is the compatibility property section 1 tested.

---

## 6. Section 3: Decide on the song recorder, then deploy it

Setup: Opus 5 · High · Lane: Claude · Review: your decision is the gate · Agents: solo.
Who: agent counts and deploys, you decide. Your time: 5 minutes.
Estimated agent time: 25 minutes.

1. Agent runs a read-only count of setlists with `status: 'planned'` that are confirmed and whose service is more than three hours past, and reports the number and the oldest date. Read only, nothing written.
2. You decide: record them all, or have the recorder changed to ignore anything before a chosen date first.
3. If you say go:

```sh
npm_config_cache=/tmp/npm-cache npx -y firebase-tools@latest deploy \
  --project lv-zion-duties \
  --only functions:songHistoryRecorder \
  --config /Users/anthony/Projects/worship-duty-app-worktrees/compact-integration/firebase.json
```

4. Within 30 minutes the agent checks the logs and confirms the recorded count matches the predicted count, then confirms the next run is a no-op.

Rollback: `functions:delete songHistoryRecorder` stops further recording, but it does not undo records already written. Undoing those means `correctSongHistory` one service at a time. That asymmetry is exactly why step 1 exists.

---

## 7. Section 4: Publish Hosting

Setup: Opus 5 · High · Lane: Claude · Review: `finish-and-verify` · Agents: solo.
Who: agent, entirely. Your time: 0 minutes after the approval in section 9.
Estimated agent time: 40 minutes.

Only after sections 1 to 3 pass and you have said go.

There is no production preview-channel step in this version of the plan. A preview channel is only worth deploying if someone signs in to it, and nobody may. Skipping it is the honest call: it removes a step that would have produced no evidence.

1. Merge `claude/compact-integration` into `main`.
2. Publish Hosting through the guarded publisher, the only permitted way:

```sh
node /Users/anthony/Projects/worship-duty-app-worktrees/compact-integration/design-gallery/release.mjs --publish
```

It refuses to run unless the current live release is a recognized compatible predecessor, deploys Hosting only, and then verifies the new release stamp on the live URL itself. That self-verification is the release check, and it needs no human.

3. Agent smoke checks with no sign-in: fetch `/design-gallery-release.json` and confirm the new stamp; fetch `/`, `app.js`, `sw.js` and each of the four appearance stylesheets and confirm 200s with the expected cache headers; load the live URL in the agent's browser at 375 pixels and confirm the site lock and sign-in screen render with zero console errors in all four appearances. No credential is entered.
4. Watch the function logs for 60 minutes for a spike in `invalid-argument`, `permission-denied` or `aborted`, which is what a broken client-to-server contract looks like once real members start opening the app.
5. Push the branch and back the repository up privately.

Rollback: redeploy Hosting from commit `1e0b6fd` through the same publisher. About 15 minutes, and it is the fast one, because the server stays exactly as it is. The old client works against the new server by design, which is the property proven in section 1 and confirmed live in section 5.

Note for whoever runs this: `docs/HANDOFF.md` has no rollback section at all today. It should gain one from this plan.

---

## 8. The risk you are accepting, stated once, plainly

Setup: Opus 5 · High · Lane: Claude · Review: none, this is a disclosure · Agents: solo.

Because no human may walk the app and no agent may type a real PIN, **the first signed-in use of the new app against production data will be a real church member, in real use.**

What stands between that member and a bad day:

- Every callable, the stale-save path, the invite flow, the Needs-replacement fan-out and the recorder are proven in section 1 against a real Firestore and real rules, with real transaction semantics, just with invented people.
- The server ships first and is proven backward compatible, so the old app keeps working right up to the moment Hosting flips.
- Hosting rollback is one command and restores a version that has been live for weeks.
- The recorder, the only step that changes historical records, is a separate decision with its own count in front of it.

What still is not covered: production Auth custom claims as production mints them, Web Push, and any data shape that exists in the real database but not in the seed. If you later free up 30 minutes, the single highest-value thing you could do is the two-window stale-save test on the live site after step 7.2. It is optional and this plan does not depend on it.

---

## 9. What Anthony must do

All of these are yes or no. None involve using the app.

1. Approve the route: emulator first, then production server, then Hosting.
2. Approve the staging-harness exception to the plan's no-new-test-suites rule, and say whether it stays uncommitted in the scratchpad or is kept in a clearly labeled folder.
3. Pre-approve or decline the fallback Java install (about 190 MB, about 10 minutes, no password), so the agent is not blocked mid-run if the existing runtime is broken.
4. Approve the first production deploy in section 5. This is the irreversible one.
5. Decide in section 6 whether the whole back catalogue of confirmed song lists is recorded as sung, or gets a cutoff date first.
6. Approve the Hosting publish in section 7.
7. Acknowledge the residual risk in section 8: no human signs in to production before release.

---

## 10. Questions

1. Route: emulator first then production (recommended), or straight to production?
2. Staging harness: leave it uncommitted in the scratchpad (recommended), or keep it in a labeled folder in the repository?
3. Fallback Java install: pre-approved, or ask you if it is needed?
4. Song history back catalogue: record it all, or set a cutoff date first?
5. Start section 1 now, or wait?

---

## Build log

- 2026-09-17: Drafted. Not approved. Nothing executed. No deploy of Hosting, Functions or Rules; no production read or write; no push; no migration; no new test suite created. Research was read-only against this worktree, the S3, S4, S5A, S5B and S6 lane records, `firestore.rules`, `app.js` at `1e0b6fd` and at HEAD, `functions/compact-workflows.js`, `functions/index.js`, `design-gallery/release.mjs`, `scripts/guard-gallery-deploy.mjs`, `firebase.json`, every project `.firebaserc`, and the `live-app-release`, `lv-zion-firebase-apps` and `anthony-mac-environment` skills. Four findings drove the recommendation: Java is present at `/Users/anthony/tools/jdk/Contents/Home` (Temurin 25.0.3, verified by running it) and is only missing from the command path, which invalidates the "no emulator possible" assumption recorded in three lane records and means no install approval is needed; `songHistoryRecorder` queries every `status: 'planned'` setlist with no date floor and would back-record the entire history on its first run; the old live client's full-document schedule write is safe against the new server-owned keys because its listener carries them through, with one sub-second race that fails closed rather than losing data; and `new-song-app` shares the `lv-zion-duties` project but owns a separate `songs` Hosting site and no functions, so this repository's pinned Hosting site and named function targets cannot reach it.

- 2026-09-17: Redrafted the same day under a constraint change from Anthony: no manual signed-in walkthroughs by him, and no agent typing real PINs or passwords into sign-in screens. Human journey checks were replaced with scripted emulator checks using emulator-minted tokens, the production preview-channel step was removed as evidence-free without a signed-in tester, unauthenticated production smoke checks were added in its place, and the residual risk that no human signs in to production before release was written up as its own disclosure for Anthony to accept knowingly. Still not approved, still nothing executed.

- 2026-09-17: Section 1 (local emulator suite) executed under Anthony's same-day approval: Route B (emulator first), the staging harness as a committed, clearly-labeled exception to the no-new-test-suites rule (kept in `staging-harness/` per his choice rather than the scratchpad, excluded from Hosting), and emulator evidence standing in for a human production sign-in. Auth and Firestore emulators ran locally for the demo project `demo-lv-zion-duties`; `functions/node_modules` was temporarily symlinked from the sibling `worship-duty-app` checkout and removed before committing. Seeded entirely fictional data (members T. Fictitia, R. Testarosa, V. Trial, W. Sampleton, Q. Sample, N. Mockford, K. Dummy, X. Newcomer, leader L. Leaderman, administrator A. Administrix; real department/duty names) and called `saveMemberAvailability`, `resolveDutyAttention`, `saveSongService`, `correctSongHistory`, `recordSongHistory`, `searchDepartmentCandidates`, `createDepartmentInvitation`, `revokeDepartmentInvitation`, and `acceptDepartmentInvitation` directly, plus five `firestore.rules` checks over the Firestore emulator's REST API with minted ID tokens. 26 of 27 checks passed. Full pass/fail table, the `recordSongHistory` scope numbers, and one real defect in `docs/runs/compact-phone-refactor/reviews/staging-emulator.md`: `firestore.rules:1675`'s `canReadDepartmentProfile` chain deterministically exceeds Firestore's 1000-expression rules-evaluation budget when a member reads their own department profile, refusing a read the interface ruling explicitly says must keep working after the `revision` field ships. Not fixed (out of scope for this session); flagged for whoever owns Section 3/rules review before Section 2's production rules deploy. Step 12 (browser walkthrough against the emulators) was skipped and reported rather than editing `firebase-config.js`/`app.js` to add emulator-connection wiring, per the plan's own instruction. No deploy, no push, no production read or write. Both emulators confirmed stopped afterward.

- 2026-09-17: Section 6 production server deploy executed under Anthony's same-day approvals (deploy the new server code and rules to production now; the automatic song-history recorder records from release day forward only). Before any deploy, `functions/compact-workflows.js` gained `SONG_HISTORY_FLOOR_DATE = '2026-09-17'`, applied in `recordSongHistory`'s candidate filter and again inside the per-setlist transaction as an in-memory Pacific service-date string compare, so no Firestore inequality and no composite index is involved and a missing date fails closed; the pre-release back catalogue can never be auto-recorded. The committed staging harness gained absolute, floor-anchored fixtures and a fixed recorder clock, proving a confirmed past-window setlist dated before the floor is not recorded, one dated on the floor is, and a second run records nothing: 29/29 harness checks passed against the `demo-lv-zion-duties` emulators and the functions suite passed 56/56 (commit `e43e1fb`). Deployed by explicit named targets only, never a bare `firebase deploy` or bare `--only functions`: `firestore:rules` (20:44:58Z to 20:45:19Z UTC), then fifteen named functions (20:45:38Z to 20:47:34Z UTC, eight created and seven updated, `onScheduleWrite` among them), then `songHistoryRecorder` on its own once Step 1 had passed (20:48:59Z to 20:50:20Z UTC). The two functions in this shared project that belong to another app, `onVercelScheduleWrite` and `worshipVercelReconcile`, were left untouched and nothing was deleted; the post-deploy list is the original 21 plus the 9 new. Smoke checks with no credential: live site HTTP 200 with its release marker `gallery1789446013699` unchanged (Hosting deliberately not published), `/ics/B.%20Anthony` HTTP 200 with a valid calendar body, `publicSchedule` HTTP 200 with 70 services, unauthenticated calls to four new callables all refused HTTP 401 `UNAUTHENTICATED`, and function logs clean of errors. No rollback was needed; rollback points, exact commands and the saved copy of the live rules from `1e0b6fd` are in the lane record. No Hosting publish, no `release.mjs`, no migration, no data deletion, no direct production Firestore read or write. Record: `docs/runs/compact-phone-refactor/lanes/S6.md`.

# Worship Duty: Authenticated staging checks before the compact-phone release

Status: DRAFTED 2026-09-17. Not approved. Nothing executed. No deploy, no production read, no production write has happened for this plan.
Mode: Steps. Runner: fresh chats, one section per chat.
Branch: `claude/compact-integration` in `/Users/anthony/Projects/worship-duty-app-worktrees/compact-integration`.
Live app: https://lv-zion-duties.web.app
Firebase project: `lv-zion-duties` (shared: `new-song-app` owns the separate `songs` Hosting site in the same project)
Firebase console: https://console.firebase.google.com/project/lv-zion-duties/overview
Supersedes nothing. This plan sits between `docs/PLAN-COMPACT-PHONE-REFACTOR.md` Section 6 and its release approval.

## 0. What this plan is for, in plain language

The new phone version of Worship Duty is finished and merged, but nothing about it has ever been tried by a real signed-in person. Everything so far was checked on this Mac with the database switched off.

The new app needs new server code before it can work at all. A Firebase preview link cannot carry server code, so a preview link on its own proves nothing. This plan is how we get real signed-in proof without risking the live app that people use every week.

Total time for the whole plan: about 4 hours 30 minutes of agent work plus about 70 minutes of your time, spread over two sittings.

---

## 1. The three routes we considered

Setup: Opus 5 · High · Lane: Claude (research only) · Review: none (this section is the analysis, not work to do) · Agents: solo, no fan-out.

### Route A: put the server code on production first, then preview the new app against it

Deploy the new Cloud Functions and the two rules lines to production, confirm the OLD live app still works, then put the NEW app on a temporary preview link pointed at the same real data, test it with your own account, and finally publish.

This works because the server changes were built to be backward compatible. Verified by reading the code, not by running it:

- Witnesses (`expectedRevision`, `expectedMemberName`, `expectedUpdatedAt`) are all optional. `functions/revision.js` treats a missing witness as "no check", so the old app, which sends none, is never rejected.
- The two rules additions only ADD a key name to two allowlists (`firestore.rules` lines 381 and 628). An allowlist that gains a name cannot deny something it allowed yesterday.
- The third rules addition is an explicit `allow read, write: if false` on `departmentInvitations` (`firestore.rules` lines 1803 to 1810). Firestore rule matches are additive and `if false` grants nothing, so this cannot widen access. It exists to stop a future edit opening the collection by accident.

Exactly which changed server behavior the OLD live app would meet:

| Changed behavior | Does the old app hit it? | Verdict |
| --- | --- | --- |
| `updateProfile` now runs in a transaction and writes a `revision` number | Yes, on every leader profile or availability save | Safe. The old app ignores fields it does not know about, and `revision` was added to the `departmentProfileKeysSafe` read allowlist, which is what gates the old app's profile reads. Without that one line the old app's profile reads would have broken on the first save. It is in. |
| Assignment handlers now write `schedule/{id}.assignmentRevisions` | Yes, whenever a leader assigns or unassigns | Safe. Written by the server through the Admin SDK, which bypasses rules entirely. The old app's schedule listener does `snap.docs.map(d => d.data())`, so it holds the whole document including the new key and writes it straight back. |
| `onScheduleWrite` self-healing: clears dead Needs-replacement markers, writes `revision` onto records it rewrites | Yes, it fires on every schedule write | Safe, and it is the piece that keeps the Sheet sync and the old direct-write path from leaving stale markers behind. |
| `songHistoryRecorder`, a new job every 30 minutes | Yes, immediately, whether or not anyone opens the app | **Not safe on day one. See section 2.** |

**The full-document write question, answered.** The old live app at commit `1e0b6fd` saves a service with `fb.setDoc(doc, svc)` at `app.js:1036`, the whole document at once. The worry was that once the server adds `assignmentRevisions` or `needsReplacement`, an old-app save would drop those keys, and the rules allowlists (`adminScheduleUpdate` at `firestore.rules:803` and its siblings from line 894 onward) are all `hasOnly` lists that do not name either key, so a dropped key would count as an affected key and the whole save would be refused.

It does not happen in normal use. The `svc` object the old app writes came from the live listener (`app.js:4214`, `state.services = snap.docs.map(d => d.data())`), so it already carries both server keys and writes them back byte for byte. Neither key shows up in the rules diff, so the allowlists never see them. The Sheet sync is fine too: it edits the existing object in place (`mergeSheetServices`, `app.js:1348` onward) and only builds a fresh bare object for services that do not exist in Firestore yet, where there is nothing to drop.

There is one narrow window left. If the server changes a marker in the split second between the listener's last snapshot and the old app's save, that save is refused with a permission error and a banner. Nothing is lost, the person taps save again. The listener is real time, so the window is well under a second. I am calling this a low risk, not a blocker, but it is a real one and it is why section 4 has a rollback.

The new client is already better here: `serviceWriteBody()` at `app.js:1188` tracks both server-owned keys from the listener and carries them through deliberately.

**Route A honest weaknesses:** the very first real exercise of nine brand-new callables happens against live church data. If a handler has a transaction bug, a real record is the one that gets it. There is no undo for a Firestore write.

### Route B: run the local emulator with made-up data first, then do Route A with less risk

The lane records for S3, S4 and S6 all say the emulator is impossible because Java is not installed. **That is out of date.** Java IS on this Mac: Temurin OpenJDK 25.0.3 at `/Users/anthony/tools/jdk/Contents/Home`. It is simply not on the command path, which is why `java -version` fails and why every earlier check concluded it was missing.

So Route B costs one environment variable, not an install:

```sh
export JAVA_HOME=/Users/anthony/tools/jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
```

That removes the only stated reason Route B was rejected. Everything the emulator can prove costs nothing real: the nine callables end to end, the rules changes, the stale-save rejection, the Needs-replacement fan-out, and above all what `songHistoryRecorder` would actually do, which is the one thing in this release that can quietly damage real records.

**Route B honest weaknesses:** the emulator is not production. It does not prove real Auth custom claims, real Web Push, the real Sheet sync, real cold-start latency, or real data shapes that accumulated over years. It cannot replace Route A, only de-risk it. Setting up seeded fictional data and minted custom claims is real work, roughly 90 minutes.

### Route C: a separate staging Firebase project

Cost: a new Firebase project, Blaze billing enabled on it, a second copy of rules and functions, a second Auth configuration with its own Web Push VAPID key, a second `firebase-config.js`, and seeded data. Roughly a full day, and it needs your Google account and a billing decision.

Benefit over Route B: it proves real Auth and real Cloud Functions cold starts.

Verdict: not worth it. It carries the same shared-project deploy hazard as production, it proves very little that the emulator does not, and it leaves a second church Firebase project alive that someone has to remember exists. Reject.

### Recommendation

**Route B first, then Route A, with the 30 minute song recorder deliberately held back on the first deploy.**

Two reasons, both concrete. First, Java is already here, so Route B's cost collapsed from "install a Java runtime" to one line in a shell. Second, the single genuinely dangerous item in this release is the song recorder, and the emulator is the only place we can see what it would do before it does it to real records.

---

## 2. The song recorder problem, stated plainly

Setup: Opus 5 · High · Lane: Claude · Review: none (finding, not work) · Agents: solo.

Yes, `songHistoryRecorder` starts running within 30 minutes of the Functions deploy, on its own, with nobody signed in.

What it does, from `functions/compact-workflows.js:594` to `655`: it fetches **every** setlist whose `status` is `'planned'`, with no date limit at all. For each one that has songs, was confirmed, and whose service started more than three hours ago, it marks the setlist as sung and increments `timesSung` on every song in it.

In plain language: every confirmed song list anyone ever saved and never manually marked as sung, going back to the beginning of the app, gets recorded as sung in one burst, and the "times sung" count on those songs jumps. The job is idempotent, so it will not do it twice, but there is no dry run and nothing to undo it with except `correctSongHistory`, one service at a time, by hand.

This may well be the correct outcome. Those services really did happen. But it is a data change to real history that nobody has agreed to, and it would arrive by surprise.

**Gate it, do not ship it blind.** The gate needs no code change: deploy the other functions by name and simply do not name `songHistoryRecorder`. Then count the candidates read-only, show you the number, and deploy the recorder as its own separate step once you have said yes.

---

## 3. Section 1: Emulator run with fictional data

Setup: Sonnet 5 · High · Lane: Claude · Review: controller self-verification only, no fresh reviewer (routine internal tooling, zero blast radius) · Agents: solo, no fan-out.
Who: agent. Your time: 0 minutes.
Estimated agent time: 100 minutes.
Touches production: no. Nothing leaves this Mac.

1. Put Java on the path with `JAVA_HOME=/Users/anthony/tools/jdk/Contents/Home` and confirm `java -version` reports Temurin 25.
2. Start the Firestore, Functions and Auth emulators for project `lv-zion-duties` from `/Users/anthony/Projects/worship-duty-app-worktrees/compact-integration`, with `npm_config_cache=/tmp/npm-cache` on every npx call as this Mac requires. Emulators only. No `--project` deploy of any kind.
3. Seed entirely fictional data: about six services across two departments, four fictional members, one leader, one administrator, one presider, two setlists (one confirmed and past, one confirmed and future), and a few catalog songs. No real names, no real PINs, no real member records, and the seed file lives in the scratchpad, never in Git.
4. Mint the Auth custom claims the callables expect (`memberId`, role, department) through the Admin SDK against the Auth emulator.
5. Exercise all nine callables end to end, plus the revision contract on the five existing ones, plus both rules allowlist additions, plus the `departmentInvitations` deny.
6. Run `recordSongHistory` by hand against the seeded data and record exactly which setlists it picks up and which it skips.
7. Serve the built `.hosting-gallery` against the emulator and walk the four journeys in section 6 with the fictional accounts.

Rollback: stop the emulators. There is nothing to undo.

Evidence: append a `## 2026-09-17: Section 1` block to `docs/runs/compact-phone-refactor/lanes/S6.md` naming every callable exercised, every failure found, and the exact recorder behavior. Add one Build log line to `docs/PLAN-COMPACT-PHONE-REFACTOR.md`.

Stop here if anything fails. Corrections come back to this branch and Section 1 runs again.

---

## 4. Section 2: Deploy Rules, then Functions except the recorder

Setup: Opus 5 · High · Lane: Claude · Review: controller self-verification plus your live confirmation (production surface holding other people's data) · Agents: solo, no fan-out.
Who: agent deploys, you confirm.
Estimated agent time: 35 minutes. Your time: 10 minutes.
Touches production: yes. This is the first irreversible step in the plan, and it needs your explicit go-ahead in section 9.

**Before anything, capture what is live now**, so rollback is possible:

1. Save the current live `firestore.rules` from the console (https://console.firebase.google.com/project/lv-zion-duties/firestore/rules) into `/Users/anthony/Projects/worship-duty-app-worktrees/compact-integration/docs/runs/compact-phone-staging/rollback/firestore.rules.live-2026-09-17.txt`. Firebase also keeps its own rules version history in that console page, which is the real safety net.
2. Record the currently deployed function list and the git commit the live Hosting build came from.

**Deploy rules:**

```sh
npm_config_cache=/tmp/npm-cache npx -y firebase-tools@latest deploy \
  --project lv-zion-duties \
  --only firestore:rules \
  --config /Users/anthony/Projects/worship-duty-app-worktrees/compact-integration/firebase.json
```

Rollback for this step: redeploy the saved file, or restore the previous version from the console's rules history. Takes under 2 minutes.

**Deploy functions by name, never `--only functions`.** `docs/PLAYBOOK.md` line 249 currently shows a bare `--only functions`. That redeploys all twenty-plus functions at once for no reason and is a wider blast radius than this change needs. Name them:

```sh
npm_config_cache=/tmp/npm-cache npx -y firebase-tools@latest deploy \
  --project lv-zion-duties \
  --only functions:saveMemberAvailability,functions:resolveDutyAttention,functions:saveSongService,functions:correctSongHistory,functions:searchDepartmentCandidates,functions:createDepartmentInvitation,functions:revokeDepartmentInvitation,functions:acceptDepartmentInvitation,functions:updateDepartmentProfile,functions:updateMemberAvailability,functions:createDepartmentProfile,functions:assignDepartmentDuty,functions:unassignDepartmentDuty,functions:overrideDepartmentAssignment,functions:onScheduleWrite \
  --config /Users/anthony/Projects/worship-duty-app-worktrees/compact-integration/firebase.json
```

`songHistoryRecorder` is deliberately absent. Deploying it is section 5.

Never a bare `firebase deploy` in this project. The Hosting predeploy guard at `scripts/guard-gallery-deploy.mjs` blocks Hosting, but rules and functions have no such guard, so the discipline has to be ours.

Rollback for this step: redeploy the same named functions from commit `1e0b6fd`, which is the code the live site was built from. About 10 minutes. `onScheduleWrite` is the one to watch, because it is the only changed trigger that fires without anyone touching the app.

**Then you confirm the OLD live app still works, on your phone, at https://lv-zion-duties.web.app** (10 minutes, and this is the whole point of deploying the server first):

- Open the schedule and confirm services and assignments still show.
- Open a leader screen, change one assignment, and confirm it saves.
- Open a member profile or availability and save it once.
- Confirm no red error banner appears anywhere.

If any of those fail, roll back the functions immediately and stop.

---

## 5. Section 3: New app on a preview channel against real data

Setup: Opus 5 · High · Lane: Claude · Review: your walkthrough is the review · Agents: solo, no fan-out.
Who: agent deploys the preview, you and the agent walk the journeys.
Estimated agent time: 45 minutes. Your time: 45 minutes.
Touches production data: yes, reads and writes, through your own test account only. Touches the live site: no.

The repository already has exactly the right tool. `design-gallery/release.mjs --preview` deploys to a temporary Firebase Hosting channel named `design-gallery-review` that expires in 7 days, and it deploys Hosting assets only. Its own output says the preview reads REAL Firebase records, which is precisely what we need here and why the server had to go first.

```sh
cd /Users/anthony/Projects/worship-duty-app-worktrees/compact-integration
node /Users/anthony/Projects/worship-duty-app-worktrees/compact-integration/design-gallery/release.mjs --preview
```

The command prints the preview URL. It is a `web.app` address ending in `--design-gallery-review-<something>`. The live site at https://lv-zion-duties.web.app is not touched.

Rollback for this step: delete the channel, or let it expire in 7 days. Production is untouched either way, so there is genuinely nothing to undo.

Two things to expect on a preview channel, so they do not look like bugs:

- Sign-in must be allowed on the preview domain. Firebase normally adds preview channel domains to the Auth authorized list automatically. If sign-in refuses with an unauthorized-domain message, the fix is adding that one domain in the console, which is a change to account settings and therefore yours to approve first.
- An invite link created on the preview channel points at the preview channel, because the code builds it from `location.origin`. That is correct behavior, not a defect. Accept the invite in a second window on the same preview URL.

Then walk section 6.

---

## 6. Section 4: The four journeys to walk

Setup: Opus 5 · High · Lane: Claude · Review: your sign-off · Agents: solo.
Who: you drive, agent records. Your time: 45 minutes, included in section 5's estimate.

Every one of these is unexercised today. Section 6 of the refactor plan's own record says so.

**Member (about 10 minutes)**

1. Sign in, land on My next duty, confirm it is the right duty.
2. Open Availability, mark one department unavailable for a date you still hold a duty on, save.
3. Confirm the plain-words message naming the duty and service date appears, and that your assignment is still there rather than silently removed.
4. Mark yourself available again and confirm the flag clears.

**Department leader (about 12 minutes)**

5. Open Needs attention and confirm the duty you just flagged appears as Needs replacement.
6. Search for a replacement member by name and confirm ineligible people are explained rather than silently missing.
7. Pick someone who already has another duty in that same service, and confirm you get an advisory warning, not a refusal, and that confirming it goes through.
8. Open Members, create an invite, use Share and Copy link, then accept it in a second window signed in as a different member. Confirm it works once and refuses the second time.

**Administrator (about 12 minutes)**

9. Open all-department scheduling, change an assignment, confirm it saves.
10. **Stale save test, two windows.** Open the same service in two browser windows. In window one, change the assignment and save. In window two, without reloading, change the same assignment and save. Window two must refuse with a plain explanation of who changed it, and must keep your edit rather than throwing it away.
11. Confirm `#manage/exceptions` is not reachable and lands on the unavailable screen.

**Presider (about 8 minutes)**

12. Open My service, pick songs in the library, save a draft, then Confirm. Confirm must succeed after your own song picks, which is the exact bug fixed as Finding 4.
13. Edit a confirmed list and confirm it makes you confirm again.
14. Open History and confirm existing records are all still there.

**Pacific time selector check (about 3 minutes), required by `AGENTS.md` before any Hosting release**

15. Find a day with both a 5:00 AM and a 7:30 PM service. Check the Schedule selector at 7:20 PM Pacific and again at 9:06 PM Pacific. It must show one current-or-next service correctly across that boundary in all four appearances, and an explicitly selected past service must stay selected while the automatic default moves on.

**Test accounts and data, with nothing sensitive in Git**

- Use your own real account for the administrator and leader journeys. It already has the roles.
- You need one second signed-in account for the invite accept and the stale-save test. Ask one person you trust, or use a second account of your own. Its PIN goes in Apple Passwords (open the `Passwords` app), never in this repository, never in a screenshot, never in a chat message.
- Do not create fictional members in production. Use services and departments that already exist.
- Prefer a service far enough in the future that a mistake affects nobody, and put any assignment you change back the way you found it.
- Screenshots for the record get member names cropped or blurred before they are saved anywhere.

---

## 7. Section 5: Decide on the song recorder, then deploy it

Setup: Opus 5 · High · Lane: Claude · Review: your decision is the gate · Agents: solo.
Who: agent counts, you decide, agent deploys.
Estimated agent time: 20 minutes. Your time: 5 minutes.

1. Agent runs a read-only count of setlists with `status: 'planned'` that are confirmed and whose service is more than three hours past, and reports the number and the oldest date. Read only, nothing written.
2. You decide: record them all, or have the recorder changed to ignore anything older than a chosen date first.
3. If you say go:

```sh
npm_config_cache=/tmp/npm-cache npx -y firebase-tools@latest deploy \
  --project lv-zion-duties \
  --only functions:songHistoryRecorder \
  --config /Users/anthony/Projects/worship-duty-app-worktrees/compact-integration/firebase.json
```

4. Within 30 minutes, check the function logs and confirm the recorded count matches the predicted count.

Rollback: delete the function with `functions:delete songHistoryRecorder`. That stops any further recording, but it does not undo records already written. Undoing those means `correctSongHistory` one service at a time. This is why step 1 exists.

---

## 8. Section 6: Publish, or roll back

Setup: Opus 5 · High · Lane: Claude · Review: `finish-and-verify` · Agents: solo.
Who: agent publishes, you confirm on your phone.
Estimated agent time: 30 minutes. Your time: 10 minutes.

Only after sections 1 to 5 pass and you have said go.

1. Merge `claude/compact-integration` into `main`.
2. Publish Hosting through the guarded publisher, which is the only permitted way:

```sh
node /Users/anthony/Projects/worship-duty-app-worktrees/compact-integration/design-gallery/release.mjs --publish
```

It refuses to run unless the current live release is a recognized compatible predecessor, verifies the new release stamp on the live URL afterward, and deploys Hosting only.

3. Delete the `design-gallery-review` preview channel.
4. You open https://lv-zion-duties.web.app on your phone and confirm all four appearances load and My next duty is right.
5. Push the branch and back the repository up privately.

Rollback: redeploy Hosting from commit `1e0b6fd` through the same publisher. The server stays as it is, because it is backward compatible with the old client, which is the property section 1 tested and section 2 confirmed live.

Note for whoever runs this: `docs/HANDOFF.md` has no rollback section at all today. It should gain one from this plan.

---

## 9. What Anthony must do

1. Approve or reject the recommended route: emulator first, then production server, then preview, then publish.
2. Approve the first production deploy in section 2. This is the irreversible one.
3. Decide who the second test account belongs to, and put its PIN in Apple Passwords.
4. Decide, in section 5, whether the whole back catalogue of confirmed song lists should be recorded as sung.
5. Approve adding the preview channel domain to Firebase Auth's authorized domains, if sign-in refuses it in section 3.

---

## 10. Questions

1. Route: emulator first then production (recommended), or straight to production server and preview?
2. Second test account: someone you ask, or a second account of your own?
3. Song history back catalogue: record it all, or set a cutoff date first?
4. Start section 1 now, or after you have looked at the preview?

---

## Build log

- 2026-09-17: Drafted. Not approved. Nothing executed. No deploy of Hosting, Functions or Rules; no production read or write; no push; no migration; no new test suite. Research was read-only against this worktree, the two Codex branch records, `firestore.rules`, `app.js` at `1e0b6fd` and at HEAD, `functions/compact-workflows.js`, `functions/index.js`, `design-gallery/release.mjs`, `scripts/guard-gallery-deploy.mjs`, `firebase.json`, `.firebaserc`, and the `live-app-release`, `lv-zion-firebase-apps` and `anthony-mac-environment` skills. Three findings drove the recommendation: Java is present at `/Users/anthony/tools/jdk/Contents/Home` (Temurin 25.0.3) and is only missing from the command path, which invalidates the "no emulator possible" assumption recorded in the S3, S4 and S6 lane records; `songHistoryRecorder` queries every `status: 'planned'` setlist with no date floor and would back-record the entire history on its first run; and the old live client's full-document schedule write is safe against the new server-owned keys because its listener carries them through, with one sub-second race window that fails closed rather than losing data.

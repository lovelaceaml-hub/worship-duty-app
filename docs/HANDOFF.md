# Handoff: LV Zion Worship Duty

Updated 2026-11-11 (the review's suggestions built and released).

## Released 2026-11-11: the review's suggestions

Anthony: "do all 15", build and release without stopping, no forced PIN
change. What went live, in order (each merged after its checks; functions
from the Mac with `scripts/deploy-functions.mjs`, the app with GitHub
"Firebase release"):

- [PR #54](https://github.com/lovelaceaml-hub/worship-duty-app/pull/54)
  (1, 8): a PIN change signs the member out on their other devices; a device
  the member has signed in on before is not locked out by wrong PINs typed
  elsewhere.
- [PR #55](https://github.com/lovelaceaml-hub/worship-duty-app/pull/55)
  (5, 6, 7, 10, 11, 12, 13, 14): import alerts after a partly failed
  import, the timed import holds more than 10 clears for Import now, leader
  settings saved in one transaction, request listeners, song list saves,
  the update screen, override name spelling. App release run 43078403713.
- [PR #56](https://github.com/lovelaceaml-hub/worship-duty-app/pull/56)
  (4): `setlists` and `songStats` are for signed-in members only. The
  Signal song ingest uses the new `songIngest` function with a token
  (Secret Manager `SONG_INGEST_TOKEN`; Mac Keychain item
  `worship-duty-song-ingest`); its side is
  [song-ingest PR #6](https://github.com/lovelaceaml-hub/song-ingest/pull/6),
  merged, and the Mac's live folder is on it. Rules deployed last with the
  pinned command. Read back: an open read of `songStats` is refused (403),
  the schedule is still public, the endpoint answers with the token and
  refuses without. App release run 43082713939.
- [PR #57](https://github.com/lovelaceaml-hub/worship-duty-app/pull/57)
  (15, server): firebase-admin 14, firebase-functions 7,
  google-auth-library 11 (`npm audit`: 0), and a new year's Sheet tab made
  in one request. After the deploy: public schedule, calendar feed, the
  ingest endpoint and a sign-in call with an unknown name all answered as
  they should; no errors in the functions log in the first minutes.

- [PR #58](https://github.com/lovelaceaml-hub/worship-duty-app/pull/58)
  (15, browser): Firebase browser SDK 10.12.2 to 12.19.0. Anthony signed in
  on the preview and said to release. App release run 43085656411; live is
  r1794424687832, commit 6110592, and the page, the app and the service
  worker all name 12.19.0.

- [PR #59](https://github.com/lovelaceaml-hub/worship-duty-app/pull/59)
  (15, splits): `fill()` in three steps, `app/services/rosters.js`,
  `functions/profile-patch.js` and `permissions-data.js` (the page loads it
  before `permissions.js`; `functions/` has identical copies). No change in
  behavior. Anthony approved one full run ("Yes, run it", 2026-11-11):
  Tests run 43086873714 on the branch passed the module check, unit and
  rules, the rules emulator, Cloud Functions and browser suites. Functions
  deployed, app release run 43088143272; live is r1794425628249, commit
  4d90f59.

Not done, with the reason:

- 2 (everyone chooses a PIN): Anthony said no.
- 3 (site passcode hash): the schedule is public on purpose, so hiding the
  hash protects nothing. Also, the site passcode is switched off on live
  (`features.siteLock` false, no hash saved, read 2026-11-11).
- 9 (two song list listeners): they cover different ranges; merging them
  would make every member load all song history.

Still to check:

- A signed-in look at My Duties and Songs on live (the song rules are
  proven on the emulator, `tests/rules-emulator/members.test.mjs`, 37
  passed, not with a real sign-in).
- The next Signal song post: `ingest.log` on the Mac should say
  `song data: endpoint (us-central1-lv-zion-duties.cloudfunctions.net)`.
- Functions log over the next day (reminders hourly, Sheet check every 10
  minutes) on the new libraries.
- When the Signal hub VM is set up, give it the token:
  `sudo put-secret.sh worship_song_token` (same value as the Mac's).
- One full suite ran, for PR #59 only (see above). Everything before it had
  focused test files only.

For agents on this Mac: the browser tests need Playwright's Chromium 1243,
which is not downloaded; `WDS_CHROMIUM=<path to chrome-headless-shell>`
points them at the 1248 copy in `~/Library/Caches/ms-playwright`. The rules
emulator runs with `JAVA_HOME=~/tools/jdk/Contents/Home`. A browser test
file hangs if `--test-name-pattern` matches none of its tests.
`functions/.env.lv-zion-duties` (the other app's settings, 2026-09-03,
ignored by git) makes one backend-guard unit test fail locally.

## Released 2026-11-10: review cleanup

- [PR #53](https://github.com/lovelaceaml-hub/worship-duty-app/pull/53):
  four small fixes, a `qs` patch, a Firebase SDK version test and README
  corrections. Functions, then the app (run 42979627657).
- Review: [reviews/2026-11-10-review.md](reviews/2026-11-10-review.md).

Previously updated 2026-11-06 (leader added, release verified).

## Released 2026-11-06: Children's Teachers

- [PR #50](https://github.com/lovelaceaml-hub/worship-duty-app/pull/50):
  new department with Small Sanctuary #1, #2 and Main Sanctuary #1, #2. A
  member only in Children's Teachers sees only that department (README,
  "Children's Teachers"). This release also carried PR #47 (calendar
  grouping), merged earlier but not released until now.
- Released with Anthony's go-ahead: the 36 functions (Mac,
  `scripts/deploy-functions.mjs`), then the rules (Mac, pinned command),
  then the app (GitHub "Firebase release", run 42317978431).
- Tests: Anthony approved one full run for PR #50 (run 42316560828): unit,
  rules emulator and Cloud Functions tests passed; browser flows 110 of 111.
  The one failure was the test's own wording (the empty-lists message now
  also names Children's Teachers); fixed and that test passed locally. The
  full suite was not rerun.
- Sheet: both "2026 Entry" and "2027 Entry" have the four columns (AG to AJ)
  under a merged "CHILDREN'S TEACHERS" heading. The "Header" and "Dates"
  locks on 2026 Entry let only alovelace144 through: heading or column
  changes there go through alovelace144 in Chrome. The Sheet's script lists
  Children's Teachers in GROUPS.
- Leader: D. Kenya (Anthony, 2026-11-06). Added on 2026-11-06 with
  Anthony's approval by running the server's own updateRoleConfiguration
  as B. Anthony (no PIN sign-in), the same step as Manage, Leaders, Add.
  Read back: app/leaderConfig has Children's Teachers: D. Kenya and nothing
  else changed; her account is a departmentLeader for Children's Teachers
  and must choose a new PIN at her next sign-in; the audit record exists.
- Verified live on 2026-11-06: the site serves release r1794011505918
  (commit b31a425), all 36 functions were updated at 00:23 UTC on
  2026-11-07, and the live Firestore rules equal `firestore.rules`.
- Backend release workflow: [PR #51](https://github.com/lovelaceaml-hub/worship-duty-app/pull/51)
  fixed its guard self-test call. It still fails at deploy: the account
  `gh-backend-deploy` gets 403 reading the Firestore database. Granting it
  read access to the database (for example Cloud Datastore Viewer) needs
  Anthony's approval; until then deploy functions and rules from the Mac.

Previously updated 2026-11-04.

## Since the last release

- [PR #47](https://github.com/lovelaceaml-hub/worship-duty-app/pull/47)
  (the calendar groups services by date once per screen, item 8 of the
  [performance review](PERFORMANCE-REVIEW.md)) was merged on 2026-10-23 but
  not released: the last "Firebase release" run is still the 2026-10-11 one
  (commit `41e1cdc`). It goes live with the next release.
- A whole-repository review on 2026-11-03 is in
  [reviews/2026-11-03-review.md](reviews/2026-11-03-review.md).
- Two draft pull requests from mid-October are still open: #45 (Hosting
  previews only when asked) and #46 (full test suite only with approval).

## Hosting release check (2026-11-04)

- `firebase-tools` 15.34.1 (2026-10-21) added a check that the Hosting API is on.
  A Study Rooms release stopped on 2026-11-04 because its deploy account could
  not run that check. Worship Duty uses `firebase-tools@15` too, so it was checked.
- No change was needed here, and Anthony chose to leave the account as it is.
  `gh-hosting-deploy@lv-zion-duties` holds Firebase Hosting Admin, Cloud Run
  Viewer and Cloud Functions Viewer. Cloud Functions Viewer includes
  `serviceusage.services.get`, so do not remove it without adding
  `roles/serviceusage.serviceUsageConsumer` instead.
- Evidence: three previews with that account passed on 2026-11-04, for example
  [run 41775211340](https://github.com/lovelaceaml-hub/worship-duty-app/actions/runs/41775211340).
  By publish dates they used 15.34.2; the logs do not print the version.
- Not yet proven: a live release. The last was 2026-10-11, before the check
  existed. It runs the same check, so it should pass; the next real release is
  the proof.
- Keyless settings went on 2026-11-04 with Anthony's approval and were read back
  from GitHub: `GCP_BACKEND_WIF_PROVIDER`, `GCP_BACKEND_DEPLOY_SA`,
  `GCP_DRIFT_WIF_PROVIDER` and `GCP_DRIFT_SA`. "Firebase backend release" can now
  sign in, but has not been run with them and still starts only by hand. The
  read-only Functions drift check should first really check on Monday 2026-11-09.

## Released performance improvement

- [PR #43](https://github.com/lovelaceaml-hub/worship-duty-app/pull/43),
  merged and released on 2026-10-11 with Anthony's approval, defers Firebase Messaging
  until push registration or saved-token cleanup needs it. Ordinary startup
  no longer waits for the optional push SDK. Enabled push on reopen, local
  alerts, unsupported browsers, retry and sign-out cleanup are covered.
- [Performance review](PERFORMANCE-REVIEW.md) records ten opportunities,
  the selection rationale and the controlled startup comparison.
- Module checks, 106 unit/source-rules tests, all 110 browser tests and the
  release build passed. One existing server property test skipped because
  Functions dependencies were not installed.
- Production release: `r1791754381268`, commit `41e1cdc`, maintenance off.
  The [Hosting-only release workflow](https://github.com/lovelaceaml-hub/worship-duty-app/actions/runs/38176442125)
  passed its pre-release checks, deployment and live calendar check.
- Read-only verification confirmed the live site and documented calendar
  feed return HTTP 200, release metadata identifies the deployed commit,
  and the live app serves the deferred-Messaging code. No real member
  sign-in or production record changes were used for verification.
- No Functions or Firestore rules were changed or deployed.

## Where things stand

- Merged on 2026-10-06, released by Anthony's go-ahead the same day
  (functions, then the app):
  [PR #41](https://github.com/lovelaceaml-hub/worship-duty-app/pull/41): the
  Sheet is checked every 10 minutes and imported only when this month or
  later changed; earlier months are no longer touched by an import. Manage
  shows Import now at the top, with the time the app last imported.
  [PR #42](https://github.com/lovelaceaml-hub/worship-duty-app/pull/42):
  Fill's Usual mode (the default) learns each department's last 2 months of
  habits, shared in proportion; Manual only per member in each department
  (for M. Chad); two duties can be marked always OK together for anyone.
- Live at https://lv-zion-duties.web.app. On 2026-10-02
  [PR #35](https://github.com/lovelaceaml-hub/worship-duty-app/pull/35)
  (leaders: Import now and Check the Sheet) and
  [PR #36](https://github.com/lovelaceaml-hub/worship-duty-app/pull/36)
  (Prism is the only look) were merged, the functions deployed, then the app
  released.
- [PR #37](https://github.com/lovelaceaml-hub/worship-duty-app/pull/37) adds
  View as (account menu, administrators only): the app as a chosen member or
  leader sees it, with changes off. Use it to check member and leader views
  on the live site; agents never sign in with someone's PIN.
- [PR #33](https://github.com/lovelaceaml-hub/worship-duty-app/pull/33): the
  round feedback button is back on phones, smaller and above the tabs; the
  account menu keeps it too.
- [PR #30](https://github.com/lovelaceaml-hub/worship-duty-app/pull/30)
  (Fill and duty rules, whole-app review fixes) is merged. Functions, Firestore
  rules and the app were all deployed on 2026-10-02, in that order.
- [PR #31](https://github.com/lovelaceaml-hub/worship-duty-app/pull/31) is
  merged and its functions deployed: the server reads and writes the Sheet as
  `lv-zion-worship@lv-zion-duties.iam.gserviceaccount.com`, the agents' own
  service account, which the Sheet is shared with as an Editor. The functions'
  default account holds Service Account Token Creator on it.
- Sheet writing is on (see README, "The Google Sheet"). Check the Sheet on
  2026-10-02: 192 services in "2026 Entry", no duty differences, 4 services in
  the Sheet that the app deleted, no warnings.
- October 2026 choir songs are entered for all 19 Sabbath Day and Third Day
  services, in the app and the Sheet.

## Still to do

- Watch the functions logs for a few hours after a deploy: reminders hourly,
  the Sheet check every 10 minutes, song counting every 30 minutes. The errors
  from `worshipVercelReconcile` ("time must not be empty") belong to another
  app in the same project and predate this release.
- After-deploy checks in the app: a leader marks a double duty OK in Manage,
  Requests; a presider sets a choir song.
- One read-only look for "phantom" 2027 services the old Raw Data import may
  have made (on a day with no regular service, with `sheetSyncedAt`). Anthony
  deletes any himself in the app.
- Check that the November 1 job added December 2026 to December 2027
  (Manage, Data), then add the 2027 feast services by hand. Not checked
  from the repository on 2026-11-04.
- When a 2027 Entry tab is added, update the Sheet's own script so Raw Data
  reads every year's Entry tab (README, "The Google Sheet", step 5).

## Later

- Availability by weekday.
- Release safety: GitHub Environments cannot lock a key to `main` on GitHub
  Free private repositories (no environment secrets, no deployment branch
  rules). Instead, Functions and rules now release keylessly from "Firebase
  backend release" (Google only issues the token to that workflow on `main`),
  and `scripts/deploy-functions.mjs` pins firebase-tools@15. Later: move the
  Hosting key to the same keyless sign-in, and run the tests in the Mac
  release script.
- The older issues in PR #30's "Not blocking" comment.

## How to undo

- App: Firebase console, Hosting, Release history, Rollback.
- Rules: Firebase console, Firestore, Rules, history.
- Sheet: File, Version history in Google Sheets. To stop the app writing,
  turn off Write changes to the Sheet in Manage, Features.

# Handoff: LV Zion Worship Duty

Updated 2026-11-06.

## In progress: Children's Teachers (branch `children-teachers`)

- New department with Small Sanctuary #1, #2 and Main Sanctuary #1, #2,
  in the app, the server, the database rules and the Sheet reader. A member
  only in Children's Teachers sees only that department (README,
  "Children's Teachers").
- Checked: module check, focused unit, rules-source and server Sheet tests,
  and a new browser test for the limited view. The rules emulator tests
  were not run (no Java on the Mac); no full suite was run.
- Sheet: both "2026 Entry" and "2027 Entry" have the four columns under a
  merged "CHILDREN'S TEACHERS" heading (2026-11-06). The app's reader finds
  them (columns AG to AJ). The "Header" and "Dates" locks on 2026 Entry let
  only alovelace144 through, not lovelace.aml or the app's account: header
  or column changes there go through alovelace144 in Chrome.
- The Sheet's script ("Worship Schedule Builder", Extensions, Apps Script)
  lists Children's Teachers in GROUPS, so Raw Data includes it once the
  columns exist.
- Release needs all three, in order: functions (the Sheet reader and
  permissions), the rules, then the app.
- Leader: D. Kenya (Anthony, 2026-11-06). Built into permissions.js, but a
  saved app/leaderConfig overrides the built-in list, so after release an
  administrator adds D. Kenya to Children's Teachers in Manage, Leaders.

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

# Handoff: LV Zion Worship Duty

Updated 2026-10-02 (evening).

## Where things stand

- Branch `claude/fill-patterns-oy9u7c` (open pull request, not yet merged):
  Fill's new Usual mode learns each department's habits (who does which
  duty, which services, how often) and is the default; Manual only per
  member in each department (for M. Chad); two duties can be marked always
  OK together for anyone (for example Offering #6 and Prayer of Thanks).
  Needs the functions deployed (new: setOkPair, setManualOnly; changed:
  the assignment saves and request answers), then the app released.
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
  the Sheet import every 2 hours, song counting every 30 minutes. The errors
  from `worshipVercelReconcile` ("time must not be empty") belong to another
  app in the same project and predate this release.
- After-deploy checks in the app: a leader marks a double duty OK in Manage,
  Requests; a presider sets a choir song.
- One read-only look for "phantom" 2027 services the old Raw Data import may
  have made (on a day with no regular service, with `sheetSyncedAt`). Anthony
  deletes any himself in the app.
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

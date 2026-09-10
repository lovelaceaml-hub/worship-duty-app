# Live design choice: Current + Prism

This is a production-integration candidate, not the offline demo. The build stages the original live app and its existing Firebase configuration together with both renderers. It never runs `prototype/build.mjs` or `prototype-prism/build.mjs`. No fake clock, sample member selection, disabled locks, demo storage namespace, or blocked synchronization is used in the release.

## Member experience

Current design remains the default. Once the **shared access settings have arrived** and the member has passed the existing site-passcode gate, a one-time modal asks:

> Would you like to try our new design?
> The same schedules, duties and song plans—with a new look. You can switch back at any time using the Design button.

Buttons: **Keep current design** / **Try the new design**. Escape or Close keeps the current choice. A persistent **Design** button appears in both layouts. Preference is saved on this browser/device under `wds-design-choice-v1`. It is deliberately not presented as an account-wide preference: the current app has a site passcode + member-name picker and background anonymous Firebase authentication, not individual email/password accounts.

Switching happens **in place**, on the same URL, with the same JS state, Firebase instance, subscriptions, member selection, permissions, calendar/push tokens, original Firestore paths and song module. It does not recreate the database, copy prototype data, reset permissions or clear storage. Unsubmitted text/selection fields are captured and restored without firing mutation events. Saved changes are real shared changes in either design; switching back is not undo.

If the new stylesheet fails to load, the current design remains usable. `?design=classic` is a per-tab rescue URL. A build made with `--disable-prism` disables opt-in and ignores any saved new-design preference without deleting it.

## Build and validate

From this branch:

```sh
node live-design/release.mjs
npm ci
npx playwright install chromium
node live-design/test.mjs
```

The build is in **`.hosting-live/`**. Source `app.js`, `song-app.js`, `index.html`, Firebase config/rules/functions, the original release script, and both offline prototypes remain unchanged. Release stamps are generated together for the shell, lazy assets and original service worker.

The integration tests serve the compiled modules over HTTP with a **mocked Firebase SDK**; they exercise the real handlers while blocking all external destinations. No production database/accounts are touched. This is not a full production-auth, push-delivery, security-rules or cross-browser certification. Check the workflow's actual `test-report.json`.

## Deploy after review

Run from the same authorized Firebase CLI environment used for the existing app:

```sh
node live-design/release.mjs --publish
```

This publishes **hosting only** to the existing `lv-zion-duties` site. It does not merge GitHub branches or deploy Firestore rules/functions. The staging folder has an explicit public-file allowlist, so prototype HTML, sources, tests and build scripts are not accidentally uploaded. The existing `/ics/**` function rewrite is retained.

**Do not run the old `scripts/deploy.sh` for this integration:** it deploys the untouched original source shell, not `.hosting-live/`. No workflow in this change deploys automatically. If Firebase CLI access has not already been authorized, authorize it in the normal CLI browser flow; do not paste tokens or service-account files into chat or commit them.

Rollout rollback (retains current app and the same live data):

```sh
node live-design/release.mjs --disable-prism --publish
```

A browser already open will see a Hosting rollback on refresh, not instantly via a new database flag. Standard Firebase Hosting version rollback is also available. A Hosting preview channel uses the configured backend too; it is not an isolated database. Use the mocked test suite or a dedicated test project before editing test records.

## Implementation boundaries

`build.mjs` uses checked source anchors to reuse the reviewed Prism presentation while preserving the original data handlers. Unexpected upstream markup/anchor drift fails the build. UI preference code is separately fail-safe: if it does not load, original initialization still runs. The live build retains original browser-native destructive confirmations instead of asynchronously changing the original mutation/authorization flow.

Before publishing: review the invitation on iPhone/Android, verify the actual live passcode and editor gates, confirm a permitted test assignment and setlist in a safe test project, and retain the previous Hosting release for rollback. This branch adds a live-capable integration; committing/testing it alone does not deploy it.

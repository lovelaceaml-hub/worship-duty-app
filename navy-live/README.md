# Navy & Cream — optional live-app appearance

The approved navy header, warm cream canvas, burgundy selections, restrained gold details and floating four-tab navigation, applied across the actual app. **Original remains the default.** This is an optional presentation of the same Firebase records, not the earlier isolated sample-data prototype.

## Member experience

After the existing site passcode is unlocked and settings have loaded, a first-time dialog offers Original or Navy & Cream. Closing it or pressing Escape counts as declining; the offer does not repeat every visit. **Appearance** remains in the header in both designs. Switching is immediate and reversible, requires no second login and does not create a separate schedule. Preferences are saved only in this browser/device under `wds-appearance-navy-v1`, not to a member's account. Storage failures fall back to session-only preferences.

The new design supports warm light and deep navy modes, subtle motion and a reduced-motion option. The device's reduced-motion setting always takes priority.

## All-page coverage

- Schedule: month/date/time browsing, selected-day and full-schedule views, original department filters and assignment rows, choir songs, past-services control and next-service shortcut.
- My Duties: next-duty summary plus original member selection, reminders, calendar subscription, change-request forms and team expanders.
- Presider: the real Home, Library, Services and Insights song planner, including song details, setlist builder, runsheet and nested controls. Original role-conditional visibility and song logic remain intact.
- Manage: Services, Planning, Requests, People, Features and Data & Sync, including assignment editors, rosters, workload tables, conflict review and passcode screens.
- Responsive phone/tablet/desktop layouts, restrained hero drift, navigation transitions, press feedback, modal entrance and reduced-motion support.

No prototype-only draft/published schema, publishing controls, invented service workflow or sample assignments are added to production. Management summaries count actual upcoming services, filled assignments and unique people. The native one-prayer-plus-one-usher exception is unchanged.

## Implementation boundaries

`build.mjs` creates disposable `navy-live/dist/` assets from a fixed allowlist and validates the reviewed upstream source hashes. It retains original Firebase configuration, app code and song code, inserting a read-only presentation bridge before `init()`. Original action handlers, persistence, authorization, notification behavior, calendar routes, feature settings and data schemas are unchanged.

The theme adds/removes presentation elements and reversible visibility attributes; it does not replace original form nodes. Switching designs preserves typed values and does not remount or navigate the nested song planner.

Root `index.html`, `app.js`, `song-app.js`, service-worker source, Firestore rules and functions remain unchanged in this branch. Generated hosting assets contain the integration and fresh cache stamps. The hosting-only release config preserves the existing `/ics/**` rewrite. Tests and fixtures are excluded from production assets.

## Build and inspect

Run from the repository folder:

```sh
git fetch origin
git switch prototype/navy-cream
node navy-live/build.mjs
python3 -m http.server 8091 --directory navy-live/dist
```

Open `http://localhost:8091`. This build uses the **real configured Firebase project**. Do not casually test editing against production; the automated suite uses isolated fixtures and blocks every external request instead.

## Deploy both appearances at the current site

Use a terminal authenticated to the existing Firebase project. No second project or hosting site is required.

```sh
# Only when this computer is not already authenticated:
npx firebase-tools login

# Optional temporary review URL, still connected to real Firebase records:
node navy-live/release.mjs --preview

# Publish both choices at the current member-facing URL:
node navy-live/release.mjs --publish
```

The cross-platform release script resolves paths from its own location, rebuilds with fresh cache stamps, checks the current live source for conflicting releases, deploys **Hosting only**, and verifies the published release manifest. It refuses to overwrite an unrelated release (including the separate Prism branch) until changes are reconciled. It never deploys functions/security rules, migrates data, changes accounts or merges branches.

Without an argument the release script only builds. A preview channel alone does not show the offer to members at the production URL; `--publish` is required. If authentication, deployment or verification fails, the script reports failure rather than claiming success. CI is review-only and does not deploy.

## Regression suite

```sh
node navy-live/build.mjs
python3 -m pip install playwright==1.57.0
python3 -m playwright install chromium
python3 navy-live/test.py
```

Covers original default, login gating, remembered decline/Escape, reversible appearance, unsent form preservation, every main tab and Manage/Presider subsection, native conflict rules, editor locking, Presider eligibility, dark mode, reduced motion and 320/390/768/1440px layouts. All external traffic is intercepted; no production account is used.

For restricted local environments:

```sh
STANDALONE=1 CHROMIUM_PATH=/path/to/chromium python3 navy-live/test.py
```

Standalone mode uses in-memory test storage, real SHA-256 via a local test binding and a preloaded original song module. It is not an HTTP persistence or service-worker test. Neither mode is a live Firebase authentication, push-delivery or concurrency audit.

Latest local run: **50 standalone browser assertions passed**, zero uncaught JavaScript errors. The GitHub Actions HTTP suite uploads its actual `results.json` and screenshots; consult that result for server-based checks. No deployment is performed by the tests.

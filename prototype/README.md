# Aurora, working design prototype

> Note added 2026-09-20. The standalone Aurora prototype described here is historical. Its source files in this folder are still live inputs: `design-gallery/build.mjs` compiles `aurora.js`, `workspaces.js`, `presider-workspace.js`, `shell.html`, and the CSS into the Aurora appearance of the live app, so edits here reach production. The prototype's own header, dark mode button, and pause button no longer exist in the live app. See [design-gallery/README.md](../design-gallery/README.md).

An isolated, runnable redesign of **this repository's app**, not an image and not a fictional replacement. Desktop uses a navigation rail, focused day/time selection, grouped duty teams, and a personal upcoming-duties panel. Mobile uses bottom navigation and stacked layouts. Light/dark surfaces, subtle orbital motion, reduced-motion support, search, keyboard focus and local editing are included.

## Open it

From the repository root, on Node 22:

```sh
node prototype/build.mjs
```

Open **`prototype/dist/index.html`** in a browser. It is one self-contained offline HTML file: no dev server, Firebase sign-in, internet, external fonts or build dependencies. For local HTTP use `python3 -m http.server 8080 --directory prototype/dist`. The GitHub Actions `aurora-prototype-review` artifact also contains the generated HTML, screenshots and test report.

To run automated checks using the existing repository dev dependencies:

```sh
npm ci
npx playwright install chromium
node prototype/tests/preview.mjs
```

## What is real

The build consumes **the original** `app.js`, `index.html` stylesheet, `song-app.js`, `song-app.css`, `song-lib.js`, `seed-data.js` and `song-seed.js`. It never modifies those files. `aurora.js` replaces the schedule presentation and decorates existing screens; original action handlers and domain functions still power edits and song planning.

| Area | Included in this working prototype |
| --- | --- |
| Schedule | Original service names, dates/times, all eight duty categories, assigned names, choir songs, personal highlights, department filtering and past services; new day/month selector and search. |
| My Duties | Name picker, assignments, full-team expansion, change requests and actual Presider deep links. Calendar exports an explicitly labeled reference-data snapshot. |
| Presider | **The real song workspace**: Home / Library / Insights. Home includes My Services and All Services views. Original 509-song catalog, searching/categories/sorting, Glory/Thanks slots, setlist order, duration totals, confirmation, history controls and service planning. No invented service-cue workflow. |
| Manage | Original Services / Planning / Requests / People / Features / Data & Sync screens, assignment dropdowns, workload/substitute logic, requests, member/department editing, local backups and restore. |
| Rules | Original Presider visibility gate and song-picker feature flag; original double-duty conflicts, including the intentional single **prayer + usher** exception. Approving a change request does not silently reassign a duty. |

## Reference data, not the live schedule

The repository seed contains **74 services and 45 members**, dated May to July 2026. This preview deliberately fixes its internal reference clock to **July 1, 2026** so upcoming-duty behavior can be exercised without fabricating new dates or assignments. The original member-name variants remain intact; original song canonicalization still applies. No live Firestore schedule or song history is downloaded. Do not treat the preview as today's assignments or live usage statistics.

The seed selects `B. Anthony L` so a real seeded Presider assignment is immediately available. Change the name in My Duties to test other people and the role gate.

## Isolation and limits

- **No changes to production app files, Firebase config, Firestore rules, functions, service worker, release script, or main branch. No deploy step.**
- The generated bundle uses a preview-only storage facade with prefix `lv-aurora-preview-v1:`. Reset clears only that prefix. If browser storage is blocked, a visible notice explains that edits last only for the current tab.
- The bundle does not load Firebase config or register a service worker. Content Security Policy blocks connections, workers, frames, forms and external scripts/styles.
- Google Sheet/catalog network refresh, push delivery and live calendar subscriptions are intentionally disabled. An offline calendar snapshot is not a subscription. The UI states this. Backup/export/clipboard features operate locally; copying for Signal does not send a message.
- Site/editor locks start off **only in the isolated seed settings** for review. Production gates are unchanged. Lock controls remain available for local testing. Reset preview recovers a locked demo.
- The original song module receives the original schedule through a preview context bridge because its production bridge normally comes from Firebase. Real mount, song ids, setlist ids, helpers and event handling are retained.
- Build replacements use exact, uniqueness-checked source anchors and fail rather than silently adapt incompatible future source changes.
- This is a **design-review bundle**, not the production migration. Online sync/auth/push/subscriptions, real-time collaborator edits and production migration require separately reviewed integration after design approval.

## Files

- `shell.html`: responsive workspace shell and offline CSP.
- `aurora.css`: visual system, desktop/mobile layouts, light/dark, motion and print.
- `aurora.js`: preview-only schedule view and presentation adapter.
- `build.mjs`: assembles the real runtime into a self-contained HTML without editing sources.
- `tests/preview.mjs`: functional browser checks, viewport overflow checks, storage isolation, screenshots and test report. Not a claim of complete accessibility or cross-browser certification.

Generated `dist/` stays untracked. The Actions review bundle is private to repository collaborators and retained seven days. Keep generated HTML private too: it embeds the repository's reference member names and song catalog.

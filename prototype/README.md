# Aurora 02 — working design prototype

An isolated, runnable redesign of **this repository's app**, not an image or a replacement business-logic implementation. The Schedule design is retained; **My Duties, Presider and all Manage sections now have dedicated Aurora layouts**. Desktop uses a navigation rail and spacious workspaces. Mobile uses bottom navigation, readable stacked cards and touch controls. Light/dark appearances, gentle motion, motion pause, reduced-motion support and keyboard focus remain available.

## Open it

From the repository root, on Node 22:

```sh
git switch prototype/aurora-workspace
node prototype/build.mjs
```

Open **`prototype/dist/index.html`** in a browser. It is one self-contained offline HTML file: no dev server, Firebase sign-in, internet, external fonts or build dependencies. For local HTTP use `python3 -m http.server 8080 --directory prototype/dist`. The private GitHub Actions `aurora-prototype-review` artifact also contains the generated HTML, source, screenshots and test report.

To run the checks using the existing repository dev dependencies:

```sh
npm ci
npx playwright install chromium
node prototype/tests/preview.mjs
```

## Aurora 02: the other tabs

### My Duties

A next-assignment hero and real upcoming-duty, service-day and pending-request counts lead into an assignment timeline. The identity selector, Presider planning shortcut, notification/calendar controls and updates are organized in an adjacent panel on desktop. The name selector comes before the timeline on smaller screens. The original full-team expansion, request form, alerts, member selection and song deep links remain operational. Notification and calendar limitations are clearly distinguished from Presider planning instructions.

### Presider

This is still the **actual song planner**, not the fictional service-cue workflow in earlier image concepts.

- **Home:** next Presider service, original upcoming service cards, local plan counts, and catalog/history shortcuts.
- **Library:** searchable catalog alongside a sticky, independently scrollable setlist builder on desktop. Mobile stacks the panels with jump links. Glory/Thanks slots, song ordering, duration totals, notes, confirmation, categories, sorting and pagination all use the original code.
- **Services:** service-plan cards with the original edit, confirm, mark-as-sung, copy and history controls.
- **Insights:** reorganized less-used song lists, category coverage and original history/editor controls. A visible note distinguishes local reference history from live congregation statistics.

Expandable song titles and quick-add controls are separate native buttons, so keyboard activation expands a song without inadvertently adding it. Service-card expansion is also a native button.

### Manage

All six sections share the Aurora coordinator layout and the original action handlers:

- **Services:** labeled creation form, grouped service teams, and an expanded assignment editor with all **8 departments and 27 duty slots**.
- **Planning:** clearer conflict and vacancy panels plus the original scrollable workload table and substitute suggestions.
- **Requests:** original request approval/dismissal workflow with clearer explanation that approval does not automatically reassign a duty.
- **People:** editable member cards, all department checkboxes, and a new local name search with a recoverable empty state.
- **Features:** all **13 original feature switches**, grouped by purpose, with keyboard-operable controls. Passcode and scheduler settings are retained.
- **Data & Sync:** original backup, restore, reset and name-cleanup controls; a truthful disconnected-preview panel instead of instructions to configure a new Firebase backend.

## What remains original

The build consumes the original `app.js`, `index.html` stylesheet, `song-app.js`, `song-app.css`, `song-lib.js`, `seed-data.js` and `song-seed.js`. **It does not modify these files.** Presentation adapters compose the original rendered controls into new layouts; original domain functions still power editing and song planning.

The original Presider visibility gate, song-picker feature flag and double-duty conflict logic remain intact, including the single **prayer + usher** exception. The catalog retains all **509 songs**. Schedule service names, dates/times, choir songs, departments and assignments are not fabricated or renamed for the design.

## Reference data, not the live schedule

The repository seed contains **74 services and 45 members**, dated May–July 2026. The preview deliberately fixes its internal reference clock to **July 1, 2026** so upcoming-duty behavior can be exercised without inventing current assignments. Original member-name variants and original song canonicalization remain intact. No live Firestore schedule or song history is downloaded. Do not treat the preview as today's assignments or live usage statistics.

The seed selects `B. Anthony L` so an actual seeded Presider assignment is immediately available. Change the name in My Duties to test other members and role visibility. Existing Aurora preview edits remain under the same isolated storage prefix.

## Verification

`tests/preview.mjs` retains the original browser checks for assignment editing, requests, calendar export, Presider setlists, storage persistence/reset isolation, production-source hashes and zero external traffic. It also runs `tests/workspaces.mjs` for the expanded interfaces: search/focus, native keyboard song controls, full assignment/category coverage, feature switches, and layouts at **320, 390, 768, 1024 and 1440 px in both light and dark appearances**. Reports and screenshots are generated by the workflow; use its completed report rather than treating an early packaging run as a completed test.

These are Chromium functional and layout checks, not complete accessibility or cross-browser certification. Live collaborative updates and production integration are outside this isolated design review.

## Isolation and limits

- **No changes to production app files, Firebase configuration, rules, functions, service worker, release scripts or main. No deployment.**
- Storage is isolated under `lv-aurora-preview-v1:`. Reset clears only that prefix. If browser storage is blocked, a visible notice explains that edits last only for the current tab.
- The bundle does not load Firebase configuration or register a service worker. Its Content Security Policy blocks external connections, workers, frames and external scripts/styles.
- Google Sheet/catalog network refresh, push delivery and live calendar subscriptions are intentionally disabled. Calendar download is an explicitly labeled reference-data snapshot, not a live subscription. Backup/export/clipboard actions operate locally; copying for Signal does not send a message.
- Site/editor locks start off only in the isolated seed settings for review. Production gates are unchanged. Local lock controls remain available and Reset preview recovers a locked demo.
- The original song module receives the reference schedule through a preview context bridge. Original mount handling, song IDs, setlist IDs, helpers and events are retained.
- Build replacements use exact, uniqueness-checked source anchors and fail rather than silently adapt incompatible source changes.
- Online sync/auth/push/subscriptions and production migration require a separate reviewed integration after design approval.

## Files

- `shell.html`, `aurora.css`, `aurora.js`: original Aurora shell, Schedule design and isolated runtime adapter.
- `workspaces.js`: My Duties and Manage presentation composition.
- `presider-workspace.js`: presentation extensions inside the original song module closure.
- `workspaces.css`: scoped desktop/mobile and light/dark styling for the three expanded tabs.
- `build.mjs`: assembles the self-contained app without editing production sources.
- `tests/preview.mjs`, `tests/workspaces.mjs`: browser checks, screenshots and review report.

Generated `dist/` stays untracked. The Actions bundle is private to repository collaborators and retained seven days. Keep generated HTML private too: it embeds reference member names and the song catalog.

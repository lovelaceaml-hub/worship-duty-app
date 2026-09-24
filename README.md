# LV Zion Worship Service

The web app the LV Zion congregation uses to see worship duty assignments, get
reminders, plan songs, and manage department rosters.

Last updated: 2026-09-24.

## Quick links

- **Live app:** https://lv-zion-duties.web.app (share this link with members)
- **Preview channel (private review before a release):** https://lv-zion-duties--design-gallery-review-rtm2fa8h.web.app (it reads and writes real records, and expires seven days after the last preview publish)
- **GitHub repo (private):** https://github.com/lovelaceaml-hub/worship-duty-app
- **App.js split:** [plan](docs/PLAN-2026-09-22-APP-JS-SPLIT.md) and its shipped [module map](docs/CODE-INDEX.md#the-appjs-split-2026-09-22); `app.js` is now an entry script importing modules under `core/`, `views/`, `actions/`, merged with F1-F14's feature work on 2026-09-23.
- **Handoff (current state, branches, open items):** [docs/HANDOFF.md](docs/HANDOFF.md)
- **Playbook (run and release the app):** [docs/PLAYBOOK.md](docs/PLAYBOOK.md)
- **User Guide (members):** [docs/USER-GUIDE.md](docs/USER-GUIDE.md)
- **User Manual (leaders and administrators):** [docs/USER-MANUAL.md](docs/USER-MANUAL.md)
- **Run records (one file per feature and release):** [docs/runs/keep-look-features/](docs/runs/keep-look-features/)
- **Rules for agents working in this repo:** [AGENTS.md](AGENTS.md)
- **Retired:** [Complete phone plan](docs/PLAN-COMPACT-PHONE-REFACTOR.md), historical since 2026-09-22; unmerged work preserved on `claude/compact-runtime` and `claude/compact-server`.

## Current status

Live. Features F1 to F14 shipped on `claude/keep-look-f4f5`; the app.js split
(source reorganization, zero behavior change) merged with them into `main` on
2026-09-23 and was released from `main` the same day (Hosting release marker
`gallery1790151129923`). `main` is now the Hosting source branch.

On 2026-09-17 Anthony rejected the integrated new-shell preview because it
replaced the app's look. The decision since then: keep the live look, add
features into the four existing appearances (Original, Prism, Navy & Cream,
Aurora) one at a time, show each on the preview channel first, and release on
his approval.

What members see now:

- One shared header in every appearance: the LV badge, "LV ZION", the name of
  the current screen, a small Appearance icon, and the member's name.
- Tapping the name opens a menu with Availability, Settings, and Sign out.
- On phones, Schedule, My Duties, Presider, and Manage are a floating bar at
  the bottom of the screen. Wide screens keep the tabs at the top.
- On phones, the secondary menus (Manage sections, Presider sections) are one
  row under the header.
- A green dot on My Duties means a new duty. A red dot on Manage means a
  request or conflict needs attention.
- A round feedback button sits above the bottom bar. Administrators read the
  notes under Manage, Feedback.
- Schedule opens on the next upcoming service in Pacific time and advances at
  each service's start time.
- Department leaders add members by name search and can reset a member PIN from
  the roster. No account ID appears anywhere on screen.
- Dark mode in Prism and Aurora follows the device setting. There are no dark
  mode or pause buttons.

Release history, open items, and standing warnings are in
[docs/HANDOFF.md](docs/HANDOFF.md).

## Where the live app comes from

| Part | Source branch | Worktree |
| --- | --- | --- |
| Hosting (everything members see) | `main` | `/Users/anthony/Projects/worship-duty-app` |
| Cloud Functions and Firestore rules | `claude/compact-integration` | `/Users/anthony/Projects/worship-duty-app-worktrees/compact-integration` |

Warning: the `firestore.rules` file on `main` is older than the live rules
and must never be deployed. Rules deploy only from the `compact-integration`
worktree.

## Run the tests

None of these need a passcode, a PIN, or a network connection to live data.

- Unit and contract tests: `node --test tests/*.test.mjs`
- Identity migration (run for any member identity change): `node --test tests/member-migration.test.mjs`
- Build the four appearances into one Hosting copy: `node design-gallery/build.mjs`
- Browser suite for all four appearances (needs `npm ci` for Playwright; on a Mac run it outside the sandbox): `node design-gallery/test.mjs`
- App.js split check: `node scripts/check-app-split.mjs <baseline-sha>` (see the [split plan](docs/PLAN-2026-09-22-APP-JS-SPLIT.md))

The GitHub workflows in `.github/workflows/` run the gallery build, the permission tests, and the browser checks.

## How to release (three commands, Anthony runs them)

1. Preview: `node design-gallery/release.mjs --preview` from `main`, then
   review on the preview channel.
2. Publish with the maintenance message on, then publish again with it off
   (`node design-gallery/release.mjs --publish` both times).
3. Exact copy-paste blocks with absolute paths are in
   [docs/PLAYBOOK.md, sections 8 and 8a](docs/PLAYBOOK.md). Claude cannot run
   production deploys (the Claude Code auto mode classifier denies them), so
   Anthony runs these himself.

Schedule edits never need a release. They sync live through the database or the
Google Sheet import.

## Other documents

- [Features](docs/FEATURES.md): the on and off switches under Manage, Features
- [Code index](docs/CODE-INDEX.md) and [feature map](docs/FEATURE-MAP.json): where things live in the code
- [Design gallery README](design-gallery/README.md): how the four appearances are compiled
- [Usage Counter](docs/USAGE-COUNTER.md): what the privacy-safe daily counter records
- [Design](docs/DESIGN.md): the Original appearance's design system
- [Setup Guide](docs/SETUP-GUIDE.md) (same file as the Playbook) and [Creation Guide](docs/CREATION-GUIDE.md) (same file as the historical Implementation guide)
- Historical records: [department roster release](docs/DEPARTMENT-ROSTER-AVAILABILITY-RELEASE.md), [authentication release](docs/AUTH-DEPARTMENT-UPGRADE-RELEASE.md), [song app merge](docs/MERGE-HANDOFF.md), [compact design handoff](docs/COMPACT-DESIGN-HANDOFF.md) (rejected new-shell design), [all documents](docs/)

## Files

- `index.html`: the app shell, the shared header markup, and the Original styles
- `core/`, `views/`, `actions/`: the app modules that `app.js` loads
- `member-access.js`, `department-*.js`: member identity, department-leader access, and department workflow helpers used by the browser
- `live-design/`: the earlier two-choice design candidate, kept frozen as history (the [design gallery README](design-gallery/README.md) is current)
- `tests/`, `scripts/`: tests and build or release helpers (not deployed)
- `app.js`: entry script, imports `core/`, `views/`, `actions/dispatch.js` (see [docs/CODE-INDEX.md](docs/CODE-INDEX.md#the-appjs-split-2026-09-22) for the module map)
- `permissions.js`: who may do what, used by the browser
- `song-app.js`, `song-lib.js`, `song-seed.js`, `song-app.css`: the Presider song planner, loaded only when opened
- `design-gallery/`: compiles Original, Prism, Navy & Cream, and Aurora into one Hosting build, and releases it
- `prototype/`, `prototype-prism/`: the Aurora and Prism appearance sources the gallery compiles
- `firebase-config.js`: public Firebase web config and Web Push key
- `functions/`, `firestore.rules`: server code and rules. On `main` they are OLDER than what is live (see the warning above)
- `sw.js`, `manifest.json`, `icon.svg`: make the app installable and able to receive push
- `seed-data.js`: the original May to July 2026 spreadsheet import, kept as the offline fallback

# LV Zion Worship Duty

The app LV Zion members use to see the duty schedule and their own duties, ask
for a change, and plan songs when they preside. Leaders use it to fill duties,
answer requests, and keep their department rosters.

Live at https://lv-zion-duties.web.app.

## How it is built

Plain JavaScript modules in the browser, with no framework and no build step
while developing. Firebase runs everything else: Hosting, Firestore, Cloud
Functions (Node 22), sign-in (member name and PIN), and push notifications.

| Where | What |
| --- | --- |
| `index.html` | The page: header, tabs, and the space screens draw into. |
| `app/main.js` | Start-up: cached schedule first, then Firebase, live data, sign-in. |
| `app/store.js` | All app state in one place: `data`, `session`, `ui`. |
| `app/sync.js` | Live Firestore listeners that fill `data`. |
| `app/render.js` | Picks what shows (a lock screen or a tab) and draws it. |
| `app/actions.js` | Connects buttons and forms to code (see below). |
| `app/config/` | Departments and duties, and the feature switches in Manage, Features. |
| `app/lib/` | The rules, with no side effects: dates, services, availability, double duties, workload, requests, names. Unit tested. |
| `app/services/` | Reads, writes and server calls: sign-in, requests, departments, notifications, feedback. |
| `app/screens/` | One file per screen or Manage section. The Schedule has one layout per appearance. |
| `app/ui/` | Pieces used on many screens: header, tabs, banners, cards. |
| `app/appearance/` | The four appearances and the picker. |
| `app/presider/` | The song planner. |
| `styles/base.css` | The Original appearance, and the layout every appearance shares. |
| `styles/themes/` | Prism, Navy & Cream and Aurora, each drawn over `base.css`. |
| `permissions.js` | Who may do what. The server has an identical copy in `functions/`; a test keeps the two the same. |
| `song-lib.js`, `song-seed.js` | Song counts and the song list. The Signal song ingest on Anthony's Mac loads these two files from this folder, so keep them here and keep their behavior. |
| `functions/` | Cloud Functions. |
| `firestore.rules` | Database rules. |
| `scripts/` | Local server, build, release, and the functions deploy. |
| `tests/` | Unit, rules and browser tests, and the fake Firebase they use. |

### Adding to the app

- **A button or form.** Give it `data-act="name"` (`data-change` for a select
  or checkbox, `data-input` for typing) and add the handler in the same
  screen file: `defineActions({ name: { run: el => ..., allowed: el => ... } })`.
  `allowed` is checked before `run`. An action needs a signed-in member unless
  it says `public: true`.
- **Markup.** Build it with `` html`...` `` from `app/html.js`. Values are
  escaped; wrap trusted markup in `raw()`.
- **A rule.** Put it in `app/lib/` with a unit test in `tests/unit/`.
- **A feature switch.** Add it to `app/config/features.js`. It shows up in
  Manage, Features, and `feature('id')` reads it.
- **A screen.** Add a file in `app/screens/`, a tab button in `index.html`,
  and a line in `screen()` in `app/render.js`. A Manage section goes in
  `app/screens/manage/index.js`.

## Run it on your computer

```bash
npm ci
```

```bash
npm start
```

`npm start` serves http://localhost:5174 with made-up members and a made-up
schedule, and never touches Firebase. Passcode 2468, every PIN 1234. B. Adam
is an administrator, E. Joseph leads Worship and Media, S. Grace leads Usher
Sisters, and M. Ruth edits songs (see `tests/fake/fixture.js`).

`npm run serve` runs the app against the real database. Anything you change
there is real.

## Tests

```bash
npm run check
```

```bash
npm test
```

```bash
npm run test:functions
```

```bash
npm run test:browser
```

- `check`: every module's imports and exports line up.
- `test`: the rules in `app/lib/`, permissions, and the Firestore rules.
- `test:functions`: the Cloud Functions. Run `npm ci` in `functions/` once first.
- `test:browser`: the main flows in a real browser on the fake data: sign-in,
  change requests, assignments, availability, invite links, feedback, the song
  planner, appearances, offline, and the built files.
- `npm run screenshots -- --appearance prism --out /tmp/shots` saves every
  screen in one appearance.

GitHub runs all four on every pull request.

## Release

Only the app itself (Firebase Hosting) is released this way; functions and
rules are below.

**From GitHub** (also works from a cloud session):

- Every pushed branch except `main` gets its own 7-day preview link, shown in
  the Actions run summary. Previews use the real data: look, do not tap.
- To go live, run **Firebase release** on `main`
  (https://github.com/lovelaceaml-hub/worship-duty-app/actions/workflows/firebase-release.yml).
  It runs every test first, publishes, then checks that the calendar feed
  still answers. Tick "maintenance" to show the "being updated" screen, and
  release again without it to end it.
- `.github/scripts/deploy-guard.sh` lets these workflows run only the pinned
  Hosting command for this project. The deploy key (service account
  `gh-hosting-deploy`, repository secret `FIREBASE_SERVICE_ACCOUNT`) must be
  rotated by 2027-09-29.
- To undo a release: Firebase console, Hosting, site `lv-zion-duties`,
  Release history, Rollback on the release before it.

**From your Mac:**

```bash
node scripts/release.mjs preview
```

```bash
node scripts/release.mjs live
```

The preview is the approval link (channel `design-gallery-review`, valid 7
days). It uses the real data too. The build stamps every file with the
release, so a phone never mixes two versions. `node scripts/release.mjs live
--maintenance` shows the "being updated" screen.

Cloud Functions, when `functions/` changed. Deploy them before the app when
the app needs the new server code.

```bash
node scripts/deploy-functions.mjs
```

This deploys this app's functions by name. Never run a bare `firebase deploy`
or `firebase deploy --only functions`: the Firebase project also holds another
app's functions (`onVercelScheduleWrite` and `worshipVercelReconcile`), and
those commands would offer to delete them.

Database rules, only when `firestore.rules` changed:

```bash
npm_config_cache=/tmp/npm-cache npx -y firebase-tools@latest deploy --only firestore:rules --project lv-zion-duties
```

## Where the data comes from

- The schedule is imported from the Google Sheet every 2 hours, or right away
  from Manage, Data. The import only reads the Sheet; nothing is written back.
  New names in the Sheet join the member list, and names listed in
  `app/nameMap` count as one person.
- Everything else lives in Firestore: `schedule`, `app/*` (settings, members,
  leaders), `requests`, `departments/*/members` (rosters and availability),
  `setlists` and `songStats` (songs), and `feedback`.
- Server jobs on a timer: duty reminders every hour, the Sheet import every
  2 hours, and every 30 minutes the songs of each confirmed list are counted
  as sung once 3 hours have passed since its service started.

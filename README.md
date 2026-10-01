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
| `app/config/` | Departments and duties (with the names shown for older stored ones: "Sermon" shows as Opening Prayer, "Prayer of Thanks" as Thanks Prayer; the Sheet and database keep the old names), and the feature switches in Manage, Features. |
| `app/lib/` | The rules, with no side effects: dates, services, availability, double duties, workload, Fill, requests, names. Unit tested. |
| `app/services/` | Reads, writes and server calls: sign-in, requests, departments, notifications, feedback. |
| `app/screens/` | One file per screen or Manage section. The Schedule has one layout per appearance. |
| `app/ui/` | Pieces used on many screens: header, tabs, banners, cards. |
| `app/appearance/` | The four appearances and the picker. |
| `app/presider/` | The song planner: each service's prayers, Preparation Songs, Glory (and Thanks) and Choir song, and Copy for Signal. |
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

## Planning a month

Manage, Services is the month planner. A leader sees their department's
duties for every service still to come that month: a grid on a computer, a
list on a phone. Changing a duty saves it at once. A service shows only the
duties it has: Thanks Prayer only at Sabbath Day Morning and feast-day
mornings, Closing Prayer and the choir song only at Sabbath Day and Third Day
(`app/lib/worship.js`).

**Fill empty duties** proposes someone for every empty duty that kind of
service (same worship and time) has had filled in the past year, or every
duty it has when there is no history. It only picks members who are active
in the department, can take that duty, are available, and are not already
serving in that service. The leader chooses how (remembered on the device):

- **Auto**: no other duty that day first, then the fewest duties this month,
  then least served lately, then longest since.
- **Rotation**: down each department's list by name, starting after whoever
  served there most recently, round and round.
- **Random**.

The leader changes any proposal, then saves them together; each member gets
one notification listing their new duties. A service's heading opens its
details (date, time, choir song, replacements, double duties, an
administrator's override, delete).

## Department members

- Every night (`servingMembers`, 3:30 AM Pacific) everyone who has served in
  a department's duties is added to it if they are not on its list yet:
  active if they served there in the last 35 days or have a duty coming up,
  inactive otherwise. They can take any duty of the department (in Worship,
  only the duties they have served). People already on a list are never
  changed, so a leader removes someone by making them inactive.
- A department's page also lists people who serve there but are not on the
  list yet ("Not on the list yet"), with Add and Add all. "Add a member"
  finds anyone on the member list, including people who have never signed in.
- Availability: a service time a member has not set counts as available.
  Only times marked "not available" (or a day off) keep them off.

## Fixing a name

Manage, Data, **Fix a member's name** (administrators) changes a name
everywhere: member list, services, departments, leaders, song lists,
requests and department profiles, and adds the old spelling to
`app/nameMap` so a Sheet import maps it too. The member keeps their sign-in
and PIN, and no duty alerts go out. When the correct name is already a
member, the two become one. Names shown without a title ("Bridgette") are
shown as written, never split into "B. ridgette".

Every November 1 the server adds the regular services from December 1
through the next December (every Saturday's three and every Tuesday
evening). Administrators then see a reminder to add that year's feast
services. Manage, Data can also add a year by hand.

## The Google Sheet

The Sheet stays the master. People type duties into its "<year> Entry"
tabs (one row per service, one column per duty, header on row 2); the
Sheet's own script copies them into "Raw Data".

- By default the app only reads the Sheet: every 2 hours (or Import now in
  Manage, Data) from the published Raw Data link.
- With **Write changes to the Sheet** on (Manage, Features), the app writes
  every duty change and new service into the Entry tabs within seconds, adds
  each new year's tab, and reads the Entry tabs directly. A blank cell never
  clears a duty in the app; clear it in the app, which blanks the cell.
- Setting it up, once:
  1. Turn on the Google Sheets API for the project:
     `gcloud services enable sheets.googleapis.com --project lv-zion-duties`
  2. Paste the Sheet's address in Manage, Data, then press **Check the
     Sheet**. It reads the Sheet, compares it with the app, changes nothing,
     and says which Google account the app uses.
  3. Share the Sheet with that account as an Editor, and check again.
  4. Try the writing on a copy of the Sheet first (File, Make a copy):
     `node scripts/sheet-try.mjs "<the copy's address>"`, then look at the copy.
  5. Update the Sheet's script so it reads every year's Entry tab.
  6. Turn on Write changes to the Sheet.
- If a write fails, Manage shows why, and the next change tries again.

## Where the data comes from

- The schedule is imported from the Google Sheet every 2 hours, or right away
  from Manage, Data (see "The Google Sheet" above). New names in the Sheet
  join the member list, and names listed in `app/nameMap` count as one
  person.
- Everything else lives in Firestore: `schedule`, `app/*` (settings, members,
  leaders), `requests`, `departments/*/members` (rosters and availability),
  `setlists` and `songStats` (songs), and `feedback`.
- Server jobs on a timer: duty reminders every hour, the Sheet import every
  2 hours, every 30 minutes the songs of each confirmed list are counted as
  sung once 3 hours have passed since its service started, every night the
  department members from the schedule, and every November 1 the next
  planning year's regular services.
- Notifications: a new duty, a day-before reminder, a change request (to the
  scheduler and that department's leaders) and its answer, and feedback
  marked done (to the member who sent it).

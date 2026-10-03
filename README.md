# LV Zion Worship Duty

The app LV Zion members use to see the duty schedule and their own duties, ask
for a change, and plan songs when they preside. Leaders use it to fill duties,
answer requests, and keep their department rosters.

Live at https://lv-zion-duties.web.app.

## Quick links

- Live app: https://lv-zion-duties.web.app
- Current status and what is next: [docs/HANDOFF.md](docs/HANDOFF.md)
- Repository: https://github.com/lovelaceaml-hub/worship-duty-app
- Duty Sheet ("LV Zion Worship Duty Schedule"): https://docs.google.com/spreadsheets/d/17YrNykmijnJ_LQPky512X47LZUDUot3KfiWJbeWnLuQ/edit
- Firebase console: https://console.firebase.google.com/project/lv-zion-duties/overview

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
| `app/ui/` | Pieces used on many screens: header, tabs, banners and toasts, cards. `replace.js` redraws a screen while keeping the member's place: focus, the caret, unsaved field values and scroll. |
| `app/appearance/` | The four appearances and the picker. |
| `app/presider/` | The song planner: each service's prayers, Preparation Songs, Glory (and Thanks) and Choir song, and Copy for Signal. |
| `styles/base.css` | The Original appearance, and the layout every appearance shares. |
| `styles/themes/` | Prism, Navy & Cream and Aurora, each drawn over `base.css`. |
| `permissions.js` | Who may do what. The server has an identical copy in `functions/`; a test keeps the two the same. |
| `song-lib.js`, `song-seed.js` | Song counts and the song list. The Signal song ingest on Anthony's Mac loads these two files from this folder, so keep them here and keep their behavior. |
| `functions/` | Cloud Functions. `index.js` only wires each one, through one `callable()` wrapper; the work is in modules by area (`accounts.js` sign-in and PINs, `notify.js` alerts, `schedule-projection.js`, `sheet-io.js`, `public-endpoints.js`, `replacements.js`, ...). Every refusal carries a reason code (`refusals.js`), which `app/lib/reasons.js` turns into plain words. |
| `firestore.rules` | Database rules. They decide from the member's account document, as the server does. |
| `scripts/` | Local server, build, release, and the functions deploy. |
| `tests/` | Unit, rules and browser tests, and the fake Firebase they use. |

### Adding to the app

- **A button or form.** Give it `data-act="name"` (`data-change` for a select
  or checkbox, `data-input` for typing) and add the handler in the same
  screen file: `defineActions({ name: { run: el => ..., allowed: el => ... } })`.
  `allowed` is checked before `run`. An action needs a signed-in member unless
  it says `public: true`.
- **Markup.** Build it with `` html`...` `` from `app/html.js`. Values are
  escaped; wrap trusted markup in `raw()`. Give controls stable `data-*` keys
  (service, duty, date), so a redraw finds them again and keeps the focus.
- **A message.** `notice(text)` for a short confirmation (it shows briefly
  above the tabs), `notice(text, true)` for a problem, and `banner(text)` for
  anything the member must read or copy; banners stay until closed.
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

`npm start` serves only this computer; add `-- --host 0.0.0.0` to open it
from a phone on the same network.

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
npm run test:rules
```

```bash
npm run test:browser
```

- `check`: every module's imports and exports line up.
- `test`: the rules in `app/lib/`, permissions, and that the Firestore rules
  know every document and duty the app writes.
- `test:rules`: the Firestore rules themselves, on the Firestore emulator,
  for every read and write the app makes, allowed and refused. It needs
  Java 21 (Mac: `brew install openjdk@21`) and downloads firebase-tools 15
  and the emulator the first time (prefix `npm_config_cache=/tmp/npm-cache`
  as for the deploy commands).
- `test:functions`: the Cloud Functions. Run `npm ci` in `functions/` once first.
- `test:browser`: the main flows in a real browser on the fake data: sign-in,
  change requests, assignments, the month plan and Fill, availability, invite
  links, feedback, the song planner, appearances, offline, keyboard focus,
  and the built files (`tests/browser/*.test.mjs`).
- `npm run screenshots -- --appearance prism --out /tmp/shots` saves every
  screen in one appearance.

GitHub runs all five on every pull request.

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

When a change needs all three, deploy them the same day in this order: the
functions, then the rules, then the app. To undo the rules: Firebase console,
Firestore, Rules, history.

## Planning a month

Manage, Month plan is the month planner. A leader sees their department's
duties for every service still to come that month: a grid on a computer (as
wide as the window), a list on a phone. Changing a duty saves it at once.
Manage opens on Requests when one is waiting, otherwise on the month plan.

The legend above the month explains the marks: amber "Not filled" for a duty
the service usually has, a red name with the reason underneath (not on the
list, not available, already serving), a dashed cell for a Fill proposal not
saved yet, and a green edge for an usher who also gives a prayer there (an
allowed pair). Usher leaders see who prays in each service. A service that
has started can no longer be changed by leaders (administrators use the
override, which is recorded), and a past month only shows what happened. A service shows only the
duties it has: Thanks Prayer only at Sabbath Day Morning and feast-day
mornings, Closing Prayer and the choir song only at Sabbath Day and Third Day
(`app/lib/worship.js`).

**Fill** ("Fill by" Auto, Rotation or Random) reads the department lists
again, then proposes someone for every empty duty that kind of service (same
worship and time) has had filled in the past year, or every duty it has when
there is no history. Proposals belong to their department and month: until
they are saved or discarded, the month and the department stay put. A save
that fails keeps the proposals, and a duty the server refuses says why. The grid dims the duties Fill leaves
alone. It only picks members who are active in the department, can take that
duty, are available, and may hold it alongside what they already do in that
service (see "One duty each" below).

Opening Prayer is given by whoever delivers the sermon. Fill always gives it
to its default, the church overseer (E. Simon) unless a Worship leader or an
administrator chooses someone else, or no default, in Manage, Departments,
Worship. When the default cannot take it, it stays empty, outlined, for the
leader to fill by hand; another preacher is always put on by hand. Fill never
gives the default any other duty. New services, added by hand or by the
yearly batch, start with the default on Opening Prayer.

An usher duty goes first to someone giving the Thanks or Closing Prayer in
that service, whichever way the leader fills: the prayers lead and the ushers
follow. A service's prayers are settled before its ushers, so when an
administrator fills every department at once the matches happen in the same
fill; an usher leader gets them when filling after the prayers are set.
Everyone else is chosen the leader's way (remembered on the device):

- **Auto**: no other duty that day first, then the fewest duties that month
  (the services already past count too), then least served lately, then
  longest since.
- **Rotation**: everyone takes a turn before anyone serves again. Whoever has
  gone longest without a turn goes first, and people tied go by name, so once
  everyone has had a turn it runs down the list by name, round and round.
  Someone away for their turn goes first next time, and someone already on a
  duty later that month waits. The Presider and Opening Prayer each take
  turns of their own, and an usher duty matched to a prayer is not a turn.
- **Random**.

When no one is free for a duty, Fill moves its own picks in that service
around so that someone is (another free member takes the duty they leave), so
a duty stays empty only when no such move fills it. Duties already saved are
never moved. The leader changes any proposal, then saves them together; each
member gets one notification listing their new duties. Duties no one was free
for are outlined, and each says why: no one on the list takes it, no one who
takes it is available, or everyone available already serves there. A service's
heading opens its details (date, time, choir song, replacements, double
duties, an administrator's override, delete).

### One duty each

A member holds one duty in a service, with one exception: Thanks Prayer or
Closing Prayer together with an usher duty (Usher Door, Front or Back, Usher
#1 or #2; Lobby Security does not count). Opening Prayer is never paired:
whoever gives it delivers the sermon and does nothing else. The planner
offers the pair, with the prayer shown next to the name, and Fill makes it as
above. The
server refuses any other second duty, whichever way it is saved. A double
duty that arrives another way (the Sheet, an administrator's override) is
flagged on the schedule until a leader marks it OK; the mark holds while the
person's duties stay the same. `app/lib/conflicts.js` has the rule and
`permissions.js` the same rule for the server; a test checks that they agree
on every pair and three of duties.

## Change requests and flagged duties

- A member asks for a change from My Duties. The duty then says "Asked. You
  stay on this duty until your leader answers.", and the member can withdraw
  the request while it waits. A member can ask only about their own duty.
- The department's leaders answer in Manage, Requests: give the duty to
  someone (suggested people first, then everyone who can take it), leave it
  open, or decline (the member stays on). The button says what Approve does.
  When the member no longer holds the duty, Approve is refused and the
  request can only be closed; a request for a moved or deleted service can
  be closed too. Requests for services that have started show as Past.
- A duty flagged because the member marked the day off ("can no longer make
  it") can go to someone else, be left open, or stay with the member. Keeping
  them marks them available for that one service, in all their departments,
  so saving their availability later does not flag it again; their other
  services that day stay as they set them. A flag in another department
  stays for its own leader.

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
  Only times marked "not available" (or a day off) keep them off. A weekly
  time covers every service at that time ("Evening" is Saturday and Tuesday
  evenings and feast-day evenings), and the screen says so. Changes wait in
  an "Unsaved changes" bar until saved. Saving names the duties on days now
  marked off; their leaders are told. A leader's change to someone's
  availability flags the same way, and is refused if the member changed it
  meanwhile.
- "Add a member", "Add" and "Add all" give people duties the way the nightly
  job does. Someone who joins with an invite link shows as "Not ready" until
  a leader chooses the duties they can take.

## Signing in

- Members sign in with their name and PIN. A new or reset PIN is a shared
  starting PIN until the member chooses their own (Settings, Change your
  PIN); the shared starting PINs cannot be chosen.
- Five wrong PINs lock the account for 15 minutes. A reset unlocks it and
  signs the member out on every device, and their phones get no alerts until
  they sign in again (so a lost phone stops getting them). Only
  administrators reset a leader's, a song editor's or an administrator's PIN,
  and every reset is recorded.
- Removing someone as a leader or song editor holds; it also ends their open
  sessions, as a reset and a name fix do. They sign in again.
- Signing out clears what the member left on the device: unsaved changes,
  notices, Recent updates, and alerts to that device.

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
  Manage, Data) from the published Raw Data link. A duty changed in the app
  stays changed: each service remembers what the Sheet said at the last
  import (`sheetSeen`), and the Sheet's name replaces the app's only when
  that cell changed in the Sheet since then. The Sheet itself is not
  updated, so change it there too if people use it; Check the Sheet lists
  where the two differ. The first import after this was released takes the
  Sheet's names once, as before. Times set in the app stay, and a service
  deleted in the app is not added again; add it again in the app to bring
  it back. A row's year follows its weekday (a word before the date that is
  not a weekday, such as a feast's name, is left out).
- With **Write changes to the Sheet** on (Manage, Features), the app writes
  every duty change and new service into the Entry tabs within seconds, adds
  each new year's tab, and reads the Entry tabs directly. A blank cell never
  clears a duty in the app; clear it in the app, which blanks the cell. A
  write that fails is tried again at the next import, for the cells it was
  for only, so a cell changed in the Sheet meanwhile is kept. A new row goes
  in with its values in one step, so a failure never leaves an empty row.
- Live since 2026-10-02: the Sheet's link is set in Manage, Data and
  **Write changes to the Sheet** is on, so the app writes into the
  "2026 Entry" tab and imports from it.
- Setting it up, once:
  1. Turn on the Google Sheets API for the project:
     `gcloud services enable sheets.googleapis.com --project lv-zion-duties`
  2. Paste the Sheet's address in Manage, Data, then press **Check the
     Sheet**. It reads the Sheet, compares it with the app, and changes
     nothing.
  3. The app reads and writes the Sheet as
     `lv-zion-worship@lv-zion-duties.iam.gserviceaccount.com`, which the live
     Sheet is already shared with as an Editor. The server's own account
     borrows it (Service Account Token Creator on that account, given
     2026-10-02). Never share the Sheet with another account.
  4. Try the writing on a copy of the Sheet first (File, Make a copy):
     `node scripts/sheet-try.mjs "<the copy's address>"`, then look at the copy.
  5. Update the Sheet's script so it reads every year's Entry tab.
  6. Turn on Write changes to the Sheet.
- If a write fails, Manage shows why until the next import, which writes it
  first. **Write changes to the Sheet** turns on only after a successful
  Check the Sheet.

- Department leaders see Manage, Data with only **Import now** and **Check
  the Sheet**. The Sheet's link, Fix a member's name, adding a year and the
  backup stay with administrators.

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
  sung once 3 hours have passed since its service started (a list planned
  with "Plan another date" for a date with no service counts at its own
  date and time, also one made before this release; a list whose service
  was deleted or moved does not count), every night the
  department members from the schedule, and every November 1 the next
  planning year's regular services.
- Notifications: new duties (one alert names all of a member's new duties,
  also after a Sheet import), a day-before reminder (one per member, gone once
  the service starts), a change request (to the scheduler and that
  department's leaders) and its answer, and feedback marked done (to the
  member who sent it). None for services that have started.

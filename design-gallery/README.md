# LV Zion appearance gallery: Original + 3 optional designs

Last updated: 2026-09-23. Verified against `design-gallery/build.mjs` on branch
`main` (the source of the live app since the 2026-09-23 merge of
`claude/keep-look-f4f5`).

This folder compiles **Original, Prism, Navy & Cream, and Aurora** into one
Hosting build behind one member-facing **Appearance** chooser. There is one
live application, one Firebase project, one schedule, one set of permissions,
and one Presider song planner. The gallery is a compiler for the current app,
not a second app.

## Member experience

After the site passcode and member sign-in, and once shared settings have
loaded, the app offers a four-card appearance chooser once. Members can change
again at any time with the small Appearance icon in the header, or under their
name, Settings, Appearance. The choice is stored only in that browser under
`wds-design-gallery-v1`; it does not change another member's view.

Shared by all four appearances (each styled with its own colors, fonts, and
surfaces):

- **One header.** Brand badge, "LV ZION", the current screen's name, the
  icon-sized Appearance control, and the member chip. The chip opens the
  account menu (Availability, Settings, Sign out).
- **Floating bottom bar on phones** (640 pixels wide or less): Schedule, My
  Duties, Presider, Manage. Hidden on the lock, sign-in, loading, and
  maintenance screens and while the on-screen keyboard is open. Wide screens
  keep the tabs at the top.
- **Secondary menus in one row under the header on phones** (the Manage
  sections, and Home, Library, Services, Insights inside Presider).
- **Dots:** green on My Duties for a new duty, red on Manage for requests or
  conflicts.
- **Feedback button** above the bottom bar, with its sheet and the
  administrator list.
- **No manual dark or motion controls.** Prism and Aurora follow
  `prefers-color-scheme` live; Original and Navy & Cream stay light. Every
  appearance respects `prefers-reduced-motion`. On phones, Original and Navy &
  Cream show "Live sync on" as a status dot in the header. Prism's old utility
  row is removed.

Existing Prism users are migrated from `wds-design-choice-v1` and stay on
Prism. A previous Navy preference in `wds-appearance-navy-v1` is also
recognized. `?design=classic` is an emergency, session-only way to stay on
Original if another stylesheet has a problem.

All four modes keep the original app's actions and data model. Presider remains
the real Home, Library, Services, Insights song planner, and the single prayer
plus single usher double-duty exception is unchanged.

## Designs and their sources

| Appearance | Sources |
| --- | --- |
| Original | `index.html` (markup and inline styles), `app.js` |
| Prism | `prototype-prism/prism.js`, `all-pages.js`, `song-pages.js`, `shell.html`, `prism.css`, `all-pages.css`, `safety.css`, plus helpers and `aurora.css` from `prototype/` |
| Navy & Cream | `design-gallery/navy-adapter.js`, `design-gallery/navy.css` |
| Aurora | `prototype/aurora.js`, `workspaces.js`, `presider-workspace.js`, `shell.html`, `aurora.css`, `workspaces.css` |

## How the build compiles them (`build.mjs`)

1. **Drift checks first.** The build requires exact, single occurrences of key
   functions and strings in `app.js` and `song-app.js` (member sign-in, forced
   PIN change, Manage permission guards, the Presider tab order, the choir song
   merge, the four exact appearance names in `choice.js`). If the app changed
   shape, the build stops before staging anything. Fix the source, do not loosen
   the check.
2. **Host bridge.** `host-bridge.js` is a template with slots
   (`/* PRISM_HELPERS */`, `/* PRISM_VIEWS */`, `/* PRISM_ALL_PAGES */`,
   `/* AURORA_CORE */`, `/* AURORA_DECORATE */`, `/* AURORA_WORKSPACES */`,
   `/* NAVY_ADAPTER */`, `/* PRISM_SHELL */`, `/* AURORA_SHELL */`). The build
   fills them from the Prism and Aurora prototype sources (with preview-only
   wording replaced by live wording and prototype event listeners removed) and
   from `navy-adapter.js`. The filled bridge is inserted into `app.js` just
   before `init();`, so there is one state, one Firebase handle, and one set of
   action handlers. It also owns following the system dark setting.
3. **Shared header markup.** The header markup lives once in `index.html`.
   The build lifts the brand button (`wd-head-brand`) and the tools block
   (`wd-head-tools`, which must contain the account menu), adds the Appearance
   icon button to the tools block, and reuses both inside the Prism and Aurora
   shells in place of their own brand, member chip, and top bar. Prism's utility
   row is removed from its shell. `paintHeader()` in `app.js` fills the header.
4. **Stylesheets, one per appearance.** `prism-live.css`, `navy-live.css`, and
   `aurora-live.css` are each built from that appearance's own CSS, plus its
   marked section of `header.css` (`/* @prism */` to `/* @end-prism */`, and the
   same for `navy` and `aurora`), plus its marked section of `feedback.css`.
   Original's header and feedback styles live in `index.html`. The three
   stylesheets are linked with `media="not all"` and switched on by
   `choice.js` (`design-choice.js` in the build).
5. **Song planner variants.** `song-app.js` gets a bridge that picks the Prism
   or Aurora renderers for the planner's views when that appearance is active,
   and the original renderers otherwise.
6. **Staging.** Everything is written to `.hosting-gallery/` with the `?v=DEV`
   stamp replaced by the release stamp (`gallery` plus a timestamp), along with
   the untouched shared files, a stamped `sw.js`, `firebase.gallery.json`
   (Hosting only), and `design-gallery-release.json` (the release marker, which
   records hashes of the source `app.js`, `song-app.js`, and `index.html`).
7. **Syntax check.** The generated `app.js` and `song-app.js` must parse.

`release.mjs` runs the build, applies `app-fixes.mjs` (it adds the choir song
date fix to the staged app when the source does not already have it), and for `--publish` first proves
the live site is a known release from this branch's history before deploying.

## Safety boundaries

`build.mjs` stages only Hosting files. It wraps presentation around the
unchanged original domain functions. Firebase configuration, sign-in, realtime
listeners, writes, notification logic, the calendar route, change requests, and
feature switches remain authoritative in `app.js`.

The gallery never creates a second schedule or copies production records.
Switching appearances keeps the same document alive and preserves in-progress
text and select values. The Presider module is not remounted just to change
appearance.

GitHub Actions is QA-only and never deploys.

## Build

```sh
node design-gallery/build.mjs
python3 -m http.server 8092 --directory .hosting-gallery
```

The resulting build is wired to the repository's real Firebase config. Do not
point a local browser at production for editing tests.

## Verification

```sh
node design-gallery/test.mjs
```

The suite builds an isolated `.hosting-gallery`, mocks Firebase Auth and
Firestore, blocks other network requests, and drives the real handlers at phone
and desktop widths. As of 2026-09-20 it is out of date and being updated (lane
F13): it still clicks sub-tab buttons that are now hidden on phones and expects
account ID text that was removed. See the open items in
[docs/HANDOFF.md](../docs/HANDOFF.md).

## Release

Full copy-paste commands with absolute paths are in
[docs/PLAYBOOK.md](../docs/PLAYBOOK.md), sections 8 and 8a. In short, from the
main checkout `/Users/anthony/Projects/worship-duty-app`:

```sh
# private preview channel; reads and writes REAL Firebase records
node design-gallery/release.mjs --preview

# publish the four-choice gallery at the existing site (Anthony runs this)
node design-gallery/release.mjs --publish
```

The release script deploys **Hosting only**. It never deploys functions or
rules and never changes Firestore data.

Warning: the `firestore.rules` and `functions/` on this branch are older than
what is live. The live rules and functions come from branch
`claude/compact-integration`. Never deploy rules or functions from here.

## Important

The isolated Aurora prototype's phrases such as "local preview", disabled sync,
and reference clock are removed in this live adapter. Aurora's layouts are
reused, not its isolated storage or fake clock. The Navy and Prism standalone
choosers are not stacked together; this directory owns the single appearance
preference and single popup.

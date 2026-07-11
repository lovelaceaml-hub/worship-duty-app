# Song-app merge — handoff

> **✅ COMPLETED 2026-07-10.** The merge is finished, verified, and live.
> `song-lib.js`, `song-seed.js`, `song-app.js`, and `song-app.css` were
> created and wired into `index.html`; the port was verified end-to-end
> (pure-logic contract identical to the old app, full UI smoke test,
> re-render safety, and an ingest dry-run producing byte-identical writes).
> Both repos' merge branches were merged to `main`. The combined app is
> deployed at **https://lv-zion-duties.web.app**, the Signal ingest daemon
> now loads `worship-duty-app/song-lib.js` + `song-seed.js` (config repointed
> in `~/tools/song-ingest`), and the old standalone site
> **lv-zion-songs.web.app** now redirects here. The rest of this document is
> kept for reference on how the pieces fit together.

Status as of 2026-07-10. A cloud session did the half of this work that
didn't need the new-song-app source (which lives only on the Mac at
`/Users/anthony/Projects/new-song-app`); this document is everything a
session running **on the Mac** needs to finish the job.

## The goal

One app instead of two. In worship-duty-app, when the member selected in
My Duties has an upcoming **Presider** assignment, a button appears that
opens the song-selection/presider screen (today the stand-alone
new-song-app at lv-zion-songs) *inside* worship-duty-app. Presider only —
there is deliberately no Announcer duty.

## What's already done (committed on `claude/worship-duty-app-merge-ahldr6`)

Both repos use the same branch name. **worship-duty-app** commit
"Add role-gated presider song picker entry point":

- `app.js` — all host-side wiring, keyed to these anchors:
  - `FEATURES`: new `songPicker` toggle (default on, kill-switch in
    Manage → Features).
  - `ui.songSvc`: svcId deep-link target; `ui.tab` gained the value
    `'songs'` (no 4th nav tab — the My Duties tab stays highlighted via
    the nav loop in `render()`).
  - `renderMy()`: a "Plan songs for your service" primary button (shown
    only when `feat('songPicker')` and the member has an upcoming
    Presider duty) plus a per-line "Pick songs" button on each Presider
    role row. Both carry `data-act="open-songs" data-svc="<svcId>"`.
  - `handleAct()`: `open-songs` / `close-songs` actions.
  - `render()` dispatch: `ui.tab === 'songs'` → `renderSongs(view)`.
  - New section "songs view (presider song picker)" after `renderMy`:
    `loadSongApp()` (lazy `import('./song-app.js')`, cached),
    `songCtx()`, `renderSongs()`. The view renders a "← My Duties" back
    button and a `#song-root` container, then calls `mount()`.
  - `initFirebase()`: the `fb` handle now also exposes `collection`,
    `onSnapshot`, `getDoc`, `getDocs`, `updateDoc` for the song module.
- `firestore.rules` — comment only: `setlists`/`songStats` must STAY
  open because song-ingest writes unauthenticated REST (API key only).

**song-ingest** commit "Repoint helper paths at the merged
worship-duty-app": `config.json` `appJsPath`/`seedJsPath` now point at
`/Users/anthony/Projects/worship-duty-app/song-lib.js` and
`.../song-seed.js` (files that don't exist yet — created below), README
updated (intro, migration note, troubleshooting, E2E test).

## The contract the remaining work must satisfy

### 1. `song-app.js` — the ported screen (ES module)

`app.js` lazily imports `./song-app.js` and calls:

```js
mount(rootEl, ctx)
// rootEl: the #song-root div (already in the DOM)
// ctx = {
//   fb,        // host Firebase handle: { db, doc, setDoc, deleteDoc, writeBatch,
//              //   collection, onSnapshot, getDoc, getDocs, updateDoc, ... } — or null in local mode
//   me,        // canonicalized member name (unifiedNameMap()[ui.me] || ui.me)
//   nameMap,   // the merged variant→canonical name map
//   service,   // deep-link hint: { date, worship, service, time } of the tapped
//              //   Presider duty, or null (map to a setlist id with serviceIdFor)
//   nav,       // one-shot: true only on the mount caused by an explicit tap
//              //   (Presider tab → Home, "Pick songs" → that setlist);
//              //   false on background re-mounts, which must not navigate
//   onBack     // call to return to My Duties
// }
```

`mount` must be **idempotent** — Firestore snapshots re-render the host
view, which calls `renderSongs()` again (it skips rebuilding the DOM if
`#song-root` exists, but will call `mount` again).

Porting rules (from the approved plan):
- Delete from the port: its own `initializeApp`/anonymous auth/App
  Check, any site/passcode gate, service-worker registration, and any
  top-level autostart. One app, one Firebase instance: use `ctx.fb` only.
- Attach event listeners to the root element, **not** `document` — the
  host delegates `data-act`/`data-chg` clicks document-wide and must not
  see the song UI's attributes. Rename its action attribute to
  `data-song-act` if it used `data-act`.
- Prefix any localStorage keys that collide with the host's `wds-*`.
- Attach `setlists`/`songStats` listeners lazily on first mount; keep
  them after unmount (cheap, and reopening is instant).

### 2. `song-lib.js` — pure helpers for the Signal daemon

Extract `applySung`, `serviceIdFor` (and their pure dependencies) from
new-song-app/app.js, byte-identical logic. Dual-environment footer, same
pattern as `functions/sheet-lib.js`:

```js
if (typeof module !== 'undefined') module.exports = { applySung, serviceIdFor /*, ...*/ };
if (typeof window !== 'undefined') window.SongLib = { applySung, serviceIdFor /*, ...*/ };
```

No side effects at load. **Do not change `serviceIdFor`'s output** — its
slug scheme defines the existing `setlists/{id}` doc ids (different from
this app's `svcId()`; keep both, do not unify). song-app.js should use
these same helpers (via `window.SongLib` or a direct import) rather than
carrying a second copy.

### 3. `song-seed.js` — the catalog

Byte-identical copy of new-song-app/seed-data.js (`window.SONG_SEED`,
no window guard — ingest's `loadCatalog` requires it under Node with a
bare `global.window` stub).

### 4. `song-app.css` + `index.html`

- `song-app.css`: the song app's styles with every rule scoped under
  `#song-root ` so nothing leaks into the host UI. Add a small style for
  the `.song-head` back-button row.
- `index.html`: add next to the existing seed-data.js script tag:
  `<script src="song-seed.js"></script>`,
  `<script src="song-lib.js"></script>`, and a
  `<link rel="stylesheet" href="song-app.css">` in `<head>`.
- Do NOT copy the song app's index.html/sw.js/manifest/firebase-config.
- sw.js needs no change (network-first runtime cache, no precache list).

## Verification checklist

1. **Node contract test** (protects the Signal daemon):
   `node -e "const a=require('./song-lib.js'); console.log(typeof a.applySung, a.serviceIdFor('2026-07-11','Morning'))"`
   — must match the same call against the old new-song-app/app.js exactly.
   Also `node -e "global.window={};require('./song-seed.js');console.log(window.SONG_SEED.songs.length)"`.
2. **Ingest dry run** (on the Mac): `cd ~/tools/song-ingest && node ingest.js --dry-run`
   after updating the *deployed* config.json paths — intended writes must
   be unchanged. (The repo's config.json defaults are already repointed;
   the deployed copy under ~/tools may differ.)
3. **App smoke test**: `python3 -m http.server` in worship-duty-app →
   pick a name with an upcoming Presider duty → button appears; a
   non-presider sees nothing; toggle `songPicker` off in Manage →
   Features hides it. Open the view, plan songs, check the
   `setlists/{id}` doc in the Firestore console, hit "← My Duties", then
   regression-check Schedule/My/Manage all still render and Manage edits
   still save (the document-level event delegation is the risk spot).
4. **Re-render safety**: focus a text input in the song view, change the
   schedule from a second tab — the input must not be wiped
   (`viewHasFocusedInput` covers `#view`; verify it covers song inputs).
5. **Preview deploy** before the real one:
   `firebase hosting:channel:deploy merge-test` and test on a phone.

## Rollout order (after code is done)

1. Deploy hosting (`firebase deploy --only hosting` in worship-duty-app).
   Rules are unchanged; no functions changes.
2. Update the *deployed* ingest config on the Mac
   (`~/tools/song-ingest/config.json` — appJsPath/seedJsPath → the
   worship-duty-app checkout) and run one `--dry-run`.
3. Retire the old app: replace new-song-app's index.html with a redirect
   to https://lv-zion-duties.web.app (meta refresh + link, keep it tiny)
   and `firebase deploy --only hosting:lv-zion-songs` from that project.
   Old phone bookmarks/PWA installs land on the merged app.

## Branches

- worship-duty-app: `claude/worship-duty-app-merge-ahldr6` (this doc +
  host wiring live here)
- song-ingest: `claude/worship-duty-app-merge-ahldr6` (config/README
  repoint)

Merge both to main together once verified — the ingest repoint is
harmless before the files exist (config paths are only read at daemon
runtime on the Mac), but keeping them in step is tidier.

/* =================================================================
   song-app.js — the presider song picker, ported from the old
   stand-alone new-song-app into an ES module that mounts INSIDE
   worship-duty-app.

   The host (app.js) lazily `import()`s this file and calls
   `mount(rootEl, ctx)` where rootEl is the #song-root div and

     ctx = {
       fb,        // host Firebase handle (shared instance + anon auth), or null
       me,        // canonicalized member name
       nameMap,   // merged variant→canonical name map
       service,   // deep-link hint {date,worship,service,time} of the tapped
                  //   Presider duty, or null
       onBack,    // call to return to My Duties
       canEditSongService // optional host authorization callback. It receives
                          // the service record and action name and returns a
                          // boolean. Returning false is fail-closed.
       canManagePresiders // optional host authorization callback for the
                          // Worship-only presider list management surface.
     }

   Differences from the stand-alone app (per docs/MERGE-HANDOFF.md):
   - No Firebase init / anonymous auth / App Check / service worker /
     top-level autostart. Uses ctx.fb only.
   - No "Who are you?" identity gate — identity comes from ctx.me.
   - Event listeners are attached to the root element (not document) and
     use data-song-act / data-song-chg so the host's document-wide
     data-act delegation never sees the song UI.
   - Pure, correctness-critical helpers (applySung, serviceIdFor, …) are
     reused from window.SongLib (song-lib.js), never re-implemented, so
     the in-app path and the Signal ingest daemon can't diverge.
   - All styles are scoped under #song-root (song-app.css).
   ================================================================= */

/* Pure helpers shared with the Signal ingest daemon — single source of truth. */
const {
  serviceIdFor, recompute, applySung, applyUndo,
  backfillServiceId, applyBackfill, removeHistoryEntry,
  totalDuration, countedSongIds
} = window.SongLib;

/* ================= constants ================= */

const SERVICE_LABELS = ['Morning', 'Afternoon', 'Evening', 'Early Morning', 'Commemoration'];
const WORSHIP_TYPES = ['Sabbath Day', 'Third Day', 'Prayer Week', 'Ascension Day', 'Pentecost', 'Heavenly Parent\'s Day'];

/* Left-to-right tab order — drives swipe-left/right navigation inside the picker. */
const TAB_ORDER = ['home', 'library', 'insights'];

/* Known presider-name variants → canonical spelling. Falls back under the
   shared app/nameMap doc (and the host-supplied ctx.nameMap) in canonName(). */
const NAME_UNIFY_MAP = {
  'B. Anthony L': 'B. Anthony', 'D. Chris K': 'D. Chris', 'D. Chris Kane': 'D. Chris',
  'B. James D': 'B. James', 'B. Jason S': 'B. Jason', 'S. Martha B': 'S. Martha',
  'S. Monica Salazar': 'S. Monica S', 'M.Chad': 'M. Chad', 'B. Gio': 'B. Giomar'
};

const DATA_KEY = 'nss-data-v1';

/* Google Sheets mirror (Apps Script Web App). Empty string disables it. */
const SHEET_SYNC_URL = 'https://script.google.com/macros/s/AKfycbxmp5EvNQXcO0arGkmX1lQYZqaeFp6rsGZ6-QwE5VSvbZt9thwtrWNBg01J2e9yw2ScBw/exec';
const RECENT_WARN_DAYS = 28;

/* Live catalog sync — published Google-Sheets CSV of the New Song list. */
const CATALOG_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR60X_ipfHfqs9WZAdX21vvreetI8CyR7F_vusELR3gt0jfw_t3USeip4y25lF-ePzwY-o8FzCtd10a/pub?output=csv';

const VALID_CATEGORIES = {
  Festival: 1, Glory: 1, Gratitude: 1, Faith: 1, Hope: 1, Love: 1,
  Sacrifice: 1, Repentance: 1, Preaching: 1, Prayer: 1, Ceremony: 1, Meditation: 1
};
const CATALOG_MIN_LEN = 400;
const TITLE_OVERRIDES = { '284': 'Holy Is Your Sacrifice' };

const CATEGORY_COLORS = {
  Festival: 'var(--accent)', Glory: 'var(--accent-2)', Gratitude: 'var(--ok)',
  Faith: 'var(--warn)', Hope: 'var(--accent)', Love: 'var(--danger)',
  Sacrifice: 'var(--accent-2)', Repentance: 'var(--warn)', Preaching: 'var(--ok)',
  Prayer: 'var(--accent)', Ceremony: 'var(--muted)', Meditation: 'var(--faint)'
};
function catColor(cat) { return CATEGORY_COLORS[cat] || 'var(--muted)'; }

const SORTS = [
  ['number', 'Number'], ['times', 'Times sung'], ['last', 'Last sung'], ['duration', 'Duration']
];

/* ================= module state ================= */

let root = null;   // the #song-root element the host gives us
let ctx = null;    // the mount context from the host
let fb = null;     // host Firebase handle (ctx.fb) or null in local mode

let _catalogLoaded = false;
let _subscribed = false;
/* The exact element wireRoot() last attached its listeners to. The host tears
   #song-root out of the DOM every time the presider leaves the Presider tab, so
   a remount hands us a BRAND NEW element with no listeners on it. Tracking the
   element (instead of a one-shot boolean) means the picker gets wired again
   every time, which is what kept the second visit from responding to taps. */
let _wiredRoot = null;

const state = {
  songs: [], songById: {}, stats: {}, setlists: {}, settings: {},
  presiders: [], nameMap: {}, schedule: [],
  ui: {
    tab: 'home', homeScope: 'mine', search: '', category: 'All', sort: 'number', libPage: 0,
    currentSetlist: null, expandedSong: null, showPast: false,
    expandedService: null, runsheet: null, pickSlot: null, manualService: false,
    me: '', pendingEditorAction: null, editorGate: null, pinError: '',
    showBackfill: false, backfillSong: '', backfillDate: '',
    showPresiderMgr: false, newPresiderName: '',
    helpDismissed: (typeof localStorage !== 'undefined' && localStorage.getItem('nss-help-dismissed') === '1')
  }
};

/* ================= helpers ================= */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function pad(n) { return (n < 10 ? '0' : '') + n; }
function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function todayISO() { return toISO(new Date()); }

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function dateBadge(iso) {
  const t = new Date();
  if (iso === toISO(t)) return 'Today';
  t.setDate(t.getDate() + 1);
  if (iso === toISO(t)) return 'Tomorrow';
  return '';
}
function fmtDur(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  return Math.floor(sec / 60) + ':' + pad(sec % 60);
}
function relTime(isoDate) {
  if (!isoDate) return 'Never';
  const then = new Date(isoDate + 'T00:00:00');
  if (isNaN(then.getTime())) return 'Never';
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today0 - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return days + ' days ago';
  if (days < 30) { const w = Math.round(days / 7); return w + (w === 1 ? ' week ago' : ' weeks ago'); }
  const m = Math.round(days / 30);
  return m + (m === 1 ? ' month ago' : ' months ago');
}
function daysSince(isoDate) {
  if (!isoDate) return Infinity;
  const then = new Date(isoDate + 'T00:00:00');
  if (isNaN(then.getTime())) return Infinity;
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today0 - then) / 86400000);
}

/* ================= editor PIN lock ================= */

const EDITOR_UNLOCK_KEY = 'nss-editor-unlock';

async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
}
function editorPinHash() { return (state.settings && state.settings.editorPinHash) || ''; }
function editorUnlocked() {
  const h = editorPinHash();
  if (!h) return false;
  return (typeof localStorage !== 'undefined') && localStorage.getItem(EDITOR_UNLOCK_KEY) === h;
}
function writeSongSettings(patch) {
  if (fb) {
    fb.setDoc(fb.doc(fb.db, 'app', 'songSettings'), patch, { merge: true });
  } else {
    state.settings = Object.assign({}, state.settings, patch);
    saveLocal();
  }
}
function denySongEdit() {
  state.ui.pinError = 'This account can view songs but cannot edit this service.';
  render();
}
function requireEditor(action, target, permissionAction, permissionCheck) {
  const allowed = permissionCheck
    ? permissionCheck()
    : target
      ? canEditSongsForService(target, permissionAction || 'edit')
      : canManageSongCatalog(permissionAction || 'manage');
  if (!allowed) { denySongEdit(); return false; }
  if (editorUnlocked()) { action(); return true; }
  state.ui.pendingEditorAction = action;
  state.ui.editorGate = editorPinHash() ? 'unlock' : 'create';
  state.ui.pinError = '';
  render();
  return true;
}
function resolvePendingEditorAction() {
  const action = state.ui.pendingEditorAction;
  state.ui.pendingEditorAction = null;
  state.ui.editorGate = null;
  state.ui.pinError = '';
  if (action) action(); else render();
}
function cancelEditorGate() {
  state.ui.pendingEditorAction = null;
  state.ui.editorGate = null;
  state.ui.pinError = '';
  render();
}
function renderEditorGate() {
  if (state.ui.editorGate === 'create') {
    return '<div class="card lock-box">' +
      '<div class="lock-title">Create the editor PIN</div>' +
      '<p class="hint">No PIN exists yet. Whoever sets it first becomes the editor — afterwards it is required for marking songs sung, undo, backfill, deleting setlists, and managing presiders. Viewing never needs a PIN.</p>' +
      '<form class="add-row" data-song-act="set-editor-pin">' +
      '<input type="password" id="ep-new" placeholder="New PIN" autocomplete="off" required>' +
      '<input type="password" id="ep-confirm" placeholder="Repeat it" autocomplete="off" required>' +
      '<button class="primary" type="submit">Set PIN</button></form>' +
      (state.ui.pinError ? '<p class="pin-error">' + esc(state.ui.pinError) + '</p>' : '') +
      '<button class="linkish" data-song-act="cancel-editor-gate">Cancel</button>' +
      '</div>';
  }
  return '<div class="card lock-box">' +
    '<div class="lock-title">Editor action locked</div>' +
    '<p class="hint">Enter the editor PIN to continue.</p>' +
    '<form class="add-row" data-song-act="unlock-editor">' +
    '<input type="password" id="ep-input" placeholder="PIN" autocomplete="off" required>' +
    '<button class="primary" type="submit">Unlock</button></form>' +
    (state.ui.pinError ? '<p class="pin-error">' + esc(state.ui.pinError) + '</p>' : '') +
    '<button class="linkish" data-song-act="cancel-editor-gate">Cancel</button>' +
    '</div>';
}

/* ================= local persistence (fallback mode) ================= */

function saveLocal() {
  if (fb) return;
  localStorage.setItem(DATA_KEY, JSON.stringify({
    stats: state.stats, setlists: state.setlists, settings: state.settings, presiders: state.presiders
  }));
}
function loadLocal() {
  try {
    const obj = JSON.parse(localStorage.getItem(DATA_KEY));
    if (obj && typeof obj === 'object') {
      state.stats = obj.stats || {};
      state.setlists = obj.setlists || {};
      state.settings = obj.settings || {};
      state.presiders = Array.isArray(obj.presiders) ? obj.presiders : [];
    }
  } catch (e) { /* ignore */ }
}

/* ================= write layer (both modes) ================= */

function now() { return Date.now(); }
function whoAmI() { return state.ui.me || 'Someone'; }

function sheetSafeDeep(v) {
  if (typeof v === 'string') return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
  if (Array.isArray(v)) return v.map(sheetSafeDeep);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = sheetSafeDeep(v[k]);
    return o;
  }
  return v;
}
function pushToSheet(type, payload) {
  if (!SHEET_SYNC_URL || typeof fetch === 'undefined') return;
  try {
    fetch(SHEET_SYNC_URL, {
      method: 'POST', mode: 'no-cors', keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: type, payload: sheetSafeDeep(payload) })
    }).catch(function () {});
  } catch (e) { /* ignore */ }
}
const _mirrorVer = {};
function mirrorSeen(kind, id, ver) {
  const k = kind + ':' + id;
  if (_mirrorVer[k] === ver) return true;
  _mirrorVer[k] = ver;
  return false;
}
function statRowForSheet(songId, stat) {
  const song = state.songById[songId];
  if (!song) return null;
  return {
    number: song.number, title: song.title, category: song.category,
    timesSung: (stat && stat.timesSung) || 0, lastSung: (stat && stat.lastSung) || ''
  };
}

function stampMeta(patch) { patch.updatedAt = now(); patch.updatedBy = whoAmI(); return patch; }

/* Setlists this device created that have not come back from a Firestore
   snapshot yet. `state.setlists` is rebuilt wholesale on every snapshot, so
   without this the freshly created setlist would vanish from under the builder
   and the "+" buttons would stop appearing. */
const pendingSetlists = {};
/* id -> promise for a create still in flight, so a song added a split second
   after opening a service waits for the document to exist. */
const setlistCreates = {};

function mergePendingSetlists(map) {
  Object.keys(pendingSetlists).forEach(id => {
    if (map[id]) delete pendingSetlists[id];
    else map[id] = pendingSetlists[id];
  });
  return map;
}

/* Applied to the in-memory copy so the screen updates immediately; the
   snapshot that follows carries the same values. Mutates in place because
   callers hold references to the setlist object. */
function applyLocalSetlistPatch(id, patch) {
  const base = state.setlists[id];
  if (base) Object.assign(base, patch);
}

/* Creates the Firestore document ONLY when it is genuinely absent. This used
   to be a plain setDoc, which blanked a setlist that already had songs
   whenever the picker was opened before the first snapshot arrived. That was
   the "sometimes it doesn't save" case. */
function createSetlistIfAbsent(doc) {
  const ref = fb.doc(fb.db, 'setlists', doc.id);
  const p = fb.runTransaction(fb.db, async tx => {
    const snap = await tx.get(ref);
    if (snap.exists()) return;
    tx.set(ref, state.setlists[doc.id] || doc);
  }).catch(err => {
    console.warn('Could not create the setlist:', err);
    delete pendingSetlists[doc.id];
    alert('That service could not be opened for planning. Check your connection and try again.');
  });
  setlistCreates[doc.id] = p;
  p.then(() => { if (setlistCreates[doc.id] === p) delete setlistCreates[doc.id]; });
  return p;
}

/* Every Firestore write to a setlist goes through here: it waits for a create
   that is still in flight, falls back to writing the whole local record if the
   document is missing, and tells the presider when a change really could not
   be saved instead of failing in silence. */
function writeSetlistPatch(id, patch) {
  const run = () => fb.updateDoc(fb.doc(fb.db, 'setlists', id), patch).catch(err => {
    const base = state.setlists[id];
    if (!base) throw err;
    return fb.setDoc(fb.doc(fb.db, 'setlists', id), Object.assign({}, base, patch));
  });
  const pending = setlistCreates[id];
  return (pending ? pending.then(run) : run()).catch(err => {
    console.warn('Could not save the setlist change:', err);
    alert('That change could not be saved. Check your connection and try again.');
  });
}

function updateSetlist(id, patch, options) {
  const sl = state.setlists[id];
  if (!(options && options.internal) && (!sl || !canEditSongsForService(sl, 'edit'))) return false;
  stampMeta(patch);
  if (fb) {
    applyLocalSetlistPatch(id, patch);
    writeSetlistPatch(id, patch);
  } else {
    state.setlists[id] = Object.assign({}, state.setlists[id], patch);
    saveLocal(); render();
  }
  return true;
}
function setlistAddSong(id, songId) {
  const sl = state.setlists[id];
  if (!sl || !canEditSongsForService(sl, 'edit')) return false;
  const songs = ((sl && sl.songs) || []).concat(songId);
  if (fb) {
    const patch = stampMeta({ songs: songs });
    applyLocalSetlistPatch(id, patch);
    writeSetlistPatch(id, patch);
  } else if (sl) { sl.songs = songs; stampMeta(sl); saveLocal(); render(); }
  return true;
}
function setlistRemoveSongAt(id, index) {
  const sl = state.setlists[id];
  if (!sl || !canEditSongsForService(sl, 'edit')) return false;
  const songs = (sl.songs || []).slice();
  if (index < 0 || index >= songs.length) return false;
  const removed = songs.splice(index, 1)[0];
  const clear = {};
  if (songs.indexOf(removed) === -1) {
    if (sl.glorySong === removed) clear.glorySong = null;
    if (sl.thanksSong === removed) clear.thanksSong = null;
  }
  if (fb) {
    const patch = stampMeta(Object.assign({ songs: songs }, clear));
    applyLocalSetlistPatch(id, patch);
    writeSetlistPatch(id, patch);
    render();
  } else {
    sl.songs = songs; Object.assign(sl, clear);
    stampMeta(sl); saveLocal(); render();
  }
  return true;
}
function setlistReorder(id, songs) {
  const sl = state.setlists[id];
  if (!sl || !canEditSongsForService(sl, 'edit')) return false;
  if (fb) {
    const patch = stampMeta({ songs: songs.slice() });
    applyLocalSetlistPatch(id, patch);
    writeSetlistPatch(id, patch);
    render();
  } else { state.setlists[id].songs = songs.slice(); stampMeta(state.setlists[id]); saveLocal(); render(); }
  return true;
}

/* ================= confirmation state ================= */

/* A presider "confirms" the list once it is the one they actually want. The
   confirm write stamps confirmedAt to the same value as updatedAt, so any
   later edit (including a song added from Signal) pushes updatedAt ahead and
   the list reads as changed since it was confirmed. */
function isConfirmed(sl) {
  return !!(sl && sl.confirmedAt && sl.confirmedAt >= (sl.updatedAt || 0));
}
function changedSinceConfirmed(sl) {
  return !!(sl && sl.confirmedAt && sl.confirmedAt < (sl.updatedAt || 0));
}
function confirmSetlist(id) {
  const sl = state.setlists[id];
  if (!sl || !canEditSongsForService(sl, 'confirm') || !(sl.songs || []).length) return false;
  const patch = stampMeta({ confirmedBy: whoAmI() });
  patch.confirmedAt = patch.updatedAt;
  updateSetlist(id, patch);
  render();
  return true;
}

/* One chip that answers "have the songs been picked for this service?" It
   replaces the old Planned/Sung pill, which said "Planned" whether the service
   had 14 songs or none at all. */
function songStatus(sl) {
  const count = (sl && sl.songs || []).length;
  if (sl && sl.status === 'sung') return { cls: 'sung', label: 'Sung' };
  if (!count) return { cls: 'none', label: 'No songs yet' };
  if (isConfirmed(sl)) return { cls: 'confirmed', label: 'Confirmed' };
  if (changedSinceConfirmed(sl)) return { cls: 'planned', label: 'Changed' };
  return { cls: 'planned', label: 'Songs picked' };
}
function statusPill(sl) {
  const st = songStatus(sl);
  return '<span class="status-pill ' + st.cls + '">' + st.label + '</span>';
}

/* ================= builder helpers ================= */

function ensureSetlist(date, worshipType, serviceLabel, source) {
  const id = serviceIdFor(date, serviceLabel);
  if (!state.setlists[id]) {
    const doc = stampMeta({
      id: id, date: date, worshipType: worshipType, serviceLabel: serviceLabel,
      presider: state.ui.me || '', notes: '', songs: [], status: 'planned',
      sungAt: null, source: source || 'manual'
    });
    // Put it in memory first. The builder and the Library's "+" buttons both
    // read state.setlists, so waiting for the round trip is what used to leave
    // the presider tapping songs with nothing happening.
    state.setlists[id] = doc;
    if (fb) { pendingSetlists[id] = doc; createSetlistIfAbsent(doc); }
    else saveLocal();
  }
  return id;
}
function currentSetlist() {
  const id = state.ui.currentSetlist;
  return id ? state.setlists[id] : null;
}

/* ================= mark-as-sung / undo (write side) ================= */

async function markSetlistSung(id) {
  const local = state.setlists[id];
  if (!local || !canEditSongsForService(local, 'mark-sung')) return false;
  if (local.status === 'sung') { render(); return; }
  const by = whoAmI();
  const markedAt = now();
  if (!fb) {
    const result = applySung(state.stats, local, { by, markedAt });
    Object.keys(result.changed).forEach(sid => { state.stats[sid] = result.changed[sid]; });
    state.setlists[id] = Object.assign({}, local, { status: 'sung', sungAt: markedAt, updatedAt: markedAt, updatedBy: by });
    saveLocal(); render(); return true;
  }
  try {
    await fb.runTransaction(fb.db, async tx => {
      const slRef = fb.doc(fb.db, 'setlists', id);
      const fresh = await tx.get(slRef);
      if (!fresh.exists()) return;
      const setlist = fresh.data();
      if (setlist.status === 'sung') return;
      const refs = {}; const statsMap = {};
      for (const sid of (setlist.songs || [])) {
        if (refs[sid]) continue;
        const ref = fb.doc(fb.db, 'songStats', sid);
        refs[sid] = ref;
        const snap = await tx.get(ref);
        if (snap.exists()) statsMap[sid] = snap.data();
      }
      const result = applySung(statsMap, setlist, { by, markedAt });
      Object.keys(result.changed).forEach(sid => { tx.set(refs[sid], result.changed[sid]); });
      tx.update(slRef, { status: 'sung', sungAt: markedAt, updatedAt: markedAt, updatedBy: by });
    });
  } catch (err) {
    console.warn('markSetlistSung failed:', err);
    alert('Could not mark as sung. Check your connection and try again.');
  }
  return true;
}
async function undoSetlistSung(id) {
  const local = state.setlists[id];
  if (!local || !canEditSongsForService(local, 'undo-sung')) return false;
  if (!fb) {
    const result = applyUndo(state.stats, local);
    Object.keys(result.changed).forEach(sid => { state.stats[sid] = result.changed[sid]; });
    result.removed.forEach(sid => { delete state.stats[sid]; });
    state.setlists[id] = Object.assign({}, local, { status: 'planned', sungAt: null, updatedAt: now(), updatedBy: whoAmI() });
    saveLocal(); render(); return true;
  }
  const undoneAt = now(); const by = whoAmI();
  try {
    await fb.runTransaction(fb.db, async tx => {
      const slRef = fb.doc(fb.db, 'setlists', id);
      const fresh = await tx.get(slRef);
      if (!fresh.exists()) return;
      const setlist = fresh.data();
      const refs = {}; const statsMap = {};
      for (const sid of (setlist.songs || [])) {
        if (refs[sid]) continue;
        const ref = fb.doc(fb.db, 'songStats', sid);
        refs[sid] = ref;
        const snap = await tx.get(ref);
        if (snap.exists()) statsMap[sid] = snap.data();
      }
      const result = applyUndo(statsMap, setlist);
      Object.keys(result.changed).forEach(sid => tx.set(refs[sid], result.changed[sid]));
      result.removed.forEach(sid => tx.delete(refs[sid]));
      tx.update(slRef, { status: 'planned', sungAt: null, updatedAt: undoneAt, updatedBy: by });
    });
  } catch (err) {
    console.warn('undoSetlistSung failed:', err);
    alert('Could not undo. Check your connection and try again.');
  }
  return true;
}

/* ================= presiders ================= */

const TITLE_RANK = { 'P.': 0, 'E.': 1, 'M.': 2, 'D.': 3, 'B.': 4, 'S.': 4 };
function titleRank(name) {
  const m = String(name || '').match(/^([A-Z]\.)\s/);
  const r = m ? TITLE_RANK[m[1]] : undefined;
  return r == null ? 5 : r;
}
function nameAfterTitle(name) { return String(name || '').replace(/^[A-Z]\.\s*/, ''); }
function canonName(n) { return (state.nameMap && state.nameMap[n]) || NAME_UNIFY_MAP[n] || n; }

function presiderNames() {
  const set = {};
  state.schedule.forEach(s => { const p = s.assignments && s.assignments.Presider; if (p) set[canonName(p)] = true; });
  (state.presiders || []).forEach(n => { if (n) set[canonName(n)] = true; });
  return Object.keys(set).sort((a, b) => {
    const ra = titleRank(a), rb = titleRank(b);
    if (ra !== rb) return ra - rb;
    return nameAfterTitle(a).localeCompare(nameAfterTitle(b));
  });
}
function myUpcomingSchedule() {
  const me = state.ui.me;
  if (!me) return [];
  const t = todayISO();
  return state.schedule
    .filter(s => s.assignments && canonName(s.assignments.Presider) === canonName(me) && s.date >= t)
    .sort((a, b) => a.date.localeCompare(b.date));
}
function nextDutyForMe() { return myUpcomingSchedule()[0] || null; }

/* ================= song authorization ================= */

/* The host owns identity and authorization. A Worship leader is not a song
   editor unless the host explicitly grants song access. B. Anthony remains the
   named application administrator fallback while the authenticated host loads
   its permission data. */

function authSources() {
  const sources = [ctx, ctx && ctx.permissions, ctx && ctx.authorization,
    ctx && ctx.authz, ctx && ctx.user, ctx && ctx.account];
  return sources.filter(s => s && typeof s === 'object');
}

function roleTokens(source) {
  if (!source || typeof source !== 'object') return [];
  const values = [];
  ['role', 'roles', 'permissions', 'permissionGroups', 'groups', 'department', 'departmentRole'].forEach(key => {
    const value = source[key];
    if (Array.isArray(value)) values.push.apply(values, value);
    else if (typeof value === 'string') values.push(value);
  });
  return values.map(value => String(value).trim().toLowerCase().replace(/[ _]+/g, '-'));
}

function hasBooleanPermission(keys) {
  return authSources().some(source => keys.some(key => source[key] === true));
}

function hasRolePermission(roles) {
  const wanted = roles.map(role => String(role).toLowerCase().replace(/[ _]+/g, '-'));
  return authSources().some(source => roleTokens(source).some(role => wanted.indexOf(role) !== -1));
}

function isHostAdmin() {
  return hasBooleanPermission(['isAdmin', 'admin', 'allAccess', 'canAdminister', 'isWorshipAdmin',
    'canManagePresiders', 'canManageWorship', 'canAdministerWorship']) ||
    hasRolePermission(['admin', 'administrator', 'all-access', 'all', 'worship-admin', 'worship-administrator']);
}

function isHostSongEditor() {
  return hasBooleanPermission([
    'isSongEditor', 'songEditor', 'choirSongEditor', 'choirSongEditorAccess',
    'canEditSongs', 'canEditSong', 'canEditSongService', 'canEditSongsForService'
  ]) || hasRolePermission([
    'song-editor', 'songeditor', 'choir-song-editor', 'choir-songeditor', 'choirsongeditor',
    'choir-song-editor-access'
  ]);
}

/* A host callback can enforce a richer permission matrix or a forced-PIN
   boundary. A callback that returns false is authoritative and must not be
   widened by the local fallback checks below. */
function hostSongAuthorization(service, action) {
  const candidates = [];
  const add = (owner, key) => {
    if (owner && typeof owner[key] === 'function') candidates.push({ owner, fn: owner[key] });
  };
  add(ctx, 'canEditSongService');
  add(ctx, 'canEditSongsForService');
  add(ctx, 'authorizeSongAction');
  add(ctx && ctx.permissions, 'canEditSongService');
  add(ctx && ctx.permissions, 'canEditSongsForService');
  add(ctx && ctx.permissions, 'authorizeSongAction');
  add(ctx && ctx.authz, 'canEditSongService');
  add(ctx && ctx.authz, 'canEditSongsForService');
  add(ctx && ctx.authz, 'authorizeSongAction');
  if (!candidates.length) return null;
  for (const candidate of candidates) {
    try {
      const result = candidate.fn.call(candidate.owner, service, action, state.ui.me);
      if (typeof result === 'boolean') return result;
      if (result && typeof result.allowed === 'boolean') return !!result.allowed;
    } catch (err) {
      console.warn('Song authorization callback failed:', err);
      return false;
    }
  }
  return false;
}

function songServiceRecord(target) {
  const source = target || {};
  const id = source.id || source.serviceId || '';
  const schedule = source.schedule || (id ? scheduleFor(id) : null);
  const record = Object.assign({}, schedule || {}, source);
  const assignments = record.assignments || (schedule && schedule.assignments) || {};
  record.assignments = assignments;
  record.id = id || record.id || '';
  record.date = record.date || (schedule && schedule.date) || '';
  record.service = record.service || record.serviceLabel || (schedule && schedule.service) || '';
  record.worship = record.worship || record.worshipType || (schedule && schedule.worship) || '';
  record.presider = record.presider || assignments.Presider || '';
  return record;
}

function presiderForService(target) {
  const record = songServiceRecord(target);
  const schedule = record.id ? scheduleFor(record.id) : null;
  return (schedule && schedule.assignments && schedule.assignments.Presider) ||
    record.presider || (record.assignments && record.assignments.Presider) || '';
}

function isMyPresiderService(target) {
  const me = canonName(state.ui.me || (ctx && ctx.me) || '');
  const presider = canonName(presiderForService(target));
  return !!(me && presider && me === presider);
}

function canEditSongsForService(target, action) {
  const record = songServiceRecord(target);
  if (!record.date && !record.service && !record.id) return false;
  const hostResult = hostSongAuthorization(record, action || 'edit');
  if (hostResult !== null) return hostResult;

  /* Assigned Presider access is service-scoped, not a general Worship role. */
  if (isMyPresiderService(record)) return true;
  if (isHostAdmin() || isHostSongEditor()) return true;

  const me = canonName(state.ui.me || (ctx && ctx.me) || '');
  if (me === 'B. Anthony') return true;
  return false;
}

function canCreateSongSetlist() {
  const hostResult = hostSongAuthorization({ scope: 'new-setlist', date: todayISO(), service: SERVICE_LABELS[0] }, 'create');
  if (hostResult !== null) return hostResult;
  if (isHostAdmin() || isHostSongEditor()) return true;
  const me = canonName(state.ui.me || (ctx && ctx.me) || '');
  if (me === 'B. Anthony') return true;
  return false;
}

function canManageSongCatalog(action) {
  const target = { scope: 'song-catalog', id: 'song-catalog' };
  const hostResult = hostSongAuthorization(target, action || 'manage');
  if (hostResult !== null) return hostResult;
  if (isHostAdmin() || isHostSongEditor()) return true;
  const me = canonName(state.ui.me || (ctx && ctx.me) || '');
  return me === 'B. Anthony';
}

/* Presider-list management is a Worship administration action, not a song
   editor action. Keep it on its own host hook so Choir Song Editors cannot
   inherit the broader management surface. */
function hostAdminAuthorization(action) {
  const candidates = [];
  const add = (owner, key) => {
    if (owner && typeof owner[key] === 'function') candidates.push({ owner, fn: owner[key] });
  };
  const keys = ['canManagePresiders', 'canManageWorship', 'canAdministerWorship',
    'authorizeWorshipAction', 'authorizeAdminAction'];
  const owners = [ctx, ctx && ctx.permissions, ctx && ctx.authz];
  owners.forEach(owner => keys.forEach(key => add(owner, key)));
  if (!candidates.length) return null;
  const target = { scope: 'presider-management', id: 'presider-management' };
  for (const candidate of candidates) {
    try {
      const result = candidate.fn.call(candidate.owner, target, action || 'manage', state.ui.me);
      if (typeof result === 'boolean') return result;
      if (result && typeof result.allowed === 'boolean') return !!result.allowed;
    } catch (err) {
      console.warn('Worship authorization callback failed:', err);
      return false;
    }
  }
  return false;
}

function canManagePresiders(action) {
  const hostResult = hostAdminAuthorization(action || 'manage');
  if (hostResult !== null) return hostResult;
  if (isHostAdmin()) return true;
  const me = canonName(state.ui.me || (ctx && ctx.me) || '');
  return me === 'B. Anthony';
}

function canEditCurrentSetlist() {
  const sl = currentSetlist();
  return !!sl && canEditSongsForService(sl, 'edit');
}

function findScheduleEntry(scheduleArr, serviceId) {
  return (scheduleArr || []).find(s => s.date && s.service && serviceIdFor(s.date, s.service) === serviceId) || null;
}
function scheduleFor(serviceId) { return findScheduleEntry(state.schedule, serviceId); }

function serviceOrder(worship, serviceLabel, assignments, songNotes) {
  const a = assignments || {};
  const n = songNotes || {};
  const steps = [
    { step: 'Glory song', note: n.glory || 'stand & sing' },
    { step: 'Opening prayer', who: a.Sermon || '' }
  ];
  if (worship === 'Sabbath Day' && serviceLabel === 'Morning') {
    steps.push({ step: 'Thanks song', note: n.thanks || '' });
    steps.push({ step: 'Prayer of thanks', who: a['Prayer of Thanks'] || '' });
  }
  steps.push({ step: 'Choir song', note: n.choir || '' });
  steps.push({ step: 'Sermon', who: a.Sermon || '' });
  steps.push({ step: 'Closing prayer', who: a['Closing Prayer'] || '' });
  return steps;
}
function songLabel(sid) {
  const s = sid && state.songById[sid];
  return s ? '#' + s.number + ' ' + s.title : '';
}
function choirLabel(c) {
  if (!c) return '';
  const s = state.songById[c];
  return s ? '#' + s.number + ' ' + s.title : String(c);
}
function dispNumber(song) {
  const n = (song && song.number) || '';
  const m = /^Appx\.?\s*(\d+)/i.exec(n);
  return m ? 'A' + m[1] : n;
}
function prepSongIds(sl) {
  if (!sl) return [];
  return (sl.songs || []).filter(id => id !== sl.glorySong && id !== sl.thanksSong);
}
function renderOrderOfWorship(sl, sched) {
  if (!sched) return '';
  const worship = (sl && sl.worshipType) || sched.worship;
  const label = (sl && sl.serviceLabel) || sched.service;
  let html = '<div class="order-list">';
  const prep = prepSongIds(sl);
  if (prep.length) {
    html += '<div class="order-head">Preparation songs</div>' +
      prep.map(id => {
        const song = state.songById[id];
        if (!song) return '';
        return '<div class="order-step"><span class="n tnum">' + esc(dispNumber(song)) + '</span>' +
          '<span class="s">' + esc(song.title) + '</span>' +
          '<span class="who tnum prep-dur">' + fmtDur(song.durationSec) + '</span></div>';
      }).join('') +
      '<div class="order-sep"></div>';
  }
  html += '<div class="order-head">Order of worship</div>';
  const steps = serviceOrder(worship, label, sched.assignments,
    { glory: songLabel(sl && sl.glorySong), thanks: songLabel(sl && sl.thanksSong), choir: choirLabel(sched.choirSong) });
  html += steps.map((s, i) =>
    '<div class="order-step"><span class="n tnum">' + (i + 1) + '</span>' +
    '<span class="s">' + esc(s.step) +
      (s.note ? '<span class="note"> · ' + esc(s.note) + '</span>' : '') + '</span>' +
    ('who' in s ? '<span class="who">' + (s.who ? esc(s.who) : '&mdash;') + '</span>' : '') +
    '</div>'
  ).join('');
  return html + '</div>';
}

function maybeSyncPresiderSchedule() {
  if (state._setlistsLoaded && state._scheduleLoaded && state.ui.me) syncPresiderSchedule();
}
function syncPresiderSchedule() {
  if (!fb) return;
  const me = state.ui.me;
  if (!me) return;
  const t = todayISO();
  state.schedule
    .filter(s => s.assignments && canonName(s.assignments.Presider) === canonName(me) && s.date >= t)
    .forEach(s => {
      const label = s.service;
      if (!label) return;
      const id = serviceIdFor(s.date, label);
      const existed = !!state.setlists[id];
      ensureSetlist(s.date, s.worship || WORSHIP_TYPES[0], label);
      if (!existed) updateSetlist(id, { presider: me, source: 'schedule' }, { internal: true });
      else { const sl = state.setlists[id]; if (sl && sl.presider !== me) updateSetlist(id, { presider: me }, { internal: true }); }
    });
}
function addPresider(name) {
  if (!canManagePresiders('manage')) return false;
  name = String(name || '').trim();
  if (!name) return false;
  if (state.presiders.indexOf(name) !== -1) return false;
  if (fb) fb.setDoc(fb.doc(fb.db, 'app', 'presiders'), { names: fb.arrayUnion(name) }, { merge: true });
  else { state.presiders.push(name); state.presiders.sort(); saveLocal(); render(); }
  return true;
}
function removePresider(name) {
  if (!canManagePresiders('manage')) return false;
  if (fb) fb.setDoc(fb.doc(fb.db, 'app', 'presiders'), { names: fb.arrayRemove(name) }, { merge: true });
  else { state.presiders = state.presiders.filter(n => n !== name); saveLocal(); render(); }
  return true;
}

async function deleteSetlistById(id) {
  if (!state.setlists[id] || !canEditSongsForService(state.setlists[id], 'delete')) return false;
  if (fb) {
    try { await fb.deleteDoc(fb.doc(fb.db, 'setlists', id)); }
    catch (err) { console.warn('deleteSetlistById failed:', err); alert('Could not delete. Check your connection and try again.'); }
  } else {
    delete state.setlists[id];
    if (state.ui.currentSetlist === id) state.ui.currentSetlist = null;
    saveLocal(); render();
  }
  return true;
}

/* ================= backfill (editor-gated) ================= */

async function backfillSong(songId, date) {
  if (!canManageSongCatalog('backfill')) return false;
  const by = whoAmI() || 'Backfill';
  const markedAt = now();
  if (!fb) {
    const doc = applyBackfill(state.stats, songId, date, { by, markedAt });
    if (doc) { state.stats[songId] = doc; saveLocal(); }
    render(); return true;
  }
  try {
    let statsMap = {};
    if (state.stats[songId]) statsMap[songId] = state.stats[songId];
    else { const snap = await fb.getDoc(fb.doc(fb.db, 'songStats', songId)); if (snap.exists()) statsMap[songId] = snap.data(); }
    const doc = applyBackfill(statsMap, songId, date, { by, markedAt });
    if (doc) await fb.setDoc(fb.doc(fb.db, 'songStats', songId), doc, { merge: true });
  } catch (err) {
    console.warn('backfillSong failed:', err);
    alert('Could not save the backfill entry. Check your connection and try again.');
  }
  return true;
}
async function removeHistoryEntryById(songId, service) {
  if (!canManageSongCatalog('remove-history')) return false;
  if (!fb) {
    const r = removeHistoryEntry(state.stats, songId, service);
    if (r.removed) delete state.stats[songId];
    else if (r.changed) state.stats[songId] = r.changed;
    saveLocal(); render(); return true;
  }
  try {
    let statsMap = {};
    if (state.stats[songId]) statsMap[songId] = state.stats[songId];
    else { const snap = await fb.getDoc(fb.doc(fb.db, 'songStats', songId)); if (snap.exists()) statsMap[songId] = snap.data(); }
    const r = removeHistoryEntry(statsMap, songId, service);
    if (r.removed) await fb.deleteDoc(fb.doc(fb.db, 'songStats', songId));
    else if (r.changed) await fb.setDoc(fb.doc(fb.db, 'songStats', songId), r.changed);
  } catch (err) {
    console.warn('removeHistoryEntryById failed:', err);
    alert('Could not remove that entry. Check your connection and try again.');
  }
  return true;
}

/* ================= derived stats ================= */

function statFor(songId) {
  return state.stats[songId] || { songId: songId, timesSung: 0, lastSung: null, history: [] };
}

/* ================= sorting / filtering catalog ================= */

function filteredSongs() {
  const q = state.ui.search.trim().toLowerCase();
  const cat = state.ui.category;
  let list = state.songs.filter(s => {
    if (cat === 'Appendix') { if (!s.id.startsWith('appx-')) return false; }
    else if (cat !== 'All' && s.category !== cat) return false;
    if (!q) return true;
    return s.title.toLowerCase().indexOf(q) !== -1 || String(s.number).toLowerCase().indexOf(q) !== -1;
  });
  const sort = state.ui.sort;
  list = list.slice().sort((a, b) => {
    const sa = statFor(a.id), sb = statFor(b.id);
    if (sort === 'times') { if (sb.timesSung !== sa.timesSung) return sb.timesSung - sa.timesSung; }
    else if (sort === 'last') { const da = daysSince(sa.lastSung), db = daysSince(sb.lastSung); if (da !== db) return db - da; }
    else if (sort === 'duration') { if (b.durationSec !== a.durationSec) return b.durationSec - a.durationSec; }
    return String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
  });
  return list;
}

const LIB_PAGE_SIZE = 100;
function paginateSongs(list) {
  const appendix = list.filter(s => s.id.startsWith('appx-'));
  const numbered = list.filter(s => !s.id.startsWith('appx-'));
  const pages = [];
  for (let i = 0; i < numbered.length; i += LIB_PAGE_SIZE) {
    const chunk = numbered.slice(i, i + LIB_PAGE_SIZE);
    const first = chunk[0].number, last = chunk[chunk.length - 1].number;
    pages.push({ label: String(first) + '–' + String(last), songs: chunk });
  }
  if (appendix.length) pages.push({ label: 'Appendix', songs: appendix });
  if (!pages.length) pages.push({ label: '', songs: [] });
  return pages;
}

/* The catalog shows one 100-song group at a time, and scrolling to the bottom
   APPENDS the next group in place. It used to replace the list and jump the
   page back up to the search controls, which is what made scrolling the song
   list feel like it was fighting back. */
const RANGE_DASH = '\u2013';
function lastShownPage(pages) {
  return Math.max(0, Math.min(state.ui.libPage + (state.ui.libMore || 0), pages.length - 1));
}
function visibleSongs(pages) {
  let out = [];
  for (let i = state.ui.libPage; i <= lastShownPage(pages); i++) out = out.concat(pages[i].songs);
  return out;
}
/* Jumping to a group is a deliberate tap, so it does scroll back to the top of
   the list. Scrolling itself never moves the page under you any more. */
function goToLibPage(n) {
  const pages = paginateSongs(filteredSongs());
  n = Math.max(0, Math.min(n, pages.length - 1));
  if (n === state.ui.libPage && !state.ui.libMore) return;
  state.ui.libPage = n;
  state.ui.libMore = 0;
  const anchor = root && root.querySelector('.lib-controls');
  if (anchor) {
    const top = anchor.getBoundingClientRect().top + window.scrollY - 8;
    window.scrollTo({ top: top, behavior: 'auto' });
  }
  render();
}
function pagerLabel(pages, cur, last, shown) {
  if (cur === last) return pages[cur].label;
  const first = String(pages[cur].label).split(RANGE_DASH)[0];
  const tail = shown.length ? dispNumber(shown[shown.length - 1]) : String(pages[last].label);
  return first + RANGE_DASH + tail;
}
function renderLibPager(pages, cur, last, shown) {
  if (pages.length <= 1) return '<div class="lib-pager" hidden></div>';
  const dots = pages.map((p, i) =>
    '<button class="pg-dot' + (i >= cur && i <= last ? ' active' : '') + '" data-song-act="lib-page" data-page="' + i + '" ' +
    'aria-label="Group ' + esc(p.label) + '"></button>').join('');
  const prevDis = cur <= 0 ? ' disabled' : '';
  const nextDis = last >= pages.length - 1 ? ' disabled' : '';
  return '<div class="lib-pager">' +
    '<button class="pg-arrow" data-song-act="lib-page" data-page="' + (cur - 1) + '"' + prevDis + ' aria-label="Previous group">\u2039</button>' +
    '<span class="pg-label">' + esc(pagerLabel(pages, cur, last, shown)) + '</span>' +
    '<div class="pg-dots">' + dots + '</div>' +
    '<button class="pg-arrow" data-song-act="lib-page" data-page="' + (last + 1) + '"' + nextDis + ' aria-label="Next group">\u203a</button>' +
    '</div>';
}
/* Visible fallback for the scroll sentinel: a tap always works, even where
   IntersectionObserver never fires. */
function renderLibMore(pages) {
  const last = lastShownPage(pages);
  if (last >= pages.length - 1) return '<div class="lib-more" hidden></div>';
  return '<div class="lib-more"><button class="ghost sm" data-song-act="lib-more">Show the next ' +
    pages[last + 1].songs.length + ' songs</button></div>';
}
/* Appends the next group to the list already on screen. Nothing above the
   insertion point is touched, so the scroll position stays exactly where the
   presider left it. */
function appendNextLibGroup() {
  if (state.ui.tab !== 'library' || !root) return false;
  const pages = paginateSongs(filteredSongs());
  const last = lastShownPage(pages);
  if (last >= pages.length - 1) return false;
  state.ui.libMore = (state.ui.libMore || 0) + 1;
  const listEl = root.querySelector('.song-list');
  if (listEl) listEl.insertAdjacentHTML('beforeend', pages[last + 1].songs.map(renderSongRow).join(''));
  const shown = visibleSongs(pages);
  const pagerEl = root.querySelector('.lib-pager');
  if (pagerEl) pagerEl.outerHTML = renderLibPager(pages, state.ui.libPage, last + 1, shown);
  const moreEl = root.querySelector('.lib-more');
  if (moreEl) moreEl.outerHTML = renderLibMore(pages);
  setupLibPaging();
  return true;
}
let libObserver = null;
function setupLibPaging() {
  if (libObserver) { libObserver.disconnect(); libObserver = null; }
  if (state.ui.tab !== 'library' || !root) return;
  const sentinel = root.querySelector('.lib-sentinel');
  if (!sentinel || typeof IntersectionObserver === 'undefined') return;
  const pages = paginateSongs(filteredSongs());
  if (lastShownPage(pages) >= pages.length - 1) return;
  libObserver = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) {
      if (libObserver) { libObserver.disconnect(); libObserver = null; }
      appendNextLibGroup();
    }
  }, { threshold: 0.1 });
  libObserver.observe(sentinel);
}
function categoriesInSeed() {
  const seen = {}; const order = [];
  state.songs.forEach(s => { if (!seen[s.category]) { seen[s.category] = true; order.push(s.category); } });
  return order;
}

/* ================= setlist queries ================= */

function allSetlists() { return Object.keys(state.setlists).map(k => state.setlists[k]); }
function sortedSetlists() { return allSetlists().slice().sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id)); }
function pastSetlists() {
  const t = todayISO();
  return sortedSetlists().filter(s => s.status === 'sung' || s.date < t).reverse();
}

/* ================= rendering ================= */

/** Don't wipe a focused input inside the picker when a background Firestore
    snapshot triggers a re-render — mirrors the host's viewHasFocusedInput. */
function rootHasFocusedInput() {
  const a = document.activeElement;
  if (!a || !root || !root.contains(a)) return false;
  if (a.tagName === 'TEXTAREA') return true;
  if (a.tagName !== 'INPUT') return false;
  const t = (a.getAttribute('type') || 'text').toLowerCase();
  return ['text', 'search', 'url', 'password', 'number', 'email', 'tel', 'date', 'time'].indexOf(t) !== -1;
}

function renderHeader() {
  const next = nextDutyForMe();
  const nextTxt = next ? 'Next: ' + fmtDate(next.date) + (next.service ? ' · ' + next.service : '') : '';
  return '<div class="ns-head">' +
    '<span class="ns-role">Presider</span>' +
    '<span class="ns-name">' + esc(state.ui.me || '') + '</span>' +
    (nextTxt ? '<span class="ns-next">' + esc(nextTxt) + '</span>' : '') +
    '</div>';
}
function renderTabs() {
  const labels = { home: 'Home', library: 'Library', insights: 'Insights' };
  return '<nav class="ns-tabs" role="tablist" aria-label="Song picker sections">' +
    TAB_ORDER.map(t => {
      const on = state.ui.tab === t;
      return '<button data-song-act="tab" data-tab="' + t + '" role="tab" aria-selected="' + (on ? 'true' : 'false') + '"' +
        (on ? ' class="active"' : '') + '>' + labels[t] + '</button>';
    }).join('') + '</nav>';
}
function renderTabBody() {
  switch (state.ui.tab) {
    case 'home': return renderHome();
    case 'library': return renderLibrary();
    case 'insights': return renderInsights();
    /* Old persisted state or a stale deep link may still name Services. Home
       now owns that content, so keep the route usable without a fourth tab. */
    case 'services': state.ui.tab = 'home'; return renderHome();
    default: return renderHome();
  }
}

function render() {
  if (!root) return;
  if (rootHasFocusedInput()) return;
  if (state.ui.tab === 'services') state.ui.tab = 'home';
  if (state.ui.editorGate) { root.innerHTML = renderHeader() + '<div class="ns-view">' + renderEditorGate() + '</div>'; return; }
  if (state.ui.runsheet) { root.innerHTML = '<div class="ns-view">' + renderRunsheet() + '</div>'; return; }
  root.innerHTML = renderHeader() + renderTabs() + '<div class="ns-view">' + renderTabBody() + '</div>';
  if (state.ui.tab === 'library') setupLibPaging();
}

function setSyncPill() { /* no-op in the merged app; the host owns the sync indicator */ }

/* ---------- Library ---------- */

function renderLibrary() {
  const cats = ['All', 'Appendix'].concat(categoriesInSeed());
  const pills = cats.map(c =>
    '<button class="cat-pill' + (state.ui.category === c ? ' active' : '') + '" ' +
    'data-song-act="set-category" data-cat="' + esc(c) + '">' + esc(c) + '</button>'
  ).join('');
  const sortOpts = SORTS.map(s =>
    '<option value="' + s[0] + '"' + (state.ui.sort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'
  ).join('');
  const list = filteredSongs();
  const pages = paginateSongs(list);
  state.ui.libPage = Math.max(0, Math.min(state.ui.libPage, pages.length - 1));
  const last = lastShownPage(pages);
  const shown = visibleSongs(pages);
  const rows = shown.map(renderSongRow).join('') || '<div class="empty">No songs match your search.</div>';
  return renderBuilder() +
    '<div class="lib-controls">' +
      '<input type="search" id="lib-search" data-song-chg="search" placeholder="Search title or number" ' +
        'value="' + esc(state.ui.search) + '" autocomplete="off">' +
      '<div class="cat-row">' + pills + '</div>' +
      '<div class="sort-row"><label for="lib-sort">Sort</label>' +
        '<select id="lib-sort" data-song-chg="sort">' + sortOpts + '</select>' +
        '<span class="lib-count">' + list.length + ' song' + (list.length === 1 ? '' : 's') + '</span>' +
      '</div>' +
    '</div>' +
    renderLibPager(pages, state.ui.libPage, last, shown) +
    '<div class="song-list">' + rows + '</div>' +
    '<div class="lib-sentinel" aria-hidden="true"></div>' +
    renderLibMore(pages);
}
function renderSongRow(song) {
  const st = statFor(song.id);
  const expanded = state.ui.expandedSong === song.id;
  const timesLabel = st.timesSung + '×';
  let qadd = '';
  const cur = currentSetlist();
  if (cur && canEditCurrentSetlist()) {
    const count = (cur.songs || []).filter(s => s === song.id).length;
    const seen = daysSince(st.lastSung) <= RECENT_WARN_DAYS;
    const badge = count ? '<span class="qadd-n">' + count + '</span>' : '';
    qadd = '<button class="qadd' + (count ? ' in' : '') + (seen ? ' seen' : '') + '" ' +
      'data-song-act="quick-add" data-id="' + esc(song.id) + '" aria-label="Add to setlist">+' + badge + '</button>';
  }
  let html = '<div class="song-row' + (expanded ? ' open' : '') + '" data-song-act="toggle-song" data-id="' + esc(song.id) + '" ' +
    'role="button" tabindex="0" aria-expanded="' + (expanded ? 'true' : 'false') + '">' +
    '<span class="num">' + esc(dispNumber(song)) + '</span>' +
    '<span class="dot-c" title="' + esc(song.category) + '" style="background:' + catColor(song.category) + '"></span>' +
    '<span class="s-main"><span class="s-title">' + esc(song.title) + '</span>' +
      '<span class="sr-only"> · ' + esc(song.category) + '</span></span>' +
    '<span class="s-dur tnum">' + fmtDur(song.durationSec) + '</span>' +
    '<span class="s-times tnum">' + timesLabel + '</span>' +
    qadd +
    '</div>';
  if (expanded) html += renderSongDetail(song, st);
  return html;
}
function renderSongDetail(song, st) {
  let hist = '';
  if (st.history && st.history.length) {
    const items = st.history.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(h => {
      const sl = state.setlists[h.service];
      const label = sl ? (sl.worshipType + ' · ' + sl.serviceLabel) : (h.backfilled ? 'Backfilled' : h.service);
      return '<div class="hist-item"><span class="t tnum">' + esc(fmtDate(h.date)) + '</span>' +
        '<span>' + esc(label) + (h.backfilled ? ' <span class="warn-chip" style="margin-left:6px">backfilled</span>' : '') + '</span>' +
        '<button class="linkish hist-rm" data-song-act="remove-history" data-id="' + esc(song.id) + '" data-service="' + esc(h.service) + '">remove</button>' +
        '</div>';
    }).join('');
    hist = '<div class="hist-list">' + items + '</div>';
  } else {
    hist = '<div class="hist-none">Not sung yet.</div>';
  }
  let warn = '';
  const d = daysSince(st.lastSung);
  if (d <= RECENT_WARN_DAYS) warn = '<span class="warn-chip">sung ' + esc(relTime(st.lastSung)) + '</span>';
  const cur = currentSetlist();
  const count = cur ? (cur.songs || []).filter(s => s === song.id).length : 0;
  let addBtn;
  if (!cur) {
    addBtn = canCreateSongSetlist()
      ? '<button class="primary sm" data-song-act="add-to-setlist" data-id="' + esc(song.id) + '">Add to setlist</button>' + warn
      : '<span class="hint">Choose an assigned Presider service from Home to edit songs.</span>';
  } else if (!canEditCurrentSetlist()) {
    addBtn = '<span class="hint">View only. The assigned Presider or a song editor can change this setlist.</span>';
  } else if (count) {
    addBtn = '<button class="primary sm" data-song-act="add-to-setlist" data-id="' + esc(song.id) + '">Add again</button>' +
      '<span class="in-set">' + count + '× in current setlist</span>';
  } else {
    addBtn = '<button class="primary sm" data-song-act="add-to-setlist" data-id="' + esc(song.id) + '">Add to setlist</button>' + warn;
  }
  return '<div class="song-detail">' +
    '<div class="s-cat">' + esc(song.category) + '</div>' + hist +
    '<div class="detail-actions">' + addBtn +
    '<button class="ghost sm" data-song-act="backfill-this" data-id="' + esc(song.id) + '">Backfill a past date</button>' +
    '</div></div>';
}

/* ---------- Builder ---------- */

function renderHelpCard() {
  if (state.ui.helpDismissed) return '';
  return '<div class="banner">' +
    '<span><b>New here?</b> Start a setlist up top &rarr; add songs from the <b>Library</b> below &rarr; watch the total time build up &rarr; ' +
    'after the service, tap <b>Mark as sung</b> on the service card in <b>Home</b>.</span>' +
    '<button class="x" data-song-act="dismiss-help" aria-label="Dismiss">&times;</button>' +
    '</div>';
}

function renderReadOnlyBuilder(sl) {
  const sched = scheduleFor(sl.id);
  const songs = sl.songs || [];
  let html = '<div class="card readonly-builder">' +
    '<div class="card-head"><span class="svc-title">' + esc(sl.worshipType || (sched && sched.worship) || '') +
      ' <small>· ' + esc(sl.serviceLabel || (sched && sched.service) || '') + '</small></span>' +
      statusPill(sl) + '</div>' +
    '<div class="svc-meta"><span>' + esc(fmtDate(sl.date || (sched && sched.date))) + '</span>' +
      (sl.presider || (sched && sched.assignments && sched.assignments.Presider)
        ? '<span>Presider: ' + esc(sl.presider || sched.assignments.Presider) + '</span>' : '') + '</div>' +
    '<p class="hint">View only. The assigned Presider, a Choir Song Editor, or B. Anthony can change songs for this service.</p>';
  if (sched) html += renderOrderOfWorship(sl, sched);
  else if (songs.length) {
    html += '<div class="svc-songs">' + songs.map(sid => {
      const song = state.songById[sid];
      if (!song) return '';
      return '<div class="svc-song"><span class="num">' + esc(dispNumber(song)) + '</span>' +
        '<span class="s-title">' + esc(song.title) + '</span>' +
        '<span class="s-dur tnum">' + fmtDur(song.durationSec) + '</span></div>';
    }).join('') + '</div>';
  } else html += '<div class="hist-none">No songs in this setlist.</div>';
  return html + '<div class="detail-actions"><button class="linkish" data-song-act="go-home">Back to Home</button></div></div>';
}

function renderBuilder() {
  const sl = currentSetlist();
  const mine = myUpcomingSchedule();
  let html = renderHelpCard();
  if (!sl) {
    html += '<div class="card"><div class="card-head"><span class="svc-title">Your service</span></div>';
    if (mine.length) {
      const svcOpts = '<option value="">— Choose your service —</option>' +
        mine.map(e => '<option value="' + esc(serviceIdFor(e.date, e.service)) + '">' +
          esc(fmtDate(e.date)) + ' · ' + esc(e.worship || '') + ' · ' + esc(e.service) + '</option>').join('');
      html += '<label class="sr-only" for="b-service">Choose your service</label>' +
        '<select id="b-service" data-song-chg="b-service">' + svcOpts + '</select>' +
        '<p class="hint">Pick one of your scheduled services, then add songs from the Library below.</p>';
    } else {
      html += '<p class="hint">You have no upcoming services on the schedule.</p>';
    }
    if (state.ui.manualService && canCreateSongSetlist()) {
      const worshipOpts = WORSHIP_TYPES.map(w => '<option>' + esc(w) + '</option>').join('');
      const labelOpts = SERVICE_LABELS.map(l => '<option>' + esc(l) + '</option>').join('');
      html += '<div class="svc-grid" style="margin-top:10px">' +
        '<input type="date" id="b-date" aria-label="Service date" value="' + esc(todayISO()) + '">' +
        '<select id="b-worship" aria-label="Worship type">' + worshipOpts + '</select>' +
        '<select id="b-label" aria-label="Service time label">' + labelOpts + '</select></div>' +
        '<button class="primary" data-song-act="start-setlist">Start this setlist</button>';
    } else if (canCreateSongSetlist()) {
      html += '<button class="linkish" data-song-act="manual-service" style="margin-top:4px">Build for another date&hellip;</button>';
    }
    html += '</div>';
    return html;
  }
  if (!canEditSongsForService(sl, 'edit')) return html + renderReadOnlyBuilder(sl);
  html += '<div class="card">' +
    '<div class="card-head"><span class="svc-title">' + esc(sl.worshipType) + ' <small>· ' + esc(sl.serviceLabel) + '</small></span>' +
      statusPill(sl) + '</div>' +
    '<div class="svc-meta"><span>' + esc(fmtDate(sl.date)) + '</span>' +
      (sl.presider ? '<span>' + esc(sl.presider) + '</span>' : '') + '</div>' +
    (mine.length > 1 ? '<div style="margin-top:8px"><button class="linkish" data-song-act="change-service">Change service</button></div>' : '') +
    '<textarea id="b-notes" data-song-chg="b-notes" placeholder="Notes (optional)" rows="2">' + esc(sl.notes || '') + '</textarea>';
  const slotRow = (slot, label, sid) => {
    const lbl = songLabel(sid);
    return '<div class="slot-row"><span class="dname">' + label + '</span>' +
      '<span class="pill' + (lbl ? '' : ' none') + '">' + (lbl ? esc(lbl) : 'not chosen') + '</span>' +
      '<button class="linkish" data-song-act="pick-slot" data-slot="' + slot + '">' + (lbl ? 'Change' : 'Choose') + '</button></div>';
  };
  html += '<div class="slot-box">' +
    slotRow('glory', 'Glory song', sl.glorySong) +
    (sl.worshipType === 'Sabbath Day' && sl.serviceLabel === 'Morning' ? slotRow('thanks', 'Thanks song', sl.thanksSong) : '') +
    '</div>';
  if (state.ui.pickSlot) {
    html += '<div class="banner"><span>Tap the <b>+</b> next to a song below to set it as the <b>' +
      (state.ui.pickSlot === 'glory' ? 'Glory' : 'Thanks') + ' song</b>.</span>' +
      '<button class="x" data-song-act="cancel-pick" aria-label="Cancel">&times;</button></div>';
  }
  html += '</div>';
  const songs = sl.songs || [];
  const prep = songs.map((sid, i) => ({ sid, i })).filter(x => x.sid !== sl.glorySong && x.sid !== sl.thanksSong);
  let listHtml;
  if (!prep.length) {
    listHtml = '<div class="empty">No songs yet. Add them from the <b>Library</b> tab.</div>';
  } else {
    listHtml = prep.map((x, pos) => {
      const song = state.songById[x.sid];
      if (!song) return '';
      const up = pos > 0 ? '<button class="mv" data-song-act="move-song" data-idx="' + x.i + '" data-dir="' + (prep[pos - 1].i - x.i) + '" aria-label="Move up">↑</button>' : '<span class="mv-sp"></span>';
      const down = pos < prep.length - 1 ? '<button class="mv" data-song-act="move-song" data-idx="' + x.i + '" data-dir="' + (prep[pos + 1].i - x.i) + '" aria-label="Move down">↓</button>' : '<span class="mv-sp"></span>';
      return '<div class="set-row">' +
        '<span class="num">' + esc(dispNumber(song)) + '</span>' +
        '<span class="s-title">' + esc(song.title) + '</span>' +
        '<span class="s-dur tnum">' + fmtDur(song.durationSec) + '</span>' +
        '<span class="mv-group">' + up + down + '</span>' +
        '<button class="rm" data-song-act="remove-song" data-idx="' + x.i + '" aria-label="Remove">×</button>' +
        '</div>';
    }).join('');
  }
  const counted = countedSongIds(sl);
  const total = totalDuration(counted, state.songById);
  html += '<div class="total-readout"><span class="lbl">Total time</span>' +
    '<span class="big tnum">' + fmtDur(total) + '</span>' +
    '<span class="cnt">' + counted.length + ' song' + (counted.length === 1 ? '' : 's') + '</span></div>' +
    '<div class="total-note">Glory &amp; Thanks songs aren’t counted in the total.</div>';
  html += '<div class="set-list">' + listHtml + '</div>';
  html += renderConfirmBox(sl, prep.length);
  return html;
}

/* The closing step of picking songs: say "this is my list". Nothing else in
   the app depended on the presider ever finishing, so there was no way to tell
   a half-built list from a finished one. */
function renderConfirmBox(sl, songCount) {
  if (!sl || sl.status === 'sung') return '';
  if (!songCount && !(sl.songs || []).length) {
    return '<div class="confirm-box empty-state">' +
      '<p class="hint">Add songs from the <b>Library</b> tab, then confirm your list here.</p></div>';
  }
  if (isConfirmed(sl)) {
    const when = sl.confirmedAt ? new Date(sl.confirmedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
    return '<div class="confirm-box done">' +
      '<span class="confirm-mark" aria-hidden="true">\u2713</span>' +
      '<div><b>Songs confirmed</b>' +
      '<div class="hint">' + esc(sl.confirmedBy || '') + (when ? (sl.confirmedBy ? ' on ' : '') + esc(when) : '') +
      '. Change the list above any time and confirm it again.</div></div></div>';
  }
  if (changedSinceConfirmed(sl)) {
    return '<div class="confirm-box changed">' +
      '<div><b>You changed the songs after confirming</b>' +
      '<div class="hint">Confirm again so everyone sees the list you actually want.</div></div>' +
      '<button class="primary" data-song-act="confirm-songs" data-id="' + esc(sl.id) + '">Confirm again</button></div>';
  }
  return '<div class="confirm-box">' +
    '<div><b>Finished picking?</b>' +
    '<div class="hint">Confirm the list so it shows as done on your duties.</div></div>' +
    '<button class="primary" data-song-act="confirm-songs" data-id="' + esc(sl.id) + '">Done, these are my songs</button></div>';
}

/* ---------- Home ("My Services") ---------- */

function renderRoles(entry) {
  const a = (entry && entry.assignments) || {};
  const meC = canonName(state.ui.me);
  const row = (label, name) => {
    if (!name) return '';
    const mine = canonName(name) === meC;
    return '<div class="duty-row"><span class="dname">' + esc(label) + '</span>' +
      '<span class="pill' + (mine ? ' me' : '') + '">' + esc(name) + '</span></div>';
  };
  let html = row('Sermon', a.Sermon) + row('Prayer of Thanks', a['Prayer of Thanks']) + row('Closing Prayer', a['Closing Prayer']);
  const choir = entry && choirLabel(entry.choirSong);
  if (choir) html += '<div class="duty-row"><span class="dname">Choir song</span><span class="pill">' + esc(choir) + '</span></div>';
  return html ? '<div class="svc-roles">' + html + '</div>' : '';
}

function homeScope() {
  return state.ui.homeScope === 'all' ? 'all' : 'mine';
}

function renderHomeScopeToggle() {
  const scope = homeScope();
  return '<div class="home-scope" role="group" aria-label="Presider services">' +
    '<button class="scope-button' + (scope === 'mine' ? ' active' : '') + '" data-song-act="home-scope" data-scope="mine" aria-pressed="' + (scope === 'mine' ? 'true' : 'false') + '">My Services</button>' +
    '<button class="scope-button' + (scope === 'all' ? ' active' : '') + '" data-song-act="home-scope" data-scope="all" aria-pressed="' + (scope === 'all' ? 'true' : 'false') + '">All Services</button>' +
    '</div>';
}

function pastServicesForHome(scope) {
  return pastSetlists().filter(sl => scope === 'all' || isMyPresiderService(sl));
}

function renderHome() {
  const scope = homeScope();
  let html = '<div class="date-head"><span class="day" role="heading" aria-level="2">' +
    (scope === 'mine' ? 'My Services' : 'All Services') + '</span>' +
    '<button class="me-chip" data-song-act="back">← My Duties</button></div>';
  const mine = myUpcomingSchedule();
  html += renderHomeScopeToggle();

  if (scope === 'mine') {
    const t0 = new Date(todayISO() + 'T00:00:00');
    const daysTo = d => Math.round((new Date(d + 'T00:00:00') - t0) / 864e5);
    const soon = mine.find(e => daysTo(e.date) <= 3);
    if (soon) {
      const soonSl = state.setlists[serviceIdFor(soon.date, soon.service)];
      if (!soonSl || !(soonSl.songs || []).length) {
        const d = daysTo(soon.date);
        const when = d === 0 ? '<b>today</b>' : d === 1 ? '<b>tomorrow</b>' : 'in ' + d + ' days';
        html += '<div class="banner"><span><b>' + esc((soon.worship || '') + ' · ' + soon.service) + '</b> is ' + when + ' and has no songs yet.</span>' +
          '<button class="linkish" data-song-act="build-for" data-date="' + esc(soon.date) + '" data-worship="' + esc(soon.worship || '') + '" data-label="' + esc(soon.service) + '">Pick songs</button></div>';
      }
    }
    if (mine.length) {
      html += mine.map(entry => {
        const id = serviceIdFor(entry.date, entry.service);
        const sl = state.setlists[id];
        if (sl) return renderServiceCard(sl, { home: true, mine: true });
        return renderScheduleCard(entry, { home: true, mine: true });
      }).join('');
    } else if (fb && !state._scheduleLoaded) {
      html += '<div class="empty">Loading your schedule&hellip;</div>';
    } else if (!fb) {
      html += '<div class="empty">Live sync is off, so the shared presider schedule isn’t available.<br>' +
        '<button class="linkish" data-song-act="tab" data-tab="library">Build a setlist in the Library</button></div>';
    } else {
      html += '<div class="empty">No upcoming services are assigned to you.' +
        '<p class="hint">Assignments come from the duty roster.</p></div>';
    }
  } else {
    const all = allUpcomingServices();
    if (all.length) {
      html += all.map(item => {
        const mineHere = isMyPresiderService(item.sl || item.sched);
        if (item.sl) return renderServiceCard(item.sl, { home: true, mine: mineHere });
        return renderScheduleCard(item.sched, { home: true, mine: mineHere });
      }).join('');
    } else if (fb && !state._scheduleLoaded) {
      html += '<div class="empty">Loading the shared schedule&hellip;</div>';
    } else {
      html += '<div class="empty">No upcoming services on the schedule yet.</div>';
    }
  }

  const past = pastServicesForHome(scope);
  if (past.length) {
    html += '<div class="home-past-toggle"><button class="linkish" data-song-act="toggle-past">' +
      (state.ui.showPast ? 'Hide past' : 'Show ' + past.length + ' past') + '</button></div>';
    if (state.ui.showPast) {
      html += '<div class="date-head"><span class="day">Past</span></div>' +
        past.map(sl => renderServiceCard(sl, { home: true, mine: isMyPresiderService(sl) })).join('');
    }
  }
  return html;
}

/* ---------- Runsheet ---------- */

function renderRunsheet() {
  const id = state.ui.runsheet;
  const sl = state.setlists[id];
  const sched = scheduleFor(id);
  if (!sl && !sched) { state.ui.runsheet = null; return renderHome(); }
  const worship = (sl && sl.worshipType) || (sched && sched.worship) || '';
  const label = (sl && sl.serviceLabel) || (sched && sched.service) || '';
  const date = (sl && sl.date) || sched.date;
  let html = '<div class="runsheet">' +
    '<div class="date-head"><span class="day" role="heading" aria-level="1">' + esc(worship) + ' · ' + esc(label) + '</span>' +
    '<button class="me-chip" data-song-act="exit-runsheet">Close</button></div>' +
    '<p class="hint" style="margin-top:-6px">' + esc(fmtDate(date)) + (dateBadge(date) ? ' · ' + dateBadge(date) : '') + '</p>';
  if (sched) {
    html += '<div class="card">' + renderOrderOfWorship(sl, sched) + '</div>';
  } else {
    const songs = (sl && sl.songs) || [];
    if (songs.length) {
      html += '<div class="date-head"><span class="day">Songs</span></div><div class="card">' +
        songs.map(sid => {
          const song = state.songById[sid];
          if (!song) return '';
          return '<div class="rs-song"><span class="n tnum">' + esc(dispNumber(song)) + '</span>' +
            '<span class="s-title">' + esc(song.title) + '</span>' +
            '<span class="s-dur tnum">' + fmtDur(song.durationSec) + '</span></div>';
        }).join('') + '</div>';
    }
  }
  return html + '</div>';
}
function renderScheduleCard(entry, opts) {
  opts = opts || {};
  const id = serviceIdFor(entry.date, entry.service);
  const badge = dateBadge(entry.date);
  const pres = entry.assignments && entry.assignments.Presider;
  const today = entry.date === todayISO();
  const mine = opts.mine == null ? isMyPresiderService(entry) : !!opts.mine;
  const editable = opts.editable == null ? canEditSongsForService(entry, 'edit') : !!opts.editable;
  return '<div class="card svc-card' + (mine ? '' : ' other-presider') + '">' +
    '<div class="card-head">' +
      '<span class="svc-title">' + esc(entry.worship || WORSHIP_TYPES[0]) + ' <small>· ' + esc(entry.service) + '</small></span>' +
      statusPill(state.setlists[id]) +
    '</div>' +
    '<div class="svc-meta"><span>' + esc(fmtDate(entry.date)) + (badge ? ' · ' + badge : '') + '</span>' +
      (pres ? '<span class="presider-meta">Presider: ' + esc(pres) + '</span>' : '') + '</div>' +
    renderRoles(entry) +
    '<div class="svc-actions">' +
    (today ? '<button class="primary sm" data-song-act="runsheet" data-id="' + esc(id) + '">Runsheet</button>' : '') +
    (editable ? '<button class="' + (today ? 'ghost' : 'primary') + ' sm" data-song-act="build-for" ' +
      'data-date="' + esc(entry.date) + '" data-worship="' + esc(entry.worship || '') + '" data-label="' + esc(entry.service) + '">Add songs</button>' :
      '<span class="readonly-note">View only</span>') + '</div>' +
    '</div>';
}
function allUpcomingServices() {
  const t = todayISO();
  const map = {};
  (state.schedule || []).forEach(s => {
    if (!s.date || s.date < t || !s.service) return;
    const id = serviceIdFor(s.date, s.service);
    if (!map[id]) map[id] = { id, date: s.date, sched: s };
  });
  Object.keys(state.setlists).forEach(id => {
    const sl = state.setlists[id];
    if (!sl.date || sl.date < t || sl.status === 'sung') return;
    if (!map[id]) map[id] = { id, date: sl.date };
    map[id].sl = sl;
  });
  return Object.keys(map).map(k => map[k]).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/* ---------- Services compatibility route ---------- */

/* Keep old in-memory routes and deep links usable after Services moved into
   Home. The tab is never rendered by renderTabs(). */
function renderServices() {
  state.ui.tab = 'home';
  return renderHome();
}
function renderServiceCard(sl, opts) {
  opts = opts || {};
  const songs = sl.songs || [];
  const total = totalDuration(countedSongIds(sl), state.songById);
  const sung = sl.status === 'sung';
  const expanded = state.ui.expandedService === sl.id;
  const badge = dateBadge(sl.date);
  const sched = scheduleFor(sl.id);
  const mine = opts.mine == null ? isMyPresiderService(sl) : !!opts.mine;
  const editable = opts.editable == null ? canEditSongsForService(sl, 'edit') : !!opts.editable;
  const pres = (sched && sched.assignments && sched.assignments.Presider) || sl.presider || '';
  let html = '<div class="card svc-card' + (mine ? '' : ' other-presider') + '">' +
    '<div class="card-head" style="cursor:pointer" data-song-act="toggle-service" data-id="' + esc(sl.id) + '">' +
      '<span class="svc-title">' + esc(sl.worshipType) + ' <small>· ' + esc(sl.serviceLabel) + '</small></span>' +
      '<span style="display:flex;align-items:center;gap:6px">' +
        (sl.source === 'signal' ? '<span class="src-chip">from Signal</span>' : '') +
        statusPill(sl) +
      '</span>' +
    '</div>' +
    '<div class="svc-meta">' +
      '<span>' + esc(fmtDate(sl.date)) + (badge ? ' · ' + badge : '') + '</span>' +
      (pres ? '<span class="presider-meta">Presider: ' + esc(pres) + '</span>' : '') +
      '<span class="tnum">' + songs.length + ' song' + (songs.length === 1 ? '' : 's') + '</span>' +
      '<span class="tnum">' + fmtDur(total) + '</span>' +
    '</div>';
  if (sched) html += renderRoles(sched);
  if (expanded) {
    if (sched) {
      html += renderOrderOfWorship(sl, sched);
    } else if (songs.length) {
      html += '<div class="svc-songs">' + songs.map(sid => {
        const song = state.songById[sid];
        if (!song) return '';
        return '<div class="svc-song"><span class="num">' + esc(dispNumber(song)) + '</span>' +
          '<span class="s-title">' + esc(song.title) + '</span>' +
          '<span class="s-dur tnum">' + fmtDur(song.durationSec) + '</span></div>';
      }).join('') + '</div>';
    } else {
      html += '<div class="hist-none">No songs in this setlist.</div>';
    }
  }
  // Offered wherever a service is listed, so a presider who already picked
  // their songs can close the loop without reopening the builder.
  const needsConfirm = editable && !sung && songs.length && !isConfirmed(sl);
  html += '<div class="svc-actions">';
  if (opts.home) {
    const today = sl.date === todayISO();
    if (today) html += '<button class="primary sm" data-song-act="runsheet" data-id="' + esc(sl.id) + '">Runsheet</button>';
    if (editable) {
      if (needsConfirm) html += '<button class="' + (today ? 'ghost' : 'primary') + ' sm" data-song-act="confirm-songs" data-id="' + esc(sl.id) + '">' +
        (changedSinceConfirmed(sl) ? 'Confirm again' : 'Confirm songs') + '</button>';
      html += '<button class="' + (today || needsConfirm ? 'ghost' : 'primary') + ' sm" data-song-act="build-for" data-id="' + esc(sl.id) + '">Add songs</button>';
    } else {
      html += '<span class="readonly-note">View only</span>';
    }
    html += '<button class="ghost sm" data-song-act="toggle-service" data-id="' + esc(sl.id) + '">' +
      (expanded ? 'Hide order' : 'Order of worship') + '</button>';
    if (songs.length) html += '<button class="ghost sm" data-song-act="copy-signal" data-id="' + esc(sl.id) + '">Copy for Signal</button>';
  } else if (!sung) {
    if (editable) {
      if (needsConfirm) html += '<button class="primary sm" data-song-act="confirm-songs" data-id="' + esc(sl.id) + '">' +
        (changedSinceConfirmed(sl) ? 'Confirm again' : 'Confirm songs') + '</button>';
      html += '<button class="ghost sm" data-song-act="edit-setlist" data-id="' + esc(sl.id) + '">Edit in Builder</button>';
      html += '<button class="' + (needsConfirm ? 'ghost' : 'primary') + ' sm" data-song-act="mark-sung" data-id="' + esc(sl.id) + '">Mark as sung</button>';
    } else {
      html += '<span class="readonly-note">View only</span>';
    }
    if (songs.length) html += '<button class="ghost sm" data-song-act="copy-signal" data-id="' + esc(sl.id) + '">Copy for Signal</button>';
    if (editable) html += '<button class="danger-link" data-song-act="delete-setlist" data-id="' + esc(sl.id) + '">Delete</button>';
  } else {
    if (editable) {
      html += '<button class="ghost sm" data-song-act="edit-setlist" data-id="' + esc(sl.id) + '">Open in Builder</button>';
      html += '<button class="danger-link" data-song-act="undo-sung" data-id="' + esc(sl.id) + '">Undo sung</button>';
      html += '<button class="danger-link" data-song-act="delete-setlist" data-id="' + esc(sl.id) + '">Delete</button>';
    } else {
      html += '<span class="readonly-note">View only</span>';
    }
  }
  html += '</div></div>';
  return html;
}

/* ---------- Insights ---------- */

const INSIGHTS_COUNT = 15;
function leastSungSongs() {
  return state.songs.slice().sort((a, b) => {
    const sa = statFor(a.id), sb = statFor(b.id);
    if (sa.timesSung !== sb.timesSung) return sa.timesSung - sb.timesSung;
    return String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
  }).slice(0, INSIGHTS_COUNT);
}
function longestSinceSungSongs() {
  return state.songs.slice().sort((a, b) => {
    const sa = statFor(a.id), sb = statFor(b.id);
    const da = daysSince(sa.lastSung), db = daysSince(sb.lastSung);
    if (da !== db) return db - da;
    return String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
  }).slice(0, INSIGHTS_COUNT);
}
function categoryCoverage() {
  return categoriesInSeed().map(cat => {
    const songs = state.songs.filter(s => s.category === cat);
    const sungCount = songs.filter(s => statFor(s.id).timesSung > 0).length;
    return { category: cat, sung: sungCount, total: songs.length };
  });
}
function renderInsightsRow(song) {
  const st = statFor(song.id);
  return '<div class="song-row insight-row">' +
    '<span class="num">' + esc(dispNumber(song)) + '</span>' +
    '<span class="dot-c" title="' + esc(song.category) + '" style="background:' + catColor(song.category) + '"></span>' +
    '<span class="s-main"><span class="s-title">' + esc(song.title) + '</span></span>' +
    '<span class="s-times tnum">' + st.timesSung + '×</span>' +
    '<span class="s-last">' + esc(relTime(st.lastSung)) + '</span>' +
    '</div>';
}
function renderCoverageBar(row) {
  const pct = row.total ? Math.round((row.sung / row.total) * 100) : 0;
  return '<div class="cov-row">' +
    '<span class="cov-label">' + esc(row.category) + '</span>' +
    '<div class="cov-track"><div class="cov-fill" style="width:' + pct + '%"></div></div>' +
    '<span class="cov-count tnum">' + row.sung + ' / ' + row.total + '</span>' +
    '</div>';
}
function renderInsights() {
  const least = leastSungSongs();
  const overdue = longestSinceSungSongs();
  const coverage = categoryCoverage();
  let html = '';
  html += '<div class="card"><div class="card-head"><span class="svc-title">Least sung</span></div>' +
    '<div class="song-list">' + (least.map(renderInsightsRow).join('') || '<div class="empty">No songs yet.</div>') + '</div></div>';
  html += '<div class="card"><div class="card-head"><span class="svc-title">Longest since sung</span></div>' +
    '<div class="song-list">' + (overdue.map(renderInsightsRow).join('') || '<div class="empty">No songs yet.</div>') + '</div></div>';
  html += '<div class="card"><div class="card-head"><span class="svc-title">Category coverage</span></div>' +
    coverage.map(renderCoverageBar).join('') + '</div>';
  html += '<div class="card"><div class="card-head"><span class="svc-title">Export</span></div>' +
    '<p class="hint">Every sung-history entry, one row per song per date. Keep a copy — it is the only backup of the sung record.</p>' +
    '<button class="ghost sm" data-song-act="export-csv">Export history (CSV)</button></div>';
  html += renderBackfillCard();
  html += renderPresiderCard();
  return html;
}
function renderBackfillCard() {
  if (!state.ui.showBackfill) {
    return '<div class="card"><div class="card-head"><span class="svc-title">Backfill history</span></div>' +
      '<p class="hint">Record a song sung before this app existed — pick a song and an approximate past date.</p>' +
      '<button class="ghost sm" data-song-act="open-backfill">Backfill a past date</button></div>';
  }
  const songOpts = state.songs.map(s =>
    '<option value="' + esc(s.id) + '"' + (s.id === state.ui.backfillSong ? ' selected' : '') + '>' +
    esc(s.number) + ' · ' + esc(s.title) + '</option>').join('');
  return '<div class="card"><div class="card-head"><span class="svc-title">Backfill history</span></div>' +
    '<p class="hint">Pick a song and an approximate past date. It is recorded as a backfilled entry and can be removed later from that song\'s history in the Library.</p>' +
    '<div class="svc-grid two"><select id="bf-song" data-song-chg="bf-song"><option value="">— Song —</option>' + songOpts + '</select></div>' +
    '<div class="svc-grid two"><input type="date" id="bf-date" data-song-chg="bf-date" value="' + esc(state.ui.backfillDate || '') + '" max="' + esc(todayISO()) + '"></div>' +
    '<div class="detail-actions">' +
      '<button class="primary sm" data-song-act="save-backfill">Save backfill entry</button>' +
      '<button class="linkish" data-song-act="close-backfill">Cancel</button>' +
    '</div></div>';
}
function renderPresiderCard() {
  if (!canManagePresiders('manage')) return '';
  if (!state.ui.showPresiderMgr) {
    return '<div class="card"><div class="card-head"><span class="svc-title">Presiders</span></div>' +
      '<p class="hint">Manage the list of presider names used in the Builder.</p>' +
      '<button class="ghost sm" data-song-act="open-presider-mgr">Manage presiders</button></div>';
  }
  const rows = state.presiders.length
    ? state.presiders.map(n => '<div class="list-row">' +
        '<span style="flex:1 1 auto">' + esc(n) + '</span>' +
        '<button class="danger-link" data-song-act="remove-presider" data-name="' + esc(n) + '">remove</button>' +
        '</div>').join('')
    : '<div class="hist-none">No presiders yet.</div>';
  return '<div class="card"><div class="card-head"><span class="svc-title">Presiders</span></div>' + rows +
    '<form class="add-row" data-song-act="add-presider-form">' +
      '<input type="text" id="new-presider-name" placeholder="Add a name" autocomplete="off">' +
      '<button class="primary sm" type="submit">Add</button>' +
    '</form>' +
    '<button class="linkish" data-song-act="close-presider-mgr">Done</button></div>';
}

/* ---------- CSV export ---------- */

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function historyToCSV() {
  const header = ['songId', 'number', 'title', 'date', 'service', 'by', 'backfilled'];
  const rows = [header.join(',')];
  state.songs.forEach(song => {
    const st = statFor(song.id);
    (st.history || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(h => {
      rows.push([song.id, song.number, song.title, h.date || '', h.service || '', h.by || '', h.backfilled ? 'true' : 'false'].map(csvEscape).join(','));
    });
  });
  return rows.join('\n');
}
function exportHistoryCSV() {
  const csv = historyToCSV();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'new-song-history-' + todayISO() + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ================= live catalog sync ================= */

function parseCSV(text) {
  const rows = []; let row = []; let field = ''; let inQuotes = false;
  const s = String(text == null ? '' : text);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(field); field = ''; rows.push(row); row = []; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function applyTitleOverrides(songs) {
  (songs || []).forEach(s => { if (s && Object.prototype.hasOwnProperty.call(TITLE_OVERRIDES, s.id)) s.title = TITLE_OVERRIDES[s.id]; });
  return songs;
}
function durationToSec(raw) {
  const m = String(raw == null ? '' : raw).trim().match(/^(\d+):([0-5]?\d)$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}
function parseSongNumber(raw) {
  const t = String(raw == null ? '' : raw).trim();
  if (!t) return null;
  const appx = t.match(/^Appx\.?\s*(\d+)$/i);
  if (appx) { const n = String(parseInt(appx[1], 10)); return { id: 'appx-' + n, number: 'Appx. ' + n }; }
  const num = t.match(/^(\d+)$/);
  if (num) { const padded = String(parseInt(num[1], 10)).padStart(3, '0'); return { id: padded, number: padded }; }
  return null;
}
function csvToCatalog(text) {
  const rows = parseCSV(text);
  let headerIdx = -1; let cols = null;
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].map(c => String(c == null ? '' : c).trim());
    const lower = cells.map(c => c.toLowerCase());
    if (lower.indexOf('category') !== -1 && lower.indexOf('duration') !== -1) {
      const find = names => { for (let i = 0; i < lower.length; i++) { if (names.indexOf(lower[i]) !== -1) return i; } return -1; };
      cols = { category: find(['category']), number: find(['#', 'no', 'no.', 'number']), title: find(['new song', 'title', 'song']), duration: find(['duration']) };
      headerIdx = r; break;
    }
  }
  if (headerIdx === -1 || !cols || cols.number === -1 || cols.title === -1 || cols.duration === -1 || cols.category === -1) return [];
  const out = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells.some(c => String(c == null ? '' : c).trim() !== '')) continue;
    const cell = i => (i >= 0 && i < cells.length ? String(cells[i] == null ? '' : cells[i]).trim() : '');
    const numInfo = parseSongNumber(cell(cols.number));
    if (!numInfo) continue;
    const durationSec = durationToSec(cell(cols.duration));
    if (durationSec == null) continue;
    const title = cell(cols.title);
    if (!title) continue;
    out.push({ id: numInfo.id, number: numInfo.number, category: cell(cols.category), title: title, durationSec: durationSec });
  }
  return applyTitleOverrides(out);
}
function validateCatalog(songs) {
  if (!Array.isArray(songs)) return { ok: false, reason: 'not an array' };
  if (songs.length < CATALOG_MIN_LEN) return { ok: false, reason: 'only ' + songs.length + ' songs (need >= ' + CATALOG_MIN_LEN + ')' };
  const seenIds = {};
  for (let i = 0; i < songs.length; i++) {
    const s = songs[i];
    if (!s || !s.id || !s.number || !s.title) return { ok: false, reason: 'entry missing id/number/title at index ' + i };
    if (!(Number.isInteger(s.durationSec) && s.durationSec > 0)) return { ok: false, reason: 'bad durationSec for ' + s.id };
    if (seenIds[s.id]) return { ok: false, reason: 'duplicate id ' + s.id };
    seenIds[s.id] = true;
    if (!VALID_CATEGORIES[s.category]) return { ok: false, reason: 'unknown category "' + s.category + '" for ' + s.id };
  }
  return { ok: true, reason: '' };
}
async function syncCatalog() {
  if (!CATALOG_CSV_URL || CATALOG_CSV_URL === '__PLACEHOLDER__') return;
  let text;
  try {
    const resp = await fetch(CATALOG_CSV_URL, { cache: 'no-store' });
    if (!resp.ok) { console.warn('Catalog sync: HTTP ' + resp.status + ' — keeping the static seed.'); return; }
    text = await resp.text();
  } catch (err) { console.warn('Catalog sync: fetch failed — keeping the static seed.', err); return; }
  let catalog;
  try { catalog = csvToCatalog(text); }
  catch (err) { console.warn('Catalog sync: parse failed — keeping the static seed.', err); return; }
  const v = validateCatalog(catalog);
  if (!v.ok) { console.warn('Catalog sync: fetched catalog rejected (' + v.reason + ') — keeping the static seed.'); return; }
  state.songs = catalog;
  state.songById = {};
  state.songs.forEach(s => { state.songById[s.id] = s; });
  render();
  console.log('Catalog sync: adopted live catalog (' + catalog.length + ' songs).');
}

/* ================= dispatch ================= */

function handleAct(act, el) {
  switch (act) {
    case 'back': if (ctx && ctx.onBack) ctx.onBack(); break;
    case 'tab':
      state.ui.tab = el.dataset.tab === 'services' ? 'home' : el.dataset.tab;
      state.ui.runsheet = null; state.ui.pickSlot = null; render(); break;
    case 'home-scope':
      state.ui.homeScope = el.dataset.scope === 'all' ? 'all' : 'mine';
      state.ui.showPast = false; state.ui.runsheet = null; state.ui.pickSlot = null; render(); break;
    case 'go-home':
      state.ui.tab = 'home'; state.ui.runsheet = null; state.ui.pickSlot = null; render(); break;
    case 'pick-slot': state.ui.pickSlot = el.dataset.slot; render(); break;
    case 'cancel-pick': state.ui.pickSlot = null; render(); break;
    case 'copy-signal': {
      const sl = state.setlists[el.dataset.id];
      if (!sl) break;
      const sched = scheduleFor(sl.id);
      const lines = [sl.worshipType + ' · ' + sl.serviceLabel + ' — ' + fmtDate(sl.date)];
      if (songLabel(sl.glorySong)) lines.push('Glory song: ' + songLabel(sl.glorySong));
      if (songLabel(sl.thanksSong)) lines.push('Thanks song: ' + songLabel(sl.thanksSong));
      if (sched && choirLabel(sched.choirSong)) lines.push('Choir song: ' + choirLabel(sched.choirSong));
      const rest = (sl.songs || []).filter(s => s !== sl.glorySong && s !== sl.thanksSong).map(songLabel).filter(Boolean);
      if (rest.length) lines.push('New songs:');
      rest.forEach(l => lines.push(l));
      const text = lines.join('\n');
      navigator.clipboard.writeText(text).then(() => {
        el.textContent = 'Copied ✓';
        setTimeout(() => { el.textContent = 'Copy for Signal'; }, 1600);
      }).catch(() => { window.prompt('Copy this message:', text); });
      break;
    }
    case 'runsheet': state.ui.runsheet = el.dataset.id; render(); break;
    case 'exit-runsheet': state.ui.runsheet = null; render(); break;
    case 'build-for': {
      let id = el.dataset.id || (el.dataset.date && serviceIdFor(el.dataset.date, el.dataset.label || SERVICE_LABELS[0]));
      const target = state.setlists[id] || (id && scheduleFor(id));
      if (!target || !canEditSongsForService(target, 'edit')) { denySongEdit(); break; }
      if (!state.setlists[id]) id = ensureSetlist(el.dataset.date, el.dataset.worship || WORSHIP_TYPES[0], el.dataset.label || SERVICE_LABELS[0], 'schedule');
      state.ui.currentSetlist = id; state.ui.tab = 'library'; state.ui.search = ''; state.ui.pickSlot = null; render(); break;
    }
    case 'quick-add': {
      if (state.ui.pickSlot) { assignSlotSong(el.dataset.id); break; }
      const sl = currentSetlist(); const sid = el.dataset.id;
      // setlistAddSong now updates the in-memory setlist itself, so this only
      // has to redraw.
      if (sl) { setlistAddSong(sl.id, sid); render(); }
      break;
    }
    case 'set-category': state.ui.category = el.dataset.cat; state.ui.libPage = 0; state.ui.libMore = 0; render(); break;
    case 'lib-page': goToLibPage(Number(el.dataset.page)); break;
    case 'lib-more': appendNextLibGroup(); break;
    case 'confirm-songs': confirmSetlist(el.dataset.id); break;
    case 'toggle-song': state.ui.expandedSong = (state.ui.expandedSong === el.dataset.id) ? null : el.dataset.id; render(); break;
    case 'add-to-setlist': addSongToCurrent(el.dataset.id); break;
    case 'start-setlist': {
      const date = root.querySelector('#b-date').value || todayISO();
      const worship = root.querySelector('#b-worship').value;
      const label = root.querySelector('#b-label').value;
      if (!canCreateSongSetlist()) { denySongEdit(); break; }
      state.ui.currentSetlist = ensureSetlist(date, worship, label, 'manual');
      state.ui.manualService = false; render(); break;
    }
    case 'move-song': moveSong(Number(el.dataset.idx), Number(el.dataset.dir)); break;
    case 'remove-song': { const sl = currentSetlist(); if (sl) setlistRemoveSongAt(sl.id, Number(el.dataset.idx)); break; }
    case 'toggle-past': state.ui.showPast = !state.ui.showPast; render(); break;
    case 'toggle-service': state.ui.expandedService = (state.ui.expandedService === el.dataset.id) ? null : el.dataset.id; render(); break;
    case 'edit-setlist':
      if (!state.setlists[el.dataset.id] || !canEditSongsForService(state.setlists[el.dataset.id], 'edit')) { denySongEdit(); break; }
      state.ui.currentSetlist = el.dataset.id; state.ui.tab = 'library'; state.ui.pickSlot = null; render(); break;
    case 'change-service': state.ui.currentSetlist = null; state.ui.pickSlot = null; state.ui.manualService = false; render(); break;
    case 'manual-service':
      if (!canCreateSongSetlist()) { denySongEdit(); break; }
      state.ui.manualService = true; render(); break;
    case 'mark-sung': {
      const id = el.dataset.id;
      const sl = state.setlists[id];
      requireEditor(() => { if (confirm('This updates every song’s sung count - do this after the service.')) markSetlistSung(id); else render(); }, sl, 'mark-sung');
      break;
    }
    case 'undo-sung': {
      const id = el.dataset.id;
      const sl = state.setlists[id];
      requireEditor(() => { if (confirm('Undo marking this setlist as sung? Every song’s count will be recomputed.')) undoSetlistSung(id); else render(); }, sl, 'undo-sung');
      break;
    }
    case 'delete-setlist': {
      const id = el.dataset.id;
      const sl = state.setlists[id];
      requireEditor(() => { if (confirm('Delete this setlist? This cannot be undone (sung history for its songs is untouched).')) deleteSetlistById(id); else render(); }, sl, 'delete');
      break;
    }
    case 'unlock-editor': {
      const input = root.querySelector('#ep-input');
      const val = input ? input.value : '';
      sha256(val).then(h => {
        if (h === editorPinHash()) { localStorage.setItem(EDITOR_UNLOCK_KEY, h); resolvePendingEditorAction(); }
        else { state.ui.pinError = 'That PIN is not right.'; render(); }
      });
      break;
    }
    case 'set-editor-pin': {
      const a = root.querySelector('#ep-new').value;
      const b = root.querySelector('#ep-confirm').value;
      if (a.length < 4) { state.ui.pinError = 'Use at least 4 characters.'; render(); return; }
      if (a !== b) { state.ui.pinError = 'The two entries don’t match.'; render(); return; }
      sha256(a).then(h => {
        writeSongSettings({ editorPinHash: h });
        state.settings = Object.assign({}, state.settings, { editorPinHash: h });
        localStorage.setItem(EDITOR_UNLOCK_KEY, h);
        resolvePendingEditorAction();
      });
      break;
    }
    case 'cancel-editor-gate': cancelEditorGate(); break;
    case 'backfill-this':
      state.ui.tab = 'insights'; state.ui.showBackfill = true; state.ui.backfillSong = el.dataset.id; state.ui.backfillDate = ''; render(); break;
    case 'open-backfill': requireEditor(() => { state.ui.showBackfill = true; render(); }); break;
    case 'close-backfill': state.ui.showBackfill = false; state.ui.backfillSong = ''; state.ui.backfillDate = ''; render(); break;
    case 'save-backfill': {
      requireEditor(() => {
        const songSel = root.querySelector('#bf-song');
        const dateSel = root.querySelector('#bf-date');
        const songId = songSel ? songSel.value : state.ui.backfillSong;
        const date = dateSel ? dateSel.value : state.ui.backfillDate;
        if (!songId) { alert('Pick a song.'); render(); return; }
        if (!date) { alert('Pick a date.'); render(); return; }
        backfillSong(songId, date).then(() => { state.ui.showBackfill = false; state.ui.backfillSong = ''; state.ui.backfillDate = ''; render(); });
      });
      break;
    }
    case 'remove-history': {
      const songId = el.dataset.id; const service = el.dataset.service;
      requireEditor(() => { if (confirm('Remove this history entry? The song’s sung count will be recomputed.')) removeHistoryEntryById(songId, service); else render(); });
      break;
    }
    case 'open-presider-mgr':
      requireEditor(() => { state.ui.showPresiderMgr = true; render(); }, null, 'manage-presiders', () => canManagePresiders('manage'));
      break;
    case 'close-presider-mgr': state.ui.showPresiderMgr = false; render(); break;
    case 'add-presider-form': {
      requireEditor(() => {
        const input = root.querySelector('#new-presider-name');
        const name = input ? input.value.trim() : '';
        if (name) addPresider(name);
        state.ui.showPresiderMgr = true; render();
      }, null, 'manage-presiders', () => canManagePresiders('manage'));
      break;
    }
    case 'remove-presider': {
      const name = el.dataset.name;
      requireEditor(() => { if (confirm('Remove "' + name + '" from the presider list?')) removePresider(name); state.ui.showPresiderMgr = true; render(); }, null, 'manage-presiders', () => canManagePresiders('manage'));
      break;
    }
    case 'export-csv': exportHistoryCSV(); break;
    case 'dismiss-help':
      state.ui.helpDismissed = true; if (typeof localStorage !== 'undefined') localStorage.setItem('nss-help-dismissed', '1'); render(); break;
    default: console.warn('Unhandled data-song-act:', act);
  }
}

function addSongToCurrent(songId) {
  let sl = currentSetlist();
  if (!sl) {
    if (!canCreateSongSetlist()) { denySongEdit(); return; }
    if (!confirm('No setlist is open. Start one for today and add this song?')) { state.ui.tab = 'library'; render(); return; }
    const id = ensureSetlist(todayISO(), WORSHIP_TYPES[0], SERVICE_LABELS[0]);
    state.ui.currentSetlist = id; sl = state.setlists[id];
    if (!sl) { render(); return; }
  }
  if (!canEditSongsForService(sl, 'edit')) { denySongEdit(); return; }
  setlistAddSong(sl.id, songId);
  render();
}
function assignSlotSong(songId) {
  const sl = currentSetlist();
  const slot = state.ui.pickSlot;
  state.ui.pickSlot = null;
  if (!sl || !slot || !canEditSongsForService(sl, 'edit')) { denySongEdit(); return; }
  const patch = {};
  patch[slot === 'glory' ? 'glorySong' : 'thanksSong'] = songId;
  updateSetlist(sl.id, patch);
  if ((sl.songs || []).indexOf(songId) === -1) setlistAddSong(sl.id, songId);
  if (fb) render();
}
function moveSong(index, dir) {
  const sl = currentSetlist();
  if (!sl || !canEditSongsForService(sl, 'edit')) return;
  const songs = (sl.songs || []).slice();
  const i = index; const j = i + dir;
  if (i < 0 || i >= songs.length || j < 0 || j >= songs.length) return;
  const tmp = songs[i]; songs[i] = songs[j]; songs[j] = tmp;
  setlistReorder(sl.id, songs);
}

const debounceTimers = {};
function debounce(key, fn, ms) { clearTimeout(debounceTimers[key]); debounceTimers[key] = setTimeout(fn, ms); }

function handleChg(chg, el) {
  switch (chg) {
    case 'search': state.ui.search = el.value; state.ui.libPage = 0; state.ui.libMore = 0; render(); break;
    case 'sort': state.ui.sort = el.value; state.ui.libPage = 0; state.ui.libMore = 0; render(); break;
    case 'b-service': {
      const id = el.value;
      if (!id) { render(); break; }
      const e = findScheduleEntry(state.schedule, id);
      if (e && canEditSongsForService(e, 'edit')) {
        state.ui.currentSetlist = ensureSetlist(e.date, e.worship || WORSHIP_TYPES[0], e.service, 'schedule');
      } else if (e) {
        denySongEdit();
      }
      render(); break;
    }
    case 'b-notes': {
      const sl = currentSetlist();
      if (!sl) return;
      const val = el.value;
      debounce('notes:' + sl.id, () => updateSetlist(sl.id, { notes: val }), 600);
      break;
    }
    case 'bf-song': state.ui.backfillSong = el.value; break;
    case 'bf-date': state.ui.backfillDate = el.value; break;
    default: console.warn('Unhandled data-song-chg:', chg);
  }
}

/** In-place re-render of the song list + count on live search — preserves the
    search input focus/caret. Scoped to the root element. */
function renderLibraryInPlace() {
  if (state.ui.tab !== 'library' || !root) return;
  const list = filteredSongs();
  const pages = paginateSongs(list);
  state.ui.libPage = Math.max(0, Math.min(state.ui.libPage, pages.length - 1));
  const last = lastShownPage(pages);
  const shown = visibleSongs(pages);
  const listEl = root.querySelector('.song-list');
  const countEl = root.querySelector('.lib-count');
  const pagerEl = root.querySelector('.lib-pager');
  const moreEl = root.querySelector('.lib-more');
  if (listEl) listEl.innerHTML = shown.map(renderSongRow).join('') || '<div class="empty">No songs match your search.</div>';
  if (countEl) countEl.textContent = list.length + ' song' + (list.length === 1 ? '' : 's');
  if (pagerEl) pagerEl.outerHTML = renderLibPager(pages, state.ui.libPage, last, shown);
  if (moreEl) moreEl.outerHTML = renderLibMore(pages);
  setupLibPaging();
}

/* ================= root event wiring (scoped to #song-root) ================= */

function wireRoot() {
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-song-act]');
    if (!el || el.tagName === 'FORM') return;
    if (e.target.closest('[data-song-chg]')) return;
    handleAct(el.dataset.songAct, el);
  });
  root.addEventListener('submit', e => {
    const el = e.target.closest('[data-song-act]');
    if (!el) return;
    e.preventDefault();
    handleAct(el.dataset.songAct, el);
  });
  root.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[data-song-act][role="button"]');
    if (!el || e.target !== el) return;
    e.preventDefault();
    handleAct(el.dataset.songAct, el);
  });
  root.addEventListener('input', e => {
    const el = e.target.closest('[data-song-chg]');
    if (!el) return;
    const chg = el.dataset.songChg;
    if (chg === 'search') { state.ui.search = el.value; state.ui.libPage = 0; state.ui.libMore = 0; renderLibraryInPlace(); }
    else if (chg === 'b-notes') handleChg('b-notes', el);
  });
  root.addEventListener('change', e => {
    const el = e.target.closest('[data-song-chg]');
    if (!el) return;
    const chg = el.dataset.songChg;
    if (chg === 'search' || chg === 'b-notes') return;
    handleChg(chg, el);
  });

  /* Swipe left/right within the picker to move between its tabs (or, on the
     catalog, between 100-song groups). Scoped to root so it never fights the
     host's own gestures. */
  let swipeStart = null;
  root.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || e.target.closest('.cat-row, input, select, textarea, .ns-tabs')) { swipeStart = null; return; }
    const t = e.touches[0];
    const onList = !!e.target.closest('.song-list, .lib-pager, .lib-sentinel');
    swipeStart = { x: t.clientX, y: t.clientY, at: Date.now(), onList: onList };
  }, { passive: true });
  root.addEventListener('touchend', e => {
    if (!swipeStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeStart.x;
    const dy = t.clientY - swipeStart.y;
    const dt = Date.now() - swipeStart.at;
    const onList = swipeStart.onList;
    swipeStart = null;
    if (state.ui.editorGate) return;
    if (dt > 600 || Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    if (state.ui.runsheet) { state.ui.runsheet = null; render(); return; }
    if (onList && state.ui.tab === 'library') {
      if (dx < 0) appendNextLibGroup(); else goToLibPage(state.ui.libPage - 1);
      return;
    }
    state.ui.pickSlot = null;
    const i = TAB_ORDER.indexOf(state.ui.tab);
    const j = i + (dx < 0 ? 1 : -1);
    if (i === -1 || j < 0 || j >= TAB_ORDER.length) return;
    state.ui.tab = TAB_ORDER[j];
    render();
  }, { passive: true });
}

/* ================= Firestore subscription (via ctx.fb) ================= */

function subscribe() {
  const unsubs = [];
  let fellBack = false;
  function fallbackToLocal(err) {
    if (err && err.code !== 'permission-denied') { console.warn('song snapshot error (staying in Firebase mode):', err); return; }
    if (fellBack) return;
    fellBack = true;
    console.warn('Firestore access denied for the song picker — falling back to this device only:', err);
    unsubs.forEach(u => { try { u(); } catch (e) { /* ignore */ } });
    fb = null;
    loadLocal();
    render();
  }

  unsubs.push(fb.onSnapshot(fb.collection(fb.db, 'setlists'), snap => {
    const map = {};
    snap.docs.forEach(d => { map[d.id] = d.data(); });
    state.setlists = mergePendingSetlists(map);
    const firstLoad = !state._setlistsLoaded;
    state._setlistsLoaded = true;
    if (!firstLoad) {
      snap.docChanges().forEach(ch => {
        if (ch.type === 'removed') { pushToSheet('setlist-remove', { id: ch.doc.id }); return; }
        const d = ch.doc.data();
        if (mirrorSeen('setlist', ch.doc.id, String(d.updatedAt || ''))) return;
        pushToSheet('setlist', d);
      });
    }
    maybeSyncPresiderSchedule();
    render();
  }, fallbackToLocal));

  unsubs.push(fb.onSnapshot(fb.collection(fb.db, 'songStats'), snap => {
    const map = {};
    snap.docs.forEach(d => { map[d.id] = d.data(); });
    const firstLoad = !state._statsLoaded;
    state.stats = map;
    state._statsLoaded = true;
    if (!firstLoad) {
      const rows = [];
      snap.docChanges().forEach(ch => {
        const song = state.songById[ch.doc.id];
        if (ch.type === 'removed') { if (song) pushToSheet('stats-zero', { number: song.number }); return; }
        const stat = ch.doc.data();
        if (mirrorSeen('stat', ch.doc.id, (stat.timesSung || 0) + '|' + (stat.lastSung || ''))) return;
        const rowForSheet = statRowForSheet(ch.doc.id, stat);
        if (rowForSheet) rows.push(rowForSheet);
      });
      if (rows.length) pushToSheet('stats', rows);
    }
    render();
  }, fallbackToLocal));

  unsubs.push(fb.onSnapshot(fb.doc(fb.db, 'app', 'songSettings'), snap => {
    state.settings = snap.exists() ? snap.data() : {};
    render();
  }, fallbackToLocal));

  unsubs.push(fb.onSnapshot(fb.doc(fb.db, 'app', 'presiders'), snap => {
    state.presiders = (snap.exists() && Array.isArray(snap.data().names)) ? snap.data().names.slice().sort() : [];
    render();
  }, fallbackToLocal));

  unsubs.push(fb.onSnapshot(fb.doc(fb.db, 'app', 'nameMap'), snap => {
    const shared = (snap.exists() && snap.data().map) || {};
    // Merge the shared map on top of the host-supplied ctx.nameMap.
    state.nameMap = Object.assign({}, (ctx && ctx.nameMap) || {}, shared);
    render();
  }, fallbackToLocal));

  unsubs.push(fb.onSnapshot(fb.collection(fb.db, 'schedule'), snap => {
    state.schedule = snap.docs.map(d => {
      const data = d.data();
      return { id: d.id, date: data.date, service: data.service, worship: data.worship, assignments: data.assignments || {}, choirSong: data.choirSong || '' };
    });
    state._scheduleLoaded = true;
    maybeSyncPresiderSchedule();
    render();
  }, fallbackToLocal));
}

/* ================= catalog load ================= */

function loadCatalog() {
  const seedSongs = (window.SONG_SEED && window.SONG_SEED.songs) || [];
  state.songs = applyTitleOverrides(Array.isArray(seedSongs) ? seedSongs.slice() : []);
  state.songById = {};
  state.songs.forEach(s => { state.songById[s.id] = s; });
}

/* ================= mount (the module's only export) ================= */

export function mount(rootEl, context) {
  root = rootEl;
  ctx = context || {};
  fb = ctx.fb || null;
  state.nameMap = Object.assign({}, state.nameMap, (ctx.nameMap || {}));
  state.ui.me = ctx.me || state.ui.me || '';

  if (!_catalogLoaded) { loadCatalog(); _catalogLoaded = true; syncCatalog(); }
  if (!_subscribed) {
    if (fb) subscribe();
    else loadLocal();
    _subscribed = true;
  }
  if (_wiredRoot !== root) { wireRoot(); _wiredRoot = root; }

  /* A stale host route can still ask for the retired Services destination.
     Treat it as Home before rendering, including after a module remount. */
  const requestedTab = ctx.tab || ctx.initialTab || ctx.route;
  if (requestedTab === 'services') state.ui.tab = 'home';

  // Explicit navigation from the host (ctx.nav is a one-shot flag): a tapped
  // "Pick songs" button opens that service's setlist; the Presider tab (no
  // service) opens Home. Background re-mounts from live sync arrive with
  // nav: false and must leave whatever view the presider is on untouched.
  if (ctx.nav) {
    state.ui.runsheet = null;
    state.ui.pickSlot = null;
    if (ctx.service && ctx.service.date && ctx.service.service) {
      const svc = ctx.service;
      const id = serviceIdFor(svc.date, svc.service);
      const target = state.setlists[id] || scheduleFor(id) ||
        Object.assign({}, svc, { presider: svc.presider || (ctx.nav ? ctx.me : '') });
      if (!canEditSongsForService(target, 'edit')) {
        state.ui.currentSetlist = null;
        state.ui.tab = 'home';
      } else {
        if (!state.setlists[id]) ensureSetlist(svc.date, svc.worship || WORSHIP_TYPES[0], svc.service, 'schedule');
        state.ui.currentSetlist = id;
        state.ui.tab = 'library';
      }
    } else {
      state.ui.tab = 'home';
    }
  }

  render();
}

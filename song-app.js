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
       onBack     // call to return to My Duties
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

import './src/domain/setlist.js?v=DEV';
import './src/services/song-repository.js?v=DEV';

/* Pure helpers shared with the Signal ingest daemon — single source of truth. */
const {
  serviceIdFor, recompute, applySung, applyUndo,
  backfillServiceId, applyBackfill, removeHistoryEntry,
  totalDuration, countedSongIds
} = window.SongLib;
const SETLIST_DOMAIN = window.WorshipApp && window.WorshipApp.domain && window.WorshipApp.domain.setlist;
const SONG_REPOSITORY = window.WorshipApp && window.WorshipApp.services && window.WorshipApp.services.songRepository;

/* ================= constants ================= */

const SERVICE_LABELS = ['Morning', 'Afternoon', 'Evening', 'Early Morning', 'Commemoration'];
const WORSHIP_TYPES = ['Sabbath Day', 'Third Day', 'Prayer Week', 'Ascension Day', 'Pentecost', 'Heavenly Parent\'s Day'];

/* Left-to-right tab order — drives swipe-left/right navigation inside the picker. */
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
let firebaseGateway = null;
let songRepository = null;

let _catalogLoaded = false;
let subscriptionStop = null;
let rootAbortController = null;
let _wiredRoot = null;
let libObserver = null;

const state = {
  songs: [], songById: {}, stats: {}, setlists: {}, settings: {},
  presiders: [], nameMap: {}, schedule: [],
  ui: {
    tab: 'services', search: '', category: 'All', sort: 'number',
    currentSetlist: null, expandedSong: null, showPast: false,
    expandedService: null, runsheet: null, pickSlot: null, manualService: false,
    me: '', pendingEditorAction: null, editorGate: null, pinError: '',
    showBackfill: false, backfillSong: '', backfillDate: '',
    showPresiderMgr: false, newPresiderName: '',
    presiderFilter: 'mine', presiderMonth: '', presiderMonthTouched: false, presiderDay: '', workspaceService: null,
    songRole: 'prep', saveState: 'ready', saveServiceId: '', saveError: '',
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

function makeCompatibleGateway(context) {
  if (context && context.firebaseGateway) return context.firebaseGateway;
  const raw = context && context.fb;
  if (!raw) return null;
  const firebaseService = window.WorshipApp && window.WorshipApp.services && window.WorshipApp.services.firebase;
  if (firebaseService && typeof firebaseService.createAdapter === 'function') {
    return firebaseService.createAdapter({ firebase: raw, authReady: context.authReady });
  }
  const waitForAuth = () => {
    try {
      return Promise.resolve(typeof context.authReady === 'function' ? context.authReady() : context.authReady);
    } catch (error) {
      return Promise.reject(error);
    }
  };
  const ref = (collection, id) => raw.doc(raw.db, collection, id);
  const write = task => waitForAuth().catch(() => undefined).then(task);
  return {
    firebase: raw,
    ref,
    write,
    writeDocument: (collection, id, value, options) => write(() => raw.setDoc(ref(collection, id), value, options)),
    deleteDocument: (collection, id) => write(() => raw.deleteDoc(ref(collection, id))),
    runTransaction: callback => write(() => raw.runTransaction(raw.db, callback))
  };
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
  if (songRepository && songRepository.isRemote()) {
    songRepository.setDocument('app', 'songSettings', patch, { merge: true });
  } else {
    state.settings = Object.assign({}, state.settings, patch);
    saveLocal();
  }
}
function requireEditor(action) {
  if (editorUnlocked()) { action(); return; }
  state.ui.pendingEditorAction = action;
  state.ui.editorGate = editorPinHash() ? 'unlock' : 'create';
  state.ui.pinError = '';
  render();
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

function ensureLocalRepository() {
  if (!songRepository) songRepository = SONG_REPOSITORY.createSongRepository({ storage: typeof localStorage !== 'undefined' ? localStorage : null, key: DATA_KEY });
  return songRepository;
}

function saveLocal() {
  const repository = ensureLocalRepository();
  if (repository.isRemote()) return;
  repository.saveLocal({ stats: state.stats, setlists: state.setlists, settings: state.settings, presiders: state.presiders });
}
function loadLocal() {
  const obj = ensureLocalRepository().loadLocal();
  if (obj && typeof obj === 'object') {
    state.stats = obj.stats || {};
    state.setlists = obj.setlists || {};
    state.settings = obj.settings || {};
    state.presiders = Array.isArray(obj.presiders) ? obj.presiders : [];
  }
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

function stampMeta(patch, serviceId) {
  const current = (serviceId && state.setlists[serviceId]) || (patch && patch.id && state.setlists[patch.id]);
  const previous = current ? Math.max(Number(current.updatedAt) || 0, Number(current.confirmedAt) || 0) : 0;
  patch.updatedAt = Math.max(now(), previous + 1, Number(patch.confirmedAt) || 0);
  patch.updatedBy = whoAmI();
  return patch;
}

/* Setlists this device created that have not come back from a Firestore
   snapshot yet. `state.setlists` is rebuilt wholesale on every snapshot, so
   without this the freshly created setlist would vanish from under the builder
   and the "+" buttons would stop appearing. */
const pendingSetlists = {};
/* id -> promise for a create still in flight, so a song added a split second
   after opening a service waits for the document to exist. */
const setlistCreates = {};
const pendingPatchOverlays = {};
const saveQueues = {};
const saveStates = {};

function mergePendingSetlists(map) {
  Object.keys(pendingSetlists).forEach(id => {
    if (map[id]) delete pendingSetlists[id];
    else map[id] = pendingSetlists[id];
  });
  Object.keys(pendingPatchOverlays).forEach(id => {
    const overlay = pendingPatchOverlays[id];
    const incoming = map[id];
    if (incoming && Number(incoming.updatedAt) >= overlay.version) {
      delete pendingPatchOverlays[id];
      return;
    }
    map[id] = Object.assign({}, incoming || state.setlists[id] || {}, overlay.patch);
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
  if (!productionCanMutate(doc && doc.id)) return Promise.resolve(null);
  const repository = songRepository;
  const gateway = firebaseGateway;
  const p = repository.runTransaction(async tx => {
    const ref = gateway.ref('setlists', doc.id);
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
  if (!productionCanMutate(id)) return Promise.resolve(null);
  const repository = songRepository;
  const version = Number(patch.updatedAt) || now();
  pendingPatchOverlays[id] = {
    version: version,
    patch: Object.assign({}, pendingPatchOverlays[id] ? pendingPatchOverlays[id].patch : {}, patch)
  };
  const retryPayload = Object.assign({}, patch);
  saveStates[id] = { state: 'saving', error: '', retryPayload: retryPayload, version: version };
  state.ui.saveState = 'saving';
  state.ui.saveServiceId = id;
  state.ui.saveError = '';
  if (root) render();
  const run = () => repository.updateOrCreate('setlists', id, patch,
    Object.assign({}, state.setlists[id] || {}, pendingPatchOverlays[id] ? pendingPatchOverlays[id].patch : {}, patch));
  const pending = setlistCreates[id];
  const prior = saveQueues[id] || Promise.resolve();
  const operation = prior.catch(() => undefined).then(() => pending ? pending.then(run) : run());
  saveQueues[id] = operation;
  return operation.then(result => {
    if (saveStates[id] && saveStates[id].version === version) {
      saveStates[id].state = 'saved';
      state.ui.saveState = 'saved';
      state.ui.saveServiceId = id;
      state.ui.saveError = '';
    }
    if (root) render();
    return result;
  }).catch(err => {
    if (saveStates[id] && saveStates[id].version === version) {
      saveStates[id].state = 'failed';
      saveStates[id].error = 'Could not save this service. Retry when your connection is ready.';
      saveStates[id].retryPayload = retryPayload;
      state.ui.saveState = 'failed';
      state.ui.saveServiceId = id;
      state.ui.saveError = saveStates[id].error;
    }
    console.warn('Could not save the setlist change:', err);
    if (root) render();
    return null;
  });
}

function updateSetlist(id, patch, options) {
  if (!productionCanMutate(id)) return false;
  stampMeta(patch, id);
  if (options && options.confirm) patch.confirmedAt = patch.updatedAt;
  if (fb) {
    applyLocalSetlistPatch(id, patch);
    writeSetlistPatch(id, patch);
  } else {
    state.setlists[id] = Object.assign({}, state.setlists[id], patch);
    state.ui.saveState = 'saved';
    state.ui.saveServiceId = id;
    state.ui.saveError = '';
    saveLocal(); render();
  }
}
function setlistAddSong(id, songId) {
  if (!productionCanMutate(id)) return false;
  const sl = state.setlists[id];
  const songs = ((sl && sl.songs) || []).concat(songId);
  if (fb) {
    const patch = stampMeta({ songs: songs }, id);
    applyLocalSetlistPatch(id, patch);
    writeSetlistPatch(id, patch);
  } else if (sl) { sl.songs = songs; stampMeta(sl); state.ui.saveState = 'saved'; state.ui.saveServiceId = id; state.ui.saveError = ''; saveLocal(); render(); }
}
function setlistRemoveSongAt(id, index) {
  if (!productionCanMutate(id)) return false;
  const sl = state.setlists[id];
  if (!sl) return;
  const songs = (sl.songs || []).slice();
  if (index < 0 || index >= songs.length) return;
  const removed = songs.splice(index, 1)[0];
  const clear = {};
  if (songs.indexOf(removed) === -1) {
    if (sl.glorySong === removed) clear.glorySong = null;
    if (sl.thanksSong === removed) clear.thanksSong = null;
  }
  if (fb) {
    const patch = stampMeta(Object.assign({ songs: songs }, clear), id);
    applyLocalSetlistPatch(id, patch);
    writeSetlistPatch(id, patch);
    render();
  } else {
    sl.songs = songs; Object.assign(sl, clear);
    stampMeta(sl, id); state.ui.saveState = 'saved'; state.ui.saveServiceId = id; state.ui.saveError = ''; saveLocal(); render();
  }
}
function setlistReorder(id, songs) {
  if (!productionCanMutate(id)) return false;
  if (fb) {
    const patch = stampMeta({ songs: songs.slice() }, id);
    applyLocalSetlistPatch(id, patch);
    writeSetlistPatch(id, patch);
    render();
  } else { state.setlists[id].songs = songs.slice(); stampMeta(state.setlists[id], id); state.ui.saveState = 'saved'; state.ui.saveServiceId = id; state.ui.saveError = ''; saveLocal(); render(); }
}

/* ================= confirmation state ================= */

/* A presider "confirms" the list once it is the one they actually want. The
   confirm write stamps confirmedAt to the same value as updatedAt, so any
   later edit (including a song added from Signal) pushes updatedAt ahead and
   the list reads as changed since it was confirmed. */
function isConfirmed(sl) {
  return SETLIST_DOMAIN.isConfirmed(sl);
}
function changedSinceConfirmed(sl) {
  return SETLIST_DOMAIN.isChanged(sl);
}
function confirmSetlist(id) {
  if (!productionCanMutate(id)) return false;
  const sl = state.setlists[id];
  if (!sl || !(sl.songs || []).length) return;
  updateSetlist(id, { confirmedBy: whoAmI() }, { confirm: true });
  render();
}

/* One chip that answers "have the songs been picked for this service?" It
   replaces the old Planned/Sung pill, which said "Planned" whether the service
   had 14 songs or none at all. */
function songStatus(sl) {
  const presentation = {
    sung: { cls: 'sung', label: 'Sung' },
    empty: { cls: 'none', label: 'No songs yet' },
    confirmed: { cls: 'confirmed', label: 'Confirmed' },
    changed: { cls: 'planned', label: 'Changed' },
    picked: { cls: 'planned', label: 'Songs picked' }
  };
  return presentation[SETLIST_DOMAIN.status(sl)];
}
function statusPill(sl) {
  const st = songStatus(sl);
  return '<span class="status-pill ' + st.cls + '">' + st.label + '</span>';
}

/* ================= builder helpers ================= */

function ensureSetlist(date, worshipType, serviceLabel, source) {
  const id = serviceIdFor(date, serviceLabel);
  if (!productionCanMutate(id)) return null;
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
  if (!editorUnlocked()) return false;
  const local = state.setlists[id];
  if (!local) return;
  if (local.status === 'sung') { render(); return; }
  const by = whoAmI();
  const markedAt = now();
  if (!fb) {
    const result = applySung(state.stats, local, { by, markedAt });
    Object.keys(result.changed).forEach(sid => { state.stats[sid] = result.changed[sid]; });
    state.setlists[id] = Object.assign({}, local, { status: 'sung', sungAt: markedAt, updatedAt: markedAt, updatedBy: by });
    saveLocal(); render(); return;
  }
  try {
    const repository = songRepository;
    const gateway = firebaseGateway;
    await repository.runTransaction(async tx => {
      const slRef = gateway.ref('setlists', id);
      const fresh = await tx.get(slRef);
      if (!fresh.exists()) return;
      const setlist = fresh.data();
      if (setlist.status === 'sung') return;
      const refs = {}; const statsMap = {};
      for (const sid of (setlist.songs || [])) {
        if (refs[sid]) continue;
        const ref = gateway.ref('songStats', sid);
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
}
async function undoSetlistSung(id) {
  if (!editorUnlocked()) return false;
  const local = state.setlists[id];
  if (!local) return;
  if (!fb) {
    const result = applyUndo(state.stats, local);
    Object.keys(result.changed).forEach(sid => { state.stats[sid] = result.changed[sid]; });
    result.removed.forEach(sid => { delete state.stats[sid]; });
    state.setlists[id] = Object.assign({}, local, { status: 'planned', sungAt: null, updatedAt: now(), updatedBy: whoAmI() });
    saveLocal(); render(); return;
  }
  const undoneAt = now(); const by = whoAmI();
  try {
    const repository = songRepository;
    const gateway = firebaseGateway;
    await repository.runTransaction(async tx => {
      const slRef = gateway.ref('setlists', id);
      const fresh = await tx.get(slRef);
      if (!fresh.exists()) return;
      const setlist = fresh.data();
      const refs = {}; const statsMap = {};
      for (const sid of (setlist.songs || [])) {
        if (refs[sid]) continue;
        const ref = gateway.ref('songStats', sid);
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

function findScheduleEntry(scheduleArr, serviceId) {
  return (scheduleArr || []).find(s => s.date && s.service && serviceIdFor(s.date, s.service) === serviceId) || null;
}
function scheduleFor(serviceId) { return findScheduleEntry(state.schedule, serviceId); }

function serviceOrder(worship, serviceLabel, assignments, songNotes) {
  const a = assignments || {};
  const n = songNotes || {};
  const steps = [
    { step: 'Glory song', note: n.glory || 'stand & sing' },
    { step: 'Opening prayer', who: a['Opening Prayer'] || a.Sermon || '' }
  ];
  if (thanksApplies(worship, serviceLabel, a)) {
    steps.push({ step: 'Thanks song', note: n.thanks || '' });
    steps.push({ step: 'Prayer of thanks', who: a['Prayer of Thanks'] || '' });
  }
  steps.push({ step: 'Choir song', note: n.choir || '' });
  steps.push({ step: 'Sermon', who: a.Sermon || '' });
  steps.push({ step: 'Closing prayer', who: a['Closing Prayer'] || '' });
  return steps;
}
function thanksApplies(worship, serviceLabel, assignments) {
  const morning = /^morning$/i.test(String(serviceLabel || '').trim());
  if (!morning) return false;
  const hasSabbath = /\bsabbath(?:\s+day)?\b/i.test(String(worship || ''));
  const hasAssignedThanks = !!(assignments && assignments['Prayer of Thanks']);
  return hasSabbath || hasAssignedThanks;
}
function productionThanksApplies(row, sl) {
  const sched = row || (sl && scheduleFor(sl.id)) || {};
  return thanksApplies(
    (sl && sl.worshipType) || sched.worship,
    (sl && sl.serviceLabel) || sched.session || sched.service,
    sched.assignments || {}
  );
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
      if (!existed) updateSetlist(id, { presider: me, source: 'schedule' });
      else { const sl = state.setlists[id]; if (sl && sl.presider !== me) updateSetlist(id, { presider: me }); }
    });
}
function addPresider(name) {
  if (!editorUnlocked()) return false;
  name = String(name || '').trim();
  if (!name) return;
  if (state.presiders.indexOf(name) !== -1) return;
  if (songRepository && songRepository.isRemote()) songRepository.addArrayValue('app', 'presiders', 'names', name);
  else { state.presiders.push(name); state.presiders.sort(); saveLocal(); render(); }
}
function removePresider(name) {
  if (!editorUnlocked()) return false;
  if (songRepository && songRepository.isRemote()) songRepository.removeArrayValue('app', 'presiders', 'names', name);
  else { state.presiders = state.presiders.filter(n => n !== name); saveLocal(); render(); }
}

async function deleteSetlistById(id) {
  if (!productionCanMutate(id)) return false;
  if (state.ui.workspaceService === id) state.ui.workspaceService = null;
  if (state.ui.currentSetlist === id) state.ui.currentSetlist = null;
  if (fb) {
    try { await songRepository.deleteDocument('setlists', id); }
    catch (err) { console.warn('deleteSetlistById failed:', err); alert('Could not delete. Check your connection and try again.'); }
  } else {
    delete state.setlists[id];
    saveLocal(); render();
  }
}

/* ================= backfill (editor-gated) ================= */

async function backfillSong(songId, date) {
  if (!editorUnlocked()) return false;
  const by = whoAmI() || 'Backfill';
  const markedAt = now();
  if (!fb) {
    const doc = applyBackfill(state.stats, songId, date, { by, markedAt });
    if (doc) { state.stats[songId] = doc; saveLocal(); }
    render(); return;
  }
  try {
    let statsMap = {};
    if (state.stats[songId]) statsMap[songId] = state.stats[songId];
    else { const doc = await songRepository.getDocument('songStats', songId); if (doc) statsMap[songId] = doc; }
    const doc = applyBackfill(statsMap, songId, date, { by, markedAt });
    if (doc) await songRepository.setDocument('songStats', songId, doc, { merge: true });
  } catch (err) {
    console.warn('backfillSong failed:', err);
    alert('Could not save the backfill entry. Check your connection and try again.');
  }
}
async function removeHistoryEntryById(songId, service) {
  if (!editorUnlocked()) return false;
  if (!fb) {
    const r = removeHistoryEntry(state.stats, songId, service);
    if (r.removed) delete state.stats[songId];
    else if (r.changed) state.stats[songId] = r.changed;
    saveLocal(); render(); return;
  }
  try {
    let statsMap = {};
    if (state.stats[songId]) statsMap[songId] = state.stats[songId];
    else { const doc = await songRepository.getDocument('songStats', songId); if (doc) statsMap[songId] = doc; }
    const r = removeHistoryEntry(statsMap, songId, service);
    if (r.removed) await songRepository.deleteDocument('songStats', songId);
    else if (r.changed) await songRepository.setDocument('songStats', songId, r.changed);
  } catch (err) {
    console.warn('removeHistoryEntryById failed:', err);
    alert('Could not remove that entry. Check your connection and try again.');
  }
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
    if (cat === 'Appendix') { if (!(s.id && s.id.startsWith('appx-')) && s.category !== 'Appendix') return false; }
    else if (cat !== 'All' && s.category !== cat) return false;
    if (!q) return true;
    return String(s.title || '').toLowerCase().indexOf(q) !== -1 || String(s.number).toLowerCase().indexOf(q) !== -1 || dispNumber(s).toLowerCase().indexOf(q) !== -1;
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
/* ---------- Library ---------- */

/* ---------- Runsheet ---------- */

function renderRunsheet() {
  const id = state.ui.runsheet;
  const sl = state.setlists[id];
  const sched = scheduleFor(id);
  if (!sl && !sched) { state.ui.runsheet = null; return productionHome(); }
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
function renderInsights(includePresiderTools) {
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
  if (includePresiderTools !== false) html += renderPresiderCard();
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

/* ================= production Presider surface =================
   The host still owns navigation and Firebase. This composition keeps the
   existing setlist persistence helpers above as the only write path. */

function productionMonthKey(value) {
  if (/^\d{4}-\d{2}$/.test(String(value || ''))) return String(value);
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}
function productionMonthTitle(key) {
  const parts = String(key || '').split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
function productionShiftMonth(key, amount) {
  const parts = String(key || productionMonthKey()).split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1 + amount, 1);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}
function productionDateLabel(iso) {
  return new Date(String(iso || '') + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
function productionShortDateLabel(iso) {
  return new Date(String(iso || '') + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function productionTimeLabel(value) {
  const raw = String(value || '');
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return raw || 'Time not listed';
  const h = Number(m[1]);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return hour + ':' + m[2] + ' ' + suffix;
}
function productionChoirLabel(value) {
  if (!value) return 'Not assigned';
  if (typeof value === 'object') {
    const id = value.catalogId || value.songId || value.id;
    if (id && state.songById[id]) return '#' + state.songById[id].number + ' ' + state.songById[id].title;
    return String(value.title || value.label || value.name || 'Not assigned');
  }
  return state.songById[value] ? '#' + state.songById[value].number + ' ' + state.songById[value].title : String(value);
}
function productionServiceRows() {
  const map = {};
  (state.schedule || []).forEach(s => {
    if (!s || !s.date || !s.service) return;
    const id = s.id || serviceIdFor(s.date, s.service);
    map[id] = {
      id: id, date: s.date, session: s.service, worship: s.worship || '',
      time: s.time || s.time24 || '', assignments: s.assignments || {},
      choirSong: s.choirSong || '', setlist: state.setlists[id] || state.setlists[serviceIdFor(s.date, s.service)] || null
    };
  });
  Object.keys(state.setlists || {}).forEach(id => {
    const sl = state.setlists[id];
    if (!sl || !sl.date) return;
    if (!map[id]) map[id] = {
      id: id, date: sl.date, session: sl.serviceLabel || 'Service', worship: sl.worshipType || '',
      time: sl.time || '', assignments: {}, choirSong: '', setlist: sl
    };
    else map[id].setlist = sl;
  });
  return Object.keys(map).map(id => map[id]).filter(s => s.date && s.session).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)) || String(a.session).localeCompare(String(b.session))
  );
}
function productionRowFor(value) {
  const id = typeof value === 'string' ? value : value && value.id;
  const rows = productionServiceRows();
  const found = id && rows.find(row => row.id === id || serviceIdFor(row.date, row.session) === id);
  return found || null;
}
function productionAssignedPresider(row) {
  const assignment = row && row.assignments && row.assignments.Presider;
  return assignment ? String(assignment) : '';
}
function productionCanMutate(value) {
  if (editorUnlocked()) return true;
  const row = productionRowFor(value);
  const assigned = productionAssignedPresider(row);
  const me = state.ui.me;
  return !!(me && assigned && canonName(assigned) === canonName(me));
}
function productionActualPresider(row) {
  return productionAssignedPresider(row) || 'Not assigned';
}
function productionIsMyPresider(row) {
  const me = state.ui.me;
  const assigned = productionAssignedPresider(row);
  return !!me && !!assigned && canonName(assigned) === canonName(me);
}
function productionEnsureMonth() {
  if (state.ui.presiderMonth) return state.ui.presiderMonth;
  const today = todayISO();
  const rows = productionServiceRows();
  const firstMine = rows.find(row => row.date >= today && productionIsMyPresider(row));
  if (rows.length) state.ui.presiderMonth = productionMonthKey(firstMine ? firstMine.date : today);
  return state.ui.presiderMonth || productionMonthKey(today);
}
function productionMonthRows() {
  const month = productionEnsureMonth();
  const rows = productionServiceRows().filter(row => String(row.date).slice(0, 7) === month);
  if (state.ui.presiderFilter === 'all') return rows;
  return rows.filter(productionIsMyPresider);
}
function productionSongEntries(sl, row) {
  if (!sl) return [];
  const out = [];
  (sl.songs || []).forEach((id, index) => {
    if (id === sl.glorySong || id === sl.thanksSong) return;
    const song = state.songById[id];
    if (song) out.push({ id: id, index: index, role: 'Preparation', song: song });
  });
  if (sl.glorySong && state.songById[sl.glorySong]) out.push({ id: sl.glorySong, index: -1, role: 'Glory', song: state.songById[sl.glorySong] });
  if (productionThanksApplies(row, sl) && sl.thanksSong && state.songById[sl.thanksSong]) out.push({ id: sl.thanksSong, index: -1, role: 'Thanks', song: state.songById[sl.thanksSong] });
  return out;
}
function productionSongSummary(sl) {
  const ids = sl ? countedSongIds(sl) : [];
  return { count: ids.length, duration: totalDuration(ids, state.songById) };
}
function productionSnapshotNotice() {
  if (state._snapshotError) return '<div class="song-snapshot-notice" role="status" data-testid="song-snapshot-status">Song updates are unavailable. Previously loaded information is retained. ' + (songRepository && songRepository.isRemote() ? '<button class="ws-link" data-song-act="retry-song-snapshots">Retry loading</button>' : 'Reload to try online access again.') + '</div>';
  if (songRepository && songRepository.isRemote() && !state._setlistsLoaded) return '<p class="song-snapshot-notice" role="status" data-testid="song-snapshot-status">Loading song plans...</p>';
  return '';
}
function productionStatus(sl) {
  if (!sl && state._snapshotError) return 'Updates unavailable';
  if (!sl && songRepository && songRepository.isRemote() && !state._setlistsLoaded) return 'Loading songs';
  if (!sl || !(sl.songs || []).length) return 'No songs yet';
  if (sl.status === 'sung') return 'Sung';
  if (changedSinceConfirmed(sl)) return 'Changed';
  if (isConfirmed(sl)) return 'Confirmed';
  return 'Not confirmed';
}
function productionStatusClass(sl) {
  return productionStatus(sl).toLowerCase().replace(/\s+/g, '-');
}
function productionSaveState(sl) {
  const id = sl && sl.id;
  if (!id) return '';
  const save = saveStates[id];
  if (!save) return '';
  if (save.state === 'saving') return '<span class="ws-badge saving">Saving</span>';
  if (save.state === 'saved') return '<span class="ws-badge saved">Saved</span>';
  if (save.state === 'failed') return '<span class="ws-badge failed">Save failed</span><button class="ws-link" data-song-act="retry-save" data-id="' + esc(id) + '"' + (productionCanMutate(id) ? '' : ' disabled') + '>Retry</button>';
  return '';
}
function productionSelectedRow() {
  const rows = productionServiceRows();
  let row = rows.find(item => item.id === state.ui.workspaceService);
  if (!row) {
    const today = todayISO();
    row = rows.find(item => item.date >= today && productionIsMyPresider(item)) || rows.find(item => item.date >= today) || rows[0] || null;
    state.ui.workspaceService = row ? row.id : null;
  }
  state.ui.currentSetlist = row && row.setlist ? row.setlist.id : null;
  return row;
}
function productionCalendar() {
  const month = productionEnsureMonth();
  const parts = month.split('-');
  const year = Number(parts[0]);
  const monthIndex = Number(parts[1]) - 1;
  const first = new Date(year, monthIndex, 1);
  const count = new Date(year, monthIndex + 1, 0).getDate();
  const marked = {};
  productionServiceRows().forEach(row => { if (String(row.date).slice(0, 7) === month && productionIsMyPresider(row)) marked[row.date] = true; });
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push('<span class="ws-calendar-day ws-calendar-empty" aria-hidden="true"></span>');
  for (let day = 1; day <= count; day++) {
    const iso = year + '-' + pad(monthIndex + 1) + '-' + pad(day);
    const active = state.ui.presiderDay === iso;
    cells.push('<button class="ws-calendar-day' + (marked[iso] ? ' scheduledpresider' : '') + (active ? ' selected' : '') + '" data-song-act="presider-day" data-date="' + esc(iso) + '" aria-label="' + esc(productionDateLabel(iso) + (marked[iso] ? ', scheduled Presider date' : '')) + '"' + (active ? ' aria-current="date"' : '') + '><span>' + day + '</span>' + (marked[iso] ? '<i aria-hidden="true"></i>' : '') + '</button>');
  }
  return '<section class="ws-calendar presider-calendar" aria-labelledby="presider-calendar-title"><div class="ws-toolbar"><button class="ws-icon-button" data-song-act="presider-month-prev" aria-label="Previous month">&lsaquo;</button><h2 id="presider-calendar-title">' + esc(productionMonthTitle(month)) + '</h2><button class="ws-icon-button" data-song-act="presider-month-next" aria-label="Next month">&rsaquo;</button></div><div class="ws-calendar-weekdays">' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => '<span>' + d + '</span>').join('') + '</div><div class="ws-calendar-grid">' + cells.join('') + '</div></section>';
}
function productionTabs() {
  const tabs = [
    ['services', 'Services'], ['select', 'Select Songs'], ['order', 'Order of Worship'],
    ['library', 'Library'], ['insights', 'Insights']
  ];
  return '<nav class="presider-tabs" role="tablist" aria-label="Presider workspace sections">' + tabs.map(tab => {
    const active = state.ui.tab === tab[0];
    return '<button role="tab" data-song-act="presider-tab" data-tab="' + tab[0] + '" aria-selected="' + (active ? 'true' : 'false') + '" aria-controls="presider-panel-' + tab[0] + '"' + (active ? ' class="active"' : '') + '>' + tab[1] + '</button>';
  }).join('') + '</nav>';
}
function productionServiceChooser(row) {
  const rows = productionServiceRows();
  const options = '<option value="">Choose a service</option>' + rows.map(item => '<option value="' + esc(item.id) + '"' + (row && row.id === item.id ? ' selected' : '') + '>' + esc(productionShortDateLabel(item.date) + ' | ' + (item.worship || 'Service') + ' | ' + item.session) + '</option>').join('');
  return '<label class="presider-service-picker" for="presider-service"><span>Selected service</span><select id="presider-service" data-song-chg="presider-service">' + options + '</select></label>';
}
function productionContext(row) {
  if (!row) return '<div class="presider-context empty-context">Choose a service to work on its songs and order.</div>';
  const sl = row.setlist;
  return '<div class="presider-context" data-service-id="' + esc(row.id) + '"><div><h2>' + esc((row.worship || 'Service') + ' | ' + productionDateLabel(row.date)) + '</h2><p>' + esc(row.session + ' | ' + productionTimeLabel(row.time)) + '</p></div><div class="context-presider"><span>Presider</span><strong data-service-presider>' + esc(productionActualPresider(row)) + '</strong></div><div class="context-state"><span class="ws-badge ' + productionStatusClass(sl) + '" data-confirmation-state>' + esc(productionStatus(sl)) + '</span>' + productionSaveState(sl, row) + '</div></div>';
}
function productionPrayerSummary(row) {
  const a = row.assignments || {};
  const pieces = [
    '<span><b>Opening:</b> ' + esc(a['Opening Prayer'] || a.Sermon || 'Not assigned') + '</span>'
  ];
  if (productionThanksApplies(row, row.setlist)) pieces.push('<span><b>Thanks:</b> ' + esc(a['Prayer of Thanks'] || 'Not assigned') + '</span>');
  pieces.push('<span><b>Closing:</b> ' + esc(a['Closing Prayer'] || 'Not assigned') + '</span>');
  const choir = row.choirSong ? '<div class="presider-choir-line"><b>Choir:</b> ' + esc(productionChoirLabel(row.choirSong)) + '</div>' : '';
  return '<div class="presider-prayer-line" aria-label="Prayer assignments">' + pieces.join('<i aria-hidden="true">|</i>') + '</div>' + choir;
}
function productionOutline(row, sl) {
  const canMutate = productionCanMutate(row);
  const prep = productionSongEntries(sl, row).filter(entry => entry.role === 'Preparation');
  const prepRows = prep.length ? prep.map(entry => '<div class="presider-outline-row"><span class="outline-role">Prep</span><span class="outline-number">' + esc(dispNumber(entry.song)) + '</span><strong>' + esc(entry.song.title) + '</strong><time>' + fmtDur(entry.song.durationSec) + '</time></div>').join('') : '<p class="ws-empty">No preparation songs selected.</p>';
  const slot = (role, id) => {
    const song = id && state.songById[id];
    return '<div class="presider-outline-row"><span class="outline-role">' + role + '</span>' + (song ? '<span class="outline-number">' + esc(dispNumber(song)) + '</span><strong>' + esc(song.title) + '</strong><time>' + fmtDur(song.durationSec) + '</time>' : '<button class="ws-link" data-song-act="add-song-role" data-role="' + role.toLowerCase() + '" data-id="' + esc(row.id) + '"' + (canMutate ? '' : ' disabled') + '>Select ' + role + '</button>') + '</div>';
  };
  const open = state.ui.expandedService !== row.id;
  const thanks = productionThanksApplies(row, sl) ? '<div class="outline-group special-slot"><h3>Thanks</h3>' + slot('Thanks', sl && sl.thanksSong) + '</div>' : '';
  const choir = row.choirSong ? '<div class="outline-group special-slot choir-slot"><div class="presider-outline-row"><span class="outline-role">Choir</span><strong class="choir-outline-title">' + esc(productionChoirLabel(row.choirSong)) + '</strong></div></div>' : '';
  return '<details class="presider-service-order"' + (open ? ' open' : '') + '><summary data-song-act="view-service" data-id="' + esc(row.id) + '">' + (open ? 'Hide song outline' : 'Show song outline') + '</summary><div class="presider-order-body"><div class="outline-group preparation-group"><h3>Preparation</h3>' + prepRows + '</div><div class="outline-group special-slot"><h3>Glory</h3>' + slot('Glory', sl && sl.glorySong) + '</div>' + thanks + choir + '</div></details>';
}
function productionActions(row) {
  const canMutate = productionCanMutate(row);
  const openDisabled = !row.setlist && !canMutate ? ' disabled' : '';
  return '<div class="presider-action-row ws-actions" aria-label="Service actions"><button class="ws-button primary" data-song-act="open-workspace" data-id="' + esc(row.id) + '"' + openDisabled + '>Select Songs</button><button class="ws-button" data-song-act="order-workspace" data-id="' + esc(row.id) + '">Order of Worship</button><button class="ws-button" data-song-act="copy-text" data-id="' + esc(row.id) + '">Copy Text</button><button class="ws-button" data-song-act="request-change" data-id="' + esc(row.id) + '">Request Change</button></div>';
}
function productionServiceCard(row) {
  const sl = row.setlist;
  const summary = productionSongSummary(sl);
  const mine = productionIsMyPresider(row);
  return '<article class="presider-service-card ws-service-card' + (mine ? ' personal-presider' : '') + '" data-testid="presider-service" data-service-summary data-service-id="' + esc(row.id) + '"><header class="presider-service-header"><h3>' + esc((row.worship || 'Service') + ' | ' + productionDateLabel(row.date)) + '</h3><strong data-service-presider>' + esc(productionActualPresider(row)) + '</strong></header><div class="presider-facts-scroll" tabindex="0" role="region" aria-label="Service details"><div class="presider-compact-summary"><span><small>Time</small><strong>' + esc(productionTimeLabel(row.time)) + '</strong></span><span><small>Session</small><strong>' + esc(row.session || 'Service') + '</strong></span><span><small>Presider</small><strong>' + esc(productionActualPresider(row)) + '</strong></span><span><small>Songs</small><strong>' + summary.count + '</strong></span><span><small>Total</small><strong>' + esc(fmtDur(summary.duration)) + '</strong></span><span><small>Status</small><strong class="ws-badge ' + productionStatusClass(sl) + '" data-confirmation-state>' + esc(productionStatus(sl)) + '</strong>' + productionSaveState(sl, row) + '</span></div></div>' + productionPrayerSummary(row) + productionOutline(row, sl) + productionActions(row) + '</article>';
}
function productionHistory(sl, row) {
  if (!sl) return '<section class="song-history"><h2>Selected song history</h2><p class="ws-empty">Create a song plan to see service history.</p></section>';
  const items = productionSongEntries(sl, row).map(entry => {
    const st = statFor(entry.id);
    const history = (st.history || []).map(h => '<li>' + esc(fmtDate(h.date) + ' | ' + (h.service || '')) + '<button class="ws-link" data-song-act="remove-history" data-id="' + esc(entry.id) + '" data-service="' + esc(h.service || '') + '"' + (editorUnlocked() ? '' : ' disabled') + '>Remove</button></li>').join('');
    return '<details class="song-history-item"><summary>' + esc(dispNumber(entry.song) + ' ' + entry.song.title) + '</summary>' + (history ? '<ul>' + history + '</ul>' : '<p>No sung history yet.</p>') + '</details>';
  }).join('');
  return '<section class="song-history"><h2>Selected song history</h2>' + (items || '<p class="ws-empty">No songs selected.</p>') + '</section>';
}
function productionSelectedRowHtml(entry, row) {
  const canMutate = productionCanMutate(row);
  const disabled = canMutate ? '' : ' disabled';
  const roleValue = entry.role === 'Preparation' ? 'prep' : entry.role.toLowerCase();
  const thanksOption = productionThanksApplies(row, row.setlist) ? '<option value="thanks"' + (roleValue === 'thanks' ? ' selected' : '') + '>Thanks</option>' : '';
  const move = entry.role === 'Preparation' ? '<span class="prep-move"><button class="ws-icon-button" data-song-act="prep-up" data-index="' + entry.index + '" aria-label="Move ' + esc(entry.song.title) + ' up"' + disabled + '>&uarr;</button><button class="ws-icon-button" data-song-act="prep-down" data-index="' + entry.index + '" aria-label="Move ' + esc(entry.song.title) + ' down"' + disabled + '>&darr;</button></span>' : '<span class="prep-move" aria-hidden="true"></span>';
  return '<div class="selected-song-row"><select aria-label="Role for ' + esc(entry.song.title) + '" data-song-chg="song-role" data-song-id="' + esc(entry.id) + '" data-index="' + entry.index + '"' + disabled + '><option value="prep"' + (roleValue === 'prep' ? ' selected' : '') + '>Prep</option><option value="glory"' + (roleValue === 'glory' ? ' selected' : '') + '>Glory</option>' + thanksOption + '</select><span class="outline-number">' + esc(dispNumber(entry.song)) + '</span><strong title="' + esc(entry.song.title) + '">' + esc(entry.song.title) + '</strong><time>' + fmtDur(entry.song.durationSec) + '</time>' + move + '<button class="ws-icon-button remove-song" data-song-act="remove-workspace-song" data-song-id="' + esc(entry.id) + '" data-index="' + entry.index + '" aria-label="Remove ' + esc(entry.song.title) + '"' + disabled + '>&times;</button></div>';
}
function productionNoService() {
  return '<div class="ws-card state-card" data-presider-state="empty"><h2>Choose a service</h2><p class="ws-empty">Select a service above or open one from the Services tab.</p></div>';
}
function productionSelectView(row) {
  if (!row) return productionNoService();
  const sl = row.setlist;
  const canMutate = productionCanMutate(row);
  if (!sl && ((songRepository && songRepository.isRemote() && !state._setlistsLoaded) || state._snapshotError)) return '<p class="ws-empty">The song plan is not available yet. Wait for loading or retry above before creating a plan.</p>';
  if (!sl) return '<div class="ws-card state-card" data-presider-state="no-plan"><h2>No song plan yet</h2><p class="ws-empty">Create the plan for ' + esc(productionActualPresider(row)) + ' before selecting songs.</p>' + (canMutate ? '<button class="ws-button primary" data-song-act="create-workspace-plan" data-id="' + esc(row.id) + '">Create plan</button>' : '<p class="compact-notice" role="status">View only. Only the assigned Presider or editor can create this song plan.</p>') + '</div>';
  state.ui.currentSetlist = sl.id;
  const summary = productionSongSummary(sl);
  const entries = productionSongEntries(sl, row);
  const prep = entries.filter(entry => entry.role === 'Preparation');
  const glory = entries.find(entry => entry.role === 'Glory');
  const thanks = entries.find(entry => entry.role === 'Thanks');
  const prepRows = prep.length ? prep.map(entry => productionSelectedRowHtml(entry, row)).join('') : '<p class="ws-empty">No preparation songs selected.</p>';
  const slot = (role, entry) => '<section class="selected-slot"><h3>' + role + '</h3>' + (entry ? productionSelectedRowHtml(entry, row) : '<button class="ws-slot-empty" data-song-act="add-song-role" data-role="' + role.toLowerCase() + '"' + (canMutate ? '' : ' disabled') + '>Select ' + role + ' song</button>') + '</section>';
  const confirmLabel = isConfirmed(sl) && !changedSinceConfirmed(sl) ? 'Confirm Again' : 'Confirm Songs';
  const thanksSlot = productionThanksApplies(row, sl) ? slot('Thanks', thanks) : '';
  const notice = canMutate ? '' : '<p class="compact-notice" role="status">View only. Only the assigned Presider or editor can change this song plan.</p>';
  return '<div class="select-songs-view">' + notice + '<div class="selection-summary"><strong>' + summary.count + ' song' + (summary.count === 1 ? '' : 's') + '</strong><span class="tnum">' + esc(fmtDur(summary.duration)) + '</span><button class="ws-button primary" data-song-act="confirm-songs" data-id="' + esc(sl.id) + '"' + (canMutate ? '' : ' disabled') + '>' + confirmLabel + '</button></div><label class="workspace-notes">Service notes<textarea data-song-chg="workspace-notes" rows="2" placeholder="Service notes"' + (canMutate ? '' : ' readonly') + '>' + esc(sl.notes || '') + '</textarea></label><section class="selected-songs-panel" aria-labelledby="selected-songs-title"><div class="ws-toolbar"><h2 id="selected-songs-title">Preparation</h2><button class="ws-link" data-song-act="add-song-role" data-role="prep"' + (canMutate ? '' : ' disabled') + '>Add preparation song</button></div><div class="selected-song-list">' + prepRows + '</div></section>' + slot('Glory', glory) + thanksSlot + productionLibraryView(row) + '</div>';
}
function productionLibrary(row) {
  const cats = ['All', 'Appendix'].concat(categoriesInSeed().filter(category => category !== 'Appendix'));
  const sortOpts = SORTS.map(s => '<option value="' + s[0] + '"' + (state.ui.sort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>').join('');
  const list = filteredSongs();
  const sl = row && row.setlist;
  const canMutate = productionCanMutate(row);
  const addDisabled = sl && canMutate ? '' : ' disabled';
  const historyDisabled = editorUnlocked() ? '' : ' disabled';
  return '<label class="library-search" for="production-library-search"><span class="sr-only">Search by number, title, or title word</span><input id="production-library-search" type="search" data-song-chg="search" value="' + esc(state.ui.search || '') + '" placeholder="Search number, title, or word" autocomplete="off"></label><div class="library-categories" role="toolbar" aria-label="Song categories">' + cats.map(category => '<button class="ws-filter' + (state.ui.category === category ? ' active' : '') + '" data-song-act="set-category" data-cat="' + esc(category) + '">' + esc(category) + '</button>').join('') + '</div><div class="library-sort-row"><label class="library-sort">Sort<select data-song-chg="sort">' + sortOpts + '</select></label><span>' + list.length + ' songs</span></div><div class="production-song-list">' + (list.length ? list.map(song => { const st = statFor(song.id); const history = (st.history || []).map(h => '<li>' + esc(fmtDate(h.date) + ' | ' + (h.service || '')) + '<button class="ws-link" data-song-act="remove-history" data-id="' + esc(song.id) + '" data-service="' + esc(h.service || '') + '"' + historyDisabled + '>Remove</button></li>').join(''); const historyBlock = '<details class="catalog-history"><summary>History</summary>' + (history ? '<ul>' + history + '</ul>' : '<p>No sung history yet.</p>') + '</details>'; return '<article class="library-song-block" data-song-id="' + esc(song.id) + '"><div class="production-song-row"><span class="library-number">' + esc(dispNumber(song)) + '</span><span class="dot-c" title="' + esc(song.category) + '" style="background:' + catColor(song.category) + '"></span><strong title="' + esc(song.title) + '">' + esc(song.title) + '</strong><span class="tnum">' + fmtDur(song.durationSec) + '</span><span class="tnum">' + (st.timesSung || 0) + 'x</span><span class="library-last" title="Last sung">' + esc(relTime(st.lastSung)) + '</span><button class="ws-icon-button add-library" data-song-act="add-library-song" data-id="' + esc(song.id) + '" aria-label="Add ' + esc(song.title) + '"' + addDisabled + '>+</button></div>' + historyBlock + '</article>'; }).join('') : '<p class="ws-empty">No songs match this search.</p>') + '</div>';
}
function productionLibraryView(row) {
  if (!row) return productionNoService();
  const sl = row.setlist;
  const canMutate = productionCanMutate(row);
  const role = state.ui.songRole || 'prep';
  const thanksOption = productionThanksApplies(row, sl) ? '<option value="thanks"' + (role === 'thanks' ? ' selected' : '') + '>Thanks</option>' : '';
  const setup = sl ? '' : '<div class="compact-notice">Create this service plan before adding songs. <button class="ws-link" data-song-act="create-workspace-plan" data-id="' + esc(row.id) + '"' + (canMutate ? '' : ' disabled') + '>Create plan</button></div>';
  return '<section class="song-library-panel" data-testid="song-library" aria-labelledby="song-library-title"><div class="ws-toolbar library-heading"><h2 id="song-library-title">Song library</h2><label class="library-role">Add as<select data-song-chg="library-role"' + (canMutate ? '' : ' disabled') + '><option value="prep"' + (role === 'prep' ? ' selected' : '') + '>Preparation</option><option value="glory"' + (role === 'glory' ? ' selected' : '') + '>Glory</option>' + thanksOption + '</select></label></div>' + setup + productionLibrary(row) + '</section>';
}
function productionOrderView(row) {
  if (!row) return productionNoService();
  return '<section class="order-workspace" aria-labelledby="order-workspace-title"><div class="ws-toolbar"><h2 id="order-workspace-title">Order of Worship</h2><button class="ws-button" data-song-act="copy-text" data-id="' + esc(row.id) + '">Copy Text</button></div>' + (row.setlist || row.assignments ? renderOrderOfWorship(row.setlist, { worship: row.worship, service: row.session, assignments: row.assignments, choirSong: row.choirSong }) : '<p class="ws-empty">No order is available for this service.</p>') + '</section>';
}
function productionInsightsView(row) {
  const sl = row && row.setlist;
  const canMutate = productionCanMutate(row);
  const editor = editorUnlocked();
  const serviceActions = sl ? '<section class="ws-card service-tools"><div class="ws-toolbar"><h2>Service actions</h2><span class="ws-badge ' + productionStatusClass(sl) + '">' + esc(productionStatus(sl)) + '</span></div><div class="ws-actions"><button class="ws-button" data-song-act="export-csv">Export history</button><button class="ws-button" data-song-act="open-backfill"' + (editor ? '' : ' disabled') + '>Backfill history</button>' + (sl.status === 'sung' ? '<button class="ws-button" data-song-act="undo-sung" data-id="' + esc(sl.id) + '"' + (editor ? '' : ' disabled') + '>Undo sung</button>' : '<button class="ws-button" data-song-act="mark-sung" data-id="' + esc(sl.id) + '"' + (!(sl.songs || []).length || !editor ? ' disabled' : '') + '>Mark sung</button>') + '<button class="danger-link" data-song-act="delete-setlist" data-id="' + esc(sl.id) + '"' + (canMutate ? '' : ' disabled') + '>Delete setlist</button></div></section>' : '';
  return serviceActions + productionHistory(sl, row) + '<section class="insights-tools"><div class="ws-toolbar"><h2>Library insights</h2><button class="ws-button" data-song-act="sync-catalog">Refresh catalog</button></div>' + renderInsights(false) + '</section>';
}
function productionManualPlan() {
  const canMutate = editorUnlocked();
  if (!state.ui.manualService) return '<button class="ws-link" data-song-act="manual-service"' + (canMutate ? '' : ' disabled') + '>Plan another date</button>';
  const worshipOpts = WORSHIP_TYPES.map(w => '<option>' + esc(w) + '</option>').join('');
  const labelOpts = SERVICE_LABELS.map(l => '<option>' + esc(l) + '</option>').join('');
  return '<div class="ws-card manual-plan"><h2>Plan a manual service</h2><div class="manual-plan-fields"><label for="b-date">Date<input type="date" id="b-date" value="' + esc(todayISO()) + '"></label><label for="b-worship">Worship type<select id="b-worship">' + worshipOpts + '</select></label><label for="b-label">Service<select id="b-label">' + labelOpts + '</select></label></div><div class="ws-actions"><button class="ws-button primary" data-song-act="start-setlist"' + (canMutate ? '' : ' disabled') + '>Start this setlist</button><button class="ws-link" data-song-act="cancel-manual-service">Cancel</button></div></div>';
}
function productionServicesView() {
  const month = productionEnsureMonth();
  const rows = productionMonthRows();
  const groups = {};
  rows.forEach(row => { (groups[row.date] ||= []).push(row); });
  const dates = Object.keys(groups).sort();
  const body = dates.length ? dates.map(date => '<section class="presider-date-group' + (state.ui.presiderDay === date ? ' jump-target' : '') + '" data-testid="presider-date-group" data-date="' + esc(date) + '">' + groups[date].map(productionServiceCard).join('') + '</section>').join('') : '<div class="ws-empty state-card">No services match this Presider view for ' + esc(productionMonthTitle(month)) + '.</div>';
  return '<div class="presider-services-layout">' + productionCalendar() + '<div class="presider-services-main"><div class="presider-month-toolbar"><h2>' + esc(productionMonthTitle(month)) + '</h2><span>' + (state.ui.presiderFilter === 'all' ? 'All services' : 'My presiding dates') + '</span></div><div class="presider-month-list" data-testid="presider-month-list" aria-label="Presider services for ' + esc(productionMonthTitle(month)) + '">' + body + '</div>' + productionManualPlan() + '</div></div>';
}
function productionTabBody(row) {
  if (state.ui.tab === 'select') return productionSelectView(row);
  if (state.ui.tab === 'order') return productionOrderView(row);
  if (state.ui.tab === 'library') return productionLibraryView(row);
  if (state.ui.tab === 'insights') return productionInsightsView(row);
  return productionServicesView();
}
function productionHome() {
  const row = productionSelectedRow();
  const active = ['services', 'select', 'order', 'library', 'insights'].indexOf(state.ui.tab) === -1 ? 'services' : state.ui.tab;
  state.ui.tab = active;
  const context = active === 'services' ? '' : productionContext(row);
  return '<section class="presider-page song-workspace" data-screen="presider"' + (row ? ' data-service-id="' + esc(row.id) + '"' : '') + ' aria-labelledby="presider-page-title"><header class="presider-heading"><h1 id="presider-page-title">Presider</h1><label class="presider-filter" for="presider-filter"><span>Show</span><select id="presider-filter" aria-label="Show services" data-song-chg="presider-filter"><option value="mine"' + (state.ui.presiderFilter !== 'all' ? ' selected' : '') + '>My presiding</option><option value="all"' + (state.ui.presiderFilter === 'all' ? ' selected' : '') + '>All services</option></select></label></header>' + '<div data-snapshot-notices>' + productionSnapshotNotice() + '</div>' + productionTabs() + productionServiceChooser(row) + context + '<div class="presider-tab-panel" id="presider-panel-' + active + '" role="tabpanel" data-testid="' + (active === 'services' ? 'presider-month-list-panel' : 'song-workspace') + '">' + productionTabBody(row) + '</div></section>';
}
function render() {
  if (!root) return;
  if (rootHasFocusedInput()) {
    const notices = root.querySelector('[data-snapshot-notices]');
    if (notices) notices.innerHTML = productionSnapshotNotice();
    return;
  }
  if (state.ui.editorGate) { root.innerHTML = '<section class="presider-page" data-screen="presider">' + renderHeader() + renderEditorGate() + '</section>'; return; }
  root.innerHTML = productionHome();
  if (state.ui.tab === 'services' && state.ui.presiderDay) {
    setTimeout(() => { const target = root && root.querySelector('.presider-date-group[data-date="' + state.ui.presiderDay + '"]'); if (target && target.scrollIntoView) target.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 0);
  }
}

function movePreparationSong(index, direction) {
  const sl = currentSetlist();
  if (!sl) return;
  const prep = (sl.songs || []).map((id, i) => ({ id: id, index: i })).filter(entry => entry.id !== sl.glorySong && entry.id !== sl.thanksSong);
  const pos = prep.findIndex(entry => entry.index === index);
  const next = pos + direction;
  if (pos < 0 || next < 0 || next >= prep.length) return;
  const swap = prep[pos].id; prep[pos].id = prep[next].id; prep[next].id = swap;
  const special = (sl.songs || []).filter(id => id === sl.glorySong || id === sl.thanksSong);
  setlistReorder(sl.id, prep.map(entry => entry.id).concat(special));
}
function copyProductionText(id) {
  const row = productionServiceRows().find(item => item.id === id);
  if (!row) return;
  const sl = row.setlist;
  const lines = [productionDateLabel(row.date) + ' · ' + row.session, 'Presider: ' + productionActualPresider(row)];
  productionSongEntries(sl, row).forEach(entry => lines.push(entry.role + ': #' + entry.song.number + ' ' + entry.song.title));
  if (row.choirSong) lines.push('Choir: ' + productionChoirLabel(row.choirSong));
  const value = lines.join('\n');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).catch(() => window.prompt('Copy this service text:', value));
  else window.prompt('Copy this service text:', value);
}

/* ================= dispatch ================= */

function handleAct(act, el) {
  switch (act) {
    case 'open-workspace': {
      const row = productionServiceRows().find(item => item.id === el.dataset.id);
      if (row) {
        if (!row.setlist && !productionCanMutate(row)) { render(); break; }
        const id = row.setlist ? row.setlist.id : ensureSetlist(row.date, row.worship || WORSHIP_TYPES[0], row.session, 'schedule');
        if (!id) { render(); break; }
        state.ui.currentSetlist = id;
        state.ui.workspaceService = row.id;
        state.ui.tab = 'select';
        state.ui.songRole = 'prep';
        state.ui.search = '';
        state.ui.category = 'All';
        render();
      }
      break;
    }
    case 'close-workspace': state.ui.tab = 'services'; state.ui.songRole = 'prep'; render(); break;
    case 'create-workspace-plan': {
      const row = productionServiceRows().find(item => item.id === el.dataset.id);
      if (row) {
        if (!productionCanMutate(row)) { render(); break; }
        const id = ensureSetlist(row.date, row.worship || WORSHIP_TYPES[0], row.session, 'schedule');
        if (!id) { render(); break; }
        state.ui.currentSetlist = id;
        state.ui.workspaceService = row.id;
        state.ui.tab = 'select';
        render();
      }
      break;
    }
    case 'presider-month-prev': state.ui.presiderMonth = productionShiftMonth(productionEnsureMonth(), -1); state.ui.presiderMonthTouched = true; state.ui.presiderDay = ''; render(); break;
    case 'presider-month-next': state.ui.presiderMonth = productionShiftMonth(productionEnsureMonth(), 1); state.ui.presiderMonthTouched = true; state.ui.presiderDay = ''; render(); break;
    case 'presider-day': state.ui.presiderDay = el.dataset.date || ''; render(); break;
    case 'view-service': state.ui.expandedService = state.ui.expandedService === el.dataset.id ? null : el.dataset.id; render(); break;
    case 'retry-song-snapshots': {
      if (subscriptionStop) { subscriptionStop(); subscriptionStop = null; }
      subscribe();
      render();
      break;
    }
    case 'presider-tab': {
      const tab = el.dataset.tab;
      if (['services', 'select', 'order', 'library', 'insights'].indexOf(tab) !== -1) state.ui.tab = tab;
      render();
      break;
    }
    case 'order-workspace': {
      const row = productionServiceRows().find(item => item.id === el.dataset.id);
      if (row) {
        state.ui.workspaceService = row.id;
        state.ui.currentSetlist = row.setlist ? row.setlist.id : null;
      }
      state.ui.tab = 'order';
      render();
      break;
    }
    case 'add-song-role': {
      const serviceId = el.dataset.id || state.ui.workspaceService || state.ui.currentSetlist;
      if (!productionCanMutate(serviceId)) { render(); break; }
      state.ui.songRole = String(el.dataset.role || 'prep').toLowerCase(); state.ui.search = ''; if (el.dataset.id) state.ui.workspaceService = el.dataset.id; state.ui.tab = 'select'; render(); break;
    }
    case 'add-library-song': {
      const sl = currentSetlist();
      const sid = el.dataset.id;
      const role = state.ui.songRole || 'prep';
      if (!sl || !sid || !productionCanMutate(sl.id)) break;
      if (role === 'glory' || role === 'thanks') {
        const patch = {}; patch[role === 'glory' ? 'glorySong' : 'thanksSong'] = sid;
        if ((sl.songs || []).indexOf(sid) === -1) sl.songs = (sl.songs || []).concat(sid);
        updateSetlist(sl.id, Object.assign({ songs: (sl.songs || []).slice() }, patch));
      } else if ((sl.songs || []).indexOf(sid) === -1) setlistAddSong(sl.id, sid);
      render();
      break;
    }
    case 'remove-workspace-song': {
      const sl = currentSetlist();
      if (sl && productionCanMutate(sl.id)) {
        const index = Number(el.dataset.index);
        if (index >= 0) setlistRemoveSongAt(sl.id, index);
        else {
          const sid = el.dataset.songId;
          const patch = {};
          if (sl.glorySong === sid) patch.glorySong = null;
          if (sl.thanksSong === sid) patch.thanksSong = null;
          const songs = (sl.songs || []).filter(songId => songId !== sid);
          updateSetlist(sl.id, Object.assign({ songs: songs }, patch));
        }
      }
      break;
    }
    case 'prep-up': if (productionCanMutate(state.ui.currentSetlist)) movePreparationSong(Number(el.dataset.index), -1); break;
    case 'prep-down': if (productionCanMutate(state.ui.currentSetlist)) movePreparationSong(Number(el.dataset.index), 1); break;
    case 'request-change': {
      const row = productionServiceRows().find(item => item.id === el.dataset.id);
      if (ctx && ctx.ui && typeof ctx.ui.requestChange === 'function') ctx.ui.requestChange(row || null);
      else if (ctx && typeof ctx.requestChange === 'function') ctx.requestChange(row || null);
      else {
        try { window.dispatchEvent(new CustomEvent('worship-request-change', { detail: row || null })); } catch (ignore) {}
        if (ctx && ctx.onBack) ctx.onBack();
      }
      break;
    }
    case 'copy-text': copyProductionText(el.dataset.id); break;
    case 'retry-save': {
      const id = el.dataset.id;
      const save = id && saveStates[id];
      if (productionCanMutate(id) && save && save.state === 'failed' && save.retryPayload) writeSetlistPatch(id, save.retryPayload);
      break;
    }
    case 'sync-catalog': syncCatalog(); break;
    case 'set-category': state.ui.category = el.dataset.cat; render(); break;
    case 'confirm-songs': {
      const id = el.dataset.id || state.ui.currentSetlist || state.ui.workspaceService;
      if (productionCanMutate(id)) confirmSetlist(id);
      break;
    }
    case 'start-setlist': {
      const date = root.querySelector('#b-date').value || todayISO();
      const worship = root.querySelector('#b-worship').value;
      const label = root.querySelector('#b-label').value;
      state.ui.currentSetlist = ensureSetlist(date, worship, label, 'manual');
      if (!state.ui.currentSetlist) { render(); break; }
      state.ui.workspaceService = state.ui.currentSetlist;
      state.ui.tab = 'select';
      state.ui.manualService = false; render(); break;
    }
    case 'manual-service': state.ui.manualService = true; render(); break;
    case 'cancel-manual-service': state.ui.manualService = false; render(); break;
    case 'mark-sung': {
      const id = el.dataset.id;
      requireEditor(() => { if (confirm('This updates every song’s sung count — do this after the service.')) markSetlistSung(id); else render(); });
      break;
    }
    case 'undo-sung': {
      const id = el.dataset.id;
      requireEditor(() => { if (confirm('Undo marking this setlist as sung? Every song’s count will be recomputed.')) undoSetlistSung(id); else render(); });
      break;
    }
    case 'delete-setlist': {
      const id = el.dataset.id;
      if (productionCanMutate(id) && confirm('Delete this setlist? This cannot be undone (sung history for its songs is untouched).')) deleteSetlistById(id);
      else render();
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
    case 'open-presider-mgr': requireEditor(() => { state.ui.showPresiderMgr = true; render(); }); break;
    case 'close-presider-mgr': state.ui.showPresiderMgr = false; render(); break;
    case 'add-presider-form': {
      requireEditor(() => {
        const input = root.querySelector('#new-presider-name');
        const name = input ? input.value.trim() : '';
        if (name) addPresider(name);
        state.ui.showPresiderMgr = true; render();
      });
      break;
    }
    case 'remove-presider': {
      const name = el.dataset.name;
      requireEditor(() => { if (confirm('Remove "' + name + '" from the presider list?')) removePresider(name); state.ui.showPresiderMgr = true; render(); });
      break;
    }
    case 'export-csv': exportHistoryCSV(); break;
    default: console.warn('Unhandled data-song-act:', act);
  }
}

const debounceTimers = {};
function debounce(key, fn, ms) {
  const previous = debounceTimers[key];
  if (previous) clearTimeout(previous.timer);
  const entry = { timer: null, flush: fn };
  entry.timer = setTimeout(() => {
    if (debounceTimers[key] === entry) delete debounceTimers[key];
    fn();
  }, ms);
  debounceTimers[key] = entry;
}

function handleChg(chg, el) {
  switch (chg) {
    case 'presider-filter': state.ui.presiderFilter = el.value === 'all' ? 'all' : 'mine'; state.ui.presiderDay = ''; render(); break;
    case 'presider-service': {
      state.ui.workspaceService = el.value || null;
      const row = productionServiceRows().find(item => item.id === state.ui.workspaceService);
      state.ui.currentSetlist = row && row.setlist ? row.setlist.id : null;
      render();
      break;
    }
    case 'library-role': if (productionCanMutate(state.ui.workspaceService || state.ui.currentSetlist)) { state.ui.songRole = el.value || 'prep'; render(); } break;
    case 'song-role': {
      const sl = currentSetlist();
      const sid = el.dataset.songId;
      const role = el.value || 'prep';
      if (!sl || !sid || !productionCanMutate(sl.id)) break;
      const songs = (sl.songs || []).slice();
      if (songs.indexOf(sid) === -1) songs.push(sid);
      const patch = { songs: songs };
      if (role === 'glory') { patch.glorySong = sid; if (sl.thanksSong === sid) patch.thanksSong = null; }
      else if (role === 'thanks') { patch.thanksSong = sid; if (sl.glorySong === sid) patch.glorySong = null; }
      else { if (sl.glorySong === sid) patch.glorySong = null; if (sl.thanksSong === sid) patch.thanksSong = null; }
      updateSetlist(sl.id, patch);
      break;
    }
    case 'workspace-notes': {
      const sl = currentSetlist();
      if (sl && productionCanMutate(sl.id)) {
        const id = sl.id;
        const value = String(el.value || '');
        debounce('workspace-notes:' + id, () => updateSetlist(id, { notes: value }), 450);
      }
      break;
    }
    case 'search': state.ui.search = el.value; render(); break;
    case 'sort': state.ui.sort = el.value; render(); break;
    case 'bf-song': state.ui.backfillSong = el.value; break;
    case 'bf-date': state.ui.backfillDate = el.value; break;
    default: console.warn('Unhandled data-song-chg:', chg);
  }
}

/* ================= root event wiring (scoped to #song-root) ================= */

function wireRoot() {
  rootAbortController = new AbortController();
  const signal = rootAbortController.signal;
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-song-act]');
    if (!el || el.tagName === 'FORM') return;
    if (e.target.closest('[data-song-chg]')) return;
    handleAct(el.dataset.songAct, el);
  }, { signal: signal });
  root.addEventListener('submit', e => {
    const el = e.target.closest('[data-song-act]');
    if (!el) return;
    e.preventDefault();
    handleAct(el.dataset.songAct, el);
  }, { signal: signal });
  root.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[data-song-act][role="button"]');
    if (!el || e.target !== el) return;
    e.preventDefault();
    handleAct(el.dataset.songAct, el);
  }, { signal: signal });
  root.addEventListener('input', e => {
    const el = e.target.closest('[data-song-chg]');
    if (!el) return;
    const chg = el.dataset.songChg;
    if (chg === 'search') {
      state.ui.search = el.value;
      const caret = el.selectionStart;
      el.blur(); render();
      const next = root && root.querySelector('#production-library-search');
      if (next) { next.focus(); try { next.setSelectionRange(caret, caret); } catch (ignore) {} }
    }
    else if (chg === 'workspace-notes') handleChg(chg, el);
  }, { signal: signal });
  root.addEventListener('change', e => {
    const el = e.target.closest('[data-song-chg]');
    if (!el) return;
    const chg = el.dataset.songChg;
    if (chg === 'search' || chg === 'workspace-notes') return;
    handleChg(chg, el);
  }, { signal: signal });

}

/* ================= Firestore subscription (via song repository) ================= */

function subscribe() {
  if (!songRepository || !songRepository.isRemote()) return;
  let fellBack = false;
  function fallbackToLocal(err, source) {
    state._snapshotError = source || 'all';
    if (err && err.code !== 'permission-denied') {
      console.warn('song snapshot error (staying in Firebase mode):', err);
      render();
      return;
    }
    if (fellBack) return;
    fellBack = true;
    console.warn('Firestore access denied for the song picker, using this device only:', err);
    if (subscriptionStop) { subscriptionStop(); subscriptionStop = null; }
    fb = null;
    firebaseGateway = null;
    songRepository = SONG_REPOSITORY.createSongRepository({ storage: typeof localStorage !== 'undefined' ? localStorage : null, key: DATA_KEY });
    loadLocal();
    render();
  }
  subscriptionStop = songRepository.startSubscriptions({
    setlists(map, changes) {
      if (state._snapshotError === 'setlists' || state._snapshotError === 'all') state._snapshotError = '';
      state.setlists = mergePendingSetlists(map);
      const firstLoad = !state._setlistsLoaded;
      state._setlistsLoaded = true;
      if (!firstLoad) (changes || []).forEach(change => {
        if (change.type === 'removed') { pushToSheet('setlist-remove', { id: change.id }); return; }
        const d = change.data || map[change.id];
        if (d && !mirrorSeen('setlist', change.id, String(d.updatedAt || ''))) pushToSheet('setlist', d);
      });
      maybeSyncPresiderSchedule();
      render();
    },
    stats(map, changes) {
      if (state._snapshotError === 'stats') state._snapshotError = '';
      const firstLoad = !state._statsLoaded;
      state.stats = map;
      state._statsLoaded = true;
      if (!firstLoad) {
        const rows = [];
        (changes || []).forEach(change => {
          if (change.type === 'removed') {
            const song = state.songById[change.id];
            if (song) pushToSheet('stats-zero', { number: song.number });
            return;
          }
          const stat = change.data || map[change.id];
          if (stat && !mirrorSeen('stat', change.id, (stat.timesSung || 0) + '|' + (stat.lastSung || ''))) {
            const row = statRowForSheet(change.id, stat);
            if (row) rows.push(row);
          }
        });
        if (rows.length) pushToSheet('stats', rows);
      }
      render();
    },
    settings(value) { if (state._snapshotError === 'settings') state._snapshotError = ''; state.settings = value || {}; render(); },
    presiders(value) { if (state._snapshotError === 'presiders') state._snapshotError = ''; state.presiders = Array.isArray(value) ? value.slice() : []; render(); },
    nameMap(value) {
      if (state._snapshotError === 'nameMap') state._snapshotError = '';
      state.nameMap = Object.assign({}, (ctx && ctx.nameMap) || {}, value || {});
      render();
    },
    schedule(value) {
      if (state._snapshotError === 'schedule') state._snapshotError = '';
      state.schedule = Array.isArray(value) ? value : [];
      state._scheduleLoaded = true;
      maybeSyncPresiderSchedule();
      render();
    },
    error: fallbackToLocal
  });
}

/* ================= catalog load ================= */

function loadCatalog() {
  const seedSongs = (window.SONG_SEED && window.SONG_SEED.songs) || [];
  state.songs = applyTitleOverrides(Array.isArray(seedSongs) ? seedSongs.slice() : []);
  state.songById = {};
  state.songs.forEach(s => { state.songById[s.id] = s; });
}

/* ================= mount and lifecycle ================= */

function clearMountResources() {
  root = null;
  Object.keys(debounceTimers).forEach(key => {
    const entry = debounceTimers[key];
    clearTimeout(entry.timer);
    delete debounceTimers[key];
    if (entry.flush) entry.flush();
  });
  if (rootAbortController) { rootAbortController.abort(); rootAbortController = null; }
  if (subscriptionStop) { subscriptionStop(); subscriptionStop = null; }
  if (libObserver) { libObserver.disconnect(); libObserver = null; }
  ctx = null;
  _wiredRoot = null;
}

export function unmount() {
  clearMountResources();
}

/* ================= mount (the module's only export) ================= */

export function mount(rootEl, context) {
  if (root && root !== rootEl) clearMountResources();
  root = rootEl;
  ctx = context || {};
  const nextGateway = makeCompatibleGateway(ctx);
  const gatewayChanged = !nextGateway || !firebaseGateway || nextGateway.firebase !== firebaseGateway.firebase;
  if (gatewayChanged) firebaseGateway = nextGateway;
  fb = firebaseGateway ? firebaseGateway.firebase : (ctx.fb || null);
  if (gatewayChanged || !songRepository || (songRepository.isRemote() !== !!firebaseGateway)) {
    songRepository = SONG_REPOSITORY.createSongRepository({
      gateway: firebaseGateway,
      storage: typeof localStorage !== 'undefined' ? localStorage : null,
      key: DATA_KEY
    });
  }
  state.nameMap = Object.assign({}, state.nameMap, (ctx.nameMap || {}));
  if (ctx.me && state.ui.me && ctx.me !== state.ui.me && !state.ui.presiderMonthTouched) state.ui.presiderMonth = '';
  state.ui.me = ctx.me || state.ui.me || '';
  if (Array.isArray(ctx.schedule)) {
    state.schedule = ctx.schedule.map(item => Object.assign({}, item, {
      assignments: item.assignments || {},
      choirSong: item.choirSong || '',
      time: item.time || item.time24 || '',
      time24: item.time24 || item.time || ''
    }));
    state._scheduleLoaded = true;
  }

  if (!_catalogLoaded) { loadCatalog(); _catalogLoaded = true; syncCatalog(); }
  if (!subscriptionStop && songRepository.isRemote()) {
    subscribe();
  } else if (!songRepository.isRemote() && !state._localLoaded) {
    loadLocal();
    state._localLoaded = true;
  }
  if (_wiredRoot !== root) { wireRoot(); _wiredRoot = root; }

  // Explicit navigation from the host (ctx.nav is a one-shot flag): a tapped
  // "Pick songs" button opens that service's setlist; the Presider tab (no
  // service) opens Home. Background re-mounts from live sync arrive with
  // nav: false and must leave whatever view the presider is on untouched.
  if (ctx.nav) {
    state.ui.runsheet = null;
    if (ctx.service && ctx.service.date && ctx.service.service) {
      const svc = ctx.service;
      const id = serviceIdFor(svc.date, svc.service);
      if (!state.setlists[id]) ensureSetlist(svc.date, svc.worship || WORSHIP_TYPES[0], svc.service, 'schedule');
      state.ui.currentSetlist = id;
      state.ui.workspaceService = id;
      state.ui.tab = 'select';
    } else {
      state.ui.tab = 'services';
    }
  }

  productionEnsureMonth();

  render();
}

// Keep the existing local fallback in sync with manager reassignment.
export function updateLocalPresider(change) {
  if (fb) return;
  const plan = state.setlists[change.serviceId];
  if (!plan) return;
  plan.presider = change.presider || '';
  plan.updatedAt = Math.max(Date.now(), Number(plan.updatedAt || 0) + 1, Number(plan.confirmedAt || 0) + 1);
  plan.updatedBy = state.ui.me || '';
  saveLocal();
}

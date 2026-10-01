/* Song lists (setlists/{service id}) and times sung (songStats/{song id}).
   Counting uses song-lib.js, the same code the Signal ingest uses, so a song
   marked sung here and one marked from Signal count the same way.

   A song list is "confirmed" when confirmedAt is at least updatedAt: any
   later change, from here or from Signal, moves updatedAt ahead of it. */
import { fb } from '../firebase.js';
import { data, ui } from '../store.js';
import { renderSoon } from '../render.js';
import { notice } from '../ui/banners.js';
import { planner } from './state.js';
import { canEdit } from './access.js';
import { serviceId, isUpcoming, isInProgress } from '../lib/services.js';

const lib = () => window.SongLib;

/* Lists made on this device that the next snapshot may not include yet. */
const pending = {};
const creating = {};

export function listen() {
  if (planner.listening || !fb.db) return;
  planner.listening = true;
  fb.onSnapshot(fb.collection(fb.db, 'setlists'), snapshot => {
    const setlists = {};
    snapshot.docs.forEach(doc => { setlists[doc.id] = doc.data(); });
    Object.keys(pending).forEach(id => { if (setlists[id]) delete pending[id]; else setlists[id] = pending[id]; });
    planner.setlists = setlists;
    planner.loaded.setlists = true;
    createMine();
    renderSoon();
  }, error => console.warn('Song lists stopped updating:', error));
  fb.onSnapshot(fb.collection(fb.db, 'songStats'), snapshot => {
    const stats = {};
    snapshot.docs.forEach(doc => { stats[doc.id] = doc.data(); });
    planner.stats = stats;
    planner.loaded.stats = true;
    renderSoon();
  }, error => console.warn('Song counts stopped updating:', error));
}

function stamp(patch) {
  patch.updatedAt = Date.now();
  patch.updatedBy = ui.me || 'Someone';
  return patch;
}

function failed(message) {
  return error => {
    console.warn(message, error);
    notice(message + ' Check your connection and try again.', true);
  };
}

/* ---- the song list for one service ---- */

/* Make the list if it does not exist yet. The document is only created when
   it is truly missing, so opening a service never blanks a list someone
   else already filled. */
export function ensureSetlist(service, source = 'manual') {
  const id = serviceId(service);
  if (planner.setlists[id]) return id;
  const setlist = stamp({
    id, date: service.date, worshipType: service.worship || 'Sabbath Day', serviceLabel: service.service,
    presider: (service.assignments || {}).Presider || ui.me || '', notes: '', songs: [], status: 'planned', sungAt: null, source
  });
  planner.setlists[id] = setlist;
  pending[id] = setlist;
  const ref = fb.doc(fb.db, 'setlists', id);
  creating[id] = fb.runTransaction(fb.db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) transaction.set(ref, planner.setlists[id] || setlist);
  }).catch(error => {
    delete pending[id];
    failed('That service could not be opened for songs.')(error);
  }).finally(() => { delete creating[id]; });
  return id;
}

/* Every change to a list: wait for its creation, update it, or write it
   whole if the document went missing. */
function change(id, patch) {
  const setlist = planner.setlists[id];
  if (!setlist) return;
  if (patch.updatedAt == null) stamp(patch); // a confirm stamps its own, equal to confirmedAt
  Object.assign(setlist, patch);
  renderSoon();
  const ref = fb.doc(fb.db, 'setlists', id);
  const run = () => fb.updateDoc(ref, patch).catch(() => fb.setDoc(ref, Object.assign({}, setlist)));
  (creating[id] ? creating[id].then(run) : run()).catch(failed('That change was not saved.'));
}

export function addSong(id, songId) {
  const setlist = planner.setlists[id];
  if (setlist && canEdit(setlist)) change(id, { songs: (setlist.songs || []).concat(songId) });
}

export function removeSong(id, index) {
  const setlist = planner.setlists[id];
  if (!setlist || !canEdit(setlist)) return;
  const songs = (setlist.songs || []).slice();
  const [removed] = songs.splice(index, 1);
  const patch = { songs };
  if (!songs.includes(removed)) {
    if (setlist.glorySong === removed) patch.glorySong = null;
    if (setlist.thanksSong === removed) patch.thanksSong = null;
  }
  change(id, patch);
}

export function moveSong(id, from, to) {
  const setlist = planner.setlists[id];
  const songs = setlist ? (setlist.songs || []).slice() : [];
  if (!setlist || !canEdit(setlist) || to < 0 || to >= songs.length) return;
  [songs[from], songs[to]] = [songs[to], songs[from]];
  change(id, { songs });
}

export function setSlot(id, slot, songId) {
  const setlist = planner.setlists[id];
  if (!setlist || !canEdit(setlist)) return;
  const patch = { [slot === 'glory' ? 'glorySong' : 'thanksSong']: songId };
  if (!(setlist.songs || []).includes(songId)) patch.songs = (setlist.songs || []).concat(songId);
  change(id, patch);
}

/* Take the Glory or Thanks song off the list. */
export function clearSlot(id, slot) {
  const setlist = planner.setlists[id];
  const field = slot === 'glory' ? 'glorySong' : 'thanksSong';
  const other = slot === 'glory' ? 'thanksSong' : 'glorySong';
  const songId = setlist && setlist[field];
  if (!songId || !canEdit(setlist)) return;
  const patch = { [field]: null };
  if (setlist[other] !== songId) patch.songs = (setlist.songs || []).filter(item => item !== songId);
  change(id, patch);
}

export function confirmSongs(id) {
  const setlist = planner.setlists[id];
  if (!setlist || !canEdit(setlist) || !(setlist.songs || []).length) return;
  const patch = stamp({ confirmedBy: ui.me });
  patch.confirmedAt = patch.updatedAt;
  change(id, patch);
}

export function isConfirmed(setlist) {
  return !!(setlist && setlist.confirmedAt && setlist.confirmedAt >= (setlist.updatedAt || 0));
}
export function changedSinceConfirmed(setlist) {
  return !!(setlist && setlist.confirmedAt && setlist.confirmedAt < (setlist.updatedAt || 0));
}

/* Mark sung / undo: one transaction over the list and every song's count. */
async function recount(id, apply, listPatch) {
  const by = ui.me || 'Someone', at = Date.now();
  await fb.runTransaction(fb.db, async transaction => {
    const listRef = fb.doc(fb.db, 'setlists', id);
    const fresh = await transaction.get(listRef);
    if (!fresh.exists()) return;
    const setlist = fresh.data();
    const refs = {}, stats = {};
    for (const songId of setlist.songs || []) {
      if (refs[songId]) continue;
      refs[songId] = fb.doc(fb.db, 'songStats', songId);
      const snapshot = await transaction.get(refs[songId]);
      if (snapshot.exists()) stats[songId] = snapshot.data();
    }
    const result = apply(stats, setlist, { by, markedAt: at });
    if (!result) return;
    Object.keys(result.changed).forEach(songId => transaction.set(refs[songId], result.changed[songId]));
    (result.removed || []).forEach(songId => transaction.delete(refs[songId]));
    transaction.update(listRef, Object.assign({ updatedAt: at, updatedBy: by }, listPatch(at)));
  });
}

export function markSung(id) {
  const setlist = planner.setlists[id];
  if (!setlist || !canEdit(setlist) || setlist.status === 'sung') return;
  recount(id, (stats, fresh, opts) => fresh.status === 'sung' ? null : lib().applySung(stats, fresh, opts), at => ({ status: 'sung', sungAt: at }))
    .catch(failed('The songs were not marked as sung.'));
}

export function undoSung(id) {
  const setlist = planner.setlists[id];
  if (!setlist || !canEdit(setlist)) return;
  recount(id, (stats, fresh) => lib().applyUndo(stats, fresh), () => ({ status: 'planned', sungAt: null }))
    .catch(failed('That was not undone.'));
}

export async function deleteSetlist(id) {
  const setlist = planner.setlists[id];
  if (!setlist || !canEdit(setlist)) return;
  try { await fb.deleteDoc(fb.doc(fb.db, 'setlists', id)); }
  catch (error) { failed('The song list was not deleted.')(error); }
}

/* ---- song history (song editors and administrators) ---- */

async function statsDoc(songId) {
  if (planner.stats[songId]) return { [songId]: planner.stats[songId] };
  const snapshot = await fb.getDoc(fb.doc(fb.db, 'songStats', songId));
  return snapshot.exists() ? { [songId]: snapshot.data() } : {};
}

export async function addPastDate(songId, date) {
  try {
    const doc = lib().applyBackfill(await statsDoc(songId), songId, date, { by: ui.me || 'Someone', markedAt: Date.now() });
    if (doc) await fb.setDoc(fb.doc(fb.db, 'songStats', songId), doc, { merge: true });
    return true;
  } catch (error) {
    failed('The past date was not saved.')(error);
    return false;
  }
}

export async function removePastEntry(songId, service) {
  try {
    const result = lib().removeHistoryEntry(await statsDoc(songId), songId, service);
    if (result.removed) await fb.deleteDoc(fb.doc(fb.db, 'songStats', songId));
    else if (result.changed) await fb.setDoc(fb.doc(fb.db, 'songStats', songId), result.changed);
  } catch (error) {
    failed('That entry was not removed.')(error);
  }
}

/* ---- services ---- */

/* A service stays current for three hours after it starts, so the runsheet
   and Mark as sung work during and right after it. */
export function current(service) { return isUpcoming(service) || isInProgress(service); }

export function myServices() {
  return data.services.filter(service => current(service) && (service.assignments || {}).Presider === ui.me)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time)));
}

/* Each presider's own upcoming services get a song list as soon as they
   open the planner, so their name is on it before anyone picks songs. */
function createMine() {
  if (!planner.loaded.setlists || !ui.me) return;
  myServices().forEach(service => {
    const id = serviceId(service);
    const setlist = planner.setlists[id];
    if (!setlist) { ensureSetlist(service, 'schedule'); return; }
    if (setlist.presider !== ui.me && canEdit(setlist)) change(id, { presider: ui.me });
  });
}

export function totalTime(setlist) {
  return lib().totalDuration(lib().countedSongIds(setlist), planner.songById);
}
export function countedSongs(setlist) { return lib().countedSongIds(setlist); }

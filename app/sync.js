/* Live data. Each Firestore listener copies its documents into the store
   and asks for a redraw. The schedule is also saved on the device so the
   next start-up can show it at once, and offline. */
import { fb } from './firebase.js';
import { data, loaded, canonicalizeNames, canonicalizeService, canonicalizeRosters, saveCache } from './store.js';
import { renderSoon } from './render.js';
import { notice } from './ui/banners.js';
import { afterScheduleChange } from './services/notifications.js';
import { todayISO } from './lib/dates.js';

function listen(path, apply, failed = () => {}) {
  const target = path.includes('/') ? fb.doc(fb.db, ...path.split('/')) : fb.collection(fb.db, path);
  return fb.onSnapshot(target, snapshot => { apply(snapshot); renderSoon(); },
    error => { console.warn('Listener stopped: ' + path, error); failed(); renderSoon(); });
}

/* Services by document id. A snapshot after the first carries only the
   services that changed, so only those are read and respelled. */
const services = new Map();

export function startSync() {
  fb.onSnapshot(fb.collection(fb.db, 'schedule'), snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'removed') services.delete(change.doc.id);
      else services.set(change.doc.id, canonicalizeService(change.doc.data()));
    });
    data.services = Array.from(services.values());
    loaded.schedule = true;
    saveCache();
    afterScheduleChange();
    renderSoon();
  }, error => {
    console.warn('Schedule listener stopped:', error);
    notice('The shared schedule could not be reached. Showing the copy saved on this device.', true);
    renderSoon();
  });
  listen('app/members', snapshot => {
    data.members = snapshot.exists() ? (snapshot.data().list || []) : [];
    canonicalizeNames();
    loaded.members = true;
  });
  // Settled either way, so the passcode screen does not wait for ever.
  listen('app/settings', snapshot => {
    data.settings = snapshot.exists() ? snapshot.data() : {};
    loaded.settings = true;
    saveCache();
  }, () => { loaded.settings = true; });
  listen('app/departments', snapshot => {
    data.rosters = snapshot.exists() ? (snapshot.data().map || {}) : {};
    canonicalizeRosters();
    loaded.rosters = true;
  });
  listen('app/leaderConfig', snapshot => {
    data.leaderConfig = snapshot.exists() ? snapshot.data() : null;
  });
  listen('app/nameMap', snapshot => {
    data.nameMap = snapshot.exists() ? (snapshot.data().map || {}) : {};
    canonicalizeNames();
  });
}

/* Song lists from today on, for the song status on My Duties. Only signed-in
   members may read them, so this starts at sign-in (`on` true) and stops at
   sign-out; a listener that failed starts again at the next sign-in. */
let stopSetlists = null;
export function watchSetlists(on) {
  if (!on || !fb.db) {
    if (stopSetlists) stopSetlists();
    stopSetlists = null;
    data.setlists = {};
    return;
  }
  if (stopSetlists) return;
  stopSetlists = fb.onSnapshot(fb.query(fb.collection(fb.db, 'setlists'), fb.where('date', '>=', todayISO())), snapshot => {
    const setlists = {};
    snapshot.docs.forEach(doc => { setlists[doc.id] = doc.data(); });
    data.setlists = setlists;
    renderSoon();
  }, error => {
    console.warn('Setlist listener stopped:', error);
    stopSetlists = null;
  });
}

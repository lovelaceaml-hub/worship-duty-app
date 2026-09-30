/* Live data. Each Firestore listener copies its documents into the store
   and asks for a redraw. The schedule is also saved on the device so the
   next start-up can show it at once, and offline. */
import { fb } from './firebase.js';
import { data, loaded, canonicalizeNames, saveCache } from './store.js';
import { renderSoon } from './render.js';
import { notice } from './ui/banners.js';
import { afterScheduleChange } from './services/notifications.js';
import { todayISO } from './lib/dates.js';

function listen(path, apply) {
  const target = path.includes('/') ? fb.doc(fb.db, ...path.split('/')) : fb.collection(fb.db, path);
  return fb.onSnapshot(target, snapshot => { apply(snapshot); renderSoon(); },
    error => console.warn('Listener stopped: ' + path, error));
}

export function startSync() {
  fb.onSnapshot(fb.collection(fb.db, 'schedule'), snapshot => {
    data.services = snapshot.docs.map(doc => doc.data());
    canonicalizeNames();
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
  listen('app/settings', snapshot => {
    data.settings = snapshot.exists() ? snapshot.data() : {};
    loaded.settings = true;
    saveCache();
  });
  listen('app/departments', snapshot => {
    data.rosters = snapshot.exists() ? (snapshot.data().map || {}) : {};
    canonicalizeNames();
    loaded.rosters = true;
  });
  listen('app/leaderConfig', snapshot => {
    data.leaderConfig = snapshot.exists() ? snapshot.data() : null;
  });
  listen('app/nameMap', snapshot => {
    data.nameMap = snapshot.exists() ? (snapshot.data().map || {}) : {};
    canonicalizeNames();
  });
  // Song lists from today on, for the song status on My Duties.
  fb.onSnapshot(fb.query(fb.collection(fb.db, 'setlists'), fb.where('date', '>=', todayISO())), snapshot => {
    const setlists = {};
    snapshot.docs.forEach(doc => { setlists[doc.id] = doc.data(); });
    data.setlists = setlists;
    renderSoon();
  }, error => console.warn('Setlist listener stopped:', error));
}

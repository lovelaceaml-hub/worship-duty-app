import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const serviceIdFor = (date, service) => date + '_' + String(service || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const future = (day, service, presider, extras = {}) => ({
  id: serviceIdFor('2026-09-' + day, service),
  date: '2026-09-' + day,
  service,
  worship: 'Sabbath Day',
  assignments: { Presider: presider, Sermon: extras.sermon || presider },
  choirSong: ''
});

const schedule = [
  future('15', 'Morning', 'B. Brent'),
  future('16', 'Evening', 'D. Chris'),
  future('17', 'Afternoon', 'D. Chris', { sermon: 'B. Brent' })
];
const setlists = Object.fromEntries(schedule.slice(0, 2).map(entry => {
  const id = serviceIdFor(entry.date, entry.service);
  return [id, {
    id,
    date: entry.date,
    worshipType: entry.worship,
    serviceLabel: entry.service,
    presider: entry.assignments.Presider,
    songs: ['001'],
    status: 'planned',
    updatedAt: 1,
    updatedBy: entry.assignments.Presider
  }];
}));

class FakeRoot {
  constructor() { this.innerHTML = ''; this.listeners = {}; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  contains() { return false; }
  querySelector() { return null; }
}

function fakeSnapshot(name) {
  if (name === 'schedule') {
    return {
      docs: schedule.map(data => ({ id: data.id, data: () => data })),
      docChanges: () => []
    };
  }
  if (name === 'setlists') {
    return {
      docs: Object.entries(setlists).map(([id, data]) => ({ id, data: () => data })),
      docChanges: () => []
    };
  }
  return { docs: [], docChanges: () => [], exists: () => false, data: () => ({}) };
}

function fakeFirebase() {
  const db = {};
  return {
    db,
    collection: (_db, name) => ({ kind: 'collection', name }),
    doc: (_db, ...parts) => ({ kind: 'doc', name: parts.join('/') }),
    onSnapshot: (ref, next) => {
      next(fakeSnapshot(ref.name));
      return () => {};
    }
  };
}

globalThis.window = {
  SONG_SEED: { songs: [{ id: '001', number: '001', title: 'First Song', category: 'Glory', durationSec: 180 }] },
  SongLib: {
    serviceIdFor,
    recompute: () => ({}),
    applySung: () => ({ changed: {} }),
    applyUndo: () => ({ changed: {}, removed: [] }),
    backfillServiceId: () => '',
    applyBackfill: () => null,
    removeHistoryEntry: () => ({ changed: null, removed: false }),
    totalDuration: () => 180,
    countedSongIds: sl => (sl && sl.songs) || []
  }
};
globalThis.document = { activeElement: null };
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
globalThis.fetch = async () => ({ ok: false, status: 503 });
globalThis.alert = () => {};
globalThis.confirm = () => true;

const moduleURL = pathToFileURL('/Users/anthony/Projects/worship-duty-app-worktrees/auth-l7/song-app.js').href + '?permissions-test=1';
const { mount } = await import(moduleURL);

function click(root, action, dataset = {}) {
  const control = {
    tagName: 'BUTTON',
    dataset: { ...dataset, songAct: action },
    closest(selector) {
      if (selector === '[data-song-act]') return this;
      return null;
    }
  };
  root.listeners.click({ target: control });
}

function countActions(html, action) {
  return (html.match(new RegExp('data-song-act="' + action + '"', 'g')) || []).length;
}

const mineRoot = new FakeRoot();
await mount(mineRoot, { fb: fakeFirebase(), me: 'B. Brent', permissions: { roles: ['Choir Song Editor'] }, nav: true });
assert.match(mineRoot.innerHTML, /My Services/);
assert.match(mineRoot.innerHTML, /All Services/);
assert.match(mineRoot.innerHTML, /2026/);
assert.match(mineRoot.innerHTML, /Morning/);
assert.doesNotMatch(mineRoot.innerHTML, /Evening/);
assert.doesNotMatch(mineRoot.innerHTML, /Afternoon/);
assert.equal(countActions(mineRoot.innerHTML, 'build-for'), 1, 'assigned Presider can edit their own service');

click(mineRoot, 'home-scope', { scope: 'all' });
assert.match(mineRoot.innerHTML, /Evening/);
assert.match(mineRoot.innerHTML, /Presider: D\. Chris/);
assert.match(mineRoot.innerHTML, /other-presider/);
assert.doesNotMatch(mineRoot.innerHTML, /Not your service/i);
assert.equal(countActions(mineRoot.innerHTML, 'build-for'), 3, 'choir-song editor can edit all services');

const assignedRoot = new FakeRoot();
await mount(assignedRoot, {
  fb: fakeFirebase(),
  me: 'D. Chris',
  permissions: { roles: ['Worship'] },
  nav: true
});
click(assignedRoot, 'home-scope', { scope: 'mine' });
assert.doesNotMatch(assignedRoot.innerHTML, /Morning/);
assert.match(assignedRoot.innerHTML, /Evening/);
assert.match(assignedRoot.innerHTML, /Afternoon/);
assert.equal(countActions(assignedRoot.innerHTML, 'build-for'), 2, 'assigned Presider can edit only their own services');
click(assignedRoot, 'tab', { tab: 'insights' });
assert.equal(countActions(assignedRoot.innerHTML, 'open-presider-mgr'), 0, 'Worship role does not expose presider administration');

const leaderRoot = new FakeRoot();
await mount(leaderRoot, {
  fb: fakeFirebase(),
  me: 'E. Simon',
  permissions: { roles: ['Worship'] },
  nav: true
});
click(leaderRoot, 'home-scope', { scope: 'all' });
assert.equal(countActions(leaderRoot.innerHTML, 'build-for'), 0, 'Worship permission alone does not grant song editing');
assert.match(leaderRoot.innerHTML, /other-presider/);
assert.match(leaderRoot.innerHTML, /Presider: B\. Brent/);

const injectedRoot = new FakeRoot();
await mount(injectedRoot, {
  fb: fakeFirebase(),
  me: 'S. Paola',
  canEditSongService: service => service.service === 'Morning',
  nav: true
});
click(injectedRoot, 'home-scope', { scope: 'all' });
assert.equal(countActions(injectedRoot.innerHTML, 'build-for'), 1, 'host callback grants only the selected song service');
assert.match(injectedRoot.innerHTML, /Morning/);
assert.match(injectedRoot.innerHTML, /Evening/);

const deniedRoot = new FakeRoot();
await mount(deniedRoot, {
  fb: fakeFirebase(),
  me: 'B. Brent',
  permissions: { roles: ['Choir Song Editor'] },
  canEditSongService: () => false,
  nav: true
});
assert.equal(countActions(deniedRoot.innerHTML, 'build-for'), 0, 'host callback can deny even an assigned Presider');

const adminRoot = new FakeRoot();
await mount(adminRoot, {
  fb: fakeFirebase(),
  me: 'E. Simon',
  permissions: { isAdmin: true },
  nav: true
});
click(adminRoot, 'home-scope', { scope: 'all' });
assert.equal(countActions(adminRoot.innerHTML, 'build-for'), 3, 'admin can edit every service');

console.log('presider-permissions: PASS');

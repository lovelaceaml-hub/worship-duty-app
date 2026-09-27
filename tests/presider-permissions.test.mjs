import assert from 'node:assert/strict';

const serviceIdFor = (date, service) => date + '_' + String(service || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const dateAfter = days => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
};
const future = (offset, service, presider, extras = {}) => {
  const date = dateAfter(offset);
  return {
    id: serviceIdFor(date, service),
    date,
    service,
    worship: 'Sabbath Day',
    assignments: { Presider: presider, Sermon: extras.sermon || presider },
    choirSong: ''
  };
};

const schedule = [
  future(2, 'Morning', 'B. Brent'),
  future(3, 'Evening', 'D. Chris'),
  future(4, 'Afternoon', 'D. Chris', { sermon: 'B. Brent' })
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

function fakeSnapshot(name, source) {
  source = source || { schedule, setlists };
  if (name === 'schedule') {
    return {
      docs: source.schedule.map(data => ({ id: data.id, data: () => data })),
      docChanges: () => []
    };
  }
  if (name === 'setlists') {
    return {
      docs: Object.entries(source.setlists).map(([id, data]) => ({ id, data: () => data })),
      docChanges: () => []
    };
  }
  return { docs: [], docChanges: () => [], exists: () => false, data: () => ({}) };
}

function fakeFirebase(source) {
  source = source || { schedule, setlists };
  const db = {};
  return {
    db,
    collection: (_db, name) => ({ kind: 'collection', name }),
    doc: (_db, ...parts) => ({ kind: 'doc', name: parts.join('/') }),
    onSnapshot: (ref, next) => {
      next(fakeSnapshot(ref.name, source));
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

const moduleURL = new URL('../song-app.js', import.meta.url).href + '?permissions-test=1';
const { mount, serviceStartMs, serviceIsCurrentOrUpcoming } = await import(moduleURL);

const sameDayEarly = { date: '2026-09-14', time: '05:00', service: 'Early Morning' };
const sameDayEvening = { date: '2026-09-14', time: '19:30', service: 'Evening' };
const beforeEvening = new Date('2026-09-14T19:20:00');
assert.equal(serviceIsCurrentOrUpcoming(sameDayEarly, beforeEvening), false,
  'completed early morning service is no longer next in the evening');
assert.equal(serviceIsCurrentOrUpcoming(sameDayEvening, beforeEvening), true,
  'evening service remains next before it starts');
assert.ok(serviceStartMs(sameDayEarly) < serviceStartMs(sameDayEvening),
  'same-day services sort by their actual time');

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
assert.match(mineRoot.innerHTML, /Morning/);
assert.doesNotMatch(mineRoot.innerHTML, /Evening/);
assert.doesNotMatch(mineRoot.innerHTML, /Afternoon/);
assert.ok(mineRoot.innerHTML.includes(schedule[0].date), 'Home card keeps the current fixture date');
assert.equal(countActions(mineRoot.innerHTML, 'build-for'), 1, 'assigned Presider can edit their own service');
assert.equal(countActions(mineRoot.innerHTML, 'mark-sung'), 1, 'assigned Presider can mark their own service as sung');
assert.equal(countActions(mineRoot.innerHTML, 'delete-setlist'), 1, 'assigned Presider can delete their own setlist');
assert.equal(countActions(mineRoot.innerHTML, 'undo-sung'), 0, 'planned service does not expose undo');

click(mineRoot, 'home-scope', { scope: 'all' });
assert.match(mineRoot.innerHTML, /Evening/);
assert.match(mineRoot.innerHTML, /class="presider-chip"><span class="sr-only">Presider: <\/span>D\. Chris</);
assert.match(mineRoot.innerHTML, /other-presider/);
assert.doesNotMatch(mineRoot.innerHTML, /Not your service/i);
assert.equal(countActions(mineRoot.innerHTML, 'build-for'), 3, 'choir-song editor can edit all services');
assert.equal(countActions(mineRoot.innerHTML, 'mark-sung'), 2, 'choir-song editor can mark planned setlists as sung');
assert.equal(countActions(mineRoot.innerHTML, 'delete-setlist'), 2, 'choir-song editor can delete existing setlists');

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
assert.equal(countActions(assignedRoot.innerHTML, 'mark-sung'), 1, 'assigned Presider can mark only their own existing setlist as sung');
assert.equal(countActions(assignedRoot.innerHTML, 'delete-setlist'), 1, 'assigned Presider can delete only their own existing setlist');
assert.equal(countActions(assignedRoot.innerHTML, 'undo-sung'), 0, 'planned services do not expose undo');
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
assert.equal(countActions(leaderRoot.innerHTML, 'mark-sung'), 0, 'Worship permission alone does not grant mark-sung');
assert.equal(countActions(leaderRoot.innerHTML, 'delete-setlist'), 0, 'Worship permission alone does not grant delete');
assert.match(leaderRoot.innerHTML, /other-presider/);
assert.match(leaderRoot.innerHTML, /class="presider-chip"><span class="sr-only">Presider: <\/span>B\. Brent</);

const injectedRoot = new FakeRoot();
await mount(injectedRoot, {
  fb: fakeFirebase(),
  me: 'S. Paola',
  canEditSongService: service => service.service === 'Morning',
  nav: true
});
click(injectedRoot, 'home-scope', { scope: 'all' });
assert.equal(countActions(injectedRoot.innerHTML, 'build-for'), 1, 'host callback grants only the selected song service');
assert.equal(countActions(injectedRoot.innerHTML, 'mark-sung'), 1, 'host callback scopes mark-sung to the selected song service');
assert.equal(countActions(injectedRoot.innerHTML, 'delete-setlist'), 1, 'host callback scopes delete to the selected song service');
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
assert.equal(countActions(deniedRoot.innerHTML, 'mark-sung'), 0, 'host callback denial removes mark-sung');
assert.equal(countActions(deniedRoot.innerHTML, 'delete-setlist'), 0, 'host callback denial removes delete');

const adminRoot = new FakeRoot();
await mount(adminRoot, {
  fb: fakeFirebase(),
  me: 'E. Simon',
  permissions: { isAdmin: true },
  nav: true
});
click(adminRoot, 'home-scope', { scope: 'all' });
assert.equal(countActions(adminRoot.innerHTML, 'build-for'), 3, 'admin can edit every service');
assert.equal(countActions(adminRoot.innerHTML, 'mark-sung'), 2, 'admin can mark every existing planned setlist as sung');
assert.equal(countActions(adminRoot.innerHTML, 'delete-setlist'), 2, 'admin can delete every existing setlist');

const sungModuleURL = new URL('../song-app.js', import.meta.url).href + '?permissions-sung=1';
const { mount: mountSung } = await import(sungModuleURL);
const sungSetlists = Object.assign({}, setlists, {
  [schedule[0].id]: Object.assign({}, setlists[schedule[0].id], { status: 'sung', sungAt: Date.now() })
});
const sungRoot = new FakeRoot();
await mountSung(sungRoot, {
  fb: fakeFirebase({ schedule, setlists: sungSetlists }),
  me: 'B. Brent',
  permissions: { roles: ['Choir Song Editor'] },
  nav: true
});
assert.equal(countActions(sungRoot.innerHTML, 'edit-setlist'), 1, 'Home exposes the builder for a sung setlist');
assert.equal(countActions(sungRoot.innerHTML, 'undo-sung'), 1, 'Home exposes undo for an authorized sung setlist');
assert.equal(countActions(sungRoot.innerHTML, 'delete-setlist'), 1, 'Home exposes delete for an authorized sung setlist');
assert.equal(countActions(sungRoot.innerHTML, 'mark-sung'), 0, 'sung setlist does not expose mark-sung');

console.log('presider-permissions: PASS');

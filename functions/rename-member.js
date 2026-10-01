'use strict';

/* Fix a member's name everywhere (Manage, Data, administrators only):
   "Bridgette" becomes "S. Bridgette" in the member list, the department
   lists and leader settings, every service's duties, song lists, change
   requests and department profiles. The old spelling goes into app/nameMap so
   a later Sheet import maps it too. The member keeps their sign-in: the new
   account record carries the old uid and PIN, so their department profiles
   still match. Services are saved with a planBatch mark, so the change sends
   no "New duty" alerts. */

const permissions = require('./permissions.js');

const MAX_NAME = 80;

function cleanName(value) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const swap = (list, from, to) => Array.isArray(list)
  ? Array.from(new Set(list.map(name => (name === from ? to : name))))
  : list;

async function renameMember(db, { from, to, newAccount, now = Date.now() }) {
  from = cleanName(from);
  to = cleanName(to);
  if (!from || !to || from === to) throw Object.assign(new Error('Give the current name and a different new name.'), { code: 'invalid-argument' });
  if (to.length > MAX_NAME || to.includes('/')) throw Object.assign(new Error('That name cannot be used.'), { code: 'invalid-argument' });
  const counts = { services: 0, songLists: 0, requests: 0, profiles: 0 };

  // The member list: the new name must not belong to someone else already.
  const membersRef = db.collection('app').doc('members');
  const membersSnap = await membersRef.get();
  const members = membersSnap.exists ? membersSnap.data() || {} : {};
  const list = Array.isArray(members.list) ? members.list : [];
  if (!list.includes(from)) throw Object.assign(new Error(from + ' is not on the member list.'), { code: 'not-found' });
  if (list.includes(to)) throw Object.assign(new Error(to + ' is already on the member list. Ask for help to merge two members.'), { code: 'already-exists' });
  await membersRef.set(Object.assign({}, members, { list: swap(list, from, to).sort() }));

  // Old spelling -> new, and anything that pointed at the old spelling.
  const mapRef = db.collection('app').doc('nameMap');
  const mapSnap = await mapRef.get();
  const map = Object.assign({}, (mapSnap.exists && (mapSnap.data() || {}).map) || {});
  Object.keys(map).forEach(key => { if (map[key] === from) map[key] = to; });
  map[from] = to;
  delete map[to];
  await mapRef.set({ map });

  // Department name lists and leader settings.
  const departmentsRef = db.collection('app').doc('departments');
  const departmentsSnap = await departmentsRef.get();
  if (departmentsSnap.exists) {
    const data = departmentsSnap.data() || {};
    const lists = Object.assign({}, data.map || {});
    Object.keys(lists).forEach(department => { lists[department] = swap(lists[department], from, to); });
    await departmentsRef.set(Object.assign({}, data, { map: lists }));
  }
  const configRef = db.collection('app').doc('leaderConfig');
  const configSnap = await configRef.get();
  if (configSnap.exists) {
    const config = Object.assign({}, configSnap.data() || {});
    Object.keys(config).forEach(key => {
      if (Array.isArray(config[key])) config[key] = swap(config[key], from, to);
      else if (config[key] && typeof config[key] === 'object') {
        const inner = Object.assign({}, config[key]);
        Object.keys(inner).forEach(part => { if (Array.isArray(inner[part])) inner[part] = swap(inner[part], from, to); });
        config[key] = inner;
      }
    });
    await configRef.set(config);
  }
  const settingsRef = db.collection('app').doc('settings');
  const settingsSnap = await settingsRef.get();
  if (settingsSnap.exists && (settingsSnap.data() || {}).schedulerName === from) await settingsRef.set({ schedulerName: to }, { merge: true });

  // The sign-in account: the new record keeps the old uid (and PIN, if any).
  const accounts = db.collection('accounts');
  const oldSnap = await accounts.doc(from).get();
  const oldAccount = oldSnap.exists ? oldSnap.data() || {} : null;
  const keptUid = String((oldAccount && (oldAccount.authUid || oldAccount.uid)) || 'member:' + ((oldAccount && oldAccount.memberId) || from));
  const fresh = await newAccount(to);
  const account = Object.assign({}, fresh, oldAccount || {}, {
    id: to, memberId: to, name: to, memberName: to, authUid: keptUid, renamedFrom: from, renamedAt: now
  });
  if (!account.pinHash) account.pinHash = fresh.pinHash;
  await accounts.doc(to).set(account);
  if (oldAccount) await accounts.doc(from).set(Object.assign({}, oldAccount, { active: false, renamedTo: to, renamedAt: now }));

  // Department profiles keep their uid; only the name changes.
  for (const department of permissions.DEPARTMENTS) {
    for (const document of (await db.collection('departments').doc(department).collection('members').get()).docs) {
      if ((document.data() || {}).memberName !== from) continue;
      await document.ref.update({ memberName: to, updatedAt: now, updatedBy: 'Name fixed' });
      counts.profiles += 1;
    }
  }
  // Services: duties, double-duty marks and replacement flags.
  const batch = 'rename-' + now;
  for (const document of (await db.collection('schedule').get()).docs) {
    const service = document.data() || {};
    const patch = {};
    const assignments = Object.assign({}, service.assignments || {});
    if (Object.values(assignments).includes(from)) {
      Object.keys(assignments).forEach(duty => { if (assignments[duty] === from) assignments[duty] = to; });
      patch.assignments = assignments;
    }
    if (service.conflictOk && Object.prototype.hasOwnProperty.call(service.conflictOk, from)) {
      const marks = Object.assign({}, service.conflictOk);
      marks[to] = marks[from];
      delete marks[from];
      patch.conflictOk = marks;
    }
    if (service.needsReplacement && Object.values(service.needsReplacement).some(marker => marker && marker.memberName === from)) {
      const flags = {};
      Object.entries(service.needsReplacement).forEach(([duty, marker]) => {
        flags[duty] = marker && marker.memberName === from ? Object.assign({}, marker, { memberName: to }) : marker;
      });
      patch.needsReplacement = flags;
    }
    if (!Object.keys(patch).length) continue;
    patch.planBatch = batch;
    await document.ref.update(patch);
    counts.services += 1;
  }

  // Song lists and change requests.
  for (const document of (await db.collection('setlists').get()).docs) {
    const setlist = document.data() || {};
    if (setlist.presider !== from && setlist.confirmedBy !== from) continue;
    const patch = {};
    if (setlist.presider === from) patch.presider = to;
    if (setlist.confirmedBy === from) patch.confirmedBy = to;
    await document.ref.update(patch);
    counts.songLists += 1;
  }
  for (const document of (await db.collection('requests').get()).docs) {
    const request = document.data() || {};
    const patch = {};
    ['name', 'memberName', 'replacementName', 'resolvedBy', 'resolvedByName'].forEach(field => { if (request[field] === from) patch[field] = to; });
    if (!Object.keys(patch).length) continue;
    await document.ref.update(patch);
    counts.requests += 1;
  }

  return Object.assign({ from, to }, counts);
}

module.exports = { renameMember };

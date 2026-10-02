'use strict';

/* Fix a member's name everywhere (Manage, Data, administrators only):
   "Bridgette" becomes "S. Bridgette" in the member list, the department
   lists and leader settings, every service's duties, song lists, change
   requests, device tokens and department profiles. The old spelling goes
   into app/nameMap so a later Sheet import maps it too. The member keeps
   their sign-in: the new account record carries the old uid and PIN, so
   their department profiles still match. Services are saved with a
   planBatch mark, so the change sends no "New duty" alerts.

   Every step can run twice, and the member list changes last: when a step
   fails, running the same fix again finishes it. The member's open sessions
   end (their next sign-in uses the new name). */

const permissions = require('./permissions.js');

const MAX_NAME = 80;

function cleanName(value) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const swap = (list, from, to) => Array.isArray(list)
  ? Array.from(new Set(list.map(name => (name === from ? to : name))))
  : list;

const uidOf = (account, name) => String((account && (account.authUid || account.uid)) || 'member:' + ((account && account.memberId) || name));

async function endSessions(auth, uid) {
  if (!auth || typeof auth.revokeRefreshTokens !== 'function') return;
  try {
    await auth.revokeRefreshTokens(uid);
  } catch (_error) {
    // Someone who never signed in has no sessions.
  }
}

async function renameMember(db, { from, to, newAccount, auth = null, now = Date.now() }) {
  from = cleanName(from);
  to = cleanName(to);
  if (!from || !to || from === to) throw Object.assign(new Error('Give the current name and a different new name.'), { code: 'invalid-argument' });
  if (to.length > MAX_NAME || to.includes('/')) throw Object.assign(new Error('That name cannot be used.'), { code: 'invalid-argument' });
  const counts = { services: 0, songLists: 0, requests: 0, profiles: 0, devices: 0 };

  // The member list. When the new name is already there, the two are the
  // same person and become one ("merge"). A fix that stopped part way is
  // finished by running it again: the old name is still on the list, or
  // (after an older version, which changed the list first) the name map
  // already points it at the new one.
  const membersRef = db.collection('app').doc('members');
  const membersSnap = await membersRef.get();
  const members = membersSnap.exists ? membersSnap.data() || {} : {};
  const list = Array.isArray(members.list) ? members.list : [];
  const mapRef = db.collection('app').doc('nameMap');
  const mapSnap = await mapRef.get();
  const map = Object.assign({}, (mapSnap.exists && (mapSnap.data() || {}).map) || {});
  const resuming = !list.includes(from) && list.includes(to) && map[from] === to;
  if (!list.includes(from) && !resuming) throw Object.assign(new Error(from + ' is not on the member list.'), { code: 'not-found' });

  const accounts = db.collection('accounts');
  const oldSnap = await accounts.doc(from).get();
  const oldAccount = oldSnap.exists ? oldSnap.data() || {} : null;
  const keptUid = uidOf(oldAccount, from);
  const toSnap = await accounts.doc(to).get();
  const toAccount = toSnap.exists ? toSnap.data() || {} : null;
  // A merge joins two people; an account this fix made itself for the new
  // name (an earlier run) is not a second person.
  const merge = resuming
    ? !!toAccount && toAccount.renamedFrom !== from
    : list.includes(to);
  counts.merged = merge;

  // Old spelling -> new, and anything that pointed at the old spelling.
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

  // The sign-in account.
  let targetUid;
  if (merge && toAccount) {
    // Merging into someone who has signed in: their account and PIN stay.
    // Their roles follow the leader settings, which now name them in place
    // of the old spelling; a change ends their sessions so it applies.
    targetUid = uidOf(toAccount, to);
    const fresh = await newAccount(to);
    const roles = { roles: fresh.roles, departments: fresh.departments, role: fresh.role, globalLeaderManager: fresh.globalLeaderManager };
    const changed = ['roles', 'departments', 'role', 'globalLeaderManager']
      .some(field => JSON.stringify(toAccount[field]) !== JSON.stringify(roles[field]));
    if (changed) {
      await accounts.doc(to).set(Object.assign(roles, { roleVersion: Number(toAccount.roleVersion || 1) + 1 }), { merge: true });
      await endSessions(auth, targetUid);
    }
  } else if (merge) {
    // Merging into a name that has never signed in: it keeps its own uid; the
    // PIN set under the old spelling comes along.
    targetUid = 'member:' + to;
    const fresh = await newAccount(to);
    if (oldAccount && oldAccount.pinHash) Object.assign(fresh, { pinHash: oldAccount.pinHash, mustChangePin: !!oldAccount.mustChangePin });
    await accounts.doc(to).set(Object.assign(fresh, { renamedFrom: from, renamedAt: now }));
  } else {
    // A plain rename keeps the old uid and PIN, so nothing else has to move.
    targetUid = keptUid;
    const fresh = await newAccount(to);
    const account = Object.assign({}, fresh, oldAccount || {}, {
      id: to, memberId: to, name: to, memberName: to, authUid: keptUid, renamedFrom: from, renamedAt: now, active: true
    });
    delete account.renamedTo;
    if (!account.pinHash) account.pinHash = fresh.pinHash;
    if (toAccount && toAccount.renamedFrom === from) {
      // An earlier run made this account: keep what changed on it since.
      ['pinHash', 'mustChangePin', 'roleVersion', 'failedLoginAttempts', 'loginLockedUntil'].forEach(field => {
        if (Object.prototype.hasOwnProperty.call(toAccount, field)) account[field] = toAccount[field];
      });
    }
    await accounts.doc(to).set(account);
  }
  if (oldAccount && oldAccount.renamedTo !== to) {
    // A new role version ends what the old name's sign-in tokens can do.
    await accounts.doc(from).set(Object.assign({}, oldAccount, {
      active: false, renamedTo: to, renamedAt: now, roleVersion: Number(oldAccount.roleVersion || 1) + 1
    }));
  }
  // The member's open sessions still carry the old name; their next sign-in
  // uses the new one.
  await endSessions(auth, keptUid);

  // Department profiles. A rename only changes the name. A merge joins the
  // two profiles in a department (duties from both, active if either was).
  for (const department of permissions.DEPARTMENTS) {
    const docs = (await db.collection('departments').doc(department).collection('members').get()).docs;
    const own = docs.find(document => (document.data() || {}).memberName === to);
    for (const document of docs) {
      const profile = document.data() || {};
      if (profile.memberName !== from) continue;
      counts.profiles += 1;
      if (!merge) { await document.ref.update({ memberName: to, updatedAt: now, updatedBy: 'Name fixed' }); continue; }
      if (own) {
        const kept = own.data() || {};
        await own.ref.update({
          eligibleDuties: Array.from(new Set((kept.eligibleDuties || []).concat(profile.eligibleDuties || []))),
          status: kept.status === 'active' || profile.status === 'active' ? 'active' : 'inactive',
          schedulable: kept.schedulable === true || profile.schedulable === true,
          updatedAt: now, updatedBy: 'Merged ' + from
        });
      } else {
        await db.collection('departments').doc(department).collection('members').doc(targetUid)
          .set(Object.assign({}, profile, { memberUid: targetUid, uid: targetUid, memberName: to, updatedAt: now, updatedBy: 'Merged ' + from }));
      }
      if (document.id !== targetUid) await document.ref.delete();
    }
  }

  // Services: duties, double-duty marks and replacement flags (which also
  // move to the merged member's uid).
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
        flags[duty] = marker && marker.memberName === from
          ? Object.assign({}, marker, { memberName: to }, marker.memberUid === keptUid ? { memberUid: targetUid } : {})
          : marker;
      });
      patch.needsReplacement = flags;
    }
    if (!Object.keys(patch).length) continue;
    patch.planBatch = batch;
    await document.ref.update(patch);
    counts.services += 1;
  }

  // Song lists, change requests (a merged member keeps seeing their own:
  // the requester uid moves too) and device tokens.
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
    if (merge && request.requesterUid === keptUid && keptUid !== targetUid) patch.requesterUid = targetUid;
    if (!Object.keys(patch).length) continue;
    await document.ref.update(patch);
    counts.requests += 1;
  }
  for (const document of (await db.collection('tokens').get()).docs) {
    if ((document.data() || {}).name !== from) continue;
    await document.ref.update({ name: to });
    counts.devices += 1;
  }

  // Last, the member list: until here a failed fix can simply be run again.
  if (!resuming) await membersRef.set(Object.assign({}, members, { list: swap(list, from, to).sort() }));

  return Object.assign({ from, to }, counts);
}

module.exports = { renameMember };

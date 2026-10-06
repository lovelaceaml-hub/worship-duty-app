'use strict';

/* Manage, Worship: the default member of a duty that has one (Opening
   Prayer, see DUTY_DEFAULTS in permissions.js). Fill always gives the duty
   to its default, and new services start with them on it. A leader of the
   duty's department or an administrator changes it; the default must take
   the duty in that department, or be '' for no default. */
const permissions = require('./permissions.js');
const { dutyName } = require('./names.js');

function failure(code, message, reason) {
  const error = new Error(message);
  error.code = code;
  error.details = { reason };
  return error;
}

async function setDutyDefault({ db, actor, config, data }) {
  const duty = String(data && data.duty || '').trim();
  if (!Object.prototype.hasOwnProperty.call(permissions.DUTY_DEFAULTS, duty)) {
    throw failure('invalid-argument', 'That duty has no default.', 'no-default');
  }
  const department = permissions.departmentForDuty(duty);
  if (!permissions.canManageDepartment(actor, department, config)) {
    throw failure('permission-denied', 'Only a ' + department + ' leader or an administrator can change the default for ' + dutyName(duty) + '.', 'not-allowed');
  }
  const memberName = String(data.memberName || '').trim().slice(0, 80);
  if (memberName) {
    const profiles = await db.collection('departments').doc(department).collection('members')
      .where('memberName', '==', memberName).get();
    const takes = profiles.docs.some(doc => {
      const profile = doc.data() || {};
      return profile.status !== 'inactive' &&
        (profile.eligibleDuties || []).some(item => String(item).trim().toLowerCase() === duty.toLowerCase());
    });
    if (!takes) {
      throw failure('failed-precondition', memberName + ' does not take ' + dutyName(duty) + ' in ' + department + '. Add it to their duties first.', 'not-eligible');
    }
  }
  await db.collection('app').doc('settings').set({ dutyDefaults: { [duty]: memberName } }, { merge: true });
  return { ok: true, duty, memberName };
}

/* A double duty marked always OK (or no longer): the two duties together,
   for anyone (app/settings okPairs). Then the planner offers the pair, Fill
   may propose it, the server accepts it and no one is warned about it. A
   leader of either duty's department or an administrator changes it. */
async function setOkPair({ db, actor, config, data }) {
  const duties = Array.isArray(data && data.duties) ? data.duties.map(duty => String(duty || '').trim()) : [];
  const [a, b] = duties;
  if (duties.length !== 2 || !permissions.canBeOkPair(a, b)) {
    throw failure('invalid-argument', 'Choose two duties that are not already allowed together.', 'invalid-input');
  }
  if (![a, b].some(duty => permissions.canManageDepartment(actor, permissions.departmentForDuty(duty), config))) {
    throw failure('permission-denied', 'Only a leader of one of these duties\' departments or an administrator can change this.', 'not-allowed');
  }
  const key = permissions.okPairKey(a, b);
  const ok = data.ok !== false;
  const reference = db.collection('app').doc('settings');
  let okPairs = [];
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const saved = Array.from(permissions.okPairsOf(snapshot.exists ? snapshot.data() : {}));
    okPairs = ok ? Array.from(new Set(saved.concat(key))).sort() : saved.filter(item => item !== key);
    transaction.set(reference, { okPairs }, { merge: true });
  });
  return { ok: true, pair: key, okPairs };
}

/* A member set to Manual only in a department, or no longer: Fill never
   proposes them there and suggestions list them last, but a leader still
   gives them a duty by hand (app/settings manualOnly). A leader of that
   department or an administrator changes it. */
async function setManualOnly({ db, actor, config, data }) {
  const department = String(data && data.department || '').trim();
  const memberName = String(data && data.memberName || '').trim().slice(0, 80);
  if (permissions.DEPARTMENTS.indexOf(department) === -1 || !memberName) {
    throw failure('invalid-argument', 'Choose a department and a member.', 'invalid-input');
  }
  if (!permissions.canManageDepartment(actor, department, config)) {
    throw failure('permission-denied', 'Only a ' + department + ' leader or an administrator can change this.', 'not-allowed');
  }
  const on = data.on !== false;
  const reference = db.collection('app').doc('settings');
  let names = [];
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const all = (snapshot.exists ? (snapshot.data() || {}).manualOnly : null) || {};
    const saved = Array.isArray(all[department]) ? all[department].filter(name => typeof name === 'string') : [];
    names = on ? Array.from(new Set(saved.concat(memberName))).sort() : saved.filter(name => name !== memberName);
    transaction.set(reference, { manualOnly: { [department]: names } }, { merge: true });
  });
  return { ok: true, department, memberName, on, names };
}

module.exports = { setDutyDefault, setOkPair, setManualOnly };

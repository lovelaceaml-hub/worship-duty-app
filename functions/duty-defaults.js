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

module.exports = { setDutyDefault };

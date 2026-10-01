'use strict';

/* Department membership from the schedule. Everyone who has served in a
   department's duties gets a profile in that department, able to take the
   department's duties (in Worship, only the duties they have served in).
   Someone with no duty there in the last 35 days and none coming up is added
   as inactive. Existing profiles are not changed, so a leader's choices stay;
   the one exception is a profile this job added whose duties no leader has
   touched, which gets every duty of its department (not Worship). */
const authz = require('./department-auth.js');
const permissions = require('./permissions.js');

const RECENT_DAYS = 35;
const SYSTEM = 'system:serving-members';

function addDays(iso, days) {
  return new Date(Date.parse(iso + 'T12:00:00Z') + days * 864e5).toISOString().slice(0, 10);
}

/* department -> name -> { duties: Set, last: 'YYYY-MM-DD' } */
function servingRecords(services, canonicalName = name => name) {
  const records = {};
  services.forEach(service => {
    const date = String(service.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    Object.entries(service.assignments || {}).forEach(([duty, raw]) => {
      const name = canonicalName(String(raw || '').trim());
      const department = permissions.departmentForDuty(duty);
      if (!name || !department) return;
      const people = records[department] = records[department] || {};
      const record = people[name] = people[name] || { duties: new Set(), last: '' };
      record.duties.add(duty);
      if (date > record.last) record.last = date;
    });
  });
  return records;
}

/* Active when they served in the last 35 days or have a duty coming up. */
function statusFor(record, today) {
  return record.last >= addDays(today, -RECENT_DAYS) ? 'active' : 'inactive';
}

/* Worship duties are different jobs, so only the ones served; the numbered
   duties elsewhere (Usher Door, Parking #3...) are interchangeable. */
function dutiesFor(department, record) {
  const all = permissions.DEPARTMENT_DUTIES[department] || [];
  return department === 'Worship' ? all.filter(duty => record.duties.has(duty)) : all.slice();
}

function newProfile(department, memberUid, name, record, today, at) {
  const status = statusFor(record, today);
  const duties = dutiesFor(department, record);
  const initial = { source: 'schedule', authority: 'system', by: SYSTEM, at };
  return {
    memberUid, uid: memberUid, departmentId: department, department, role: 'member', memberName: name,
    status, eligibleDuties: duties, schedulable: true, availability: { recurring: {}, exceptions: {} },
    createdAt: at, createdBy: SYSTEM, updatedAt: at, updatedByUid: SYSTEM, updatedBy: 'Added from the schedule', revision: 1,
    attribution: { createdBy: SYSTEM, createdAt: at, updatedBy: 'Added from the schedule', updatedAt: at },
    fieldAttribution: { status: initial, eligibleDuties: initial, schedulable: initial, availability: initial },
    provenance: { source: 'schedule', lastServed: record.last, recentDays: RECENT_DAYS, addedOn: today }
  };
}

/* The uid a member signs in with: their account's, or, for someone on the
   member list who has never signed in, the one their first sign-in gives. */
function uidResolver(accountDocs, memberList) {
  const byName = {};
  accountDocs.forEach(document => {
    const data = document.data() || {};
    const name = String(data.memberName || data.name || document.id).trim();
    const explicit = data.authUid || data.uid;
    const memberId = data.memberId || document.id;
    const value = explicit ? String(explicit).trim() : (String(memberId).startsWith('member:') ? String(memberId) : 'member:' + memberId);
    if (name && !byName[name]) byName[name] = value;
  });
  const listed = new Set(memberList);
  return name => byName[name] || (listed.has(name) ? 'member:' + name : '');
}

/* Add the missing profiles. Returns what was added and the names that could
   not be matched to a member. */
async function addServingMembers(db, { today, now = Date.now(), canonicalName, logger } = {}) {
  const [scheduleSnap, accountsSnap, membersSnap] = await Promise.all([
    db.collection('schedule').get(), db.collection('accounts').get(), db.collection('app').doc('members').get()
  ]);
  const memberData = membersSnap.exists ? membersSnap.data() || {} : {};
  const memberList = (Array.isArray(memberData.list) ? memberData.list : Array.isArray(memberData.members) ? memberData.members : [])
    .map(name => (canonicalName || (value => value))(String(name || '').trim())).filter(Boolean);
  const uidFor = uidResolver(accountsSnap.docs, memberList);
  const records = servingRecords(scheduleSnap.docs.map(document => document.data() || {}), canonicalName);
  const added = [], widened = [], unmatched = new Set();
  for (const department of permissions.DEPARTMENTS) {
    const people = records[department] || {};
    const existing = await db.collection('departments').doc(department).collection('members').get();
    const haveUid = new Set(), haveName = new Set();
    for (const document of existing.docs) {
      const profile = document.data() || {};
      haveUid.add(document.id);
      haveName.add(String(profile.memberName || '').trim());
      const all = permissions.DEPARTMENT_DUTIES[department] || [];
      const untouched = profile.provenance && profile.provenance.source === 'schedule' &&
        ((profile.fieldAttribution || {}).eligibleDuties || {}).source === 'schedule';
      if (department !== 'Worship' && untouched && (profile.eligibleDuties || []).length < all.length) {
        await document.ref.update({ eligibleDuties: all.slice() });
        widened.push({ department, name: profile.memberName });
      }
    }
    for (const [name, record] of Object.entries(people)) {
      if (haveName.has(name)) continue;
      const memberUid = uidFor(name);
      if (!memberUid || memberUid.includes('/')) { unmatched.add(name); continue; }
      if (haveUid.has(memberUid)) continue;
      const profile = newProfile(department, memberUid, name, record, today, now);
      if (!authz.profileForScheduling(profile)) { unmatched.add(name); continue; }
      // create() leaves alone a profile made since the read above (a leader's add).
      try {
        await db.collection('departments').doc(department).collection('members').doc(memberUid).create(profile);
      } catch (error) {
        if (error && (error.code === 6 || error.code === 'already-exists' || /ALREADY_EXISTS/.test(String(error.message)))) continue;
        throw error;
      }
      haveUid.add(memberUid);
      haveName.add(name);
      added.push({ department, name, status: profile.status });
    }
  }
  const result = { added, widened, unmatched: Array.from(unmatched).sort() };
  if (logger && (added.length || widened.length || unmatched.size)) {
    logger.info('serving members added', { added: added.length, inactive: added.filter(item => item.status === 'inactive').length, widened: widened.length, unmatched: result.unmatched.length });
  }
  return result;
}

module.exports = { RECENT_DAYS, servingRecords, statusFor, addServingMembers };

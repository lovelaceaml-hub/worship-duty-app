'use strict';

/*
 * Seeds the Firestore + Auth emulators with entirely fictional data for the
 * staging harness (docs/PLAN-COMPACT-STAGING.md section 2 / section 4).
 * No real member names, PINs, or production records. Run only against the
 * demo-lv-zion-duties emulator project (see staging-harness/README.md).
 */

import { db, auth, ensureAuthUser, paDateOffset, authUidFor } from './lib.mjs';
import admin from 'firebase-admin';

function slugify(value) {
  return String(value == null ? '' : value).toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function assignmentIdFor(a) {
  return [a.departmentId, a.serviceId || a.serviceDate, a.serviceTime, a.duty]
    .map(v => encodeURIComponent(v)).join('__');
}

const availabilityAllDay = () => ({
  recurring: { 'early-morning': 'available', morning: 'available', afternoon: 'available', evening: 'available' },
  exceptions: {}
});

/* Fictional roster. None of these names appear anywhere else in the repo. */
const MEMBERS = [
  { id: 'T. Fictitia', department: 'Worship', duties: ['Presider', 'Sermon'] },
  { id: 'R. Testarosa', department: 'Worship', duties: ['Prayer of Thanks', 'Closing Prayer'] },
  { id: 'V. Trial', department: 'Worship', duties: ['Sermon', 'Prayer of Thanks', 'Closing Prayer'] },
  { id: 'W. Sampleton', department: 'Worship', duties: ['Closing Prayer', 'Prayer of Thanks'] },
  { id: 'Q. Sample', department: 'Usher Sisters', duties: ['Usher Door'] },
  { id: 'N. Mockford', department: 'Usher Sisters', duties: ['Usher Front'] },
  { id: 'K. Dummy', department: 'Usher Sisters', duties: ['Usher Back'] }
];
const LEADER_ID = 'L. Leaderman';
const ADMIN_ID = 'A. Administrix';

async function wipeCollection(name) {
  const snapshot = await db().collection(name).get();
  const batchSize = 400;
  for (let i = 0; i < snapshot.docs.length; i += batchSize) {
    const batch = db().batch();
    snapshot.docs.slice(i, i + batchSize).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function wipeSubcollections() {
  // departments/{id} parent documents are never explicitly created (only
  // their departments/{id}/members/{memberUid} subcollection is written), so
  // a plain collection('departments').get() misses them entirely and a
  // profile from a previous run (e.g. an accepted invitation) would survive
  // a reseed. collectionGroup finds every members subdocument regardless of
  // whether its parent document exists.
  const members = await db().collectionGroup('members').get();
  const batchSize = 400;
  for (let i = 0; i < members.docs.length; i += batchSize) {
    const batch = db().batch();
    members.docs.slice(i, i + batchSize).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function createAccount({ id, role, departments, admin: isAdmin, departmentLeader }) {
  const roles = [];
  if (isAdmin) roles.push('admin');
  if (departmentLeader) roles.push('departmentLeader');
  if (!roles.length) roles.push('member');
  const account = {
    id, memberId: id, name: id, memberName: id,
    role: role || roles[0],
    roles,
    departments: departments || [],
    departmentIds: departments || [],
    departmentLeaders: departmentLeader
      ? Object.fromEntries((departments || []).map(department => [department, true]))
      : {},
    globalLeaderManager: false,
    admin: !!isAdmin,
    departmentLeader: !!departmentLeader,
    songEditor: false,
    mustChangePin: false,
    active: true,
    roleVersion: 1,
    authUid: `member:${id}`
  };
  await db().collection('accounts').doc(id).set(account, { merge: false });
  await ensureAuthUser(`member:${id}`, {
    memberId: id,
    memberName: id,
    role: account.role,
    roles: account.roles,
    departments: account.departments,
    departmentIds: account.departmentIds,
    departmentLeaders: account.departmentLeaders,
    admin: account.admin,
    departmentLeader: account.departmentLeader,
    globalLeaderManager: account.globalLeaderManager,
    songEditor: account.songEditor,
    mustChangePin: false,
    roleVersion: 1
  });
  return account;
}

async function createProfile(departmentId, memberId, duties) {
  const at = Date.now();
  const memberUid = authUidFor(memberId);
  const profile = {
    uid: memberUid, memberUid,
    department: departmentId, departmentId,
    role: 'member', member: memberId, memberName: memberId,
    status: 'active', active: true,
    eligibleDuties: duties, duties,
    schedulable: true, isSchedulable: true,
    availability: availabilityAllDay(),
    createdAt: at, createdBy: 'staging-harness-seed', updatedAt: at,
    updatedByUid: 'staging-harness-seed', updatedBy: 'Staging Harness'
  };
  await db().collection('departments').doc(departmentId).collection('members').doc(memberUid).set(profile);
}

async function createSchedule({ id, date, service, worship, assignments }) {
  const doc = {
    id, date, service, worship: worship || 'Sunday Worship',
    assignments,
    assignmentRevisions: {},
    conflictOk: {},
    status: 'active'
  };
  await db().collection('schedule').doc(id).set(doc);
  const serviceTime = slugify(service);
  for (const [duty, memberName] of Object.entries(assignments)) {
    if (!memberName) continue;
    const departmentId = duty.startsWith('Usher') ? 'Usher Sisters' : 'Worship';
    const assignment = { departmentId, serviceId: id, serviceDate: date, serviceTime, duty };
    await db().collection('departmentAssignments').doc(assignmentIdFor(assignment)).set({
      id: assignmentIdFor(assignment),
      departmentId, memberUid: authUidFor(memberName), memberName, duty,
      serviceId: id, serviceDate: date, serviceTime,
      profileId: '', assignedAt: Date.now(),
      assignedByUid: 'staging-harness-seed', assignedBy: 'Staging Harness',
      override: false, authorization: 'staging-seed', revision: 0
    });
  }
  return doc;
}

async function createSetlist({ id, date, service, presider, songs, status, confirmed, updatedAt }) {
  const at = updatedAt || Date.now();
  const doc = {
    id, date, worshipType: 'Sunday Worship', serviceLabel: service,
    presider, notes: '', songs: songs || [],
    glorySong: songs && songs[0] ? songs[0] : null,
    thanksSong: songs && songs[1] ? songs[1] : null,
    status: status || 'planned', sungAt: status === 'sung' ? at : null,
    source: 'staging-harness-seed',
    updatedAt: at, updatedBy: 'Staging Harness', updatedByUid: 'staging-harness-seed',
    revision: 0
  };
  if (confirmed) {
    doc.confirmedAt = at;
    doc.confirmedBy = 'Staging Harness';
    doc.confirmedByUid = 'staging-harness-seed';
  }
  if (status === 'sung') {
    doc.historySource = 'manual';
    doc.recordedAt = at;
    doc.recordedBy = 'staging-harness-seed';
  }
  await db().collection('setlists').doc(id).set(doc);
  return doc;
}

async function createSongCatalog() {
  const songs = [
    { id: 'song-grace-and-truth', title: 'Grace and Truth', timesSung: 3, lastSung: paDateOffset(-30) },
    { id: 'song-new-covenant', title: 'New Covenant Hymn', timesSung: 5, lastSung: paDateOffset(-14) },
    { id: 'song-heavenly-zion', title: 'Heavenly Zion', timesSung: 1, lastSung: paDateOffset(-60) },
    { id: 'song-passover-joy', title: 'Passover Joy', timesSung: 0, lastSung: null }
  ];
  for (const song of songs) {
    await db().collection('songStats').doc(song.id).set({
      title: song.title, timesSung: song.timesSung, lastSung: song.lastSung, history: []
    });
  }
  return songs.map(song => song.id);
}

async function main() {
  console.log(`Seeding fictional data into Firestore emulator (${process.env.FIRESTORE_EMULATOR_HOST}) / Auth emulator (${process.env.FIREBASE_AUTH_EMULATOR_HOST}), project demo-lv-zion-duties.`);

  await Promise.all([
    'accounts', 'schedule', 'departmentAssignments', 'setlists', 'songStats',
    'requests', 'departmentInvitations', 'audit'
  ].map(wipeCollection));
  await wipeSubcollections();

  await createAccount({ id: ADMIN_ID, admin: true, departments: [] });
  await createAccount({ id: LEADER_ID, departmentLeader: true, departments: ['Worship', 'Usher Sisters'] });
  for (const member of MEMBERS) {
    await createAccount({ id: member.id, departments: [member.department] });
    await createProfile(member.department, member.id, member.duties);
  }

  const songIds = await createSongCatalog();

  /* ---- schedule services, one small block per test group ---- */
  await createSchedule({
    id: `${paDateOffset(10)}_morning-avail`, date: paDateOffset(10), service: 'Morning',
    assignments: { Presider: 'T. Fictitia', Sermon: 'V. Trial', 'Prayer of Thanks': 'R. Testarosa', 'Closing Prayer': 'R. Testarosa' }
  });
  await createSchedule({
    id: `${paDateOffset(11)}_afternoon-replace`, date: paDateOffset(11), service: 'Afternoon',
    assignments: { Presider: 'T. Fictitia', Sermon: 'V. Trial', 'Prayer of Thanks': 'R. Testarosa', 'Closing Prayer': 'R. Testarosa' }
  });
  await createSchedule({
    id: `${paDateOffset(12)}_evening-open`, date: paDateOffset(12), service: 'Evening',
    assignments: { Presider: 'T. Fictitia', Sermon: 'V. Trial', 'Prayer of Thanks': 'R. Testarosa', 'Closing Prayer': 'R. Testarosa' }
  });
  await createSchedule({
    id: `${paDateOffset(13)}_morning-request-approve`, date: paDateOffset(13), service: 'Morning',
    assignments: { Presider: 'T. Fictitia', Sermon: 'V. Trial', 'Prayer of Thanks': 'R. Testarosa', 'Closing Prayer': 'R. Testarosa' }
  });
  await createSchedule({
    id: `${paDateOffset(14)}_afternoon-request-decline`, date: paDateOffset(14), service: 'Afternoon',
    assignments: { Presider: 'T. Fictitia', Sermon: 'V. Trial', 'Prayer of Thanks': 'R. Testarosa', 'Closing Prayer': 'R. Testarosa' }
  });
  await createSchedule({
    id: `${paDateOffset(15)}_evening-usher`, date: paDateOffset(15), service: 'Evening',
    assignments: { 'Usher Door': 'Q. Sample', 'Usher Front': 'N. Mockford', 'Usher Back': 'K. Dummy' }
  });
  await createSchedule({
    id: `${paDateOffset(5)}_morning-song`, date: paDateOffset(5), service: 'Morning',
    assignments: { Presider: 'T. Fictitia' }
  });
  await createSchedule({
    id: `${paDateOffset(-1)}_evening-past`, date: paDateOffset(-1), service: 'Evening',
    assignments: { Presider: 'T. Fictitia' }
  });
  await createSchedule({
    id: `${paDateOffset(-2)}_morning-past2`, date: paDateOffset(-2), service: 'Morning',
    assignments: { Presider: 'T. Fictitia' }
  });
  await createSchedule({
    id: `${paDateOffset(-3)}_evening-unconfirmed`, date: paDateOffset(-3), service: 'Evening',
    assignments: { Presider: 'T. Fictitia' }
  });
  await createSchedule({
    id: `${paDateOffset(-10)}_morning-already-sung`, date: paDateOffset(-10), service: 'Morning',
    assignments: { Presider: 'T. Fictitia' }
  });
  await createSchedule({
    id: `${paDateOffset(20)}_morning-stale`, date: paDateOffset(20), service: 'Morning',
    assignments: { Presider: 'T. Fictitia' }
  });
  await createSchedule({
    id: `${paDateOffset(21)}_afternoon-rules`, date: paDateOffset(21), service: 'Afternoon',
    assignments: { Presider: 'T. Fictitia' }
  });

  /* ---- setlists ---- */
  await createSetlist({
    id: `${paDateOffset(5)}_morning-song`, date: paDateOffset(5), service: 'Morning',
    presider: 'T. Fictitia', songs: [songIds[0], songIds[1]], confirmed: false, status: 'planned'
  });
  await createSetlist({
    id: `${paDateOffset(-1)}_evening-past`, date: paDateOffset(-1), service: 'Evening',
    presider: 'T. Fictitia', songs: [songIds[0], songIds[2]], confirmed: true, status: 'planned'
  });
  await createSetlist({
    id: `${paDateOffset(-2)}_morning-past2`, date: paDateOffset(-2), service: 'Morning',
    presider: 'T. Fictitia', songs: [songIds[1]], confirmed: true, status: 'planned'
  });
  await createSetlist({
    id: `${paDateOffset(-3)}_evening-unconfirmed`, date: paDateOffset(-3), service: 'Evening',
    presider: 'T. Fictitia', songs: [songIds[0]], confirmed: false, status: 'planned'
  });
  const sungServiceId = `${paDateOffset(-10)}_morning-already-sung`;
  await createSetlist({
    id: sungServiceId, date: paDateOffset(-10), service: 'Morning',
    presider: 'T. Fictitia', songs: [songIds[3]], confirmed: true, status: 'sung'
  });
  /* The setlist above already has a recorded entry for song-passover-joy
     (songIds[3]), so give that song a matching songStats history entry -
     otherwise correctSongHistory's removal has nothing to find. */
  await db().collection('songStats').doc(songIds[3]).set({
    title: 'Passover Joy', timesSung: 1, lastSung: paDateOffset(-10),
    history: [{ date: paDateOffset(-10), service: sungServiceId, by: 'Staging Harness', markedAt: Date.now(), source: 'manual' }]
  });

  /* ---- pending requests for resolveDutyAttention ---- */
  await db().collection('requests').doc('req-approve-1').set({
    name: 'R. Testarosa', memberUid: 'R. Testarosa', department: 'Worship', departmentId: 'Worship',
    svcId: `${paDateOffset(13)}_morning-request-approve`, duty: 'Closing Prayer',
    date: paDateOffset(13), service: 'Morning', note: 'Fictional request for staging check',
    status: 'pending', createdAt: Date.now()
  });
  await db().collection('requests').doc('req-decline-1').set({
    name: 'R. Testarosa', memberUid: 'R. Testarosa', department: 'Worship', departmentId: 'Worship',
    svcId: `${paDateOffset(14)}_afternoon-request-decline`, duty: 'Closing Prayer',
    date: paDateOffset(14), service: 'Afternoon', note: 'Fictional request for staging check',
    status: 'pending', createdAt: Date.now()
  });

  console.log('Seed complete.');
  console.log(JSON.stringify({
    admin: ADMIN_ID, leader: LEADER_ID,
    members: MEMBERS.map(m => m.id),
    songIds
  }, null, 2));
}

main().then(() => process.exit(0)).catch(error => {
  console.error('SEED FAILED', error);
  process.exit(1);
});

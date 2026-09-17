'use strict';

/*
 * Scripted staging checks for docs/PLAN-COMPACT-STAGING.md section 4.
 * Calls the real Section 3 callable handlers directly (constructing the same
 * request.auth shape functions/index.js's callableActor builds) against a
 * real Firestore emulator, plus firestore.rules checks over the emulator's
 * REST API with minted Auth-emulator ID tokens. See staging-harness/README.md.
 */

import { createRequire } from 'module';
import { db, auth, requestFor, mintIdToken, restGet, restPatch, createReport, assert, paDateOffset, authUidFor } from './lib.mjs';

const require = createRequire(import.meta.url);
const { createCompactWorkflowHandlers } = require('../functions/compact-workflows.js');
const { createDepartmentHandlers } = require('../functions/department-handlers.js');
const { createCompactMembershipHandlers } = require('../functions/compact-membership.js');

const now = () => Date.now();
const workflows = createCompactWorkflowHandlers({ db: db(), now });
const departmentHandlers = createDepartmentHandlers({ db: db(), now });
const membership = createCompactMembershipHandlers({ db: db(), now });

const report = createReport();

function encodePath(...segments) {
  return segments.map(segment => encodeURIComponent(segment)).join('/');
}

async function docPath(collection, id) {
  return encodePath(collection, id);
}

async function main() {
  console.log('Running staging emulator checks against project demo-lv-zion-duties.\n');

  /* ---------------------------------------------------------------
   * 1. Stale save, two clients (department profile)
   * ------------------------------------------------------------- */
  await report.check('profile stale-save: two clients, first succeeds', async () => {
    const beforeSnap = await db().collection('departments').doc('Worship').collection('members').doc(authUidFor('T. Fictitia')).get();
    const before = beforeSnap.data();
    const req1 = await requestFor('L. Leaderman', {
      departmentId: 'Worship', memberUid: authUidFor('T. Fictitia'),
      eligibleDuties: ['Presider', 'Sermon', 'Closing Prayer'],
      expectedRevision: before.revision || 0, expectedUpdatedAt: before.updatedAt
    });
    const result1 = await departmentHandlers.updateDepartmentProfile(req1);
    assert(result1.ok && result1.revision === (before.revision || 0) + 1, 'first save should succeed with a new revision');
    global.__staleWitness = { expectedRevision: before.revision || 0, expectedUpdatedAt: before.updatedAt };
    return `first save -> revision ${result1.revision}`;
  });

  await report.check('profile stale-save: second client refused as aborted with details', async () => {
    const req2 = await requestFor('L. Leaderman', {
      departmentId: 'Worship', memberUid: authUidFor('T. Fictitia'),
      eligibleDuties: ['Presider', 'Sermon'],
      ...global.__staleWitness
    });
    try {
      await departmentHandlers.updateDepartmentProfile(req2);
      throw new Error('expected an aborted rejection but the save succeeded');
    } catch (error) {
      assert(error.code === 'aborted', `expected code aborted, got ${error.code}`);
      assert(error.details && typeof error.details.updatedBy === 'string' && error.details.updatedBy,
        'details should name who changed it');
      return `refused as aborted, details.updatedBy=${error.details.updatedBy}`;
    }
  });

  /* ---------------------------------------------------------------
   * 2. Availability marks and clears Needs replacement
   * ------------------------------------------------------------- */
  const availServiceId = `${paDateOffset(10)}_morning-avail`;
  await report.check('saveMemberAvailability marks Needs replacement without removing the assignment', async () => {
    const req = await requestFor('V. Trial', {
      memberUid: authUidFor('V. Trial'),
      departments: [{
        departmentId: 'Worship',
        availability: {
          recurring: { 'early-morning': 'available', morning: 'available', afternoon: 'available', evening: 'available' },
          exceptions: { [paDateOffset(10)]: { morning: 'unavailable' } }
        }
      }]
    });
    const result = await workflows.saveMemberAvailability(req);
    assert(result.ok, 'saveMemberAvailability should succeed');
    const marked = result.replacements.marked.find(m => m.serviceId === availServiceId && m.duty === 'Sermon');
    assert(marked, `expected replacements.marked to include ${availServiceId}/Sermon, got ${JSON.stringify(result.replacements)}`);
    const scheduleSnap = await db().collection('schedule').doc(availServiceId).get();
    const schedule = scheduleSnap.data();
    assert(schedule.assignments.Sermon === 'V. Trial', 'the assignment itself must not be removed');
    assert(schedule.needsReplacement && schedule.needsReplacement.Sermon
      && schedule.needsReplacement.Sermon.memberUid === authUidFor('V. Trial'), 'a live needsReplacement marker must exist');
    return 'marker set, assignment intact';
  });

  await report.check('saveMemberAvailability clears the marker when available again', async () => {
    const req = await requestFor('V. Trial', {
      memberUid: authUidFor('V. Trial'),
      departments: [{
        departmentId: 'Worship',
        availability: {
          recurring: { 'early-morning': 'available', morning: 'available', afternoon: 'available', evening: 'available' },
          exceptions: {}
        }
      }]
    });
    const result = await workflows.saveMemberAvailability(req);
    const cleared = result.replacements.cleared.find(c => c.serviceId === availServiceId && c.duty === 'Sermon');
    assert(cleared, `expected replacements.cleared to include ${availServiceId}/Sermon`);
    const scheduleSnap = await db().collection('schedule').doc(availServiceId).get();
    const schedule = scheduleSnap.data();
    assert(!schedule.needsReplacement || !schedule.needsReplacement.Sermon, 'the marker must be gone');
    return 'marker cleared';
  });

  /* ---------------------------------------------------------------
   * 3. resolveDutyAttention: conflict advisory, then acknowledged
   * ------------------------------------------------------------- */
  const replaceServiceId = `${paDateOffset(11)}_afternoon-replace`;
  await report.check('resolveDutyAttention: conflicting replacement refused as failed-precondition/conflict', async () => {
    const req = await requestFor('L. Leaderman', {
      departmentId: 'Worship', serviceId: replaceServiceId, duty: 'Closing Prayer',
      replacementMemberUid: authUidFor('V. Trial')
    });
    try {
      await workflows.resolveDutyAttention(req);
      throw new Error('expected a conflict rejection but the resolve succeeded');
    } catch (error) {
      assert(error.code === 'failed-precondition', `expected failed-precondition, got ${error.code}`);
      assert(error.details && error.details.reason === 'conflict', `expected details.reason conflict, got ${JSON.stringify(error.details)}`);
      return `refused, duties=${JSON.stringify(error.details.duties)}`;
    }
  });

  await report.check('resolveDutyAttention: succeeds and records conflictOk when acknowledged', async () => {
    const req = await requestFor('L. Leaderman', {
      departmentId: 'Worship', serviceId: replaceServiceId, duty: 'Closing Prayer',
      replacementMemberUid: authUidFor('V. Trial'), acknowledgeConflict: true
    });
    const result = await workflows.resolveDutyAttention(req);
    assert(result.ok && result.assignment && result.assignment.memberName === 'V. Trial', 'expected the replacement to be recorded');
    const scheduleSnap = await db().collection('schedule').doc(replaceServiceId).get();
    const schedule = scheduleSnap.data();
    assert(schedule.assignments['Closing Prayer'] === 'V. Trial', 'schedule assignment should update');
    assert(schedule.conflictOk && schedule.conflictOk['V. Trial'] && schedule.conflictOk['V. Trial'].includes('Closing Prayer'),
      'conflictOk should record the acknowledgement');
    return `revision ${result.revision}`;
  });

  /* ---------------------------------------------------------------
   * resolveDutyAttention: open duty (no replacement)
   * ------------------------------------------------------------- */
  const openServiceId = `${paDateOffset(12)}_evening-open`;
  await report.check('resolveDutyAttention: opens the duty when no replacement is given', async () => {
    const req = await requestFor('L. Leaderman', {
      departmentId: 'Worship', serviceId: openServiceId, duty: 'Closing Prayer'
    });
    const result = await workflows.resolveDutyAttention(req);
    assert(result.ok, 'expected ok');
    const scheduleSnap = await db().collection('schedule').doc(openServiceId).get();
    assert(scheduleSnap.data().assignments['Closing Prayer'] === '', 'the duty should be open');
    const slotSnap = await db().collection('departmentAssignments')
      .where('serviceId', '==', openServiceId).where('duty', '==', 'Closing Prayer').get();
    assert(slotSnap.empty, 'the slot document should be deleted');
    return 'duty opened, slot deleted';
  });

  /* ---------------------------------------------------------------
   * resolveDutyAttention: request decline / approve
   * ------------------------------------------------------------- */
  await report.check('resolveDutyAttention: request approved with a clean replacement', async () => {
    const req = await requestFor('L. Leaderman', {
      departmentId: 'Worship', serviceId: `${paDateOffset(13)}_morning-request-approve`,
      duty: 'Closing Prayer', requestId: 'req-approve-1', decision: 'approved',
      replacementMemberUid: authUidFor('W. Sampleton')
    });
    const result = await workflows.resolveDutyAttention(req);
    assert(result.ok && result.requestStatus === 'approved', 'expected the request to be approved');
    const requestSnap = await db().collection('requests').doc('req-approve-1').get();
    assert(requestSnap.data().status === 'approved', 'the request document should read approved');
    return `assignment memberName=${result.assignment.memberName}`;
  });

  await report.check('resolveDutyAttention: request declined, no assignment change', async () => {
    const beforeSnap = await db().collection('schedule').doc(`${paDateOffset(14)}_afternoon-request-decline`).get();
    const before = beforeSnap.data().assignments['Closing Prayer'];
    const req = await requestFor('L. Leaderman', {
      departmentId: 'Worship', serviceId: `${paDateOffset(14)}_afternoon-request-decline`,
      duty: 'Closing Prayer', requestId: 'req-decline-1', decision: 'declined'
    });
    const result = await workflows.resolveDutyAttention(req);
    assert(result.ok && result.requestStatus === 'declined', 'expected the request to be declined');
    const afterSnap = await db().collection('schedule').doc(`${paDateOffset(14)}_afternoon-request-decline`).get();
    assert(afterSnap.data().assignments['Closing Prayer'] === before, 'the assignment must be unchanged');
    return 'declined, assignment unchanged';
  });

  /* ---------------------------------------------------------------
   * 4. Membership: search, invite create/accept/repeat/revoke/expired
   * ------------------------------------------------------------- */
  await report.check('searchDepartmentCandidates finds a seeded fictional member', async () => {
    const req = await requestFor('L. Leaderman', { departmentId: 'Worship', query: 'Fic' });
    const result = await membership.searchDepartmentCandidates(req);
    assert(result.ok && result.members.some(m => m.memberUid === authUidFor('T. Fictitia')), 'expected T. Fictitia in results');
    return `${result.total} match(es)`;
  });

  await db().collection('accounts').doc('X. Newcomer').set({
    id: 'X. Newcomer', memberId: 'X. Newcomer', name: 'X. Newcomer', memberName: 'X. Newcomer',
    role: 'member', roles: ['member'], departments: [], departmentIds: [],
    mustChangePin: false, active: true, roleVersion: 1, authUid: 'member:X. Newcomer'
  });

  let inviteToken;
  await report.check('createDepartmentInvitation issues a token', async () => {
    const req = await requestFor('L. Leaderman', { departmentId: 'Worship' });
    const result = await membership.createDepartmentInvitation(req);
    assert(result.ok && result.token, 'expected a token');
    inviteToken = result.token;
    return 'token issued (not logged)';
  });

  await report.check('acceptDepartmentInvitation joins the member once', async () => {
    const req = await requestFor('X. Newcomer', { token: inviteToken });
    const result = await membership.acceptDepartmentInvitation(req);
    assert(result.ok && result.departmentId === 'Worship' && result.memberUid === authUidFor('X. Newcomer') && result.alreadyMember === false,
      `unexpected accept result ${JSON.stringify(result)}`);
    const profileSnap = await db().collection('departments').doc('Worship').collection('members').doc(authUidFor('X. Newcomer')).get();
    assert(profileSnap.exists && profileSnap.data().role === 'member' && profileSnap.data().schedulable === false,
      'expected a new member-role, non-schedulable profile');
    return 'joined, profile created';
  });

  await report.check('acceptDepartmentInvitation refuses a second use', async () => {
    const req = await requestFor('X. Newcomer', { token: inviteToken });
    try {
      await membership.acceptDepartmentInvitation(req);
      throw new Error('expected the second accept to be refused');
    } catch (error) {
      assert(error.code === 'already-exists', `expected already-exists, got ${error.code}`);
      return 'refused as already-exists';
    }
  });

  let revokeToken;
  await report.check('revokeDepartmentInvitation revokes, then refuses acceptance', async () => {
    const createReq = await requestFor('L. Leaderman', { departmentId: 'Worship' });
    const created = await membership.createDepartmentInvitation(createReq);
    revokeToken = created.token;
    const revokeReq = await requestFor('L. Leaderman', { token: revokeToken });
    const revoked = await membership.revokeDepartmentInvitation(revokeReq);
    assert(revoked.ok && revoked.revoked === true, 'expected revoked: true');
    const acceptReq = await requestFor('Q. Sample', { token: revokeToken });
    try {
      await membership.acceptDepartmentInvitation(acceptReq);
      throw new Error('expected the revoked token to be refused');
    } catch (error) {
      assert(error.code === 'failed-precondition', `expected failed-precondition, got ${error.code}`);
      return 'revoked and refused';
    }
  });

  await report.check('acceptDepartmentInvitation refuses an expired token', async () => {
    const createReq = await requestFor('L. Leaderman', { departmentId: 'Worship' });
    const created = await membership.createDepartmentInvitation(createReq);
    const crypto = await import('node:crypto');
    const digest = crypto.createHash('sha256').update(created.token, 'utf8').digest('hex');
    await db().collection('departmentInvitations').doc(digest).update({ expiresAt: Date.now() - 1000 });
    const acceptReq = await requestFor('N. Mockford', { token: created.token });
    try {
      await membership.acceptDepartmentInvitation(acceptReq);
      throw new Error('expected the expired token to be refused');
    } catch (error) {
      assert(error.code === 'failed-precondition', `expected failed-precondition, got ${error.code}`);
      return 'expired and refused';
    }
  });

  /* ---------------------------------------------------------------
   * 5. Song service saves: draft, confirm, confirm after out-of-band bump
   * ------------------------------------------------------------- */
  const songServiceId = `${paDateOffset(5)}_morning-song`;
  let songRevisionAfterDraft;
  await report.check('saveSongService: draft save', async () => {
    const before = (await db().collection('setlists').doc(songServiceId).get()).data();
    const req = await requestFor('T. Fictitia', {
      serviceId: songServiceId, songs: ['song-grace-and-truth', 'song-new-covenant'],
      glorySong: 'song-grace-and-truth', thanksSong: 'song-new-covenant', notes: 'Fictional staging note',
      confirm: false, expectedRevision: before.revision || 0, expectedUpdatedAt: before.updatedAt
    });
    const result = await workflows.saveSongService(req);
    assert(result.ok && result.setlist.status === 'planned' && !result.setlist.confirmedAt, 'expected a planned, unconfirmed draft');
    songRevisionAfterDraft = result;
    return `revision ${result.revision}`;
  });

  await report.check('saveSongService: confirm', async () => {
    const req = await requestFor('T. Fictitia', {
      serviceId: songServiceId, songs: ['song-grace-and-truth', 'song-new-covenant'],
      glorySong: 'song-grace-and-truth', thanksSong: 'song-new-covenant', notes: 'Fictional staging note',
      confirm: true,
      expectedRevision: songRevisionAfterDraft.revision, expectedUpdatedAt: songRevisionAfterDraft.setlist.updatedAt
    });
    const result = await workflows.saveSongService(req);
    assert(result.ok && result.setlist.confirmedAt, 'expected confirmedAt to be set');
    songRevisionAfterDraft = result;
    return `confirmed, revision ${result.revision}`;
  });

  await report.check('saveSongService: confirm succeeds after an out-of-band updatedAt bump (Finding 4 scenario)', async () => {
    // Simulate the legacy song picker bumping updatedAt directly (it writes
    // through the wide-open setlists rule, not through this callable, and
    // does not know about `revision`).
    const bumpedAt = Date.now() + 5000;
    await db().collection('setlists').doc(songServiceId).update({ updatedAt: bumpedAt, updatedBy: 'legacy-picker' });
    const live = (await db().collection('setlists').doc(songServiceId).get()).data();
    assert(live.revision === songRevisionAfterDraft.revision, 'revision should be untouched by the legacy bump');
    // A correctly-fixed client re-reads the live setlist before confirming
    // (Section 6's Finding 4 correction) and sends ITS witness, not a stale one.
    const req = await requestFor('T. Fictitia', {
      serviceId: songServiceId, songs: ['song-grace-and-truth', 'song-new-covenant'],
      glorySong: 'song-grace-and-truth', thanksSong: 'song-new-covenant', notes: 'Fictional staging note',
      confirm: true, expectedRevision: live.revision, expectedUpdatedAt: live.updatedAt
    });
    const result = await workflows.saveSongService(req);
    assert(result.ok, 'confirm should succeed when the client resent the live witness');
    return `confirmed after bump, revision ${result.revision}`;
  });

  /* ---------------------------------------------------------------
   * 6. correctSongHistory
   * ------------------------------------------------------------- */
  const sungServiceId = `${paDateOffset(-10)}_morning-already-sung`;
  await report.check('correctSongHistory swaps songs and updates songStats history', async () => {
    const before = (await db().collection('setlists').doc(sungServiceId).get()).data();
    const req = await requestFor('T. Fictitia', {
      serviceId: sungServiceId, songs: ['song-grace-and-truth', 'song-new-covenant'],
      expectedRevision: before.revision || 0, expectedUpdatedAt: before.updatedAt
    });
    const result = await workflows.correctSongHistory(req);
    assert(result.ok && result.setlist.status === 'sung' && result.setlist.historySource === 'corrected', 'expected a corrected sung record');
    assert(result.changedSongs.includes('song-grace-and-truth') || result.changedSongs.includes('song-passover-joy'),
      `expected changedSongs to mention the swap, got ${JSON.stringify(result.changedSongs)}`);
    const removedStats = await db().collection('songStats').doc('song-passover-joy').get();
    assert(!removedStats.exists, 'the old song with an emptied history should have its stats doc removed');
    const addedStats = await db().collection('songStats').doc('song-grace-and-truth').get();
    const entry = (addedStats.data().history || []).find(h => h.service === sungServiceId);
    assert(entry && entry.source === 'corrected', 'expected a corrected history entry');
    return `changedSongs=${JSON.stringify(result.changedSongs)}`;
  });

  /* ---------------------------------------------------------------
   * 7. recordSongHistory: window + idempotency + scope
   * ------------------------------------------------------------- */
  let firstRunScope;
  await report.check('recordSongHistory: first run records only past, confirmed, unconfirmed-untouched planned lists', async () => {
    const result = await workflows.recordSongHistory();
    firstRunScope = result;
    return `candidates recorded=${result.recorded}, skipped=${result.skipped}`;
  });

  await report.check('recordSongHistory: recorded the two past confirmed lists and left the future one alone', async () => {
    const past1 = await db().collection('setlists').doc(`${paDateOffset(-1)}_evening-past`).get();
    const past2 = await db().collection('setlists').doc(`${paDateOffset(-2)}_morning-past2`).get();
    const future = await db().collection('setlists').doc(songServiceId).get();
    const unconfirmed = await db().collection('setlists').doc(`${paDateOffset(-3)}_evening-unconfirmed`).get();
    assert(past1.data().status === 'sung' && past1.data().historySource === 'automatic', `${paDateOffset(-1)}_evening-past should be auto-recorded`);
    assert(past2.data().status === 'sung' && past2.data().historySource === 'automatic', `${paDateOffset(-2)}_morning-past2 should be auto-recorded`);
    assert(future.data().status === 'planned', 'the future confirmed setlist must NOT be recorded yet (3-hour window)');
    assert(unconfirmed.data().status === 'planned', 'the never-confirmed setlist must never be recorded');
    return `recorded=2 expected, actual recorded=${firstRunScope.recorded}, skipped=${firstRunScope.skipped}`;
  });

  await report.check('recordSongHistory: second run is a no-op for the already-recorded lists', async () => {
    const result = await workflows.recordSongHistory();
    assert(result.recorded === 0, `expected 0 newly recorded on the second run, got ${result.recorded}`);
    return `second run recorded=${result.recorded}, skipped=${result.skipped}`;
  });

  /* ---------------------------------------------------------------
   * 8. firestore.rules checks
   * ------------------------------------------------------------- */
  await report.check('rules: member can read their own profile after it carries revision', async () => {
    const idToken = await mintIdToken('member:T. Fictitia');
    const path = encodePath('departments', 'Worship', 'members', authUidFor('T. Fictitia'));
    const resp = await restGet(path, idToken);
    assert(resp.ok, `expected 200, got ${resp.status}: ${JSON.stringify(resp.body)}`);
    const revisionField = resp.body.fields && resp.body.fields.revision;
    assert(revisionField, `expected the profile to carry a revision field, got ${JSON.stringify(resp.body.fields && Object.keys(resp.body.fields))}`);
    return `read ok, revision=${JSON.stringify(revisionField)}`;
  });

  const rulesServiceId = `${paDateOffset(21)}_afternoon-rules`;
  await report.check('rules: a client cannot introduce needsReplacement on a schedule document', async () => {
    const idToken = await mintIdToken('member:A. Administrix');
    const path = await docPath('schedule', rulesServiceId);
    const resp = await restPatch(path, { needsReplacement: { Presider: { memberName: 'forged', reason: 'unavailable' } } }, idToken);
    assert(!resp.ok, `expected the write to be denied, got ${resp.status}: ${JSON.stringify(resp.body)}`);
    return `denied as expected (${resp.status})`;
  });

  await report.check('rules: departmentInvitations is unreadable and unwritable from a client', async () => {
    const idToken = await mintIdToken('member:A. Administrix');
    const readResp = await restGet(await docPath('departmentInvitations', 'anything'), idToken);
    assert(!readResp.ok, `expected read to be denied, got ${readResp.status}`);
    const writeResp = await restPatch(await docPath('departmentInvitations', 'anything'), { status: 'active' }, idToken);
    assert(!writeResp.ok, `expected write to be denied, got ${writeResp.status}`);
    return 'read and write both denied';
  });

  await report.check('rules: legacy full-document admin schedule save with the new fields carried through unchanged passes', async () => {
    // Simulate a callable having already written the server-owned fields.
    await db().collection('schedule').doc(rulesServiceId).set({
      needsReplacement: { Presider: { memberName: 'T. Fictitia', memberUid: authUidFor('T. Fictitia'), departmentId: 'Worship', reason: 'unavailable', since: Date.now(), markedByUid: 'staging-harness-seed' } },
      assignmentRevisions: { Presider: 3 }
    }, { merge: true });
    const current = (await db().collection('schedule').doc(rulesServiceId).get()).data();
    const idToken = await mintIdToken('member:A. Administrix');
    // Full-document replace (no updateMask): carries EVERY field through,
    // including the two server-owned ones, byte-for-byte identical, which is
    // exactly what app.js's serviceWriteBody()/persistService() now does
    // (Section 6 Finding 6).
    const resp = await restPatch(await docPath('schedule', rulesServiceId), {
      id: current.id || rulesServiceId,
      date: current.date, service: current.service, worship: current.worship,
      status: current.status, assignments: current.assignments, conflictOk: current.conflictOk || {},
      needsReplacement: current.needsReplacement, assignmentRevisions: current.assignmentRevisions,
      updatedAt: Date.now(), updatedBy: 'A. Administrix'
    }, idToken, { fullReplace: true });
    assert(resp.ok, `expected the carried-through save to be accepted, got ${resp.status}: ${JSON.stringify(resp.body)}`);
    return 'accepted';
  });

  await report.check('rules: a full-document save that drops needsReplacement/assignmentRevisions is refused', async () => {
    const current = (await db().collection('schedule').doc(rulesServiceId).get()).data();
    const idToken = await mintIdToken('member:A. Administrix');
    const resp = await restPatch(await docPath('schedule', rulesServiceId), {
      id: current.id || rulesServiceId,
      date: current.date, service: current.service, worship: current.worship,
      status: current.status, assignments: current.assignments, conflictOk: current.conflictOk || {},
      updatedAt: Date.now(), updatedBy: 'A. Administrix'
      // needsReplacement and assignmentRevisions deliberately omitted: a
      // full-document replace with no updateMask deletes any field not
      // listed, so those two server-owned keys would be dropped.
    }, idToken, { fullReplace: true });
    assert(!resp.ok, `expected the save to be refused, got ${resp.status}: ${JSON.stringify(resp.body)}`);
    return `refused as expected (${resp.status})`;
  });

  /* ---------------------------------------------------------------
   * report
   * ------------------------------------------------------------- */
  const summary = report.summary();
  console.log(`\n${summary.passed}/${summary.total} checks passed (${summary.failed} failed).`);
  await import('node:fs/promises').then(fs => fs.writeFile(
    new URL('./last-run-report.json', import.meta.url),
    JSON.stringify({ generatedAt: new Date().toISOString(), summary, rows: report.rows }, null, 2)
  ));
  process.exit(summary.failed ? 1 : 0);
}

main().catch(error => {
  console.error('CHECKS SCRIPT FAILED', error);
  process.exit(1);
});

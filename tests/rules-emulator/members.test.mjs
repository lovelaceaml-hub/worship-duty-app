/* Everything else a member's browser touches directly: own profiles, push
   tokens, feedback, the daily usage count, the app/* documents, the song
   collections; plus sessions that went stale and collections nothing uses. */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, limit, orderBy, query, setDoc, updateDoc, where
} from 'firebase/firestore';
import { SVC, changeRequest, startRules, uidOf } from './harness.mjs';

let h;
before(async () => { h = await startRules(); });
after(() => h.cleanup());
beforeEach(() => h.reset());

describe('department profiles (own availability)', () => {
  const profile = (who, department, uid) => doc(h.as(who), 'departments', department, 'members', uid);

  it('a member reads their own profile in each department', async () => {
    await assertSucceeds(getDoc(profile('S. Leah', 'Usher Sisters', uidOf('S. Leah'))));
  });

  it('a member asks for their profile in a department they are not in, and hears "missing" (FR-12)', async () => {
    const snapshot = await assertSucceeds(getDoc(profile('S. Leah', 'Worship', uidOf('S. Leah'))));
    assert.equal(snapshot.exists(), false);
  });

  it('a member reads no one else\'s profile', async () => {
    await assertFails(getDoc(profile('S. Leah', 'Usher Brothers', uidOf('B. Levi'))));
    await assertFails(getDoc(profile('nobody', 'Usher Sisters', uidOf('S. Leah'))));
  });

  it('a leader reads profiles in their department only', async () => {
    await assertSucceeds(getDoc(profile('S. Grace', 'Usher Sisters', uidOf('S. Leah'))));
    await assertFails(getDoc(profile('S. Grace', 'Usher Brothers', uidOf('B. Levi'))));
    await assertFails(getDoc(profile('S. Naomi', 'Usher Sisters', uidOf('S. Leah'))));
  });

  it('no one lists a roster or writes a profile directly (the callables do)', async () => {
    await assertFails(getDocs(collection(h.as('S. Grace'), 'departments', 'Usher Sisters', 'members')));
    await assertFails(setDoc(profile('S. Leah', 'Usher Sisters', uidOf('S. Leah')), { memberUid: uidOf('S. Leah'), availability: {} }));
    await assertFails(updateDoc(profile('S. Grace', 'Usher Sisters', uidOf('S. Leah')), { status: 'inactive' }));
    await assertFails(deleteDoc(profile('B. Adam', 'Usher Sisters', uidOf('S. Leah'))));
    await assertFails(getDoc(doc(h.as('S. Grace'), 'departments', 'Usher Sisters')));
  });
});

describe('push tokens (app/services/notifications.js)', () => {
  const token = (who, id) => doc(h.as(who), 'tokens', id);

  it('a member registers this phone in their own name', async () => {
    await assertSucceeds(setDoc(token('S. Leah', 'token-new'), { name: 'S. Leah', updatedAt: Date.now() }));
    await assertSucceeds(setDoc(token('S. Leah', 'token-new'), { name: 'S. Leah', updatedAt: Date.now(), lastSeenAt: Date.now() }));
  });

  it('not in someone else\'s name, and with nothing else in it (FR-13)', async () => {
    await assertFails(setDoc(token('B. Levi', 'token-new'), { name: 'S. Leah', updatedAt: Date.now() }));
    await assertFails(setDoc(token('S. Leah', 'token-new'), { name: 'S. Leah', updatedAt: Date.now(), topics: ['all'] }));
    await assertFails(setDoc(token('nobody', 'token-new'), { name: 'S. Leah', updatedAt: Date.now() }));
  });

  it('the next member who signs in on a shared phone takes the token over', async () => {
    await assertSucceeds(setDoc(token('B. Levi', 'token-leah'), { name: 'B. Levi', updatedAt: Date.now() }));
  });

  it('the member who registered a token deletes it, for example when signing out', async () => {
    await assertSucceeds(deleteDoc(token('S. Leah', 'token-leah')));
  });

  it('even when their session has gone stale', async () => {
    await h.reset({ 'tokens/token-isaac': { name: 'B. Isaac', updatedAt: 1 } });
    await assertSucceeds(deleteDoc(token('B. Isaac', 'token-isaac')));
  });

  it('deleting a token that is already gone is fine', async () => {
    await assertSucceeds(deleteDoc(token('S. Leah', 'token-gone')));
  });

  it('no one deletes another member\'s token, and no one reads tokens', async () => {
    await assertFails(deleteDoc(token('B. Levi', 'token-leah')));
    await assertFails(deleteDoc(token('B. Adam', 'token-leah')));
    await assertFails(deleteDoc(token('nobody', 'token-leah')));
    await assertFails(getDoc(token('S. Leah', 'token-leah')));
    await assertFails(getDocs(collection(h.as('B. Adam'), 'tokens')));
  });
});

describe('feedback (app/services/feedback.js)', () => {
  const entry = (name, fields = {}) => Object.assign({
    uid: uidOf(name), name, kind: 'suggestion', message: 'Could the calendar show the time?', screen: 'my',
    appearance: 'original', createdAt: Date.now(), status: 'new'
  }, fields);
  const note = (who, id) => doc(h.as(who), 'feedback', id);

  it('a member sends a note under their own uid, with the name the app shows', async () => {
    await assertSucceeds(setDoc(note('S. Leah', 'fb-new'), entry('S. Leah')));
    // The alert goes to the uid's member, so the name may be the shorter
    // form the app shows for a longer name.
    await assertSucceeds(setDoc(note('S. Leah', 'fb-short'), entry('S. Leah', { name: 'Leah' })));
  });

  it('not under someone else\'s uid, and not without a member session (FR-13)', async () => {
    await assertFails(setDoc(note('B. Levi', 'fb-new'), entry('S. Leah')));
    await assertFails(setDoc(note('nobody', 'fb-new'), entry('S. Leah')));
    await assertFails(setDoc(note('B. Isaac', 'fb-new'), entry('B. Isaac')));
    await assertFails(setDoc(note('S. Leah', 'fb-new'), entry('S. Leah', { name: 'x'.repeat(81) })));
    await assertFails(setDoc(note('S. Leah', 'fb-new'), entry('S. Leah', { name: 12 })));
  });

  it('a note of the right kind and size', async () => {
    await assertFails(setDoc(note('S. Leah', 'fb-new'), entry('S. Leah', { kind: 'complaint' })));
    await assertFails(setDoc(note('S. Leah', 'fb-new'), entry('S. Leah', { message: '' })));
    await assertFails(setDoc(note('S. Leah', 'fb-new'), entry('S. Leah', { message: 'x'.repeat(2001) })));
    await assertFails(setDoc(note('S. Leah', 'fb-new'), entry('S. Leah', { screen: 'x'.repeat(41) })));
    await assertFails(setDoc(note('S. Leah', 'fb-new'), entry('S. Leah', { status: 'done' })));
    await assertFails(setDoc(note('S. Leah', 'fb-new'), entry('S. Leah', { reply: 'Thanks' })));
  });

  it('administrators list, mark done and delete; members do not', async () => {
    await assertSucceeds(getDocs(query(collection(h.as('B. Adam'), 'feedback'), orderBy('createdAt', 'desc'), limit(100))));
    await assertSucceeds(updateDoc(note('B. Adam', 'fb-1'), { status: 'done' }));
    await assertFails(updateDoc(note('B. Adam', 'fb-1'), { message: 'Edited' }));
    await assertSucceeds(deleteDoc(note('B. Adam', 'fb-1')));
    await h.reset();
    await assertFails(getDocs(query(collection(h.as('E. Joseph'), 'feedback'), orderBy('createdAt', 'desc'), limit(100))));
    await assertFails(getDoc(note('S. Leah', 'fb-1')));
    await assertFails(updateDoc(note('S. Leah', 'fb-1'), { status: 'done' }));
    await assertFails(deleteDoc(note('S. Leah', 'fb-1')));
  });
});

describe('the daily usage count (app/services/usage.js)', () => {
  const day = '2026-10-01';
  const count = (who, event, id = day, fields = {}) =>
    setDoc(doc(h.as(who), 'pulse', id), Object.assign({ date: id, [event]: increment(1) }, fields), { merge: true });

  it('a member adds one to a counter, on a new day too', async () => {
    await assertSucceeds(count('S. Leah', 'opens'));
    await assertSucceeds(count('S. Leah', 'tab_schedule'));
    await assertSucceeds(count('S. Leah', 'tab_manage', '2026-10-02'));
    assert.deepEqual(await h.stored('pulse/' + day), { date: day, opens: 4, tab_my: 1, tab_schedule: 1 });
  });

  it('nothing but one more, on that day\'s document (FR-13)', async () => {
    await assertFails(count('S. Leah', 'admin_opens'));
    await assertFails(setDoc(doc(h.as('S. Leah'), 'pulse', day), { date: day, opens: increment(5) }, { merge: true }));
    await assertFails(setDoc(doc(h.as('S. Leah'), 'pulse', day), { date: day, opens: 0 }, { merge: true }));
    await assertFails(count('S. Leah', 'opens', '2026-10-02', { date: day }));
    await assertFails(deleteDoc(doc(h.as('S. Leah'), 'pulse', day)));
    await assertFails(count('nobody', 'opens'));
  });

  it('only administrators read the counts', async () => {
    await assertSucceeds(getDoc(doc(h.as('B. Adam'), 'pulse', day)));
    await assertFails(getDoc(doc(h.as('nobody'), 'pulse', day)));
    await assertFails(getDoc(doc(h.as('S. Leah'), 'pulse', day)));
  });
});

describe('app documents', () => {
  const app = (who, id) => doc(h.as(who), 'app', id);

  it('the lock screen, the name picker and the schedule read five of them before sign-in', async () => {
    for (const id of ['settings', 'members', 'departments', 'leaderConfig', 'nameMap']) {
      await assertSucceeds(getDoc(app('nobody', id)));
    }
  });

  it('a document not written yet reads as missing instead of stopping the listener (FR-12)', async () => {
    await h.reset({}, ['app/nameMap', 'app/leaderConfig']);
    assert.equal((await assertSucceeds(getDoc(app('nobody', 'nameMap')))).exists(), false);
    assert.equal((await assertSucceeds(getDoc(app('S. Leah', 'leaderConfig')))).exists(), false);
  });

  it('a public app document that holds a PIN hash is not readable; the passcode check in settings is', async () => {
    await h.reset({ 'app/members': { list: ['S. Leah'], pinHash: 'made-up-hash' } });
    await assertFails(getDoc(app('nobody', 'members')));
    await assertSucceeds(getDoc(app('nobody', 'settings')));
  });

  it('administrators change app/settings (features, passcode, scheduler, Sheet, feast notice)', async () => {
    await assertSucceeds(setDoc(app('B. Adam', 'settings'), { feastNotice: null }, { merge: true }));
    await assertSucceeds(setDoc(app('B. Adam', 'settings'), { sitePinHash: 'another-made-up-hash' }, { merge: true }));
  });

  it('no one else writes app documents, and no one writes the others directly', async () => {
    await assertFails(setDoc(app('E. Joseph', 'settings'), { feastNotice: null }, { merge: true }));
    await assertFails(setDoc(app('nobody', 'settings'), { feastNotice: null }, { merge: true }));
    await assertFails(setDoc(app('B. Adam', 'leaderConfig'), { departmentLeaders: {} }, { merge: true }));
    await assertFails(setDoc(app('B. Adam', 'members'), { list: [] }));
    await assertFails(setDoc(app('B. Adam', 'nameMap'), { map: {} }));
    await assertFails(deleteDoc(app('B. Adam', 'settings')));
  });

  it('documents the app does not use stay closed (FR-14)', async () => {
    await assertFails(getDoc(app('nobody', 'config')));
    await assertFails(getDoc(app('B. Adam', 'config')));
    await assertFails(getDoc(doc(h.as('B. Adam'), 'app', 'settings', 'history', 'x')));
    await assertFails(getDoc(doc(h.as('nobody'), 'app', 'members', 'history', 'old')));
    await assertFails(getDocs(collection(h.as('nobody'), 'app')));
  });
});

describe('songs (stay open for the Signal song ingest, FR-1)', () => {
  it('anyone reads and writes song lists and counts, as today', async () => {
    await assertSucceeds(getDocs(collection(h.as('nobody'), 'setlists')));
    await assertSucceeds(setDoc(doc(h.as('nobody'), 'setlists', SVC), { id: SVC, date: '2026-10-10', songs: [], status: 'draft' }));
    await assertSucceeds(setDoc(doc(h.as('nobody'), 'songStats', 'song-12'), { title: 'Song of the Spirit', count: 1 }));
  });
});

describe('sessions that are not current', () => {
  const send = who => setDoc(doc(h.as(who), 'requests', 'r-' + who), changeRequest(who, 'Usher #2', { id: 'r-' + who }));

  it('a session with a new PIN still to choose does nothing', async () => {
    await assertFails(setDoc(doc(h.as('B. Silas'), 'tokens', 'token-silas'), { name: 'B. Silas', updatedAt: 1 }));
    // Even their own requests, which any current member may list.
    await assertFails(getDocs(query(collection(h.as('B. Silas'), 'requests'), where('requesterUid', '==', uidOf('B. Silas')))));
  });

  it('a session whose account was renamed away (active false) does nothing (FR-7)', async () => {
    await assertFails(setDoc(doc(h.as('B. Micah'), 'tokens', 'token-micah'), { name: 'B. Micah', updatedAt: 1 }));
    await assertFails(setDoc(doc(h.as('B. Micah'), 'pulse', '2026-10-01'), { date: '2026-10-01', opens: increment(1) }, { merge: true }));
  });

  it('a session after a PIN reset does nothing (FR-7)', async () => {
    await assertFails(setDoc(doc(h.as('S. Esther'), 'tokens', 'token-esther'), { name: 'S. Esther', updatedAt: 1 }));
  });

  it('a session older than a role change does nothing until signing in again (FR-7)', async () => {
    await assertFails(send('B. Isaac'));
    await assertFails(setDoc(doc(h.as('B. Isaac'), 'tokens', 'token-isaac'), { name: 'B. Isaac', updatedAt: 1 }));
    await assertSucceeds(setDoc(doc(h.as('B. Isaac', { roleVersion: 2 }), 'tokens', 'token-isaac'), { name: 'B. Isaac', updatedAt: 1 }));
  });

  it('an account written before roles had versions counts as version 1, as sign-in does', async () => {
    const legacy = await h.stored('accounts/S. Leah');
    delete legacy.roleVersion;
    await h.reset({ 'accounts/S. Leah': legacy });
    await assertSucceeds(setDoc(doc(h.as('S. Leah'), 'tokens', 'token-new'), { name: 'S. Leah', updatedAt: 1 }));
    await assertFails(setDoc(doc(h.as('S. Leah', { roleVersion: 2 }), 'tokens', 'token-new'), { name: 'S. Leah', updatedAt: 1 }));
  });

  it('a session under another uid than the account\'s does nothing', async () => {
    await assertSucceeds(setDoc(doc(h.as('D. Miriam'), 'tokens', 'token-miriam'), { name: 'D. Miriam', updatedAt: 1 }));
    await h.reset();
    const wrongUid = h.env.authenticatedContext('member:D. Miriam', { memberId: 'D. Miriam', memberName: 'D. Miriam', mustChangePin: false, roleVersion: 1 }).firestore();
    await assertFails(setDoc(doc(wrongUid, 'tokens', 'token-miriam'), { name: 'D. Miriam', updatedAt: 1 }));
  });

  it('a Firebase user with no member claims, or claims for no account, does nothing', async () => {
    await assertFails(setDoc(doc(h.as('stranger'), 'pulse', '2026-10-01'), { date: '2026-10-01', opens: increment(1) }, { merge: true }));
    const ghost = h.env.authenticatedContext('member:B. Nobody', { memberId: 'B. Nobody', memberName: 'B. Nobody', mustChangePin: false, roleVersion: 1 }).firestore();
    await assertFails(setDoc(doc(ghost, 'tokens', 'token-ghost'), { name: 'B. Nobody', updatedAt: 1 }));
    const noPinClaim = h.env.authenticatedContext('member:S. Leah', { memberId: 'S. Leah', memberName: 'S. Leah', roleVersion: 1 }).firestore();
    await assertFails(setDoc(doc(noPinClaim, 'tokens', 'token-new'), { name: 'S. Leah', updatedAt: 1 }));
  });

  it('accounts are never readable from the app', async () => {
    await assertFails(getDoc(doc(h.as('S. Leah'), 'accounts', 'S. Leah')));
    await assertFails(getDoc(doc(h.as('B. Adam'), 'accounts', 'S. Leah')));
  });

  /* Each path checks the session itself, not only the account's roles: a
     leader, song editor, presider, administrator or member whose roles
     changed after they signed in does nothing until they sign in again. */
  it('every path refuses a session from before a role change, and takes it after signing in again', async () => {
    const names = ['E. Joseph', 'S. Grace', 'M. Ruth', 'B. Caleb', 'B. Adam', 'S. Leah'];
    const bumped = {};
    const versions = {};
    for (const name of names) {
      const account = await h.stored('accounts/' + name);
      versions[name] = account.roleVersion + 1;
      bumped['accounts/' + name] = Object.assign(account, { roleVersion: versions[name] });
    }
    await h.reset(bumped);
    // Each operation as the member's browser makes it, for a session `who`.
    const operations = {
      'E. Joseph': who => updateDoc(doc(who, 'schedule', SVC), { conflictOk: { 'B. Caleb': ['Presider', 'Media Booth #1'] } }),
      'S. Grace': who => getDocs(query(collection(who, 'requests'), where('department', 'in', ['Usher Sisters']))),
      'M. Ruth': who => updateDoc(doc(who, 'schedule', SVC), { choirSong: '#12 Song of the Spirit' }),
      'B. Caleb': who => updateDoc(doc(who, 'schedule', SVC), { choirSong: '#13 Song of Praise' }),
      'B. Adam': who => updateDoc(doc(who, 'schedule', SVC), { time: '10:00' }),
      'S. Leah': who => updateDoc(doc(who, 'requests', 'req-leah'), { status: 'withdrawn', updatedAt: 1 })
    };
    const stale = name => h.as(name);
    for (const name of names) await assertFails(operations[name](stale(name)));
    // The rest of what these sessions do, all refused.
    const grace = stale('S. Grace'), adam = stale('B. Adam'), leah = stale('S. Leah');
    await assertFails(getDoc(doc(grace, 'departments', 'Usher Sisters', 'members', uidOf('S. Leah'))));
    await assertFails(getDoc(doc(grace, 'requests', 'req-leah')));
    await assertFails(setDoc(doc(adam, 'schedule', '2026-10-17_morning'), { date: '2026-10-17', time: '09:00', service: 'Morning', worship: 'Sabbath Day', choirSong: '', assignments: {} }));
    await assertFails(deleteDoc(doc(adam, 'schedule', SVC)));
    await assertFails(setDoc(doc(adam, 'app', 'settings'), { feastNotice: null }, { merge: true }));
    await assertFails(getDocs(query(collection(adam, 'feedback'), orderBy('createdAt', 'desc'), limit(100))));
    await assertFails(updateDoc(doc(adam, 'feedback', 'fb-1'), { status: 'done' }));
    await assertFails(getDoc(doc(adam, 'pulse', '2026-10-01')));
    await assertFails(getDocs(collection(adam, 'requests')));
    await assertFails(getDocs(query(collection(leah, 'requests'), where('requesterUid', '==', uidOf('S. Leah')))));
    await assertFails(getDoc(doc(leah, 'departments', 'Usher Sisters', 'members', uidOf('S. Leah'))));
    await assertFails(setDoc(doc(leah, 'requests', 'r-new'), changeRequest('S. Leah', 'Usher Door', { id: 'r-new' })));
    await assertFails(setDoc(doc(leah, 'feedback', 'fb-new'), {
      uid: uidOf('S. Leah'), name: 'S. Leah', kind: 'bug', message: 'Hi', screen: 'my', appearance: 'classic', createdAt: 1, status: 'new'
    }));
    // Signed in again: the same operations go through.
    for (const name of names) await assertSucceeds(operations[name](h.as(name, { roleVersion: versions[name] })));
  });
});

describe('collections nothing in the app reads or writes (FR-14)', () => {
  const paths = ['departmentSchedules/old', 'departmentAssignments/old', 'memberships/old', 'conflicts/old', 'notifications/old',
    'alerts/old', 'audit/old', 'sent/old', 'departmentInvitations/old'];

  it('are closed to leaders and administrators alike', async () => {
    for (const path of paths) {
      for (const who of ['S. Grace', 'B. Adam']) {
        await assertFails(getDoc(doc(h.as(who), path)));
        await assertFails(setDoc(doc(h.as(who), path), { department: 'Usher Sisters', status: 'active' }));
      }
    }
    await assertFails(getDocs(collection(h.as('S. Leah'), 'departmentSchedules')));
  });
});

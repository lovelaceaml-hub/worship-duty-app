/* requests/{id}: a member asks for a change to a duty they hold; leaders
   read their departments' requests; the owner may withdraw a pending one.
   Answers go through the resolveDutyAttention callable only. */
import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { EVENING, SERVICES, SVC, changeRequest, startRules, uidOf } from './harness.mjs';

let h;
before(async () => { h = await startRules(); });
after(() => h.cleanup());
beforeEach(() => h.reset());

const send = (who, request) => setDoc(doc(h.as(who), 'requests', request.id), request);
const requests = who => collection(h.as(who), 'requests');

describe('sending a change request (app/services/requests.js sendRequest)', () => {
  it('a member asks about a duty they hold', async () => {
    await assertSucceeds(send('S. Leah', changeRequest('S. Leah', 'Usher Door')));
    await assertSucceeds(send('B. Levi', changeRequest('B. Levi', 'Closing Prayer')));
    await assertSucceeds(send('S. Leah', changeRequest('S. Leah', 'Translation #1', { svcId: EVENING })));
  });

  it('with an empty note, or one of 500 characters', async () => {
    await assertSucceeds(send('S. Leah', changeRequest('S. Leah', 'Usher Door', { note: '' })));
    await assertSucceeds(send('S. Leah', changeRequest('S. Leah', 'Usher Door', { note: 'x'.repeat(500), createdAt: 1790000000001 })));
  });

  it('not in another member\'s name (FR-2, SA-3)', async () => {
    // B. Levi tries to give away S. Leah's duty.
    const forged = changeRequest('S. Leah', 'Usher Door', { requesterUid: uidOf('B. Levi'), note: 'Please give my duty to B. Levi' });
    await assertFails(send('B. Levi', forged));
    await assertFails(send('B. Levi', Object.assign({}, forged, { memberId: 'B. Levi' })));
    await assertFails(send('B. Levi', changeRequest('B. Levi', 'Usher Door')));
    await assertFails(send('B. Levi', changeRequest('B. Levi', 'Usher #1', { requesterUid: uidOf('S. Leah') })));
    await assertFails(send('B. Levi', changeRequest('B. Levi', 'Usher #1', { memberId: 'S. Leah' })));
  });

  it('only for a duty the member holds in that service', async () => {
    await assertFails(send('S. Leah', changeRequest('S. Leah', 'Usher Front')));
    await assertFails(send('S. Leah', changeRequest('S. Leah', 'Usher Door', { svcId: EVENING })));
    await assertFails(send('S. Leah', changeRequest('S. Leah', 'Usher Door', { svcId: '2026-12-31_morning' })));
    await assertFails(send('S. Joanna', changeRequest('S. Joanna', 'Usher Back')));
  });

  it('for the department the duty belongs to', async () => {
    await assertFails(send('S. Leah', changeRequest('S. Leah', 'Usher Door', { department: 'Worship' })));
    await assertFails(send('S. Leah', changeRequest('S. Leah', 'Usher Door', { department: '' })));
  });

  it('with the service\'s own date and label', async () => {
    await assertFails(send('S. Leah', changeRequest('S. Leah', 'Usher Door', { date: '2026-10-11' })));
    await assertFails(send('S. Leah', changeRequest('S. Leah', 'Usher Door', { service: 'Evening' })));
  });

  it('pending, with a short note, the request id as its id, and nothing extra', async () => {
    await assertFails(send('S. Leah', changeRequest('S. Leah', 'Usher Door', { status: 'approved' })));
    await assertFails(send('S. Leah', changeRequest('S. Leah', 'Usher Door', { note: 'x'.repeat(501) })));
    await assertFails(send('S. Leah', changeRequest('S. Leah', 'Usher Door', { note: 42 })));
    await assertFails(send('S. Leah', changeRequest('S. Leah', 'Usher Door', { replacement: 'B. Levi' })));
    const request = changeRequest('S. Leah', 'Usher Door');
    await assertFails(setDoc(doc(h.as('S. Leah'), 'requests', 'another-id'), request));
    const withoutStatus = Object.assign({}, request);
    delete withoutStatus.status;
    await assertFails(send('S. Leah', withoutStatus));
  });

  it('not without a current member session', async () => {
    await assertFails(send('nobody', changeRequest('S. Leah', 'Usher Door')));
    await assertFails(send('stranger', changeRequest('S. Leah', 'Usher Door')));
    // B. Isaac's roles changed after he signed in.
    await assertFails(send('B. Isaac', changeRequest('B. Isaac', 'Usher #2')));
  });

  it('a request already sent cannot be replaced by sending it again', async () => {
    await assertFails(setDoc(doc(h.as('S. Leah'), 'requests', 'req-leah'), changeRequest('S. Leah', 'Usher Door', { id: 'req-leah', note: 'Changed' })));
  });
});

describe('who reads requests', () => {
  it('a member listens to their own (requesterUid == uid) and reads them one by one', async () => {
    await assertSucceeds(getDocs(query(requests('S. Leah'), where('requesterUid', '==', uidOf('S. Leah')))));
    await assertSucceeds(getDoc(doc(h.as('S. Leah'), 'requests', 'req-leah')));
  });

  it('a member reads no one else\'s (FR-9)', async () => {
    await assertFails(getDoc(doc(h.as('S. Leah'), 'requests', 'req-levi')));
    await assertFails(getDocs(query(requests('S. Leah'), where('requesterUid', '==', uidOf('B. Levi')))));
    await assertFails(getDocs(requests('S. Leah')));
    await assertFails(getDocs(query(requests('S. Leah'), where('department', '==', 'Usher Sisters'))));
  });

  it('a leader listens to their departments (department in [...]), one or two of them', async () => {
    await assertSucceeds(getDocs(query(requests('S. Grace'), where('department', 'in', ['Usher Sisters']))));
    await assertSucceeds(getDocs(query(requests('E. Joseph'), where('department', 'in', ['Worship', 'Media']))));
    await assertSucceeds(getDoc(doc(h.as('S. Grace'), 'requests', 'req-leah')));
  });

  it('a leader also listens to their own requests in other departments (requesterUid == uid)', async () => {
    await assertSucceeds(getDocs(query(requests('E. Joseph'), where('requesterUid', '==', uidOf('E. Joseph')))));
  });

  it('a leader reads no department they do not lead', async () => {
    await assertFails(getDocs(query(requests('S. Grace'), where('department', 'in', ['Usher Sisters', 'Worship']))));
    await assertFails(getDoc(doc(h.as('S. Grace'), 'requests', 'req-levi')));
    await assertFails(getDocs(requests('E. Joseph')));
  });

  it('an older leader account with a single role reads its department', async () => {
    await assertSucceeds(getDocs(query(requests('S. Hannah'), where('department', 'in', ['Worship']))));
  });

  it('a removed leader reads only their own, whatever their sign-in still says (FR-7)', async () => {
    await assertFails(getDocs(query(requests('S. Naomi'), where('department', 'in', ['Usher Sisters']))));
    await assertFails(getDoc(doc(h.as('S. Naomi'), 'requests', 'req-leah')));
    await assertSucceeds(getDocs(query(requests('S. Naomi'), where('requesterUid', '==', uidOf('S. Naomi')))));
  });

  it('administrators listen to every request, and to their own like everyone', async () => {
    await assertSucceeds(getDocs(requests('B. Adam')));
    await assertSucceeds(getDocs(query(requests('B. Adam'), where('requesterUid', '==', uidOf('B. Adam')))));
  });

  it('no one reads requests without signing in', async () => {
    await assertFails(getDocs(requests('nobody')));
    await assertFails(getDoc(doc(h.as('nobody'), 'requests', 'req-leah')));
    await assertFails(getDocs(query(requests('stranger'), where('requesterUid', '==', 'stranger-uid'))));
  });
});

describe('withdrawing and answering', () => {
  const ref = (who, id) => doc(h.as(who), 'requests', id);

  it('the member withdraws their own pending request', async () => {
    await assertSucceeds(updateDoc(ref('S. Leah', 'req-leah'), { status: 'withdrawn', updatedAt: Date.now() }));
  });

  it('a withdrawal may leave out updatedAt', async () => {
    await assertSucceeds(updateDoc(ref('S. Leah', 'req-leah'), { status: 'withdrawn' }));
  });

  it('a withdrawal changes nothing else', async () => {
    await assertFails(updateDoc(ref('S. Leah', 'req-leah'), { status: 'withdrawn', note: 'Never mind' }));
    await assertFails(updateDoc(ref('S. Leah', 'req-leah'), { status: 'withdrawn', updatedAt: 'now' }));
    await assertFails(updateDoc(ref('S. Leah', 'req-leah'), { note: 'Changed my note' }));
    await assertFails(updateDoc(ref('S. Leah', 'req-leah'), { status: 'approved' }));
  });

  it('only a pending request, and only one\'s own', async () => {
    await assertFails(updateDoc(ref('S. Naomi', 'req-naomi-old'), { status: 'withdrawn' }));
    await assertFails(updateDoc(ref('B. Levi', 'req-leah'), { status: 'withdrawn' }));
    await assertFails(updateDoc(ref('S. Grace', 'req-leah'), { status: 'withdrawn' }));
  });

  it('leaders answer through the server, not by writing the request (FR-10)', async () => {
    await assertFails(updateDoc(ref('S. Grace', 'req-leah'), { status: 'approved', resolvedAt: 1, resolvedByUid: uidOf('S. Grace') }));
    await assertFails(updateDoc(ref('S. Grace', 'req-leah'), { status: 'declined', resolvedAt: 1, resolvedByUid: uidOf('S. Grace') }));
    await assertFails(updateDoc(ref('B. Adam', 'req-leah'), { status: 'approved' }));
  });

  it('no one deletes a request from the app', async () => {
    await assertFails(deleteDoc(ref('S. Leah', 'req-leah')));
    await assertFails(deleteDoc(ref('S. Grace', 'req-leah')));
    await assertFails(deleteDoc(ref('B. Adam', 'req-leah')));
  });

  it('withdrawn stays withdrawn', async () => {
    await h.reset({ 'requests/req-leah': Object.assign(changeRequest('S. Leah', 'Usher Door', { id: 'req-leah' }), { status: 'withdrawn' }) });
    await assertFails(updateDoc(ref('S. Leah', 'req-leah'), { status: 'pending' }));
  });
});

describe('the service record the request names', () => {
  it('the holder is read from the schedule as it is now: a duty given to someone else is theirs to ask about', async () => {
    const assignments = Object.assign({}, SERVICES[SVC].assignments, { 'Usher Door': 'S. Grace' });
    await h.reset({ ['schedule/' + SVC]: Object.assign({}, SERVICES[SVC], { assignments }) });
    await assertFails(send('S. Leah', changeRequest('S. Leah', 'Usher Door')));
    await assertSucceeds(send('S. Grace', changeRequest('S. Grace', 'Usher Door')));
  });

  it('a duty stored under an older spelling that app/nameMap maps to the member still counts', async () => {
    const assignments = Object.assign({}, SERVICES[EVENING].assignments, { 'Media Booth #2': 'B Caleb' });
    await h.reset({ ['schedule/' + EVENING]: Object.assign({}, SERVICES[EVENING], { assignments }) });
    await assertSucceeds(send('B. Caleb', changeRequest('B. Caleb', 'Media Booth #2', { svcId: EVENING })));
  });
});

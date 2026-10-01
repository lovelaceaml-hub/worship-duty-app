/* Firestore stops evaluating a rule after 1,000 expressions and then denies
   the request, which is how the old rules came to refuse leaders' request
   lists and presiders' choir songs. Here every rule gets 400 extra
   expressions in front of it, and the costliest things the app does must
   still be allowed: each costs well under 600, whatever is added later. */
import { after, before, beforeEach, describe, it } from 'node:test';
import { assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, increment, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { SERVICES, SVC, changeRequest, rules, startRules, uidOf } from './harness.mjs';

const PADDING = 400;

/* Each allow condition becomes `pad() && (condition)`; the catch-all stays
   as it is, since every request also evaluates it. */
function padded(text) {
  const catchAll = text.lastIndexOf('match /{document=**}');
  const head = text.slice(0, catchAll).replace(/allow ([a-z, ]+): if ([\s\S]*?);/g, 'allow $1: if pad() && ($2);');
  const pad = '\n    function pad() { return [' + Array(PADDING).fill('0').join(', ') + '].size() > 0; }\n';
  const marker = 'match /databases/{database}/documents {';
  const at = head.indexOf(marker) + marker.length;
  return head.slice(0, at) + pad + head.slice(at) + text.slice(catchAll);
}

let h;
before(async () => { h = await startRules(padded(rules)); });
after(() => h.cleanup());
beforeEach(() => h.reset());

describe('with ' + PADDING + ' expressions to spare', () => {
  const requests = who => collection(h.as(who), 'requests');
  const mark = (who, name, duties) =>
    updateDoc(doc(h.as(who), 'schedule', SVC), { conflictOk: Object.assign({}, SERVICES[SVC].conflictOk, { [name]: duties }) });

  it('members list and send change requests', async () => {
    await assertSucceeds(getDocs(query(requests('S. Leah'), where('requesterUid', '==', uidOf('S. Leah')))));
    await assertSucceeds(setDoc(doc(h.as('S. Leah'), 'requests', 'r1'), changeRequest('S. Leah', 'Usher Door', { id: 'r1' })));
    await assertSucceeds(updateDoc(doc(h.as('S. Leah'), 'requests', 'req-leah'), { status: 'withdrawn', updatedAt: 1 }));
  });

  it('leaders list their departments\' requests, up to all eight', async () => {
    await assertSucceeds(getDocs(query(requests('E. Joseph'), where('department', 'in', ['Worship', 'Media']))));
    await assertSucceeds(getDocs(query(requests('S. Lydia'), where('department', 'in',
      ['Worship', 'Usher Sisters', 'Usher Brothers', 'Lobby', 'Translation', 'Media', 'Parking Lot', 'Offering']))));
    await assertSucceeds(getDocs(requests('B. Adam')));
  });

  it('leaders of one, two or eight departments mark a double duty', async () => {
    await assertSucceeds(mark('B. Daniel', 'B. Levi', ['Closing Prayer', 'Usher #1']));
    await assertSucceeds(mark('E. Joseph', 'B. Caleb', ['Presider', 'Media Booth #1']));
    await assertSucceeds(mark('S. Lydia', 'S. Dorcas', ['Offering #1']));
  });

  it('presiders, song editors and administrators set the choir song', async () => {
    await assertSucceeds(updateDoc(doc(h.as('B. Caleb'), 'schedule', SVC), { choirSong: '#12 Song of the Spirit' }));
    await assertSucceeds(updateDoc(doc(h.as('M. Ruth'), 'schedule', SVC), { choirSong: '#12 Song of the Spirit' }));
    await assertSucceeds(updateDoc(doc(h.as('B. Adam'), 'schedule', SVC), { time: '10:00' }));
  });

  it('members count a visit, register a phone and send feedback', async () => {
    await assertSucceeds(setDoc(doc(h.as('S. Leah'), 'pulse', '2026-10-01'), { date: '2026-10-01', opens: increment(1) }, { merge: true }));
    await assertSucceeds(setDoc(doc(h.as('S. Leah'), 'tokens', 'token-new'), { name: 'S. Leah', updatedAt: 1 }));
    await assertSucceeds(setDoc(doc(h.as('S. Leah'), 'feedback', 'f1'), {
      uid: uidOf('S. Leah'), name: 'S. Leah', kind: 'bug', message: 'Hi', screen: 'my', appearance: 'original', createdAt: 1, status: 'new'
    }));
  });
});

/* schedule/{service}: public reads, administrators' direct edits, the choir
   song, and double-duty marks (app/services/schedule.js). Assignments
   themselves change only through the callables. */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { EVENING, OLD_SPELLING, SERVICES, SVC, startRules } from './harness.mjs';

let h;
before(async () => { h = await startRules(); });
after(() => h.cleanup());
beforeEach(() => h.reset());

const service = (who, id = SVC) => doc(h.as(who), 'schedule', id);

describe('reading the schedule', () => {
  it('anyone may read it before signing in (lock screen, offline copy, calendar)', async () => {
    await assertSucceeds(getDoc(service('nobody')));
    await assertSucceeds(getDocs(collection(h.as('nobody'), 'schedule')));
    await assertSucceeds(getDocs(collection(h.as('stranger'), 'schedule')));
  });

  it('no one writes it without an administrator session', async () => {
    await assertFails(setDoc(doc(h.as('nobody'), 'schedule', '2026-10-17_morning'), SERVICES[SVC]));
    await assertFails(updateDoc(service('nobody'), { time: '10:00' }));
    await assertFails(deleteDoc(service('nobody')));
    await assertFails(setDoc(doc(h.as('S. Leah'), 'schedule', '2026-10-17_morning'), SERVICES[SVC]));
    await assertFails(deleteDoc(service('E. Joseph')));
  });
});

describe('administrators', () => {
  it('add a service with the Opening Prayer default filled in (addService)', async () => {
    const added = { date: '2026-10-17', time: '09:00', service: 'Morning', worship: 'Sabbath Day', choirSong: '', assignments: { Sermon: 'B. Samuel' } };
    await assertSucceeds(setDoc(doc(h.as('B. Adam'), 'schedule', '2026-10-17_morning'), added));
  });

  it('move a service: the whole record under the new id, then delete the old one', async () => {
    const moved = Object.assign({}, SERVICES[SVC], { date: '2026-10-11', needsReplacement: { 'Usher Door': { memberName: 'S. Leah' } } });
    await assertSucceeds(setDoc(doc(h.as('B. Adam'), 'schedule', '2026-10-11_morning'), moved));
    await assertSucceeds(deleteDoc(service('B. Adam')));
  });

  it('change the time, worship, label and choir song one field at a time', async () => {
    await assertSucceeds(updateDoc(service('B. Adam'), { time: '10:00' }));
    await assertSucceeds(updateDoc(service('B. Adam'), { worship: 'Feast of Trumpets' }));
    await assertSucceeds(updateDoc(service('B. Adam'), { service: 'morning' }));
    await assertSucceeds(updateDoc(service('B. Adam'), { choirSong: '#12 Song of the Spirit' }));
  });

  it('do not change the date in place: the id holds the date, so a new date moves the service', async () => {
    await assertFails(updateDoc(service('B. Adam'), { date: '2026-10-11' }));
  });

  it('do not write assignments or the server bookkeeping directly (FR-11)', async () => {
    const assignments = Object.assign({}, SERVICES[SVC].assignments, { 'Usher Door': 'S. Joanna' });
    await assertFails(updateDoc(service('B. Adam'), { assignments }));
    await assertFails(updateDoc(service('B. Adam'), { 'assignments.Usher Door': 'S. Joanna' }));
    await assertFails(updateDoc(service('B. Adam'), { needsReplacement: {} }));
    await assertFails(updateDoc(service('B. Adam'), { assignmentRevisions: {} }));
    await assertFails(updateDoc(service('B. Adam'), { time: '10:00', assignments }));
  });

  it('a leader or a member writes no assignment either', async () => {
    const assignments = Object.assign({}, SERVICES[SVC].assignments, { 'Usher Door': 'S. Grace' });
    await assertFails(updateDoc(service('S. Grace'), { assignments }));
    await assertFails(updateDoc(service('S. Leah'), { assignments }));
    await assertFails(updateDoc(service('M. Ruth'), { assignments }));
  });

  it('only administrators change the time or the worship name', async () => {
    await assertFails(updateDoc(service('E. Joseph'), { time: '10:00' }));
    await assertFails(updateDoc(service('M. Ruth'), { worship: 'Feast of Trumpets' }));
    await assertFails(updateDoc(service('B. Caleb'), { time: '10:00' }));
  });
});

describe('the choir song', () => {
  it('the presider sets it for their own service, with no role (FR-6)', async () => {
    await assertSucceeds(updateDoc(service('B. Caleb'), { choirSong: '#12 Song of the Spirit' }));
    await assertSucceeds(updateDoc(service('B. Caleb'), { choirSong: '' }));
  });

  it('a presider stored under an older spelling that app/nameMap maps still counts', async () => {
    await assertSucceeds(updateDoc(service('B. Caleb', OLD_SPELLING), { choirSong: '#12 Song of the Spirit' }));
  });

  it('a member who does not preside there may not', async () => {
    await assertFails(updateDoc(service('S. Leah'), { choirSong: '#12 Song of the Spirit' }));
    await assertFails(updateDoc(service('B. Caleb', EVENING), { choirSong: '#12 Song of the Spirit' }));
    await assertFails(updateDoc(service('nobody'), { choirSong: '#12 Song of the Spirit' }));
  });

  it('song editors and administrators set it on any service', async () => {
    await assertSucceeds(updateDoc(service('M. Ruth'), { choirSong: '#12 Song of the Spirit' }));
    await assertSucceeds(updateDoc(service('M. Ruth', EVENING), { choirSong: '#12 Song of the Spirit' }));
    await assertSucceeds(updateDoc(service('B. Adam', EVENING), { choirSong: '#12 Song of the Spirit' }));
  });

  it('may be set to what it already is (the song planner clears an empty one)', async () => {
    await assertSucceeds(updateDoc(service('B. Caleb', OLD_SPELLING), { choirSong: '' }));
  });

  it('is text of a sensible length, and changes nothing else', async () => {
    await assertFails(updateDoc(service('B. Caleb'), { choirSong: 12 }));
    await assertFails(updateDoc(service('B. Caleb'), { choirSong: 'x'.repeat(301) }));
    await assertFails(updateDoc(service('B. Caleb'), { choirSong: '#12', time: '10:00' }));
    await assertFails(updateDoc(service('M. Ruth'), { choirSong: '#12', 'assignments.Presider': 'M. Ruth' }));
  });

  it('works on a service whose record carries an earlier editor stamp (FR-15)', async () => {
    await h.reset({ ['schedule/' + SVC]: Object.assign({}, SERVICES[SVC], { updatedBy: 'M. Ruth', updatedByUid: 'member:M. Ruth' }) });
    await assertSucceeds(updateDoc(service('B. Caleb'), { choirSong: '#12 Song of the Spirit' }));
  });
});

describe('double duties marked OK (app/services/schedule.js markDoubleDuty)', () => {
  /* The app writes the whole conflictOk map with one person's entry set to
     their duties (Mark OK) or removed (Show the warning again). */
  const mark = (who, id, name, duties, base = SERVICES[id].conflictOk || {}) => {
    const next = Object.assign({}, base);
    if (duties) next[name] = duties; else delete next[name];
    return updateDoc(service(who, id), { conflictOk: next });
  };

  it('a leader marks one in a service where their department has empty duties (FR-5)', async () => {
    // Worship has no Thanks Prayer in this service.
    await assertSucceeds(mark('E. Joseph', SVC, 'B. Caleb', ['Presider', 'Media Booth #1']));
    // Usher Back is empty.
    await assertSucceeds(mark('S. Grace', EVENING, 'S. Naomi', ['Usher Door', 'Usher Front']));
  });

  it('a leader of either department involved may mark it', async () => {
    // B. Caleb's Media Booth #1 is in Media, which E. Joseph also leads.
    await assertSucceeds(mark('E. Joseph', SVC, 'B. Caleb', ['Presider', 'Media Booth #1']));
    await h.reset();
    await assertSucceeds(mark('B. Daniel', SVC, 'B. Levi', ['Closing Prayer', 'Usher #1']));
  });

  it('a leader shows the warning again by removing the mark (FR-5)', async () => {
    await h.reset({ ['schedule/' + SVC]: Object.assign({}, SERVICES[SVC], { conflictOk: { 'B. Caleb': ['Presider', 'Media Booth #1'] } }) });
    await assertSucceeds(mark('E. Joseph', SVC, 'B. Caleb', null, { 'B. Caleb': ['Presider', 'Media Booth #1'] }));
    assert.deepEqual((await h.stored('schedule/' + SVC)).conflictOk, {});
  });

  it('a leader of every department marks one in the last of them, well within the rules\' limits', async () => {
    const assignments = Object.assign({}, SERVICES[SVC].assignments, { 'Offering #2': 'S. Dorcas' });
    await h.reset({ ['schedule/' + SVC]: Object.assign({}, SERVICES[SVC], { assignments }) });
    await assertSucceeds(mark('S. Lydia', SVC, 'S. Dorcas', ['Offering #1', 'Offering #2']));
  });

  it('an older leader account with a single role marks for its department', async () => {
    await assertSucceeds(mark('S. Hannah', SVC, 'B. Caleb', ['Presider', 'Media Booth #1']));
  });

  it('a leader may not mark someone with no duty in their departments', async () => {
    await assertFails(mark('S. Grace', SVC, 'B. Caleb', ['Presider', 'Media Booth #1']));
    await assertFails(mark('S. Grace', SVC, 'S. Joanna', ['Usher Door']));
    // Removing someone else's mark is changing it too.
    await assertFails(mark('S. Grace', EVENING, 'B. Titus', null));
  });

  it('a leader changes only the marks of their own people, all in one write', async () => {
    const next = { 'B. Caleb': ['Presider', 'Media Booth #1'], 'S. Leah': ['Usher Door'] };
    await assertFails(updateDoc(service('E. Joseph'), { conflictOk: next }));
    await assertFails(updateDoc(service('E. Joseph'), { conflictOk: { 'B. Caleb': ['Presider', 'Media Booth #1'] }, time: '10:00' }));
    await assertFails(updateDoc(service('E. Joseph'), { conflictOk: 'all fine' }));
  });

  it('administrators mark anyone in the service', async () => {
    await assertSucceeds(mark('B. Adam', SVC, 'B. Caleb', ['Presider', 'Media Booth #1']));
    await assertSucceeds(mark('B. Adam', EVENING, 'B. Titus', null));
  });

  it('members, song editors and removed leaders may not mark', async () => {
    await assertFails(mark('B. Caleb', SVC, 'B. Caleb', ['Presider', 'Media Booth #1']));
    await assertFails(mark('M. Ruth', SVC, 'B. Caleb', ['Presider', 'Media Booth #1']));
    await assertFails(mark('S. Naomi', EVENING, 'S. Naomi', ['Usher Door', 'Usher Front']));
    await assertFails(mark('nobody', SVC, 'B. Caleb', ['Presider', 'Media Booth #1']));
  });

  it('a mark that changes nothing is not a write anyone needs', async () => {
    await assertFails(updateDoc(service('S. Leah'), { conflictOk: {} }));
  });

  it('clearing the whole field is not a mark', async () => {
    await assertFails(updateDoc(service('E. Joseph', EVENING), { conflictOk: deleteField() }));
  });
});

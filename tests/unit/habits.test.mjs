/* Fill's Usual way (the department's habits), Manual only, and the double
   duties a leader marked always OK together. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fill } from '../../app/lib/fill.js';
import { normalizeProfile } from '../../app/lib/availability.js';
import { canAlsoServe, doubleDuties, useOkPairs, okPairKey, canBeOkPair } from '../../app/lib/conflicts.js';
import { useManualOnly } from '../../app/lib/manual-only.js';
import { suggestReplacements } from '../../app/lib/workload.js';

const require = createRequire(import.meta.url);
const permissions = require('../../permissions.js');

function profile(department, name, duties) {
  return normalizeProfile({
    memberUid: 'member:' + name, departmentId: department, memberName: name, status: 'active', schedulable: true,
    eligibleDuties: duties, availability: { recurring: {}, exceptions: {} }
  }, department);
}
const service = (date, label = 'Morning', assignments = {}, worship = 'Sabbath Day') =>
  ({ date, service: label, time: label === 'Morning' ? '10:00' : '19:30', worship, assignments });
const picks = result => result.proposals.map(item => [item.serviceId, item.duty, item.memberName]);
const offering = ['Offering #1', 'Offering #2', 'Offering #3', 'Offering #4', 'Offering #5', 'Offering #6'];
const reset = () => { useManualOnly(() => ({})); useOkPairs(() => []); };

test('Usual gives a duty to whoever usually holds it at that kind of service', () => {
  reset();
  const roster = ['S. Ada', 'S. Bea', 'S. Cora'].map(name => profile('Offering', name, offering));
  // Over the summer: Ada always had Offering #6 on Sabbath mornings, Bea #1, and Cora the evenings.
  const history = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22'].flatMap(date => [
    service(date, 'Morning', { 'Offering #6': 'S. Ada', 'Offering #1': 'S. Bea' }),
    service(date, 'Evening', { 'Offering #6': 'S. Cora' })
  ]);
  const result = fill([service('2026-09-05'), service('2026-09-05', 'Evening')], ['Offering #1', 'Offering #6'],
    () => roster, {}, { mode: 'pattern', history });
  assert.deepEqual(picks(result), [
    ['2026-09-05_morning', 'Offering #1', 'S. Bea'],
    ['2026-09-05_morning', 'Offering #6', 'S. Ada'],
    ['2026-09-05_evening', 'Offering #1', 'S. Bea'],  // no one has its evening habit; Bea usually holds #1
    ['2026-09-05_evening', 'Offering #6', 'S. Cora']  // her evening habit is filled first
  ]);
});

test('Usual keeps each person near their usual number of duties a month', () => {
  reset();
  const roster = ['S. Ada', 'S. Bea'].map(name => profile('Offering', name, ['Offering #6']));
  // Ada served #6 once a month (her habit), Bea twice; Ada still has the most #6.
  const history = [
    service('2026-07-18', 'Morning', { 'Offering #6': 'S. Ada' }), service('2026-08-01', 'Morning', { 'Offering #6': 'S. Ada' }),
    service('2026-08-15', 'Morning', { 'Offering #6': 'S. Ada' }), service('2026-08-29', 'Morning', { 'Offering #6': 'S. Ada' }),
    service('2026-07-11', 'Morning', { 'Offering #6': 'S. Bea' }), service('2026-07-25', 'Morning', { 'Offering #6': 'S. Bea' }),
    service('2026-08-08', 'Morning', { 'Offering #6': 'S. Bea' })
  ];
  const result = fill(['2026-09-05', '2026-09-12', '2026-09-19'].map(date => service(date)), ['Offering #6'],
    () => roster, {}, { mode: 'pattern', history });
  // Ada first (most #6), then she has her one; Bea up to her usual (about 2), then the fairest.
  assert.deepEqual(result.proposals.map(item => item.memberName).slice(0, 2), ['S. Ada', 'S. Bea']);
});

test('Usual shares turns in proportion to the habit, mixed through the month, not one person first', () => {
  reset();
  const doors = ['S. Ada', 'S. Bea'].map(name => profile('Usher Sisters', name, ['Usher Door']));
  // The last 2 months: Ada had the door on 6 mornings, Bea on 4.
  const dates = ['2026-07-11', '2026-07-14', '2026-07-18', '2026-07-21', '2026-07-25', '2026-07-28', '2026-08-01', '2026-08-04', '2026-08-08', '2026-08-11'];
  const history = dates.map((date, i) => service(date, 'Morning', { 'Usher Door': i < 6 ? 'S. Ada' : 'S. Bea' }));
  assert.deepEqual([6, 4], ['S. Ada', 'S. Bea'].map(name => history.filter(item => item.assignments['Usher Door'] === name).length));
  const september = ['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26'].map(date => service(date));
  const result = fill(september, ['Usher Door'], () => doors, {}, { mode: 'pattern', history });
  const order = result.proposals.map(item => item.memberName);
  assert.deepEqual(order, ['S. Ada', 'S. Bea', 'S. Ada', 'S. Bea'], 'about 3 to 2, taken in turn');
  reset();
});

test('Manual only: Fill never proposes them, and says so when only they were free', () => {
  reset();
  useManualOnly(() => ({ Offering: ['M. Chad'] }));
  const roster = [profile('Offering', 'M. Chad', ['Offering #6'])];
  for (const mode of ['pattern', 'auto', 'rotation', 'random']) {
    const result = fill([service('2026-09-05')], ['Offering #6'], () => roster, {}, { mode });
    assert.deepEqual(result.proposals, [], mode);
    assert.deepEqual(result.unfilled, [{ serviceId: '2026-09-05_morning', duty: 'Offering #6', reason: 'manual' }], mode);
  }
  // Another department is not affected.
  const lobby = [profile('Lobby', 'M. Chad', ['Lobby Desk #1'])];
  assert.equal(fill([service('2026-09-05')], ['Lobby Desk #1'], () => lobby, {}).proposals.length, 1);
  reset();
});

test('Manual only: left out of a short list of suggestions, last in a full one', () => {
  reset();
  useManualOnly(() => ({ Offering: ['M. Chad'] }));
  const roster = [profile('Offering', 'M. Chad', ['Offering #6']), profile('Offering', 'S. Ada', ['Offering #6'])];
  const stats = { 'S. Ada': { past8: 5 } };
  const at = service('2026-09-05');
  assert.deepEqual(suggestReplacements(at, 'Offering #6', roster, stats).map(item => item.memberName), ['S. Ada']);
  assert.deepEqual(suggestReplacements(at, 'Offering #6', roster, stats, { limit: Infinity }).map(item => item.memberName), ['S. Ada', 'M. Chad']);
  reset();
});

test('two duties marked always OK are allowed for anyone, in the app and on the server alike', () => {
  reset();
  const assignments = { 'Prayer of Thanks': 'D. Kenya' };
  assert.equal(canAlsoServe(assignments, 'D. Kenya', 'Offering #6'), false);
  assert.equal(canBeOkPair('Offering #6', 'Prayer of Thanks'), true);
  assert.equal(canBeOkPair('Usher Door', 'Prayer of Thanks'), false, 'already allowed');
  assert.equal(canBeOkPair('Sermon', 'Offering #6'), false, 'Opening Prayer is never paired');
  const key = okPairKey('Prayer of Thanks', 'Offering #6');
  assert.equal(key, permissions.okPairKey('Offering #6', 'Prayer of Thanks'));
  useOkPairs(() => [key]);
  assert.equal(canAlsoServe(assignments, 'B. Adam', 'Offering #6'), true);
  assert.equal(canAlsoServe(assignments, 'D. Kenya', 'Offering #6'), true);
  assert.deepEqual(doubleDuties({ assignments: { 'Prayer of Thanks': 'D. Kenya', 'Offering #6': 'D. Kenya' } }), []);
  assert.deepEqual(permissions.blockingDuties(assignments, 'D. Kenya', 'Offering #6', permissions.okPairsOf({ okPairs: [key] })), []);
  assert.deepEqual(permissions.blockingDuties(assignments, 'D. Kenya', 'Offering #6'), ['Prayer of Thanks']);
  // Only that pair: a third duty, or another offering, is still a double duty.
  assert.equal(canAlsoServe({ 'Prayer of Thanks': 'D. Kenya', 'Offering #6': 'D. Kenya' }, 'D. Kenya', 'Usher Door'), false);
  assert.equal(canAlsoServe(assignments, 'D. Kenya', 'Offering #5'), false);
  // Fill may then propose the pair.
  const result = fill([service('2026-09-05', 'Morning', assignments)], ['Offering #6'], () => [profile('Offering', 'D. Kenya', ['Offering #6'])], {});
  assert.deepEqual(result.proposals.map(item => item.memberName), ['D. Kenya']);
  reset();
});

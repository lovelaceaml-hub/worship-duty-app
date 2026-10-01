/* Manage's rules outside the browser: the words for every reason the server
   gives, problem(), the one rule for who can take a duty, suggestions, what
   Add gives a new member, and when a change request is open. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { reasonText, reasonNote, holderNote, isKnownReason } from '../../app/lib/reasons.js';
import { problem } from '../../app/firebase.js';
import { whyNot, canTake, candidates, normalizeProfile, dutiesFor, statusFor } from '../../app/lib/availability.js';
import { workload, suggestReplacements, recentLoad } from '../../app/lib/workload.js';
import { isOpen, shownStatus, hasStarted } from '../../app/lib/requests.js';
import { DEPARTMENTS } from '../../app/config/duties.js';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('every reason the server gives has words', () => {
  const sources = fs.readdirSync(path.join(repo, 'functions')).filter(file => file.endsWith('.js'))
    .map(file => fs.readFileSync(path.join(repo, 'functions', file), 'utf8')).join('\n');
  const codes = new Set();
  for (const match of sources.matchAll(/decision\(false, '([a-z-]+)'/g)) codes.add(match[1]);
  for (const match of sources.matchAll(/\breason: '([a-z-]+)'/g)) codes.add(match[1]);
  // The server's list of reasons and the ones it gives by error code alone.
  if (fs.existsSync(path.join(repo, 'functions', 'refusals.js'))) {
    const refusals = require('../../functions/refusals.js');
    Object.keys(refusals.MESSAGES).concat(Object.values(refusals.DEFAULT_REASONS)).forEach(code => codes.add(code));
  }
  assert.ok(codes.size > 20, 'found the server\'s codes');
  const missing = [...codes].filter(code => !isKnownReason(code));
  assert.deepEqual(missing, [], 'add these to app/lib/reasons.js');
  ['service-started', 'service-missing', 'request-closed', 'not-holder', 'session-ended', 'pin-too-common', 'privileged-target'].forEach(code => assert.ok(reasonText(code), code));
  assert.equal(reasonText('sheet-problem'), '', 'the server\'s own message says what went wrong');
  assert.equal(reasonNote('target-unavailable'), 'not available then');
  assert.equal(reasonNote('some-new-code'), 'not saved');
  assert.ok(Object.values({ a: reasonText('changed'), b: reasonText('already-serving') }).every(text => !/[—–]/.test(text)));
});

test('a planner cell says why the person on a duty cannot have it', () => {
  assert.equal(holderNote('no-profile', { department: 'Translation' }), 'Not on the Translation list');
  assert.equal(holderNote('target-inactive', { department: 'Media' }), 'Inactive in Media');
  assert.equal(holderNote('target-ineligible', { duty: 'Usher Back' }), 'Does not take Usher Back');
  assert.equal(holderNote('already-serving', { also: ['Presider'] }), 'Also Presider here');
  assert.equal(holderNote('target-unavailable'), 'Not available then');
});

test('problem() decides by the code and the reason, never by words in the message', () => {
  const error = (code, message, details) => Object.assign(new Error(message), { code: 'functions/' + code }, details ? { details } : {});
  assert.equal(problem(error('failed-precondition', 'Department authorization denied: target-unavailable.', { reason: 'target-unavailable' })), 'That member is not available then.');
  assert.equal(problem(error('failed-precondition', 'Department authorization denied: target-ineligible.')), 'That member does not take that duty.', 'older servers name the reason in the message');
  // CC-5: the Sheet import's message mentions "changed" but is not a clash.
  assert.equal(problem(error('failed-precondition', 'The sheet had no services in it, so nothing was changed.')), 'The sheet had no services in it, so nothing was changed.');
  assert.equal(problem(error('invalid-argument', 'Only availability may be changed by this callable.')), 'Only availability may be changed by this callable.');
  assert.equal(problem(error('aborted', 'This record changed since you loaded it.')), 'Someone else changed this at the same time. Look again, then retry.');
  assert.equal(problem(error('permission-denied', 'The member role has changed. Sign in again.')), 'Your access changed. Sign out, then sign in again.');
  assert.equal(problem(error('permission-denied', 'You cannot list this department roster.')), 'Your account is not allowed to do that.');
  assert.equal(problem(error('unavailable', 'fetch failed')), 'The server could not be reached. Try again.');
  assert.equal(problem(error('not-found', 'That service was moved or deleted.', { reason: 'service-missing' })), 'That service was moved or deleted.');
  // A reason given by the code alone leaves the server's sentence.
  assert.equal(problem(error('failed-precondition', 'The Google Sheet could not be read (403).', { reason: 'sheet-problem' })), 'The Google Sheet could not be read (403).');
  assert.equal(problem(error('invalid-argument', 'Choose a year.', { reason: 'invalid-input' })), 'Choose a year.');
  assert.equal(problem(error('permission-denied', 'The member role has changed. Sign in again.', { reason: 'session-ended' })), 'Your sign-in has ended. Sign out, then sign in again.');
  assert.equal(problem(new Error('The roster did not load.'), 'The roster did not load.'), 'The roster did not load.', 'a plain error gets the fallback');
  assert.equal(problem(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })), 'Your account is not allowed to do that.', 'a Firestore write');
});

const person = (name, extra = {}) => normalizeProfile(Object.assign({
  memberUid: 'member:' + name, departmentId: 'Usher Sisters', memberName: name, status: 'active', schedulable: true,
  eligibleDuties: ['Usher Door', 'Usher Front'], availability: { recurring: {}, exceptions: {} }
}, extra), 'Usher Sisters');
const service = { date: '2026-09-12', service: 'Morning', assignments: { 'Closing Prayer': 'S. Leah', 'Usher Front': 'S. Esther', Presider: 'S. Hannah' } };

test('who can take a duty: one rule, with the server\'s reasons in the server\'s order', () => {
  assert.equal(whyNot(null, service, 'Usher Door'), 'no-profile');
  assert.equal(whyNot(person('S. Ada', { status: 'inactive', schedulable: false }), service, 'Usher Door'), 'target-inactive');
  assert.equal(whyNot(person('S. Ada', { schedulable: false }), service, 'Usher Back'), 'target-ineligible', 'ineligible before not schedulable');
  assert.equal(whyNot(person('S. Ada', { schedulable: false }), service, 'Usher Door'), 'target-not-schedulable');
  assert.equal(whyNot(person('S. Ada', { availability: { recurring: { morning: 'unavailable' } } }), service, 'Usher Door'), 'target-unavailable');
  assert.equal(whyNot(person('S. Ada', { eligibleDuties: ['usher door'] }), service, 'Usher Door'), '', 'duties match without regard to case');
  assert.equal(whyNot(person('S. Esther'), service, 'Usher Door', service.assignments), 'already-serving', 'one usher duty each');
  assert.equal(whyNot(person('S. Leah'), service, 'Usher Door', service.assignments), '', 'praying there, so she may usher');
  assert.equal(whyNot(person('S. Hannah'), service, 'Usher Door', service.assignments), 'already-serving', 'the Presider does not usher');
  assert.equal(whyNot(person('S. Esther'), service, 'Usher Door'), '', 'without the assignments only the member counts');
  assert.equal(canTake(person('S. Ada', { schedulable: false }), service, 'Usher Door'), false);
  const people = ['S. Ada', 'S. Esther', 'S. Leah'].map(name => person(name));
  assert.deepEqual(candidates(service, 'Usher Door', people, service.assignments).map(item => item.memberName), ['S. Leah', 'S. Ada'], 'praying first, Esther already ushers');
});

test('suggestions weigh people the way Fill does: the last 8 weeks plus upcoming', () => {
  const stats = workload([
    { date: '2026-08-01', assignments: { 'Usher Door': 'S. Ada' } },
    { date: '2026-08-08', assignments: { 'Usher Door': 'S. Ada' } },
    { date: '2026-09-05', assignments: { 'Usher Door': 'S. Bea' } }
  ], [], '2026-09-10');
  assert.deepEqual([recentLoad(stats, 'S. Ada'), recentLoad(stats, 'S. Bea'), recentLoad(stats, 'S. Cy')], [2, 1, 0]);
  const plain = { date: '2026-09-12', service: 'Morning', assignments: {} };
  const people = ['S. Ada', 'S. Bea'].map(name => person(name));
  assert.deepEqual(suggestReplacements(plain, 'Usher Door', people, stats, { limit: Infinity }).map(item => item.memberName), ['S. Bea', 'S. Ada']);
});

test('Add gives a new member the duties and status the nightly job gives', () => {
  const serving = require('../../functions/serving-members.js');
  const permissions = require('../../permissions.js');
  const today = '2026-09-10';
  ['2026-09-30', '2026-09-10', '2026-08-06', '2026-08-05', '2025-01-01'].forEach(last => {
    assert.equal(statusFor(last, today), serving.statusFor({ last }, today), last);
  });
  assert.equal(serving.RECENT_DAYS, 35);
  DEPARTMENTS.forEach(department => {
    const all = permissions.DEPARTMENT_DUTIES[department.name];
    const served = all.slice(0, 1);
    assert.deepEqual(dutiesFor(department.name, served), department.name === 'Worship' ? served : all, department.name);
  });
});

test('a change request is closed once withdrawn, answered or past, and stays open for a moved service until its date', () => {
  const services = [{ date: '2026-09-12', service: 'Morning', time: '10:00', assignments: { 'Usher Door': 'S. Leah' } }];
  const request = { svcId: '2026-09-12_morning', date: '2026-09-12', service: 'Morning', duty: 'Usher Door', name: 'S. Leah', status: 'pending' };
  const before = new Date('2026-09-12T09:59:00-07:00'), after = new Date('2026-09-12T10:00:00-07:00');
  assert.equal(isOpen(request, services, undefined, before), true);
  assert.equal(hasStarted(request, services, after), true, 'the service starts at 10:00');
  assert.equal(isOpen(request, services, undefined, after), false);
  assert.equal(shownStatus(request, services, undefined, after), 'past');
  assert.equal(isOpen(Object.assign({}, request, { status: 'withdrawn' }), services, undefined, before), false);
  assert.equal(shownStatus(Object.assign({}, request, { status: 'withdrawn' }), services, undefined, before), 'withdrawn');
  const moved = Object.assign({}, request, { svcId: '2026-09-12_gone' });
  assert.equal(isOpen(moved, services, undefined, before), true, 'a leader can still close it');
  assert.equal(shownStatus(moved, services, undefined, after), 'past');
  const taken = [{ date: '2026-09-12', service: 'Morning', assignments: { 'Usher Door': 'S. Grace' } }];
  assert.equal(shownStatus(request, taken, undefined, after), 'completed', 'changed another way counts as done, even later');
});

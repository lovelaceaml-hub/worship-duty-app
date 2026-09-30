'use strict';

/* Who gets a phone notification: for a change request and its answer, a new
   duty, and a reminder, and that the switches in Manage, Features turn the
   last two off. index.js runs on a small in-memory Firestore and a messaging
   stub that records what would be sent. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadIndex: loadWith } = require('./load-index.js');

const tokens = {
  'tokens/scheduler-phone': { name: 'E. Joseph' },
  'tokens/leader-phone': { name: 'S. Grace' },
  'tokens/member-phone': { name: 'S. Leah' },
  'tokens/other-phone': { name: 'B. Caleb' }
};
const request = {
  name: 'S. Leah', duty: 'Usher Door', department: 'Usher Sisters', date: '2026-10-03',
  service: 'Morning', note: 'Family visiting.', status: 'pending'
};
const created = data => ({ data: { exists: true, data: () => data }, params: { id: 'r1' } });
const recipients = sent => sent.flatMap(message => message.tokens).sort();

test('a new change request reaches the scheduler and that department\'s leaders, not the member', async () => {
  const { functions, sent } = loadWith(Object.assign({
    'app/settings': { schedulerName: 'E. Joseph' },
    'app/leaderConfig': { departmentLeaders: { 'Usher Sisters': ['S. Grace'], Media: ['B. Caleb'] } }
  }, tokens));
  await functions.onRequestCreated.run(created(request));
  assert.deepEqual(recipients(sent), ['leader-phone', 'scheduler-phone']);
  assert.equal(sent[0].data.title, 'Change request');
  assert.match(sent[0].data.body, /^S\. Leah asks to change Usher Door · Saturday, October 3 Morning · "Family visiting\."$/);
});

test('a leader who asks for a change is not told about their own request', async () => {
  const { functions, sent } = loadWith(Object.assign({
    'app/settings': {},
    'app/leaderConfig': { departmentLeaders: { 'Usher Sisters': ['S. Leah', 'S. Grace'] } }
  }, tokens));
  await functions.onRequestCreated.run(created(request));
  assert.deepEqual(recipients(sent), ['leader-phone']);
});

test('the member hears when their request is approved or declined', async () => {
  for (const [status, title] of [['approved', 'Your change request was approved'], ['declined', 'Your change request was declined']]) {
    const { functions, sent } = loadWith(Object.assign({}, tokens));
    await functions.onRequestResolved.run({
      data: {
        before: { exists: true, data: () => request },
        after: { exists: true, data: () => Object.assign({}, request, { status }) }
      },
      params: { id: 'r1' }
    });
    assert.deepEqual(recipients(sent), ['member-phone']);
    assert.equal(sent[0].data.title, title);
  }
});

/* A service 12 hours from now, in Pacific time, as the schedule stores it. */
function serviceSoon() {
  const start = new Date(Date.now() + 12 * 3600 * 1000);
  const part = type => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(start).find(item => item.type === type).value;
  return { date: part('year') + '-' + part('month') + '-' + part('day'), time: part('hour') + ':' + part('minute'), service: 'Evening', worship: 'Third Day',
    assignments: { 'Usher Door': 'S. Leah' } };
}

test('a member hears about a new duty, unless New duty alerts is off', async () => {
  const before = { date: '2026-10-03', time: '09:00', service: 'Morning', assignments: { 'Usher Door': 'S. Naomi' } };
  const after = Object.assign({}, before, { assignments: { 'Usher Door': 'S. Leah' } });
  const event = { data: { before: { exists: true, data: () => before }, after: { exists: true, data: () => after } }, params: { id: '2026-10-03_morning' } };
  for (const [features, expected] of [[{}, ['member-phone']], [{ notifications: false }, []]]) {
    const { functions, sent } = loadWith(Object.assign({ 'app/settings': { features } }, tokens));
    await functions.onScheduleWrite.run(event);
    assert.deepEqual(recipients(sent), expected, JSON.stringify(features));
    if (expected.length) assert.equal(sent[0].data.title, 'New duty for you');
  }
});

test('reminders go out in the 24 hours before a duty, unless Day-before reminders is off', async () => {
  for (const [features, expected] of [[{}, ['member-phone']], [{ reminders: false }, []]]) {
    const { functions, sent } = loadWith(Object.assign({ 'app/settings': { features }, 'schedule/soon': serviceSoon() }, tokens));
    await functions.dutyReminders.run({});
    assert.deepEqual(recipients(sent), expected, JSON.stringify(features));
    if (expected.length) assert.equal(sent[0].data.title, 'Duty reminder');
  }
});

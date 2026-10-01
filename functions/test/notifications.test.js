'use strict';

/* Who gets a phone notification and how: a change request and its answer
   (from the verified member who holds the duty, never a typed name), feedback
   marked done, new duties (all of a member's new duties in one alert, none
   once a service has started) and reminders (one per member per run, once,
   with a time to live). A payload error keeps the device's token; only a
   gone device's token is deleted. index.js runs on the in-memory Firestore
   and a messaging stub that records what would be sent. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadIndex: loadWith } = require('./load-index.js');

const tokens = {
  'tokens/scheduler-phone': { name: 'E. Joseph' },
  'tokens/leader-phone': { name: 'S. Grace' },
  'tokens/member-phone': { name: 'S. Leah' },
  'tokens/other-phone': { name: 'B. Caleb' }
};
const accounts = {
  'accounts/S. Leah': { memberName: 'S. Leah', active: true, roleVersion: 1 },
  'accounts/S. Ruth': { memberName: 'S. Ruth', active: true, roleVersion: 1 }
};
const SERVICE = 'schedule/2030-10-05_morning';
const service = assignments => ({ date: '2030-10-05', time: '10:00', service: 'Morning', worship: 'Sabbath Day', assignments });
const request = {
  name: 'S. Leah', requesterUid: 'member:S. Leah', duty: 'Usher Door', department: 'Usher Sisters', svcId: '2030-10-05_morning',
  date: '2030-10-05', service: 'Morning', note: 'Family visiting.', status: 'pending'
};
const created = data => ({ data: { exists: true, data: () => data }, params: { id: 'r1' } });
const updated = (from, to, id = 'r1') => ({ data: { before: { exists: true, data: () => from }, after: { exists: true, data: () => to } }, params: { id } });
const recipients = sent => sent.flatMap(message => message.tokens).sort();
const church = (extra = {}) => Object.assign({
  'app/settings': { schedulerName: 'E. Joseph' },
  'app/leaderConfig': { departmentLeaders: { 'Usher Sisters': ['S. Grace'], Media: ['B. Caleb'] } },
  [SERVICE]: service({ 'Usher Door': 'S. Leah' })
}, accounts, tokens, extra);

test('a new change request reaches the scheduler and that department\'s leaders, not the member', async () => {
  const { functions, sent } = loadWith(church());
  await functions.onRequestCreated.run(created(request));
  assert.deepEqual(recipients(sent), ['leader-phone', 'scheduler-phone']);
  assert.equal(sent[0].data.title, 'Change request');
  assert.match(sent[0].data.body, /^S\. Leah asks to change Usher Door · Saturday, October 5 Morning · "Family visiting\."$/);
});

test('a leader who asks for a change is not told about their own request', async () => {
  const { functions, sent } = loadWith(church({
    'app/settings': {},
    'app/leaderConfig': { departmentLeaders: { 'Usher Sisters': ['S. Leah', 'S. Grace'] } }
  }));
  await functions.onRequestCreated.run(created(request));
  assert.deepEqual(recipients(sent), ['leader-phone']);
});

test('a request in another member\'s name, for a duty its member does not hold, or for a started service sends nothing', async () => {
  for (const [label, docs, data] of [
    ['another name', church(), Object.assign({}, request, { requesterUid: 'member:S. Ruth' })],
    ['no verified member', church(), Object.assign({}, request, { requesterUid: '' })],
    ['not their duty', church({ [SERVICE]: service({ 'Usher Door': 'S. Naomi' }) }), request],
    ['started', church({ 'schedule/2020-10-03_morning': Object.assign(service({ 'Usher Door': 'S. Leah' }), { date: '2020-10-03' }) }),
      Object.assign({}, request, { svcId: '2020-10-03_morning' })]
  ]) {
    const { functions, sent } = loadWith(docs);
    await functions.onRequestCreated.run(created(data));
    assert.deepEqual(sent, [], label);
  }
});

test('the member who asked hears when their request is approved or declined, not when they withdraw it', async () => {
  for (const [status, title] of [['approved', 'Your change request was approved'], ['declined', 'Your change request was declined'], ['withdrawn', null]]) {
    // The typed name says someone else; the verified member is told.
    const { functions, sent } = loadWith(church());
    await functions.onRequestResolved.run(updated(Object.assign({}, request, { name: 'B. Caleb' }), Object.assign({}, request, { name: 'B. Caleb', status })));
    if (!title) { assert.deepEqual(sent, [], status); continue; }
    assert.deepEqual(recipients(sent), ['member-phone']);
    assert.equal(sent[0].data.title, title);
  }
});

test('the member who sent feedback hears when it is marked done, once, by their account', async () => {
  const note = { uid: 'member:S. Leah', name: 'B. Caleb', kind: 'bug', message: 'The Schedule tab is slow.', status: 'new' };
  let { functions, sent } = loadWith(church());
  await functions.onFeedbackDone.run(updated(note, Object.assign({}, note, { status: 'done' }), 'f1'));
  assert.deepEqual(recipients(sent), ['member-phone']);
  assert.equal(sent[0].data.title, 'Your feedback was marked done');
  assert.match(sent[0].data.body, /The Schedule tab is slow\./);
  ({ functions, sent } = loadWith(church()));
  await functions.onFeedbackDone.run(updated(Object.assign({}, note, { status: 'done' }), Object.assign({}, note, { status: 'done' }), 'f1'));
  await functions.onFeedbackDone.run(updated(Object.assign({}, note, { uid: '' }), Object.assign({}, note, { uid: '', status: 'done' }), 'f2'));
  assert.deepEqual(sent, []);
});

/* A service 12 hours from now, in Pacific time, as the schedule stores it. */
function serviceSoon(assignments) {
  const start = new Date(Date.now() + 12 * 3600 * 1000);
  const part = type => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(start).find(item => item.type === type).value;
  return { date: part('year') + '-' + part('month') + '-' + part('day'), time: part('hour') + ':' + part('minute'), service: 'Evening', worship: 'Third Day',
    assignments: assignments || { 'Usher Door': 'S. Leah' } };
}

const scheduleWrite = (before, after, id = '2030-10-05_morning') => ({
  data: { before: { exists: !!before, data: () => before }, after: { exists: !!after, data: () => after } }, params: { id }
});

test('a member hears about a new duty, unless New duty alerts is off', async () => {
  const before = service({ 'Usher Door': 'S. Naomi' });
  const after = service({ 'Usher Door': 'S. Leah' });
  for (const [features, expected] of [[{}, ['member-phone']], [{ notifications: false }, []]]) {
    const { functions, sent } = loadWith(Object.assign({ 'app/settings': { features } }, tokens));
    await functions.onScheduleWrite.run(scheduleWrite(before, after));
    assert.deepEqual(recipients(sent), expected, JSON.stringify(features));
    if (expected.length) assert.equal(sent[0].data.title, 'New duty for you');
  }
});

test('two new duties in one write make one alert naming both; a started service alerts no one', async () => {
  let { functions, sent } = loadWith(Object.assign({}, tokens));
  await functions.onScheduleWrite.run(scheduleWrite(service({}), service({ 'Closing Prayer': 'S. Leah', 'Usher Door': 'S. Leah' })));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].data.title, 'New duties for you');
  assert.match(sent[0].data.body, /^Closing Prayer and Usher Door · Sabbath Day Morning · Saturday, October 5 at 10:00 AM$/);
  ({ functions, sent } = loadWith(Object.assign({}, tokens)));
  const past = Object.assign(service({}), { date: '2020-10-03' });
  await functions.onScheduleWrite.run(scheduleWrite(past, Object.assign({}, past, { assignments: { 'Usher Door': 'S. Leah' } }), '2020-10-03_morning'));
  assert.deepEqual(sent, []);
});

test('a payload error keeps the device\'s token; a device that is gone loses it', async () => {
  const docs = Object.assign({ 'tokens/second-phone': { name: 'S. Leah' } }, tokens);
  const { functions, sent } = loadWith(docs, { messagingErrors: {
    'member-phone': 'messaging/invalid-argument', 'second-phone': 'messaging/registration-token-not-registered'
  } });
  await functions.onScheduleWrite.run(scheduleWrite(service({}), service({ 'Usher Door': 'S. Leah' })));
  assert.deepEqual(recipients(sent), ['member-phone', 'second-phone']);
  assert.ok(docs['tokens/member-phone'], 'kept');
  assert.equal(docs['tokens/second-phone'], undefined, 'deleted');
});

test('reminders go out in the 24 hours before a duty, unless Day-before reminders is off', async () => {
  for (const [features, expected] of [[{}, ['member-phone']], [{ reminders: false }, []]]) {
    const { functions, sent } = loadWith(Object.assign({ 'app/settings': { features }, 'schedule/soon': serviceSoon() }, tokens));
    await functions.dutyReminders.run({});
    assert.deepEqual(recipients(sent), expected, JSON.stringify(features));
    if (expected.length) assert.equal(sent[0].data.title, 'Duty reminder');
  }
});

test('a member with two duties gets one reminder, once, that expires when the service starts', async () => {
  const docs = Object.assign({ 'schedule/soon': serviceSoon({ 'Closing Prayer': 'S. Leah', 'Usher Door': 'S. Leah' }) }, tokens);
  const { functions, sent } = loadWith(docs);
  await Promise.all([functions.dutyReminders.run({}), functions.dutyReminders.run({})]);
  await functions.dutyReminders.run({});
  assert.equal(sent.length, 1);
  assert.match(sent[0].data.body, /^Closing Prayer and Usher Door · Third Day Evening · /);
  const ttl = Number(sent[0].webpush.headers.TTL);
  assert.ok(ttl > 11 * 3600 && ttl <= 12 * 3600, String(ttl));
  assert.equal(sent[0].webpush.headers.Urgency, 'high');
});

test('the assignment records follow the service as it is now, and one failing job does not stop the others', async () => {
  const profile = name => ({ memberUid: 'uid-' + name, departmentId: 'Usher Sisters', memberName: name, status: 'active' });
  const docs = Object.assign({
    'departments/Usher Sisters/members/uid-S. Leah': profile('S. Leah'),
    'departments/Usher Sisters/members/uid-S. Naomi': profile('S. Naomi'),
    [SERVICE]: service({ 'Usher Door': 'S. Naomi' })
  }, tokens);
  const { functions, sent } = loadWith(docs);
  // A late event says S. Leah; the service already says S. Naomi.
  await functions.onScheduleWrite.run(scheduleWrite(service({}), service({ 'Usher Door': 'S. Leah' })));
  const records = Object.entries(docs).filter(([path]) => path.startsWith('departmentAssignments/')).map(([, record]) => record.memberName);
  assert.deepEqual(records, ['S. Naomi']);
  assert.equal(sent.length, 1, 'the alert still went out');

  const broken = loadWith(Object.assign({ 'app/nameMap': { map: 'not a map' } }, tokens));
  broken.db.runTransaction = async () => { throw new Error('contention'); };
  await broken.functions.onScheduleWrite.run(scheduleWrite(service({}), service({ 'Usher Door': 'S. Leah' })));
  assert.equal(broken.sent.length, 1, 'alerts are sent even when the projection fails');
});

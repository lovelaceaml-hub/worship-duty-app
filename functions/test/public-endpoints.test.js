'use strict';

/* The public calendar feed and schedule: a feed lists a member's duties under
   any of their spellings, a bad address is a 400 and an unknown name a 404
   (before any schedule read), lines are folded as calendars expect, and an
   instance reads the schedule once a minute however the address varies. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadIndex } = require('./load-index.js');

function response() {
  const res = { statusCode: 200, headers: {}, body: '' };
  res.status = code => { res.statusCode = code; return res; };
  res.type = value => { res.headers['content-type'] = value; return res; };
  res.set = (key, value) => { res.headers[key] = value; return res; };
  res.send = body => { res.body = body; return res; };
  res.json = body => { res.body = body; return res; };
  return res;
}

const docs = () => ({
  'app/members': { list: ['M. Chloe', 'S. Leah'] },
  'app/nameMap': { map: {} },
  'schedule/2030-10-05_morning': { date: '2030-10-05', service: 'Morning', worship: 'Sabbath Day', assignments: { 'Usher Door': 'D. Chloe', 'Prayer of Thanks': 'S. Leah' } },
  'schedule/2030-10-08_evening': { date: '2030-10-08', service: 'Evening', worship: 'Third Day', time: '9:30', assignments: { 'Usher Front': 'M. Chloe' } }
});

test('a member\'s feed lists their duties under any spelling, at the service\'s usual time', async () => {
  const { functions } = loadIndex(docs());
  const res = response();
  await functions.ics({ path: '/ics/M.%20Chloe', method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /DTSTART;TZID=America\/Los_Angeles:20301005T100000/, 'the stored D. Chloe is M. Chloe; Morning starts at 10:00');
  assert.match(res.body, /DTSTART;TZID=America\/Los_Angeles:20301008T193000/, 'a time that cannot be read ("9:30") is the Evening\'s usual time, as in the app');
  assert.match(res.body, /X-WR-CALNAME:LV Zion Duties for M\. Chloe/);
  assert.ok(res.body.split('\r\n').every(line => Buffer.byteLength(line, 'utf8') <= 75));
});

test('a bad address is refused, an unknown name is a 404, and the schedule is read once a minute', async () => {
  const loaded = loadIndex(docs());
  let reads = 0;
  const real = loaded.db.collection;
  loaded.db.collection = name => {
    const collection = real(name);
    if (name !== 'schedule') return collection;
    return Object.assign({}, collection, { where: (...args) => { reads += 1; return collection.where(...args); } });
  };
  const call = async path => { const res = response(); await loaded.functions.ics({ path, method: 'GET', headers: {} }, res); return res; };
  assert.equal((await call('/ics/%E0%A4%A')).statusCode, 400);
  assert.equal((await call('/ics/Nobody')).statusCode, 404);
  assert.equal(reads, 0);
  await call('/ics/S.%20Leah');
  await call('/ics/M.%20Chloe');
  assert.equal(reads, 1);
});

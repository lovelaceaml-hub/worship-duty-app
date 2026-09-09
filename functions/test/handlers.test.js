'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandlers } = require('../handlers');
const { FakeDb, snapshot } = require('./fakes');

const FIXED_NOW = Date.parse('2026-09-07T19:00:00.000Z');

function fixedClock(nowMs = FIXED_NOW) {
  return {
    nowMs: () => nowMs,
    nowDate: () => new Date(nowMs),
    fromMs: value => new Date(value),
    fromValue: value => new Date(value),
    toISOString: value => value.toISOString()
  };
}

function runtime(db, options = {}) {
  if (typeof db.runTransaction !== 'function') {
    db.runTransaction = async callback => {
      const operations = [];
      const transaction = {
        get(refOrQuery) { return refOrQuery.get(); },
        set(ref, value, options) {
          operations.push({ type: 'set', ref, value, options });
          return transaction;
        },
        update(ref, value) {
          operations.push({ type: 'set', ref, value, options: { merge: true } });
          return transaction;
        },
        delete(ref) {
          operations.push({ type: 'delete', ref });
          return transaction;
        }
      };
      const result = await callback(transaction);
      for (const operation of operations) {
        if (operation.type === 'delete') await operation.ref.delete();
        else await operation.ref.set(operation.value, operation.options);
      }
      return result;
    };
  }
  const sends = [];
  const logs = [];
  const events = db.events;
  const messaging = {
    async sendEachForMulticast(message) {
      events.push({ type: 'send', message });
      sends.push(message);
      if (options.rejectSend) throw new Error('fictional messaging outage');
      return {
        responses: message.tokens.map(token => {
          const code = options.tokenErrors && options.tokenErrors[token];
          return code
            ? { success: false, error: { code } }
            : { success: true };
        })
      };
    }
  };
  const logger = {
    error(message, details) { logs.push({ level: 'error', message, details }); },
    info(message, details) { logs.push({ level: 'info', message, details }); },
    warn(message, details) { logs.push({ level: 'warn', message, details }); }
  };
  const fetch = options.fetch || (async () => ({ ok: true, async text() { return ''; } }));
  const handlers = createHandlers({
    db,
    messaging,
    fetch,
    logger,
    clock: options.clock || fixedClock()
  });
  return { handlers, sends, logs };
}

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    contentType: '',
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    type(value) { this.contentType = value; return this; },
    send(value) { this.body = value; return this; },
    json(value) { this.body = value; return this; }
  };
}

test('schedule writes alert only changed assignments and prune invalid tokens', async () => {
  const db = new FakeDb({
    tokens: {
      'fictional-live': { name: 'Example Blair' },
      'fictional-dead': { name: 'Example Blair' },
      'fictional-casey': { name: 'Example Casey' },
      'fictional-other': { name: 'Example Other' }
    }
  });
  const { handlers, sends } = runtime(db, {
    tokenErrors: { 'fictional-dead': 'messaging/registration-token-not-registered' }
  });
  const before = snapshot(db, 'schedule', 'fictional-service', {
    date: '2026-09-13',
    service: 'Morning',
    worship: 'First',
    time: '09:00',
    assignments: {
      Presider: 'Example Avery',
      'Usher Door': 'Example Blair',
      Sermon: 'Example Blair'
    }
  });
  const after = snapshot(db, 'schedule', 'fictional-service', {
    date: '2026-09-13',
    service: 'Morning',
    worship: 'First',
    time: '09:00',
    assignments: {
      Presider: 'Example Blair',
      'Usher Door': 'Example Casey',
      Sermon: 'Example Casey'
    }
  });

  await handlers.onScheduleWrite({ data: { before, after } });

  assert.equal(sends.length, 2);
  assert.deepEqual(sends[0].tokens, ['fictional-live', 'fictional-dead']);
  assert.equal(sends[0].data.title, 'New duty assigned to you');
  assert.equal(sends[0].data.body,
    'Presider: First Morning, Sunday, September 13 at 9:00 AM');
  assert.deepEqual(sends[1].tokens, ['fictional-casey']);
  assert.equal(sends[1].data.body,
    'Usher Door: First Morning, Sunday, September 13 at 9:00 AM');
  assert.equal(db._get('tokens', 'fictional-dead'), undefined);

  const sendsBeforeNoop = sends.length;
  await handlers.onScheduleWrite({ data: {
    before: snapshot(db, 'schedule', 'fictional-new', undefined),
    after: snapshot(db, 'schedule', 'fictional-new', { assignments: { Presider: 'Example Blair' } })
  } });
  await handlers.onScheduleWrite({ data: {
    before: after,
    after: snapshot(db, 'schedule', 'fictional-service', undefined)
  } });
  assert.equal(sends.length, sendsBeforeNoop);
});

test('duty reminders mark before sending, use the fixed cutoff, and prune old markers', async () => {
  const db = new FakeDb({
    schedule: {
      'fictional-service': {
        date: '2026-09-07',
        time: '15:00',
        service: 'Evening',
        worship: 'Second',
        assignments: { Presider: 'Example Avery', 'Usher Door': 'Example Blair' }
      },
      'fictional-late': {
        date: '2026-09-09',
        time: '15:00',
        service: 'Later',
        worship: 'Third',
        assignments: { Presider: 'Example Avery' }
      }
    },
    tokens: {
      'fictional-avery-token': { name: 'Example Avery' },
      'fictional-blair-token': { name: 'Example Blair' }
    },
    sent: {
      'fictional-old-marker': { t: FIXED_NOW - (8 * 24 * 3600 * 1000) }
    }
  });
  const { handlers, sends } = runtime(db);

  await handlers.dutyReminders();

  assert.equal(sends.length, 2);
  assert.equal(sends[0].data.title, 'Duty reminder');
  assert.equal(sends[0].data.body,
    'Presider: Second Evening, Monday, September 7 at 3:00 PM');
  assert.equal(sends[1].data.body,
    'Usher Door: Second Evening, Monday, September 7 at 3:00 PM');
  assert.equal(db._get('sent', 'fictional-service_Presider_Example-Avery').t, FIXED_NOW);
  assert.equal(db._get('sent', 'fictional-service_Usher-Door_Example-Blair').t, FIXED_NOW);
  assert.equal(db._get('sent', 'fictional-old-marker'), undefined);
  const firstMarkerSet = db.events.findIndex(event =>
    event.type === 'set-doc' && event.id === 'fictional-service_Presider_Example-Avery');
  const firstSend = db.events.findIndex(event => event.type === 'send');
  assert.ok(firstMarkerSet >= 0 && firstMarkerSet < firstSend);

  const sendsAfterFirstRun = sends.length;
  await handlers.dutyReminders();
  assert.equal(sends.length, sendsAfterFirstRun);
});

test('duty reminder keeps the marker when messaging fails and omits member-derived log data', async () => {
  const db = new FakeDb({
    schedule: {
      'fictional-service': {
        date: '2026-09-07', time: '15:00', service: 'Evening', worship: 'Second',
        assignments: { Presider: 'Example Avery' }
      }
    },
    tokens: { 'fictional-token': { name: 'Example Avery' } }
  });
  const { handlers, logs } = runtime(db, { rejectSend: true });

  await handlers.dutyReminders();

  assert.equal(db._get('sent', 'fictional-service_Presider_Example-Avery').t, FIXED_NOW);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].level, 'error');
  assert.equal(logs[0].details.markerId, undefined);
});

test('request handlers notify the right person and only resolve pending requests', async () => {
  const db = new FakeDb({
    app: {
      settings: { schedulerName: 'Example Scheduler' }
    },
    tokens: {
      'fictional-scheduler-token': { name: 'Example Scheduler' },
      'fictional-requester-token': { name: 'Example Requester' }
    }
  });
  const { handlers, sends } = runtime(db);
  const request = {
    name: 'Example Requester',
    duty: 'Presider',
    date: '2026-09-13',
    service: 'Morning',
    note: 'Family appointment',
    status: 'pending'
  };

  await handlers.onRequestCreated({
    data: snapshot(db, 'requests', 'fictional-request', request),
    params: { id: 'fictional-request' }
  });
  assert.equal(sends.length, 1);
  assert.equal(sends[0].data.title, 'Schedule change requested');
  assert.equal(sends[0].data.body,
    'Example Requester requests a change: Presider: Sunday, September 13 Morning, "Family appointment"');

  await handlers.onRequestCreated({
    data: snapshot(db, 'requests', 'fictional-self-request', {
      ...request, name: 'Example Scheduler'
    }),
    params: { id: 'fictional-self-request' }
  });
  assert.equal(sends.length, 1);

  await handlers.onRequestResolved({ data: {
    before: snapshot(db, 'requests', 'fictional-request', request),
    after: snapshot(db, 'requests', 'fictional-request', { ...request, status: 'approved' })
  } });
  assert.equal(sends.length, 2);
  assert.equal(sends[1].data.title, 'Schedule change approved');
  assert.equal(sends[1].data.body, 'Presider: Sunday, September 13 Morning');

  await handlers.onRequestResolved({ data: {
    before: snapshot(db, 'requests', 'fictional-request', { ...request, status: 'approved' }),
    after: snapshot(db, 'requests', 'fictional-request', { ...request, status: 'declined' })
  } });
  await handlers.onRequestResolved({ data: {
    before: snapshot(db, 'requests', 'fictional-request', request),
    after: snapshot(db, 'requests', 'fictional-request', undefined)
  } });
  assert.equal(sends.length, 2);
});

test('ICS and public schedule HTTP handlers preserve filters, headers, projection, and clock output', async () => {
  const db = new FakeDb({
    schedule: {
      'fictional-svc': {
        date: '2026-09-10',
        time: '09:00',
        worship: 'First',
        service: 'Morning',
        assignments: { Presider: 'Example Canonical' },
        privateNote: 'omit this'
      },
      'fictional-invalid': {
        date: '2026-09-11',
        time: 'bad',
        assignments: { Presider: 'Example Canonical' }
      }
    },
    app: {
      nameMap: { map: { 'Example Variant': 'Example Canonical' } }
    }
  });
  const { handlers } = runtime(db);
  const icsResponse = responseRecorder();
  await handlers.ics({ path: '/ics/Example%20Variant' }, icsResponse);

  assert.equal(icsResponse.statusCode, 200);
  assert.equal(icsResponse.headers['Cache-Control'], 'public, max-age=300');
  assert.equal(icsResponse.contentType, 'text/calendar; charset=utf-8');
  assert.match(icsResponse.body, /X-WR-CALNAME:LV Zion Duties: Example Canonical/);
  assert.match(icsResponse.body, /DTSTAMP:20260907T190000Z/);
  assert.match(icsResponse.body, /TRIGGER:-PT24H/);
  assert.match(icsResponse.body, /TRIGGER:-PT2H/);
  const icsQuery = db.events.find(event =>
    event.type === 'get-query' && event.collection === 'schedule');
  assert.deepEqual(icsQuery.filters, [{ field: 'date', operator: '>=', value: '2026-08-08' }]);

  const emptyResponse = responseRecorder();
  await handlers.ics({ path: '/ics/' }, emptyResponse);
  assert.equal(emptyResponse.statusCode, 400);
  assert.equal(emptyResponse.contentType, 'text/plain');
  assert.equal(emptyResponse.body,
    'Usage: /ics/<member name>, e.g. /ics/B.%20Anthony');

  const publicResponse = responseRecorder();
  await handlers.publicSchedule({}, publicResponse);
  assert.equal(publicResponse.headers['Cache-Control'], 'public, max-age=60, s-maxage=60');
  assert.equal(publicResponse.headers['X-Content-Type-Options'], 'nosniff');
  assert.deepEqual(publicResponse.body, {
    version: 1,
    generatedAt: '2026-09-07T19:00:00.000Z',
    services: [{
      date: '2026-09-10',
      time: '09:00',
      worship: 'First',
      service: 'Morning',
      assignments: { Presider: 'Example Canonical' }
    }]
  });
  const publicQuery = db.events.filter(event =>
    event.type === 'get-query' && event.collection === 'schedule').at(-1);
  assert.deepEqual(publicQuery.filters, [{ field: 'date', operator: '>=', value: '2026-09-07' }]);
  assert.deepEqual(publicQuery.ordering, [{ field: 'date', direction: 'asc' }]);
  assert.equal(publicQuery.limit, 260);
});

test('scheduled Sheet sync canonicalizes names, clears blank duties, preserves absent duties, and awaits BulkWriter', async () => {
  const syncNow = Date.parse('2027-01-02T20:00:00.000Z');
  const csv = [
    'Date,Service,Worship,Time,Duty,Member',
    '"Sat, Jan 03",First Service,Main,3:00 PM,Presider,Example Variant',
    '"Sat, Jan 03",First Service,Main,3:00 PM,Usher Door,',
    '"Sat, Jan 03",First Service,Main,3:00 PM,Choir Song,New Fictional Song'
  ].join('\n');
  const db = new FakeDb({
    app: {
      settings: { sheetUrl: 'https://example.invalid/fictional-sheet.csv' },
      nameMap: { map: { 'Example Variant': 'Example Canonical' } },
      members: { list: ['Example Existing'] }
    },
    schedule: {
      '2027-01-03_first-service': {
        date: '2027-01-03',
        time: '14:00',
        service: 'First Service',
        worship: 'Old Label',
        choirSong: 'Old Fictional Song',
        assignments: {
          Presider: 'Example Old',
          'Usher Door': 'Example Old Usher',
          'Media Booth #1': 'Example Manual'
        }
      }
    }
  });
  let fetchCall;
  const { handlers } = runtime(db, {
    clock: fixedClock(syncNow),
    fetch: async (url, options) => {
      fetchCall = { url, options };
      return { ok: true, async text() { return csv; } };
    }
  });

  await handlers.scheduledSheetSync();

  assert.deepEqual(fetchCall, {
    url: 'https://example.invalid/fictional-sheet.csv',
    options: { redirect: 'follow' }
  });
  assert.deepEqual(db._get('schedule', '2027-01-03_first-service'), {
    date: '2027-01-03',
    time: '15:00',
    service: 'First Service',
    worship: 'Main',
    choirSong: 'New Fictional Song',
    assignments: {
      Presider: 'Example Canonical',
      'Usher Door': '',
      'Media Booth #1': 'Example Manual'
    }
  });
  assert.deepEqual(db._get('app', 'members'), {
    list: ['Example Canonical', 'Example Existing']
  });
  assert.ok(db.events.some(event => event.type === 'bulk-close' && event.count === 2));
});

test('scheduled Sheet sync leaves Firestore untouched when parsing yields no services', async () => {
  const db = new FakeDb({
    app: {
      settings: { sheetUrl: 'https://example.invalid/empty-sheet.csv' }
    },
    schedule: {
      'fictional-existing': { date: '2026-09-07', assignments: { Presider: 'Example Avery' } }
    }
  });
  const { handlers, logs } = runtime(db, {
    fetch: async () => ({ ok: true, async text() { return 'not a valid sheet'; } })
  });

  await handlers.scheduledSheetSync();

  assert.deepEqual(db._get('schedule', 'fictional-existing'), {
    date: '2026-09-07', assignments: { Presider: 'Example Avery' }
  });
  assert.equal(db.events.some(event => event.type === 'bulk-create'), false);
  assert.ok(logs.some(entry => entry.level === 'warn' && entry.message.includes('zero services')));
});

test('schedule rename to a canonical spelling sends no duplicate notification', async () => {
  const db = new FakeDb({
    app: { nameMap: { map: { 'Fictional Old': 'Fictional New' } } },
    tokens: {
      'fictional-old-token': { name: 'Fictional Old' },
      'fictional-new-token': { name: 'Fictional New' }
    }
  });
  const { handlers, sends } = runtime(db);

  await handlers.onScheduleWrite({ data: {
    before: snapshot(db, 'schedule', 'fictional-rename', {
      date: '2026-09-13', assignments: { Presider: 'Fictional Old' }
    }),
    after: snapshot(db, 'schedule', 'fictional-rename', {
      date: '2026-09-13', assignments: { Presider: 'Fictional New' }
    })
  } });

  assert.equal(sends.length, 0);
});

test('new assignments target canonical and legacy token registrations once', async () => {
  const db = new FakeDb({
    app: { nameMap: { map: { 'Fictional Old': 'Fictional New' } } },
    tokens: {
      'fictional-old-token': { name: 'Fictional Old' },
      'fictional-new-token': { name: 'Fictional New' },
      'fictional-other-token': { name: 'Fictional Other' }
    }
  });
  const { handlers, sends } = runtime(db);

  await handlers.onScheduleWrite({ data: {
    before: snapshot(db, 'schedule', 'fictional-new-assignment', {
      date: '2026-09-13', time: '09:00', service: 'Fictional Morning', worship: 'First',
      assignments: { Presider: 'Fictional Other' }
    }),
    after: snapshot(db, 'schedule', 'fictional-new-assignment', {
      date: '2026-09-13', time: '09:00', service: 'Fictional Morning', worship: 'First',
      assignments: { Presider: 'Fictional Old' }
    })
  } });

  assert.equal(sends.length, 1);
  assert.deepEqual(sends[0].tokens, ['fictional-old-token', 'fictional-new-token']);
  assert.equal(sends[0].data.body,
    'Presider: First Fictional Morning, Sunday, September 13 at 9:00 AM');
});

test('an old reminder marker suppresses the canonical marker and duplicate send', async () => {
  const serviceId = 'fictional-legacy-marker-service';
  const oldMarker = serviceId + '_Presider_Fictional-Old';
  const canonicalMarker = serviceId + '_Presider_Fictional-New';
  const db = new FakeDb({
    app: { nameMap: { map: { 'Fictional Old': 'Fictional New' } } },
    schedule: {
      [serviceId]: {
        date: '2026-09-08', time: '10:00', service: 'Fictional Morning', worship: 'First',
        assignments: { Presider: 'Fictional Old' }
      }
    },
    tokens: {
      'fictional-old-token': { name: 'Fictional Old' },
      'fictional-new-token': { name: 'Fictional New' }
    },
    sent: { [oldMarker]: { t: FIXED_NOW } }
  });
  const { handlers, sends } = runtime(db);

  await handlers.dutyReminders();

  assert.equal(sends.length, 0);
  assert.deepEqual(db._get('sent', oldMarker), { t: FIXED_NOW });
  assert.equal(db._get('sent', canonicalMarker), undefined);
});

test('request self-notification compares canonical and legacy spellings', async () => {
  const db = new FakeDb({
    app: {
      settings: { schedulerName: 'Fictional New' },
      nameMap: { map: { 'Fictional Old': 'Fictional New' } }
    },
    tokens: {
      'fictional-old-token': { name: 'Fictional Old' },
      'fictional-new-token': { name: 'Fictional New' }
    }
  });
  const { handlers, sends } = runtime(db);

  await handlers.onRequestCreated({
    data: snapshot(db, 'requests', 'fictional-self-request', {
      name: 'Fictional Old', duty: 'Presider', date: '2026-09-13',
      service: 'Fictional Morning', status: 'pending'
    }),
    params: { id: 'fictional-self-request' }
  });

  assert.equal(sends.length, 0);
});

test('calendar feed accepts a legacy alias', async () => {
  const db = new FakeDb({
    app: {
      nameMap: { map: { 'Fictional Legacy': 'Fictional Canonical' } }
    },
    schedule: {
      'fictional-calendar-service': {
        date: '2026-09-10', time: '09:00', service: 'Fictional Morning', worship: 'First',
        assignments: { Presider: 'Fictional Legacy' }
      }
    }
  });
  const { handlers } = runtime(db);
  const response = responseRecorder();

  await handlers.ics({ path: '/ics/Fictional%20Legacy' }, response);

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /X-WR-CALNAME:LV Zion Duties: Fictional Canonical/);
  assert.match(response.body, /SUMMARY:Presider \(First Fictional Morning\)/);
});

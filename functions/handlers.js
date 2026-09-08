'use strict';

const sheetLibDefault = require('./sheet-lib');
const icsLibDefault = require('./ics-lib');
const { publicScheduleService: publicScheduleServiceDefault } = require('./public-schedule');

const TZ = 'America/Los_Angeles';
const DAY_MS = 24 * 3600 * 1000;
const REMINDER_WINDOW_MS = DAY_MS;
const ICS_LOOKBACK_MS = 30 * DAY_MS;
const MARKER_RETENTION_MS = 7 * DAY_MS;

function createSystemClock() {
  return {
    nowMs: () => Date.now(),
    nowDate: () => new Date(),
    fromMs: value => new Date(value),
    fromValue: value => new Date(value),
    toISOString: value => value.toISOString()
  };
}

function normalizeClock(clock) {
  const system = createSystemClock();
  const source = clock || {};
  const fromMs = typeof source.fromMs === 'function' ? source.fromMs : system.fromMs;
  const fromValue = typeof source.fromValue === 'function' ? source.fromValue : system.fromValue;
  const nowMs = typeof source.nowMs === 'function' ? source.nowMs : system.nowMs;
  return {
    nowMs,
    nowDate: typeof source.nowDate === 'function' ? source.nowDate : () => fromMs(nowMs()),
    fromMs,
    fromValue,
    toISOString: typeof source.toISOString === 'function' ? source.toISOString : system.toISOString
  };
}

function dateInTimeZone(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function fmtDate(iso, clock) {
  return clock.fromValue(iso + 'T12:00:00').toLocaleDateString('en-US',
    { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ });
}

function fmtTime(time) {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  let hour = parseInt(hours, 10);
  const ap = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return hour + ':' + minutes + ' ' + ap;
}

function bodyFor(duty, service, clock) {
  return duty + ': ' + (service.worship || '') + ' ' + service.service + ', ' +
    fmtDate(service.date, clock) + ' at ' + fmtTime(service.time);
}

function laStartMs(dateIso, time, clock) {
  const [year, month, day] = dateIso.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const asUTC = Date.UTC(year, month - 1, day, hour, minute, 0);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = {};
  dtf.formatToParts(clock.fromMs(asUTC)).forEach(part => { parts[part.type] = part.value; });
  const asLA = Date.UTC(+parts.year, +parts.month - 1, +parts.day,
    +parts.hour % 24, +parts.minute, +parts.second);
  const offset = asLA - asUTC;
  return asUTC - offset;
}

function createHandlers(dependencies) {
  const deps = dependencies || {};
  const db = deps.db;
  const messaging = deps.messaging;
  const sendEachForMulticast = deps.sendEachForMulticast ||
    (messaging && typeof messaging.sendEachForMulticast === 'function'
      ? messaging.sendEachForMulticast.bind(messaging)
      : null);
  const fetchImpl = deps.fetch;
  const logger = deps.logger || { error() {}, info() {}, warn() {} };
  const clock = normalizeClock(deps.clock);
  const sheetLib = deps.sheetLib || sheetLibDefault;
  const icsLib = deps.icsLib || icsLibDefault;
  const publicScheduleService = deps.publicScheduleService || publicScheduleServiceDefault;

  if (!db || typeof db.collection !== 'function') {
    throw new TypeError('createHandlers requires a Firestore adapter');
  }
  if (typeof sendEachForMulticast !== 'function') {
    throw new TypeError('createHandlers requires a messaging adapter');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('createHandlers requires a fetch adapter');
  }

  async function loadTokenTargets() {
    const snap = await db.collection('tokens').get();
    const targets = [];
    snap.forEach(document => {
      const data = document.data();
      if (data && data.name) targets.push({ token: document.id, name: data.name });
    });
    return targets;
  }

  async function sendToTargets(targets, names, title, bodyFn) {
    const wanted = new Set(names.filter(Boolean));
    if (!wanted.size) return;
    const picked = targets.filter(target => wanted.has(target.name));
    if (!picked.length) return;

    const byBody = {};
    picked.forEach(target => {
      const body = bodyFn(target.name);
      (byBody[body] || (byBody[body] = [])).push(target.token);
    });

    const dead = [];
    for (const body of Object.keys(byBody)) {
      const tokens = byBody[body];
      const response = await sendEachForMulticast({
        tokens,
        data: { title: title, body: body }
      });
      response.responses.forEach((result, index) => {
        if (!result.success && result.error) {
          const code = result.error.code || '';
          if (code === 'messaging/registration-token-not-registered' ||
              code === 'messaging/invalid-argument' ||
              code === 'messaging/invalid-registration-token') {
            dead.push(tokens[index]);
          }
        }
      });
    }

    await Promise.all(dead.map(token =>
      db.collection('tokens').doc(token).delete().catch(() => {})));
  }

  async function sendToNames(names, title, bodyFn) {
    const wanted = new Set(names.filter(Boolean));
    if (!wanted.size) return;
    await sendToTargets(await loadTokenTargets(), names, title, bodyFn);
  }

  async function onScheduleWrite(event) {
    const after = event.data && event.data.after;
    if (!after || !after.exists) return;
    if (!(event.data.before && event.data.before.exists)) return;

    const service = after.data() || {};
    const before = event.data.before.data() || {};
    const beforeAssignments = before.assignments || {};
    const afterAssignments = service.assignments || {};
    const perName = {};
    Object.keys(afterAssignments).forEach(duty => {
      const name = afterAssignments[duty];
      if (name && name !== beforeAssignments[duty] && !(name in perName)) {
        perName[name] = duty;
      }
    });
    const names = Object.keys(perName);
    if (!names.length) return;

    await sendToNames(names, 'New duty assigned to you', name =>
      bodyFor(perName[name], service, clock));
  }

  async function dutyReminders() {
    const now = clock.nowMs();
    const yesterday = clock.fromMs(now - DAY_MS);
    const cutoff = clock.toISOString(yesterday).slice(0, 10);
    const snap = await db.collection('schedule').where('date', '>=', cutoff).get();
    const tokenTargets = await loadTokenTargets();

    for (const document of snap.docs) {
      const service = document.data() || {};
      if (!service.date) continue;
      const when = laStartMs(service.date, service.time || '12:00', clock);
      if (!(when > now && when - now < REMINDER_WINDOW_MS)) continue;
      const serviceId = document.id;
      const assignments = service.assignments || {};
      for (const duty of Object.keys(assignments)) {
        const name = assignments[duty];
        if (!name) continue;
        const markerId = serviceId + '_' + duty.replace(/[^a-zA-Z0-9]+/g, '-') + '_' +
          name.replace(/[^a-zA-Z0-9]+/g, '-');
        const marker = db.collection('sent').doc(markerId);
        const existing = await marker.get();
        if (existing.exists) continue;
        await marker.set({ t: now });
        try {
          await sendToTargets(tokenTargets, [name], 'Duty reminder', () =>
            bodyFor(duty, service, clock));
        } catch (error) {
          logger.error('dutyReminders: send failed', { error: String(error) });
        }
      }
    }

    const old = await db.collection('sent')
      .where('t', '<', now - MARKER_RETENTION_MS).get();
    await Promise.all(old.docs.map(marker => marker.ref.delete().catch(() => {})));
  }

  async function onRequestCreated(event) {
    const snapshot = event.data;
    if (!snapshot || !snapshot.exists) return;
    const request = snapshot.data() || {};
    const settingsSnapshot = await db.collection('app').doc('settings').get();
    const schedulerName = (settingsSnapshot.exists && settingsSnapshot.data().schedulerName) || '';
    if (!schedulerName) {
      logger.info('onRequestCreated: no schedulerName configured, skipping notify');
      return;
    }

    const body = request.name + ' requests a change: ' + request.duty + ': ' +
      fmtDate(request.date, clock) + ' ' + request.service +
      (request.note ? ', "' + request.note + '"' : '');
    if (request.name === schedulerName) {
      logger.info('onRequestCreated: requester is the scheduler, skipping self-notify');
      return;
    }

    await sendToNames([schedulerName], 'Schedule change requested', () => body);
  }

  async function onRequestResolved(event) {
    const before = event.data && event.data.before;
    const after = event.data && event.data.after;
    if (!before || !before.exists || !after || !after.exists) return;
    const beforeData = before.data() || {};
    const afterData = after.data() || {};
    if (!(beforeData.status === 'pending' && afterData.status !== beforeData.status)) return;

    const body = afterData.duty + ': ' + fmtDate(afterData.date, clock) + ' ' + afterData.service;
    await sendToNames([afterData.name], 'Schedule change ' + afterData.status, () => body);
  }

  async function ics(req, res) {
    const member = decodeURIComponent(req.path.replace(/^\/(ics\/)?/, ''))
      .replace(/[\r\n]/g, '').trim();
    if (!member) {
      res.status(400).type('text/plain').send('Usage: /ics/<member name>, e.g. /ics/B.%20Anthony');
      return;
    }

    const since = clock.toISOString(clock.fromMs(clock.nowMs() - ICS_LOOKBACK_MS)).slice(0, 10);
    const [scheduleSnapshot, mapSnapshot] = await Promise.all([
      db.collection('schedule').where('date', '>=', since).get(),
      db.collection('app').doc('nameMap').get()
    ]);
    const services = scheduleSnapshot.docs.map(document => document.data() || {});
    const nameMap = (mapSnapshot.exists && mapSnapshot.data().map) || {};
    const body = icsLib.buildIcsForMember(services, member, nameMap, clock.nowDate());
    res.set('Cache-Control', 'public, max-age=300');
    res.type('text/calendar; charset=utf-8').send(body);
  }

  async function publicSchedule(_req, res) {
    const now = clock.nowDate();
    const today = dateInTimeZone(now);
    const snapshot = await db.collection('schedule')
      .where('date', '>=', today)
      .orderBy('date')
      .limit(260)
      .get();
    const services = snapshot.docs
      .map(document => publicScheduleService(document.data()))
      .filter(Boolean);
    res.set('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.set('X-Content-Type-Options', 'nosniff');
    res.json({ version: 1, generatedAt: clock.toISOString(now), services });
  }

  async function scheduledSheetSync() {
    const settingsSnapshot = await db.collection('app').doc('settings').get();
    const url = (settingsSnapshot.exists && settingsSnapshot.data().sheetUrl) || sheetLib.DEFAULT_SHEET_URL;

    let text;
    try {
      const response = await fetchImpl(url, { redirect: 'follow' });
      if (!response.ok) {
        logger.error('scheduledSheetSync: sheet fetch failed', { status: response.status });
        return;
      }
      text = await response.text();
    } catch (error) {
      logger.error('scheduledSheetSync: sheet fetch threw', { error: String(error) });
      return;
    }

    const parsed = sheetLib.sheetRowsToServices(sheetLib.parseCSV(text), clock.nowDate());
    if (parsed.warnings.length) logger.warn('scheduledSheetSync: parse warnings', { warnings: parsed.warnings });
    if (!parsed.services.length) {
      logger.warn('scheduledSheetSync: sheet parsed to zero services: leaving Firestore untouched');
      return;
    }

    const nameMapSnapshot = await db.collection('app').doc('nameMap').get();
    const nameMap = (nameMapSnapshot.exists && nameMapSnapshot.data().map) || {};
    parsed.services.forEach(service => {
      const assignments = service.assignments || {};
      Object.keys(assignments).forEach(duty => {
        assignments[duty] = icsLib.canonName(assignments[duty], nameMap);
      });
    });
    parsed.members = Array.from(new Set(parsed.members.map(member =>
      icsLib.canonName(member, nameMap)))).sort();

    const existingSnapshot = await db.collection('schedule').get();
    const existingById = {};
    existingSnapshot.forEach(document => { existingById[document.id] = document.data() || {}; });
    const plan = sheetLib.planMerge(parsed.services, existingById);

    const membersSnapshot = await db.collection('app').doc('members').get();
    const members = (membersSnapshot.exists && membersSnapshot.data().list) || [];
    const newMembers = parsed.members.filter(member => member && members.indexOf(member) === -1);

    if (plan.creates.length || plan.updates.length || newMembers.length) {
      const writer = db.bulkWriter();
      plan.creates.forEach(create => writer.set(db.collection('schedule').doc(create.id), create.svc));
      plan.updates.forEach(update => writer.set(
        db.collection('schedule').doc(update.id), update.patch, { merge: true }));
      if (newMembers.length) {
        writer.set(db.collection('app').doc('members'), { list: members.concat(newMembers).sort() });
      }
      await writer.close();
    }
    logger.info('scheduledSheetSync: done', {
      added: plan.creates.length, updated: plan.updates.length, newMembers: newMembers.length
    });
  }

  return {
    onScheduleWrite,
    dutyReminders,
    onRequestCreated,
    onRequestResolved,
    ics,
    publicSchedule,
    scheduledSheetSync
  };
}

module.exports = { createHandlers, createSystemClock };

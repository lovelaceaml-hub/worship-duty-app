'use strict';

/* Phone notifications (Firebase Cloud Messaging): who hears what, and how.
   Recipients are members' names in their current spelling; each device's
   token document (tokens/{token}, written by the app) names its member.
   Pushes are data-only (the service worker shows them) and carry a time to
   live, so a phone that was off does not show a stale alert later. Who asked
   for a change or sent feedback is taken from their verified account (the
   uid on the document), never from a name typed into it. Services that have
   started send no alerts. */
const { canonicalName, dutyName } = require('./names.js');
const { DEFAULT_TIMES, longDate, clockTime, serviceStart, hasStarted } = require('./time.js');
const appDocs = require('./app-docs.js');
const permissions = require('./permissions.js');
const { readAccountForMemberUid } = require('./department-handlers.js');

const HOUR_S = 3600;
const DAY_MS = 24 * HOUR_S * 1000;
const MAX_BODY = 400; // far below the 4 KB a push may carry
const MAX_NOTE = 200;
// Only an answer about the token itself means the device is gone; any other
// error (a payload problem, a quota) leaves the token in place.
const DEAD_TOKEN_CODES = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

const clip = (text, max) => (text.length > max ? text.slice(0, max - 1) + '…' : text);
const slug = value => String(value).replace(/[^a-zA-Z0-9]+/g, '-');

/* "9:00 AM", with the label's usual time when the service has none. */
function startTime(svc) {
  const time = /^\d{2}:\d{2}$/.test(svc.time || '') ? svc.time : DEFAULT_TIMES[svc.service];
  return time ? clockTime(time) : '';
}

/* The duty line in a notification: "Presider · Sabbath Day Morning ·
   Wednesday, July 1 at 9:00 AM"; several duties in one service are joined
   ("Closing Prayer and Usher Door · ..."). */
function bodyFor(duties, svc) {
  const time = startTime(svc);
  return [].concat(duties).map(dutyName).join(' and ') + ' · ' + [svc.worship, svc.service].filter(Boolean).join(' ') + ' · ' +
    longDate(svc.date) + (time ? ' at ' + time : '');
}

/* "Usher Door · Saturday, October 3 Morning", several joined, for one alert. */
function dutyList(items) {
  const lines = items.slice().sort((a, b) => a.date.localeCompare(b.date))
    .map(item => dutyName(item.duty) + ' · ' + longDate(item.date) + ' ' + item.service);
  return lines.length > 4 ? lines.slice(0, 3).join('; ') + '; and ' + (lines.length - 3) + ' more' : lines.join('; ');
}

function alreadyExists(error) {
  return !!error && (error.code === 6 || error.code === 'already-exists' || /ALREADY_EXISTS/.test(String(error.message)));
}

function createNotifier({ db, messaging, logger, now = () => Date.now() }) {
  /* Every token document once, as [{ token, name }]. */
  async function loadTargets(nameMap) {
    const snapshot = await db.collection('tokens').get();
    const targets = [];
    snapshot.forEach(document => {
      const data = document.data() || {};
      const name = canonicalName(data.name, nameMap);
      if (name) targets.push({ token: document.id, name });
    });
    return targets;
  }

  /* Send `title` to every target whose member is in `names`, with each
     member's own body. Tokens FCM reports as gone are deleted. */
  async function send(targets, names, title, bodyOf, { ttlSeconds = 7 * 24 * HOUR_S, urgent = false } = {}) {
    const wanted = new Set(names.filter(Boolean));
    const picked = targets.filter(target => wanted.has(target.name));
    if (!picked.length) return;
    const byBody = {};
    picked.forEach(target => {
      const body = clip(String(bodyOf(target.name)), MAX_BODY);
      (byBody[body] || (byBody[body] = [])).push(target.token);
    });
    const headers = { TTL: String(Math.max(60, Math.round(ttlSeconds))) };
    if (urgent) headers.Urgency = 'high';
    const dead = [];
    for (const [body, tokens] of Object.entries(byBody)) {
      const response = await messaging.sendEachForMulticast({ tokens, data: { title, body }, webpush: { headers } });
      response.responses.forEach((result, index) => {
        if (!result.success && result.error && DEAD_TOKEN_CODES.has(result.error.code)) dead.push(tokens[index]);
      });
    }
    await Promise.all(dead.map(token => db.collection('tokens').doc(token).delete().catch(() => {})));
  }

  /* The verified member behind a uid, in their current spelling, or ''. */
  async function verifiedName(uid, nameMap) {
    if (!uid) return '';
    try {
      const account = await readAccountForMemberUid(db, String(uid));
      return canonicalName(account.data.memberName || account.data.name || account.id, nameMap);
    } catch (_error) {
      return '';
    }
  }

  /* ---- new duties ---- */

  /* The month planner's save: one alert per member listing all of their new
     duties, however many services the save touched. */
  async function alertPlanned(saved) {
    if (!appDocs.switchOn(await appDocs.loadSettings(db), 'notifications')) return;
    const at = now();
    const byName = {};
    saved.filter(item => item.memberName && !hasStarted(item, at))
      .forEach(item => { (byName[item.memberName] = byName[item.memberName] || []).push(item); });
    const names = Object.keys(byName);
    if (!names.length) return;
    const nameMap = await appDocs.loadNameMap(db);
    const targets = await loadTargets(nameMap);
    for (const name of names) {
      const items = byName[name];
      await send(targets, [canonicalName(name, nameMap)], items.length > 1 ? 'New duties for you' : 'New duty for you', () => dutyList(items));
    }
  }

  /* A service changed: each member given a duty they did not hold hears once,
     naming every new duty. Not for a brand-new service (a bulk import or a
     generated year would otherwise alert everyone at once; members still get
     the in-app badge and the day-before reminder), not for a write that
     carries a new planBatch (the planner, an import and a name fix alert in
     their own way, or not at all), and not once the service has started. */
  async function alertScheduleWrite(before, after, existed) {
    if (!existed || !after) return;
    if (after.planBatch && after.planBatch !== before.planBatch) return;
    if (hasStarted(after, now())) return;
    const nameMap = await appDocs.loadNameMap(db);
    const beforeA = before.assignments || {};
    const afterA = after.assignments || {};
    const perName = {};
    Object.keys(afterA).forEach(duty => {
      const name = canonicalName(afterA[duty], nameMap);
      if (name && name !== canonicalName(beforeA[duty], nameMap)) (perName[name] = perName[name] || []).push(duty);
    });
    const names = Object.keys(perName);
    if (!names.length) return;
    if (!appDocs.switchOn(await appDocs.loadSettings(db), 'notifications')) return;
    const ttlSeconds = Math.max(HOUR_S, (serviceStart(after) - now()) / 1000);
    const targets = await loadTargets(nameMap);
    for (const name of names) {
      await send(targets, [name], perName[name].length > 1 ? 'New duties for you' : 'New duty for you',
        () => bodyFor(perName[name], after), { ttlSeconds });
    }
  }

  /* ---- day-before reminders ---- */

  /* Every hour: each member with a duty starting in the next 24 hours hears
     once, in one push naming all of those duties. Each duty is marked sent
     before the push, with create(), so two runs at once cannot both send: a
     rare missed reminder is preferred over a double one. */
  async function sendReminders() {
    if (!appDocs.switchOn(await appDocs.loadSettings(db), 'reminders')) return { sent: 0 };
    const at = now();
    const cutoff = new Date(at - DAY_MS).toISOString().slice(0, 10);
    const snapshot = await db.collection('schedule').where('date', '>=', cutoff).get();
    const nameMap = await appDocs.loadNameMap(db);
    const due = {};
    for (const document of snapshot.docs) {
      const svc = document.data() || {};
      if (!svc.date) continue;
      const start = serviceStart(svc);
      if (!(start > at && start - at < DAY_MS)) continue;
      for (const [duty, raw] of Object.entries(svc.assignments || {})) {
        const name = canonicalName(raw, nameMap);
        if (!name) continue;
        const marker = db.collection('sent').doc(document.id + '_' + slug(duty) + '_' + slug(raw));
        try {
          await marker.create({ t: at });
        } catch (error) {
          if (alreadyExists(error)) continue;
          throw error;
        }
        (due[name] = due[name] || []).push({ duty, svc, start });
      }
    }
    const names = Object.keys(due);
    const targets = names.length ? await loadTargets(nameMap) : [];
    for (const name of names) {
      const items = due[name];
      const byService = new Map();
      items.forEach(item => byService.set(item.svc, (byService.get(item.svc) || []).concat(item.duty)));
      const body = Array.from(byService.entries()).map(([svc, duties]) => bodyFor(duties, svc)).join('; ');
      try {
        await send(targets, [name], 'Duty reminder', () => body, {
          ttlSeconds: (Math.max(...items.map(item => item.start)) - at) / 1000, urgent: true
        });
      } catch (error) {
        logger.error('dutyReminders: send failed', { error: String(error && error.message || error) });
      }
    }
    const old = await db.collection('sent').where('t', '<', at - 7 * DAY_MS).get();
    await Promise.all(old.docs.map(document => document.ref.delete().catch(() => {})));
    return { sent: names.length };
  }

  /* ---- change requests and feedback ---- */

  /* A new change request: that department's leaders and the scheduler
     (Manage, Features) hear, never the member who asked. Only a request
     from the verified member who holds the duty, in a service that has not
     started. */
  async function alertRequestCreated(id, request) {
    const [settings, config, nameMap] = await Promise.all([appDocs.loadSettings(db), appDocs.runtimePermissionConfig(db), appDocs.loadNameMap(db)]);
    const requester = await verifiedName(request.requesterUid, nameMap);
    if (!requester || canonicalName(request.name, nameMap) !== requester) {
      logger.warn('change request not from its member; no alert', { request: id });
      return;
    }
    const duty = String(request.duty || '');
    const serviceSnapshot = await db.collection('schedule').doc(String(request.svcId || '-')).get();
    const svc = serviceSnapshot.exists ? serviceSnapshot.data() || {} : null;
    if (!svc || canonicalName((svc.assignments || {})[duty], nameMap) !== requester) {
      logger.warn('change request for a duty its member does not hold; no alert', { request: id });
      return;
    }
    if (hasStarted(svc, now())) return;
    const department = permissions.departmentForDuty(duty);
    const leaders = (config.departmentLeaders || {})[department] || [];
    const recipients = Array.from(new Set([settings.schedulerName || ''].concat(leaders).map(name => canonicalName(name, nameMap))))
      .filter(name => name && name !== requester);
    if (!recipients.length) return;
    const note = String(request.note || '').replace(/\s+/g, ' ').trim();
    const body = requester + ' asks to change ' + dutyName(duty) + ' · ' + longDate(svc.date) + ' ' + svc.service +
      (note ? ' · "' + clip(note, MAX_NOTE) + '"' : '');
    await send(await loadTargets(nameMap), recipients, 'Change request', () => body);
  }

  /* A request answered: the member who asked hears. A request they
     withdrew themselves sends nothing. */
  async function alertRequestResolved(id, was, request) {
    if (!(was.status === 'pending' && request.status !== was.status) || request.status === 'withdrawn') return;
    const nameMap = await appDocs.loadNameMap(db);
    const requester = await verifiedName(request.requesterUid, nameMap);
    if (!requester) {
      logger.warn('answered request has no verified member; no alert', { request: id });
      return;
    }
    const title = request.status === 'approved' ? 'Your change request was approved'
      : request.status === 'declined' ? 'Your change request was declined' : 'Your change request was answered';
    await send(await loadTargets(nameMap), [requester], title, () => dutyName(request.duty) + ' · ' + longDate(request.date) + ' ' + request.service);
  }

  /* Feedback marked done: the member who sent it hears. */
  async function alertFeedbackDone(id, was, entry) {
    if (was.status === 'done' || entry.status !== 'done') return;
    const nameMap = await appDocs.loadNameMap(db);
    const sender = await verifiedName(entry.uid, nameMap);
    if (!sender) {
      logger.warn('feedback has no verified member; no alert', { feedback: id });
      return;
    }
    const message = String(entry.message || '').replace(/\s+/g, ' ').trim();
    await send(await loadTargets(nameMap), [sender], 'Your feedback was marked done',
      () => '"' + clip(message, 80) + '" Thank you for sending it.');
  }

  return Object.freeze({
    alertPlanned, alertScheduleWrite, sendReminders,
    alertRequestCreated, alertRequestResolved, alertFeedbackDone
  });
}

module.exports = { createNotifier, bodyFor, dutyList };

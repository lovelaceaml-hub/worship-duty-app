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
const { longDate, clockTime, startClock, serviceStart, hasStarted, DAY_MS } = require('./time.js');
const appDocs = require('./app-docs.js');
const permissions = require('./permissions.js');
const { readAccountForMemberUid } = require('./department-handlers.js');
const { alreadyExists } = require('./util.js');

const HOUR_S = 3600;
const MAX_BODY = 400; // far below the 4 KB a push may carry
const MAX_NOTE = 200;
// Only an answer about the token itself means the device is gone; any other
// error (a payload problem, a quota) leaves the token in place.
const DEAD_TOKEN_CODES = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

const clip = (text, max) => (text.length > max ? text.slice(0, max - 1) + '…' : text);
const slug = value => String(value).replace(/[^a-zA-Z0-9]+/g, '-');

/* "9:00 AM": when the service starts, read as everywhere else (startClock),
   so the text names the time the reminder is timed for. */
function startTime(svc) {
  return clockTime(startClock(svc));
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
    await Promise.all(dead.map(token => db.collection('tokens').doc(token).delete().catch(error => logger.warn('could not remove a dead device token', { error: String(error && error.message || error) }))));
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
    // By the member's current spelling, so two spellings of one name make one alert.
    const nameMap = await appDocs.loadNameMap(db);
    const byName = {};
    saved.filter(item => item.memberName && !hasStarted(item, at)).forEach(item => {
      const name = canonicalName(item.memberName, nameMap);
      if (name) (byName[name] = byName[name] || []).push(item);
    });
    const names = Object.keys(byName);
    if (!names.length) return;
    const targets = await loadTargets(nameMap);
    for (const name of names) {
      const items = byName[name];
      try {
        await send(targets, [name], items.length > 1 ? 'New duties for you' : 'New duty for you', () => dutyList(items));
      } catch (error) {
        logger.error('alertPlanned: send failed', { error: String(error && error.message || error) });
      }
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
      try {
        await send(targets, [name], perName[name].length > 1 ? 'New duties for you' : 'New duty for you',
          () => bodyFor(perName[name], after), { ttlSeconds });
      } catch (error) {
        logger.error('alertScheduleWrite: send failed', { error: String(error && error.message || error) });
      }
    }
  }

  /* ---- day-before reminders ---- */

  /* Every hour: each member with a duty starting in the next 24 hours hears
     once, in one push naming all of those duties. Each duty is marked sent
     before the push, with create(), so two runs at once cannot both send: a
     rare missed reminder is preferred over a double one. The mark names the
     member's current spelling; a mark under another spelling of that name
     (the stored one, or one the name map now maps to it) counts too, so a
     name fixed before or after the reminder does not remind them again. A
     duty that could not be marked, or was marked but nothing was sent for it
     (the devices could not be read, or the whole send failed), is left to
     the next run. */
  async function sendReminders() {
    if (!appDocs.switchOn(await appDocs.loadSettings(db), 'reminders')) return { sent: 0 };
    const at = now();
    const cutoff = new Date(at - DAY_MS).toISOString().slice(0, 10);
    const snapshot = await db.collection('schedule').where('date', '>=', cutoff).get();
    const nameMap = await appDocs.loadNameMap(db);
    // The older spellings that are now each name (name map keys).
    const olderSpellings = {};
    Object.keys(nameMap).forEach(old => {
      const name = canonicalName(old, nameMap);
      if (name) (olderSpellings[name] = olderSpellings[name] || []).push(old);
    });
    const due = {};
    for (const document of snapshot.docs) {
      const svc = document.data() || {};
      if (!svc.date) continue;
      const start = serviceStart(svc);
      if (!(start > at && start - at < DAY_MS)) continue;
      for (const [duty, raw] of Object.entries(svc.assignments || {})) {
        const name = canonicalName(raw, nameMap);
        if (!name) continue;
        const prefix = document.id + '_' + slug(duty) + '_';
        const marker = db.collection('sent').doc(prefix + slug(name));
        const others = Array.from(new Set([raw].concat(olderSpellings[name] || []).map(slug))).filter(id => id !== slug(name));
        if (others.length) {
          const earlier = await Promise.all(others.map(id => db.collection('sent').doc(prefix + id).get()));
          if (earlier.some(snapshot => snapshot.exists)) continue;
        }
        try {
          await marker.create({ t: at });
        } catch (error) {
          if (!alreadyExists(error)) logger.error('dutyReminders: could not mark a duty', { service: document.id, duty, error: String(error && error.message || error) });
          continue;
        }
        (due[name] = due[name] || []).push({ duty, svc, start, marker });
      }
    }
    const names = Object.keys(due);
    const unmark = items => Promise.all(items.map(item => item.marker.delete().catch(error => logger.warn('dutyReminders: could not unmark a duty', { error: String(error && error.message || error) }))));
    let targets = [];
    try {
      targets = names.length ? await loadTargets(nameMap) : [];
    } catch (error) {
      await unmark(names.flatMap(name => due[name]));
      throw error;
    }
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
        await unmark(items);
      }
    }
    const old = await db.collection('sent').where('t', '<', at - 7 * DAY_MS).get();
    await Promise.all(old.docs.map(document => document.ref.delete().catch(error => logger.warn('dutyReminders: could not remove an old sent record', { error: String(error && error.message || error) }))));
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

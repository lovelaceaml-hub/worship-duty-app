'use strict';

const { onDocumentWritten, onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const sheetLib = require('./sheet-lib');
const icsLib = require('./ics-lib');
const { publicScheduleService } = require('./public-schedule');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { defineSecret } = require('firebase-functions/params');
const worshipSync = require('./worship-sync');

const WORSHIP_SYNC_SECRET = defineSecret('LV_ZION_WORSHIP_SYNC_SECRET');
const WORSHIP_SYNC_PREVIOUS_SECRET = defineSecret('LV_ZION_WORSHIP_SYNC_PREVIOUS_SECRET');
const WORSHIP_SYNC_EVENT_TIMEOUT_SECONDS = 540;
const WORSHIP_SYNC_RECONCILE_TIMEOUT_SECONDS = 1800;

initializeApp();
const db = getFirestore();
const REGION = 'us-central1';
const TZ = 'America/Los_Angeles';

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

/* ---- body formatting (kept close to the app's dutyLabel) ---- */
function fmtDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US',
    { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ });
}
function fmtTime(t) {
  if (!t) return '';
  const [hs, m] = t.split(':');
  let h = parseInt(hs, 10);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + m + ' ' + ap;
}
function bodyFor(duty, svc) {
  return duty + ' — ' + (svc.worship || '') + ' ' + svc.service + ', ' +
    fmtDate(svc.date) + ' at ' + fmtTime(svc.time);
}

/* ---- shared send helpers: names -> tokens -> data-only multicast ----
   Prunes token docs FCM reports as invalid/unregistered on any send. */

/* Load every token doc once as [{ token, name }]. Callers that send in a loop
   (dutyReminders) load this a single time instead of re-scanning per recipient. */
async function loadTokenTargets() {
  const snap = await db.collection('tokens').get();
  const targets = []; // { token, name }
  snap.forEach(d => {
    const data = d.data();
    if (data && data.name) targets.push({ token: d.id, name: data.name });
  });
  return targets;
}

/* Send title/body to every already-loaded target whose name is in `names`. */
async function sendToTargets(targets, names, title, bodyFn) {
  const wanted = new Set(names.filter(Boolean));
  if (!wanted.size) return;
  const picked = targets.filter(t => wanted.has(t.name));
  if (!picked.length) return;
  // Bodies can differ per recipient, so batch tokens by identical body and
  // send one data-only multicast per distinct body.
  const byBody = {};
  picked.forEach(t => {
    const body = bodyFn(t.name);
    (byBody[body] || (byBody[body] = [])).push(t.token);
  });
  const dead = [];
  for (const body of Object.keys(byBody)) {
    const grp = byBody[body];
    const resp = await getMessaging().sendEachForMulticast({
      tokens: grp,
      data: { title: title, body: body }
    });
    resp.responses.forEach((r, i) => {
      if (!r.success && r.error) {
        const code = r.error.code || '';
        if (code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-argument' ||
            code === 'messaging/invalid-registration-token') {
          dead.push(grp[i]);
        }
      }
    });
  }
  await Promise.all(dead.map(tok =>
    db.collection('tokens').doc(tok).delete().catch(() => {})));
}

/* One-shot convenience for callers that send once (loads tokens then sends). */
async function sendToNames(names, title, bodyFn) {
  const wanted = new Set(names.filter(Boolean));
  if (!wanted.size) return;
  await sendToTargets(await loadTokenTargets(), names, title, bodyFn);
}

/* ---- 1. new-duty alerts ---- */
exports.onScheduleWrite = onDocumentWritten(
  { document: 'schedule/{id}', region: REGION },
  async (event) => {
    const after = event.data && event.data.after;
    if (!after || !after.exists) return; // deleted — nothing to alert
    // Brand-new service doc (initial seed, bulk import, or a fresh sheet-created
    // service): every assignment would read as "new", fanning a mass push out to
    // everyone at once. Skip — members still get the in-app badge and the
    // day-before reminder. Only alert on edits to an existing service.
    if (!(event.data.before && event.data.before.exists)) return;
    const svc = after.data() || {};
    const before = event.data.before.data() || {};
    const beforeA = (before && before.assignments) || {};
    const afterA = svc.assignments || {};
    // for each duty whose member CHANGED to a new non-empty name
    const perName = {}; // name -> duty (first that changed for them)
    Object.keys(afterA).forEach(duty => {
      const name = afterA[duty];
      if (name && name !== beforeA[duty] && !(name in perName)) perName[name] = duty;
    });
    const names = Object.keys(perName);
    if (!names.length) return;
    await sendToNames(names, 'New duty assigned to you',
      (name) => bodyFor(perName[name], svc));
  });

/* ---- 2. day-before reminders ---- */
exports.dutyReminders = onSchedule(
  { schedule: 'every 60 minutes', timeZone: TZ, region: REGION },
  async () => {
    const now = Date.now();
    const yesterday = new Date(now - 24 * 3600 * 1000);
    const cutoff = yesterday.toISOString().slice(0, 10); // date >= today-1
    const snap = await db.collection('schedule').where('date', '>=', cutoff).get();

    // Load every token once for the whole run instead of re-scanning the
    // collection per assigned duty (reads were services × duties × tokens).
    const tokenTargets = await loadTokenTargets();

    for (const d of snap.docs) {
      const svc = d.data() || {};
      if (!svc.date) continue;
      const when = laStartMs(svc.date, svc.time || '12:00');
      if (!(when > now && when - now < 24 * 3600 * 1000)) continue;
      const svcId = d.id;
      const assignments = svc.assignments || {};
      // group members by duty so each gets their own duty in the body
      for (const duty of Object.keys(assignments)) {
        const name = assignments[duty];
        if (!name) continue;
        const markerId = svcId + '_' + duty.replace(/[^a-zA-Z0-9]+/g, '-') + '_' +
          name.replace(/[^a-zA-Z0-9]+/g, '-');
        const marker = db.collection('sent').doc(markerId);
        const existing = await marker.get();
        if (existing.exists) continue;
        // Mark BEFORE sending: a crash between send and mark would otherwise
        // re-send next hour. We accept a rare missed reminder over a double one.
        await marker.set({ t: now });
        try {
          await sendToTargets(tokenTargets, [name], 'Duty reminder', () => bodyFor(duty, svc));
        } catch (e) {
          logger.error('dutyReminders: send failed', { markerId, error: String(e) });
        }
      }
    }
    // prune markers older than 7 days
    const old = await db.collection('sent')
      .where('t', '<', now - 7 * 24 * 3600 * 1000).get();
    await Promise.all(old.docs.map(m => m.ref.delete().catch(() => {})));
  });

/* Compute a service's start time as epoch ms, interpreting date+time as
   America/Los_Angeles wall-clock. Derives LA's UTC offset for that instant
   via Intl so DST is handled without a fixed offset. */
function laStartMs(dateIso, time) {
  const [y, mo, da] = dateIso.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const asUTC = Date.UTC(y, mo - 1, da, h, mi, 0);
  // offset (ms) between the LA wall-clock and UTC at this instant
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = {};
  dtf.formatToParts(new Date(asUTC)).forEach(p => { parts[p.type] = p.value; });
  const asLA = Date.UTC(+parts.year, +parts.month - 1, +parts.day,
    +parts.hour % 24, +parts.minute, +parts.second);
  const offset = asLA - asUTC;
  return asUTC - offset;
}

/* ---- 3. schedule-change request created: notify the scheduler ---- */
exports.onRequestCreated = onDocumentCreated(
  { document: 'requests/{id}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap || !snap.exists) return;
    const req = snap.data() || {};

    const settingsSnap = await db.collection('app').doc('settings').get();
    const schedulerName = (settingsSnap.exists && settingsSnap.data().schedulerName) || '';
    if (!schedulerName) {
      logger.info('onRequestCreated: no schedulerName configured, skipping notify');
      return;
    }

    const body = req.name + ' requests a change: ' + req.duty + ' — ' +
      fmtDate(req.date) + ' ' + req.service +
      (req.note ? ' · "' + req.note + '"' : '');

    if (req.name === schedulerName) {
      logger.info('onRequestCreated: requester is the scheduler, skipping self-notify', { id: event.params.id });
      return;
    }

    await sendToNames([schedulerName], 'Schedule change requested', () => body);
  });

/* ---- 4. schedule-change request resolved: notify the requester ---- */
exports.onRequestResolved = onDocumentUpdated(
  { document: 'requests/{id}', region: REGION },
  async (event) => {
    const before = event.data && event.data.before;
    const after = event.data && event.data.after;
    if (!before || !before.exists || !after || !after.exists) return;
    const beforeData = before.data() || {};
    const afterData = after.data() || {};
    if (!(beforeData.status === 'pending' && afterData.status !== beforeData.status)) return;

    const body = afterData.duty + ' — ' + fmtDate(afterData.date) + ' ' + afterData.service;
    await sendToNames([afterData.name], 'Schedule change ' + afterData.status, () => body);
  });

/* ---- 5. per-member .ics calendar feed ----
   Served through a hosting rewrite as /ics/<member name>. Subscribe once in
   Apple/Google Calendar and duty changes flow in automatically (calendars
   re-fetch every few hours). Note: schedule data is already world-readable
   via the open Firestore rules, so this endpoint exposes nothing new. */
exports.ics = onRequest({ region: REGION }, async (req, res) => {
  const member = decodeURIComponent(req.path.replace(/^\/(ics\/)?/, '')).replace(/[\r\n]/g, '').trim();
  if (!member) {
    res.status(400).type('text/plain').send('Usage: /ics/<member name>, e.g. /ics/B.%20Anthony');
    return;
  }
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [schedSnap, mapSnap] = await Promise.all([
    db.collection('schedule').where('date', '>=', since).get(),
    db.collection('app').doc('nameMap').get()
  ]);
  const services = schedSnap.docs.map(d => d.data() || {});
  const nameMap = (mapSnap.exists && mapSnap.data().map) || {};
  const body = icsLib.buildIcsForMember(services, member, nameMap);
  res.set('Cache-Control', 'public, max-age=300');
  res.type('text/calendar; charset=utf-8').send(body);
});

/* ---- 6. read-only public schedule projection ----
   LV Zion's temporary public release fetches this server-to-server. It cannot
   read app settings, members, requests, tokens, or any other Firestore data. */
exports.publicSchedule = onRequest({ region: REGION }, async (_req, res) => {
  const today = dateInTimeZone(new Date());
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
  res.json({ version: 1, generatedAt: new Date().toISOString(), services });
});

/* ---- 7. scheduled Sheet -> Firestore sync ----
   The Google Sheet is the source of truth (other coordinators edit it); the
   app already pulls the published CSV, but only when someone opens it. This
   runs the same parse+merge server-side every 2 hours so Firestore (and
   therefore push reminders, the song app, and the .ics feeds) stays fresh
   even if nobody opens the app. Same merge policy as the app: only duties
   the sheet mentions are touched, in-app-only edits are preserved. */
exports.scheduledSheetSync = onSchedule(
  { schedule: 'every 2 hours', timeZone: TZ, region: REGION },
  async () => {
    const settingsSnap = await db.collection('app').doc('settings').get();
    const url = (settingsSnap.exists && settingsSnap.data().sheetUrl) || sheetLib.DEFAULT_SHEET_URL;

    let text;
    try {
      const resp = await fetch(url, { redirect: 'follow' });
      if (!resp.ok) {
        logger.error('scheduledSheetSync: sheet fetch failed', { status: resp.status });
        return;
      }
      text = await resp.text();
    } catch (e) {
      logger.error('scheduledSheetSync: sheet fetch threw', { error: String(e) });
      return;
    }
    const parsed = sheetLib.sheetRowsToServices(sheetLib.parseCSV(text), new Date());
    if (parsed.warnings.length) logger.warn('scheduledSheetSync: parse warnings', { warnings: parsed.warnings });
    if (!parsed.services.length) {
      logger.warn('scheduledSheetSync: sheet parsed to zero services — leaving Firestore untouched');
      return;
    }

    // Canonicalize sheet names before merging so the sync can't re-introduce
    // variant spellings the app has already unified (which would silently
    // misdirect push and .ics feeds keyed on the canonical name). Blank ''
    // clears (see sheet-lib) pass through unchanged.
    const nameMapSnap = await db.collection('app').doc('nameMap').get();
    const nameMap = (nameMapSnap.exists && nameMapSnap.data().map) || {};
    parsed.services.forEach(svc => {
      const a = svc.assignments || {};
      Object.keys(a).forEach(duty => { a[duty] = icsLib.canonName(a[duty], nameMap); });
    });
    parsed.members = Array.from(new Set(parsed.members.map(m => icsLib.canonName(m, nameMap)))).sort();

    const existingSnap = await db.collection('schedule').get();
    const existingById = {};
    existingSnap.forEach(d => { existingById[d.id] = d.data() || {}; });

    const plan = sheetLib.planMerge(parsed.services, existingById);

    // grow the members list with any new names from the sheet
    const membersSnap = await db.collection('app').doc('members').get();
    const members = (membersSnap.exists && membersSnap.data().list) || [];
    const newMembers = parsed.members.filter(m => m && members.indexOf(m) === -1);

    // Use a BulkWriter so a large import can't blow past Firestore's 500-op
    // single-batch cap (it auto-chunks and throttles under the hood).
    if (plan.creates.length || plan.updates.length || newMembers.length) {
      const writer = db.bulkWriter();
      plan.creates.forEach(c => writer.set(db.collection('schedule').doc(c.id), c.svc));
      plan.updates.forEach(u => writer.set(db.collection('schedule').doc(u.id), u.patch, { merge: true }));
      if (newMembers.length) {
        writer.set(db.collection('app').doc('members'), { list: members.concat(newMembers).sort() });
      }
      await writer.close();
    }
    logger.info('scheduledSheetSync: done', {
      added: plan.creates.length, updated: plan.updates.length, newMembers: newMembers.length
    });
  });

/* ---- 8. opt-in Firebase to Vercel Worship bridge ----
   These exports are intentionally separate from onScheduleWrite. The sender
   reads only schedule documents, is disabled unless the explicit environment
   flag is true, and never writes a Sheet or any public schedule data. */
function worshipSyncSecret(mode) {
  let current = '';
  try {
    current = WORSHIP_SYNC_SECRET.value();
  } catch (_error) {
    current = '';
  }
  if (mode !== 'rotating') return { current };
  let previous = '';
  try {
    previous = WORSHIP_SYNC_PREVIOUS_SECRET.value();
  } catch (_error) {
    previous = '';
  }
  return { current, previous };
}

exports.onVercelScheduleWrite = onDocumentWritten(
  { document: 'schedule/{id}', region: REGION, timeoutSeconds: WORSHIP_SYNC_EVENT_TIMEOUT_SECONDS,
    secrets: [WORSHIP_SYNC_SECRET, WORSHIP_SYNC_PREVIOUS_SECRET] },
  async (event) => worshipSync.handleScheduleWrite(event, {
    db,
    logger,
    secretProvider: worshipSyncSecret,
    invocationStartedAtMs: Date.now(),
    invocationBudgetMs: WORSHIP_SYNC_EVENT_TIMEOUT_SECONDS * 1000,
  }));

exports.worshipVercelReconcile = onSchedule(
  { schedule: 'every 15 minutes', timeZone: TZ, region: REGION, timeoutSeconds: WORSHIP_SYNC_RECONCILE_TIMEOUT_SECONDS,
    secrets: [WORSHIP_SYNC_SECRET, WORSHIP_SYNC_PREVIOUS_SECRET] },
  async () => worshipSync.handleReconcile({
    db,
    logger,
    secretProvider: worshipSyncSecret,
    invocationStartedAtMs: Date.now(),
    invocationBudgetMs: WORSHIP_SYNC_RECONCILE_TIMEOUT_SECONDS * 1000,
  }));

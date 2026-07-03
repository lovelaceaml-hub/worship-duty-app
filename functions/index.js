'use strict';

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();
const REGION = 'us-central1';
const TZ = 'America/Los_Angeles';

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

/* ---- shared send helper: names -> tokens -> data-only multicast ----
   Prunes token docs FCM reports as invalid/unregistered on any send. */
async function sendToNames(names, title, bodyFn) {
  const wanted = new Set(names.filter(Boolean));
  if (!wanted.size) return;
  const snap = await db.collection('tokens').get();
  const targets = []; // { token, name }
  snap.forEach(d => {
    const data = d.data();
    if (data && wanted.has(data.name)) targets.push({ token: d.id, name: data.name });
  });
  if (!targets.length) return;
  // Bodies can differ per recipient, so batch tokens by identical body and
  // send one data-only multicast per distinct body.
  const byBody = {};
  targets.forEach(t => {
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

/* ---- 1. new-duty alerts ---- */
exports.onScheduleWrite = onDocumentWritten(
  { document: 'schedule/{id}', region: REGION },
  async (event) => {
    const after = event.data && event.data.after;
    if (!after || !after.exists) return; // deleted — nothing to alert
    const svc = after.data() || {};
    const before = event.data.before && event.data.before.exists
      ? event.data.before.data() : {};
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
        await sendToNames([name], 'Duty reminder', () => bodyFor(duty, svc));
        await marker.set({ t: now });
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

'use strict';

/* The Google Sheet, both ways.
   - The import (checked every 10 minutes, and Manage, Import now) merges
     the Sheet into the schedule: the published Raw Data link, or the Entry
     grid itself when the app writes to the Sheet. Only this month and later
     are merged; earlier months stay as the app has them. The timed check
     reads the Sheet and stops there when this month onward is as it was at
     the last import. Only the duties the Sheet lists change; anything
     added in the app stays. New names join the member list
     and their department's name list, and members hear once about all of
     their new duties.
   - With "Write changes to the Sheet" on (Manage, Features), a change made
     in the app goes into the grid. A write that fails waits in sheetQueue,
     with the cells it was for; the next import first writes those cells
     from the app's state, and leaves the service out until it has, so the
     Sheet's older cells cannot undo the app's change, while a cell changed
     in the Sheet meanwhile is not written over. Manage shows the Sheet as
     failing while anything waits.
   - A service deleted in the app is remembered (deletedServices), so the
     import and the planning year do not make it again; making it again in
     the app forgets that.
   - Check the Sheet compares the two; a planning year adds its services. */
const crypto = require('node:crypto');
const sheetLib = require('./sheet-lib.js');
const sheetSync = require('./sheet-sync.js');
const permissions = require('./permissions.js');
const { serviceYear } = require('./service-year.js');
const { canonicalName, usableMemberName } = require('./names.js');
const { pacificDate, hasStarted } = require('./time.js');
const appDocs = require('./app-docs.js');
const { refusal } = require('./refusals.js');

const DAY_MS = 24 * 3600 * 1000;
const KEEP_DELETIONS_DAYS = 400;
const message = error => String(error && error.message || error).slice(0, 300);

function createSheetIo({ db, logger, notifier, createSheets, accountEmail, now = () => Date.now() }) {
  const settingsRef = () => db.collection('app').doc('settings');
  /* Where the timed check keeps the last import's fingerprint (server only).
     The app writing into the Sheet forgets it, so the next check imports in
     full even if the Sheet is then put back as it was. */
  const importStateRef = () => db.collection('sheetImport').doc('state');
  const forgetImportState = () => importStateRef().delete().catch(() => {});
  const loadSettings = () => appDocs.loadSettings(db);
  const today = () => pacificDate(new Date(now()));

  /* The Sheet's Entry grid, when an administrator has set the Sheet's link
     (Manage, Data) and turned on "Write changes to the Sheet". Otherwise
     null, and the import keeps reading the published Raw Data link. */
  function gridSheets(settings) {
    return settings.sheetId && appDocs.switchOn(settings, 'sheetWrite', false) ? createSheets(settings.sheetId) : null;
  }

  /* The Sheet's write outcome, shown in Manage: failing while any write
     waits. Written only when it changes, so a working Sheet costs nothing. */
  async function noteSheetStatus(settings, error) {
    const was = settings.sheetStatus || {};
    if (!error) {
      if (was.ok !== false) return;
      if ((await db.collection('sheetQueue').limit(1).get()).size) return;
    } else if (was.ok === false && was.message === message(error)) return;
    await settingsRef().set({ sheetStatus: { ok: !error, message: error ? message(error) : '', at: now() } }, { merge: true });
  }

  /* The grid's fields a write changed: 'worship', 'choirSong' and the
     duties. Song lists, flags and double-duty marks are none of them, and
     cost no Sheets calls. */
  function sheetFields(before, after) {
    const fields = ['worship', 'choirSong'].filter(field => String(before[field] || '') !== String(after[field] || ''));
    const was = before.assignments || {};
    const next = after.assignments || {};
    return fields.concat(Object.keys(Object.assign({}, was, next)).filter(duty => String(was[duty] || '') !== String(next[duty] || '')));
  }

  /* What the Sheet says after the app wrote into it, kept as the service's
     sheetSeen (see sheet-lib planMerge), so the next import does not take the
     app's own write for a change made in the Sheet. `fields` are the ones
     written; null means the whole row. A service deleted meanwhile is not
     made again by this. */
  async function rememberWritten(serviceId, after, fields) {
    const assignments = after.assignments || {};
    const duties = (fields || Object.keys(Object.assign({}, after.sheetSeen || {}, assignments)))
      .filter(field => field !== 'worship' && field !== 'choirSong');
    if (!duties.length) return;
    const sheetSeen = {};
    duties.forEach(duty => { sheetSeen[duty] = String(assignments[duty] || ''); });
    const reference = db.collection('schedule').doc(serviceId);
    await db.runTransaction(async transaction => {
      if ((await transaction.get(reference)).exists) transaction.set(reference, { sheetSeen }, { merge: true });
    });
  }

  /* A change made in the app goes into the Sheet's grid. Writes that came
     from the Sheet itself (the import, a generated year) carry a new
     sheetSyncedAt and are not written back. */
  async function writeBack(serviceId, before, after, existed) {
    if (after && after.sheetSyncedAt && after.sheetSyncedAt !== (existed ? before.sheetSyncedAt : undefined)) return;
    if (after && !/^\d{4}-\d{2}-\d{2}$/.test(String(after.date || ''))) return; // no date, no row
    const changed = existed && after ? sheetFields(before, after) : null;
    if (changed && !changed.length) return;
    const settings = await loadSettings();
    const sheets = gridSheets(settings);
    if (!sheets) return;
    const queueRef = db.collection('sheetQueue').doc(serviceId);
    const queued = await queueRef.get();
    const waiting = queued.exists ? queued.data() || {} : null;
    // The cells to write: this change's, and those of a write still waiting.
    // null is the whole row: a new service, or a write queued without them.
    const fields = waiting ? (Array.isArray(waiting.fields) && changed ? Array.from(new Set(waiting.fields.concat(changed))) : null) : changed;
    try {
      const done = waiting && after
        ? await sheetSync.writeState(sheets, after, { today: today(), only: fields })
        : await sheetSync.writeService(sheets, existed ? before : null, after, { today: today() });
      if (waiting) await queueRef.delete();
      await forgetImportState();
      if (after && /written|added/.test(String(done))) await rememberWritten(serviceId, after, done === 'row added' ? null : fields);
      logger.info('Sheet write', { service: serviceId, done });
      await noteSheetStatus(settings, null);
    } catch (error) {
      logger.error('Sheet write failed', { service: serviceId, error: message(error) });
      await queueRef.set(Object.assign({ at: now(), message: message(error) },
        after ? Object.assign({ deleted: false }, fields ? { fields } : {})
          : { deleted: true, date: String(before.date || ''), service: String(before.service || '') }));
      await noteSheetStatus(settings, error);
    }
  }

  /* The writes that failed, done again from the app's current state: the
     cells each was for (all of them for an entry that does not say).
     Returns the ids still waiting. */
  async function retryWaitingWrites(sheets) {
    const waiting = new Set();
    for (const document of (await db.collection('sheetQueue').get()).docs) {
      const item = document.data() || {};
      try {
        const service = await db.collection('schedule').doc(document.id).get();
        if (service.exists) {
          const only = Array.isArray(item.fields) ? item.fields : null;
          const done = await sheetSync.writeState(sheets, service.data() || {}, { today: today(), only });
          if (/written|added/.test(String(done))) await rememberWritten(document.id, service.data() || {}, done === 'row added' ? null : only);
        }
        else if (item.date && item.service) await sheetSync.writeService(sheets, { date: item.date, service: item.service }, null, { today: today() });
        await document.ref.delete();
        await forgetImportState();
      } catch (error) {
        waiting.add(document.id);
        logger.error('Sheet write retry failed', { service: document.id, error: message(error) });
      }
    }
    return waiting;
  }

  /* A service deleted in the app is remembered, so neither the import nor a
     planning year makes it again; making it again in the app forgets it. */
  async function noteDeletion(serviceId, before, after, existed) {
    const reference = db.collection('deletedServices').doc(serviceId);
    if (existed && !after) {
      await reference.set({ deletedAt: now(), date: String(before.date || ''), service: String(before.service || '') });
    } else if (!existed && after && !after.sheetSyncedAt) {
      await reference.delete();
    }
  }

  /* `force` (Import now) imports even when the Sheet looks unchanged. */
  async function importSheet({ force = false } = {}) {
    const settings = await loadSettings();
    // Old spellings are mapped to the current ones first, so the sheet cannot
    // bring back a name the app has already cleaned up.
    const nameMap = await appDocs.loadNameMap(db);
    const canonical = name => canonicalName(name, nameMap);
    const sheets = gridSheets(settings);
    let parsed;
    let waiting = new Set();
    if (sheets) {
      waiting = await retryWaitingWrites(sheets);
      await noteSheetStatus(settings, null);
      // The grid itself: edits the app makes through the API never reach Raw Data.
      parsed = await sheetSync.readServices(sheets, nameMap);
    } else {
      const response = await fetch(settings.sheetUrl || sheetLib.DEFAULT_SHEET_URL, { redirect: 'follow' });
      if (!response.ok) throw refusal('unavailable', 'sheet-problem', 'The Google Sheet could not be read (' + response.status + ').');
      parsed = sheetLib.sheetRowsToServices(sheetLib.parseCSV(await response.text()), new Date(now()));
      parsed.services.forEach(service => {
        const assignments = service.assignments || {};
        Object.keys(assignments).forEach(duty => { assignments[duty] = canonical(assignments[duty]); });
      });
    }
    if (!parsed.services.length) throw refusal('failed-precondition', 'sheet-empty');
    // This month and later only: past services stay as the app has them.
    const fromDate = today().slice(0, 8) + '01';
    parsed.services = parsed.services.filter(service => String(service.date || '') >= fromDate);
    parsed.members = Array.from(new Set(parsed.services.flatMap(service => Object.values(service.assignments || {})).filter(Boolean))).sort();
    const fingerprint = crypto.createHash('sha256')
      .update(JSON.stringify({ fromDate, services: parsed.services, members: parsed.members, waiting: Array.from(waiting).sort() }))
      .digest('hex');
    if (!force && !waiting.size) {
      const state = await importStateRef().get();
      if (state.exists && (state.data() || {}).fingerprint === fingerprint) return { unchanged: true };
    }
    const warnings = parsed.warnings.slice();

    const [existingSnap, membersSnap, departmentsSnap, deletedSnap] = await Promise.all([
      db.collection('schedule').where('date', '>=', fromDate).get(),
      db.collection('app').doc('members').get(),
      db.collection('app').doc('departments').get(),
      db.collection('deletedServices').get()
    ]);
    const existing = {};
    existingSnap.forEach(document => { existing[document.id] = document.data() || {}; });
    const deleted = new Map(deletedSnap.docs.map(document => [document.id, document.data() || {}]));
    // A service waiting for a Sheet write keeps the app's state until then.
    const plan = sheetLib.planMerge(parsed.services.filter(service => !waiting.has(sheetLib.svcId(service))), existing, { patchTime: false, canonical });
    const notAgain = plan.creates.filter(item => deleted.has(item.id)).map(item => item.id);
    plan.creates = plan.creates.filter(item => !deleted.has(item.id));
    if (notAgain.length) {
      warnings.push(notAgain.length + ' service' + (notAgain.length === 1 ? ' was' : 's were') + ' deleted in the app and not added again: ' + notAgain.slice(0, 5).join(', ') + '.');
    }

    const sheetMembers = Array.from(new Set(parsed.members.map(canonical).filter(Boolean)));
    const unusable = sheetMembers.filter(name => !usableMemberName(name));
    if (unusable.length) warnings.push('Not added to the member list, because a name cannot contain "/": ' + unusable.slice(0, 5).join(', ') + '.');
    const membersData = membersSnap.exists ? membersSnap.data() || {} : {};
    const members = Array.isArray(membersData.list) ? membersData.list : [];
    const listed = new Set(appDocs.memberListOf(membersData).map(canonical));
    const newMembers = sheetMembers.filter(name => usableMemberName(name) && !listed.has(name));
    const rosters = Object.assign({}, departmentsSnap.exists ? (departmentsSnap.data() || {}).map : {});
    let rostersChanged = false;
    parsed.services.forEach(service => Object.entries(service.assignments || {}).forEach(([duty, name]) => {
      const department = permissions.departmentForDuty(duty);
      if (!name || !department || !usableMemberName(name)) return;
      const roster = rosters[department] || (rosters[department] = []);
      if (!roster.some(item => canonical(item) === name)) { rosters[department] = roster.concat(name).sort(); rostersChanged = true; }
    }));

    // New duties in services that have not started, for one alert per member
    // (alertPlanned). The writes carry an import mark, so no service sends
    // its own alert (see notify.js).
    const at = now();
    const alerts = [];
    plan.updates.forEach(item => {
      if (!item.patch.assignments) return;
      item.patch.planBatch = 'import-' + at;
      const before = existing[item.id] || {};
      if (hasStarted(before, at)) return;
      Object.entries(item.patch.assignments).forEach(([duty, name]) => {
        const holder = canonical(name);
        if (holder && holder !== canonical((before.assignments || {})[duty])) {
          alerts.push({ memberName: holder, duty, date: before.date, service: before.service, time: before.time });
        }
      });
    });

    let failed = 0;
    if (plan.creates.length || plan.updates.length || newMembers.length || rostersChanged) {
      // BulkWriter splits a large import into batches under Firestore's limit.
      const writer = db.bulkWriter();
      const writes = [];
      const queue = (reference, value, options) => writes.push(writer.set(reference, value, options).catch(error => {
        failed += 1;
        logger.error('importSheet: a write failed', { path: reference.path, error: message(error) });
      }));
      const sheetSyncedAt = at; // these changes came from the Sheet, so none is written back
      plan.creates.forEach(item => queue(db.collection('schedule').doc(item.id), Object.assign({}, item.svc, { sheetSyncedAt })));
      plan.updates.forEach(item => queue(db.collection('schedule').doc(item.id), Object.assign({}, item.patch, { sheetSyncedAt }), { merge: true }));
      if (newMembers.length) queue(db.collection('app').doc('members'), { list: members.concat(newMembers).sort() }, { merge: true });
      if (rostersChanged) queue(db.collection('app').doc('departments'), { map: rosters }, { merge: true });
      await writer.close();
      await Promise.all(writes);
    }
    if (alerts.length && !failed) {
      try {
        await notifier.alertPlanned(alerts);
      } catch (error) {
        logger.error('importSheet: alerts failed', { error: message(error) });
      }
    }
    // Deletions older than any date the Sheet can still hold are forgotten.
    const old = new Date(at - KEEP_DELETIONS_DAYS * DAY_MS).toISOString().slice(0, 10);
    await Promise.all(Array.from(deleted.entries()).filter(([, item]) => item.date && item.date < old)
      .map(([id]) => db.collection('deletedServices').doc(id).delete().catch(() => {})));
    const result = {
      added: plan.creates.length, updated: plan.updates.length, newMembers: newMembers.length,
      waiting: waiting.size, failed, warnings: warnings.slice(0, 20)
    };
    // A failed write leaves the fingerprint as it was, so the next check imports again.
    if (!failed) await importStateRef().set({ fingerprint, at });
    // Shown in Manage: when the app last brought in the Sheet.
    await settingsRef().set({ sheetImport: { at, added: result.added, updated: result.updated, newMembers: result.newMembers, skipped: result.warnings.length } }, { merge: true });
    logger.info('importSheet: done', result);
    return result;
  }

  /* Manage, Data, Check the Sheet: reads the Sheet's Entry grid and compares
     it with the app, changing nothing. */
  async function checkSheet() {
    const settings = await loadSettings();
    if (!settings.sheetId) throw refusal('failed-precondition', 'sheet-not-set');
    const nameMap = await appDocs.loadNameMap(db);
    let read;
    try {
      read = await sheetSync.readServices(createSheets(settings.sheetId), nameMap);
    } catch (error) {
      throw refusal('failed-precondition', 'sheet-problem', message(error));
    }
    const schedule = await db.collection('schedule').get();
    const app = new Map(schedule.docs.map(doc => [doc.id, doc.data() || {}]));
    const inSheet = new Set();
    const differences = [];
    read.services.forEach(service => {
      const id = sheetLib.svcId(service);
      inSheet.add(id);
      const mine = app.get(id);
      if (!mine) return;
      Object.entries(service.assignments).forEach(([duty, name]) => {
        const current = canonicalName((mine.assignments || {})[duty], nameMap);
        if (current !== name) differences.push({ service: id, duty, sheet: name, app: current });
      });
    });
    return {
      ok: true,
      account: await accountEmail(),
      tabs: read.tabs,
      services: read.services.length,
      notInApp: read.services.filter(service => !app.has(sheetLib.svcId(service))).length,
      notInSheet: Array.from(app.entries()).filter(([id, service]) => !inSheet.has(id) && String(service.date || '') >= today()).length,
      differences: differences.slice(0, 25),
      differenceCount: differences.length,
      warnings: read.warnings.slice(0, 10)
    };
  }

  /* A planning year of regular services (service-year.js). The services go
     into the app first, so a Sheet problem cannot hold them back; a service
     an administrator deleted is not made again. Then, when the app writes to
     the Sheet, each regular service gets a row (rows already there are left
     alone), and a failure there shows in Manage like any Sheet write.
     Administrators are then reminded to add that year's feast services. */
  async function addServiceYear(year) {
    const settings = await loadSettings();
    // New services start with each duty's default member on it (Opening Prayer).
    const defaults = {};
    Object.keys(permissions.DUTY_DEFAULTS).forEach(duty => { const name = permissions.dutyDefault(settings, duty); if (name) defaults[duty] = name; });
    const wanted = serviceYear(year).map(service => Object.assign(service, { assignments: Object.assign({}, defaults) }));
    const [existing, deletedSnap] = await Promise.all([
      db.collection('schedule').where('date', '>=', wanted[0].date).get(),
      db.collection('deletedServices').get()
    ]);
    const have = new Map(existing.docs.map(doc => [doc.id, doc.data() || {}]));
    const deleted = new Set(deletedSnap.docs.map(doc => doc.id));
    const kept = wanted.filter(service => !deleted.has(service.id));
    const missing = kept.filter(service => !have.has(service.id));
    if (missing.length) {
      const writer = db.bulkWriter();
      const sheetSyncedAt = now();
      let failed = 0;
      const writes = missing.map(({ id, ...service }) => writer.set(db.collection('schedule').doc(id), Object.assign(service, { sheetSyncedAt }))
        .catch(() => { failed += 1; }));
      await writer.close();
      await Promise.all(writes);
      if (failed) throw new Error(failed + ' of the new services could not be saved.');
    }
    await settingsRef().set({ feastNotice: { year: year + 1, since: now() } }, { merge: true });
    let sheetRows = 0;
    let sheetProblem = '';
    const sheets = gridSheets(settings);
    if (sheets) {
      try {
        sheetRows = await sheetSync.addServices(sheets, kept.map(service => have.has(service.id)
          ? Object.assign({}, have.get(service.id), { date: service.date, service: service.service })
          : service), { today: today() });
        await noteSheetStatus(settings, null);
      } catch (error) {
        sheetProblem = message(error);
        logger.error('addServiceYear: Sheet rows failed', { error: sheetProblem });
        await noteSheetStatus(settings, error);
      }
    }
    return Object.assign({ added: missing.length, sheetRows, from: wanted[0].date, to: wanted[wanted.length - 1].date },
      sheetProblem ? { sheetProblem } : {});
  }

  return Object.freeze({ writeBack, noteDeletion, importSheet, checkSheet, addServiceYear });
}

module.exports = { createSheetIo };

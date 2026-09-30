/* Direct edits to schedule/{service}: adding and deleting services, changing
   a service's date, time, worship name or choir song, and marking a double
   duty as OK. Duty assignments go through services/departments.js. */
import { fb, write, problem } from '../firebase.js';
import { data } from '../store.js';
import { renderSoon } from '../render.js';
import { notice } from '../ui/banners.js';
import { serviceId } from '../lib/services.js';
import { doubleDuties } from '../lib/conflicts.js';

/* A whole service record, as a new document. The server's bookkeeping from
   the old document (it came from the Sheet, it was saved by the planner) does
   not carry over, so the server writes the new one to the Sheet. */
function save(service) {
  const { sheetSyncedAt, planBatch, ...record } = service;
  return write(() => fb.setDoc(fb.doc(fb.db, 'schedule', serviceId(service)), record));
}

/* Change only the given fields, so the rules see exactly what changed (a
   leader may mark a double duty OK; a song editor may set the choir song). */
function patch(service, fields) {
  return write(() => fb.updateDoc(fb.doc(fb.db, 'schedule', serviceId(service)), fields));
}

export async function addService(fields) {
  const service = { date: fields.date, time: fields.time, service: fields.service, worship: fields.worship || 'Sabbath Day', choirSong: '', assignments: {} };
  if (data.services.some(item => serviceId(item) === serviceId(service))) {
    notice('There is already a ' + service.service + ' service on that date.', true);
    return null;
  }
  data.services.push(service);
  renderSoon();
  try {
    await save(service);
    return service;
  } catch (error) {
    data.services = data.services.filter(item => item !== service);
    notice('The service was not added: ' + problem(error), true);
    renderSoon();
    return null;
  }
}

/* Date and service label make up the service id, so changing either moves
   the record to a new id. */
export async function updateService(service, field, value) {
  const before = Object.assign({}, service);
  const oldId = serviceId(service);
  service[field] = value;
  const newId = serviceId(service);
  if (newId !== oldId && data.services.some(item => item !== service && serviceId(item) === newId)) {
    Object.assign(service, before);
    notice('There is already a ' + service.service + ' service on that date.', true);
    renderSoon();
    return;
  }
  renderSoon();
  try {
    if (newId === oldId) await patch(service, { [field]: value });
    else {
      await save(service);
      await write(() => fb.deleteDoc(fb.doc(fb.db, 'schedule', oldId)));
    }
  } catch (error) {
    Object.assign(service, before);
    notice('The change was not saved: ' + problem(error), true);
    renderSoon();
  }
}

export async function deleteService(service) {
  const at = data.services.indexOf(service);
  data.services = data.services.filter(item => item !== service);
  renderSoon();
  try {
    await write(() => fb.deleteDoc(fb.doc(fb.db, 'schedule', serviceId(service))));
  } catch (error) {
    if (at !== -1) data.services.splice(at, 0, service);
    notice('The service was not deleted: ' + problem(error), true);
    renderSoon();
  }
}

/* Mark a person's double duty as OK, or show the warning again (ok false).
   Only that person's mark changes: the rules let a leader change the marks of
   their own department's members and no one else's. A mark stops counting by
   itself once the person's duties change (see isMarkedOk). */
export async function markDoubleDuty(service, name, ok) {
  const before = service.conflictOk;
  const conflict = doubleDuties(service).find(item => item.name === name);
  const next = Object.assign({}, service.conflictOk);
  if (ok && conflict) next[name] = conflict.duties;
  else delete next[name];
  service.conflictOk = next;
  renderSoon();
  try {
    await patch(service, { conflictOk: next });
  } catch (error) {
    service.conflictOk = before;
    notice('That was not saved: ' + problem(error), true);
    renderSoon();
  }
}

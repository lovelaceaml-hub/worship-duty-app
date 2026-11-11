/* The month planner's changes to duties.

   Fill's proposals wait in ui.plan until the leader saves or discards them.
   They belong to the department and month Fill ran for (ui.plan.scope), and
   the planner shows them only there. Saving sends each department's changes
   to the server in one call (saveDepartmentAssignments), which checks each
   change like a single assignment, saves the ones that pass and says why it
   skipped the others; members hear once about all their new duties. What
   was not saved stays: a change the server could not be reached for stays
   proposed, and a skipped one is marked with its reason (ui.plan.skipped)
   until the leader changes that duty.

   A single duty changed in the planner goes the same way, with the name it
   held as the expected one, so another leader's change is never written
   over. An administrator's override has its own callable, with a reason. */
import { call, problem } from '../firebase.js';
import { ui, nameOf } from '../store.js';
import { renderSoon } from '../render.js';
import { notice } from '../ui/banners.js';
import { departmentOf, dutyName } from '../config/duties.js';
import { serviceId } from '../lib/services.js';
import { shortDate } from '../lib/dates.js';
import { timeKey } from '../lib/availability.js';
import { reasonText } from '../lib/reasons.js';
import { loadRoster } from './rosters.js';

export const keyOf = (id, duty) => id + '|' + duty;
const splitKey = key => { const at = key.indexOf('|'); return [key.slice(0, at), key.slice(at + 1)]; };
const sameScope = (a, b) => !!a && !!b && a.department === b.department && a.month === b.month;

/* ---- Fill's proposals ---- */

/* 'serviceId|duty' -> { memberUid, memberName } */
export function proposals() { return ui.plan.proposals || {}; }

export function proposalCount() { return Object.keys(proposals()).length; }

/* The department and month the proposals belong to, or null when none wait. */
export function waitingScope() { return proposalCount() ? ui.plan.scope : null; }

/* The proposals to show for `scope`: all of them there, none elsewhere. */
export function proposalsIn(scope) { return sameScope(waitingScope(), scope) ? proposals() : {}; }

/* Fill's result for `scope`: proposals, and the duties it left empty with why. */
export function propose(result, scope) {
  ui.plan.proposals = {};
  ui.plan.unfilled = {};
  ui.plan.skipped = {};
  ui.plan.scope = scope;
  result.proposals.forEach(item => { ui.plan.proposals[keyOf(item.serviceId, item.duty)] = { memberUid: item.memberUid, memberName: item.memberName }; });
  result.unfilled.forEach(item => { ui.plan.unfilled[keyOf(item.serviceId, item.duty)] = item.reason; });
}

/* Change one proposal: another member, or none (the duty stays empty). */
export function changeProposal(key, profile) {
  if (profile) ui.plan.proposals[key] = { memberUid: profile.memberUid, memberName: profile.memberName };
  else delete ui.plan.proposals[key];
  delete ui.plan.skipped[key];
}

export function discardProposals() {
  ui.plan.proposals = {};
  ui.plan.unfilled = {};
  ui.plan.skipped = {};
}

/* Fill's notes and the save's skips belong to the month on screen. */
export function forgetNotes() {
  ui.plan.unfilled = {};
  ui.plan.skipped = {};
}

/* ---- saving ---- */

/* changes: [{ serviceId, duty, memberUid ('' to empty it), expectedMemberName }].
   Returns { saved: [...], skipped: [{ serviceId, duty, reason }], failed: [{ departmentId, message }] };
   a department whose call failed has its changes skipped with reason 'error'. */
async function saveChanges(changes) {
  const byDepartment = {};
  changes.forEach(change => {
    const department = departmentOf(change.duty).name;
    (byDepartment[department] = byDepartment[department] || []).push(change);
  });
  const saved = [], skipped = [], failed = [];
  for (const [departmentId, list] of Object.entries(byDepartment)) {
    for (let start = 0; start < list.length; start += 200) {
      const part = list.slice(start, start + 200);
      try {
        const result = await call('saveDepartmentAssignments', { departmentId, changes: part });
        saved.push(...result.saved);
        skipped.push(...result.skipped);
      } catch (error) {
        failed.push({ departmentId, message: problem(error) });
        skipped.push(...part.map(change => ({ serviceId: change.serviceId, duty: change.duty, reason: 'error' })));
      }
    }
  }
  // A refusal about a member means the list on this device is out of date.
  const stale = new Set(skipped.filter(item => /^target-|^no-profile$/.test(item.reason)).map(item => departmentOf(item.duty).name));
  stale.forEach(department => loadRoster(department, true));
  return { saved, skipped, failed };
}

/* Save every proposal. What was saved leaves the proposals; what the
   server could not be reached for stays; what it skipped is marked with the
   reason. Returns the result, with each skip's proposed member. */
export async function saveProposals() {
  const waiting = proposals();
  const changes = Object.entries(waiting).map(([key, proposal]) => {
    const [id, duty] = splitKey(key);
    return { serviceId: id, duty, memberUid: proposal.memberUid, expectedMemberName: '' };
  });
  if (!changes.length) return null;
  ui.plan.busy = true;
  renderSoon();
  const result = await saveChanges(changes);
  ui.plan.busy = false;
  result.skipped.forEach(item => { item.memberName = (waiting[keyOf(item.serviceId, item.duty)] || {}).memberName || ''; });
  const kept = {};
  result.skipped.filter(item => item.reason === 'error').forEach(item => {
    const key = keyOf(item.serviceId, item.duty);
    kept[key] = waiting[key];
  });
  ui.plan.proposals = kept;
  ui.plan.unfilled = {};
  ui.plan.skipped = {};
  result.skipped.filter(item => item.reason !== 'error').forEach(item => {
    ui.plan.skipped[keyOf(item.serviceId, item.duty)] = { reason: item.reason, memberName: item.memberName };
  });
  renderSoon();
  return result;
}

/* Duties being saved one at a time: 'serviceId|duty' -> the name going on
   (or '' for none), so the grid and the details show the change, dimmed,
   until the server answers. */
export function savingName(service, duty) {
  const key = keyOf(serviceId(service), duty);
  return Object.prototype.hasOwnProperty.call(ui.plan.saving, key) ? ui.plan.saving[key] : null;
}

async function whileSaving(service, duty, name, run) {
  const key = keyOf(serviceId(service), duty);
  if (savingName(service, duty) !== null) return false;
  ui.plan.saving[key] = name;
  delete ui.plan.skipped[key];
  renderSoon();
  try { return await run(key); }
  finally {
    delete ui.plan.saving[key];
    renderSoon();
  }
}

const when = service => shortDate(service.date) + ' ' + service.service;

/* One duty, saved at once: `profile` takes it, or no one when null.
   Resolves to whether it was saved. */
export function saveDuty(service, duty, profile) {
  return whileSaving(service, duty, profile ? profile.memberName : '', async key => {
    const change = { serviceId: serviceId(service), duty, memberUid: profile ? profile.memberUid : '', expectedMemberName: (service.assignments || {})[duty] || '' };
    const result = await saveChanges([change]);
    const skip = result.skipped[0];
    if (result.saved.length) service.assignments = Object.assign({}, service.assignments, { [duty]: profile ? profile.memberName : '' });
    if (!skip) return true;
    if (skip.reason !== 'error') ui.plan.skipped[key] = { reason: skip.reason, memberName: profile ? profile.memberName : '' };
    notice(dutyName(duty) + ' (' + when(service) + ') was not saved: ' +
      (skip.reason === 'error' ? result.failed[0].message : reasonText(skip.reason) || 'it did not pass the checks.'), true);
    return false;
  });
}

/* An administrator puts someone on a duty they could not normally take, with
   a reason the server keeps with the change. */
export function overrideDuty(service, duty, profile, reason) {
  return whileSaving(service, duty, profile.memberName, async () => {
    try {
      await call('overrideDepartmentAssignment', {
        departmentId: departmentOf(duty).name, duty, serviceId: serviceId(service), serviceDate: service.date, serviceTime: timeKey(service),
        memberUid: profile.memberUid, memberName: profile.memberName, override: true, overrideReason: reason
      });
      service.assignments = Object.assign({}, service.assignments, { [duty]: profile.memberName });
      notice('Override recorded: ' + nameOf(profile.memberName) + ' is on ' + dutyName(duty) + '.');
      return true;
    } catch (error) {
      notice('The assignment was not saved: ' + problem(error), true);
      return false;
    }
  });
}

/* Keep the member on a duty they said they can no longer make (they will
   come after all): the flag goes, they stay on it, and their availability
   says available for that service (markedAvailable). The server refuses
   (not-holder) once someone else has the duty, even when the flag went with
   that change. */
export async function keepOnDuty(service, duty) {
  const marker = (service.needsReplacement || {})[duty] || {};
  const result = await call('resolveDutyAttention', { departmentId: departmentOf(duty).name, serviceId: serviceId(service), duty, decision: 'keep',
    expectedMemberName: marker.memberName || (service.assignments || {})[duty] || '' });
  if (result && result.markedAvailable) loadRoster(departmentOf(duty).name, true);
  return result || {};
}

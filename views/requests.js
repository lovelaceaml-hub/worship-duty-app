import {feat} from '../core/constants.js';
import {dutyCategory, esc, fmtDate, svcId, todayISO} from '../core/format.js';
import {canonicalMemberName, state, ui} from '../core/state.js';
import {authActor, authorizedDepartments, canPermission, permissionApi, permissionConfig} from '../core/auth.js';
import {activeConflicts} from '../core/conflicts.js';
import {manageServiceVisible} from './manage.js';

export function findPendingRequest(svcIdVal, duty, name) {
  return state.requests.find(r => r.svcId === svcIdVal && r.duty === duty && r.name === name && requestIsActionable(r));
}
export function requestTargetService(request) {
  if (!request) return null;
  return (state.services || []).find(service => svcId(service) === request.svcId) || null;
}
export function requestIsActionable(request) {
  if (!request || request.status !== 'pending') return false;
  const service = requestTargetService(request);
  if (!service) return true;
  return canonicalMemberName((service.assignments || {})[request.duty]) === canonicalMemberName(request.name);
}
export function effectiveRequestStatus(request) {
  return request && request.status === 'pending' && !requestIsActionable(request) ? 'completed' : request.status;
}
export function requestChangeTrigger(d, key) {
  if (!feat('changeRequests') || !ui.me) return '';
  if (findPendingRequest(svcId(d.svc), d.duty, ui.me)) return '<span class="req-pending-tag">Pending</span>';
  if (ui.reqForm && ui.reqForm.key === key) return '';
  return '<button class="linkish req-change" data-act="req-open" data-key="' + esc(key) + '">Request change</button>';
}
export function requestChangeForm(d, key) {
  if (!feat('changeRequests') || !ui.me) return '';
  if (!(ui.reqForm && ui.reqForm.key === key)) return '';
  const id = svcId(d.svc);
  return '<div class="req-form">' +
    '<textarea data-chg="req-note" data-key="' + esc(key) + '" placeholder="Why do you need a change? (optional)">' +
    esc(ui.reqForm.note || '') + '</textarea>' +
    '<div class="req-actions">' +
    '<button class="primary" data-act="req-submit" data-key="' + esc(key) + '" data-svc="' + esc(id) + '" data-duty="' + esc(d.duty) + '">Submit</button>' +
    '<button class="ghost" data-act="req-cancel">Cancel</button>' +
    '</div></div>';
}
export function statusChip(status) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return '<span class="status-chip ' + esc(status) + '">' + esc(label) + '</span>';
}
export function renderYourRequests() {
  if (!ui.me) return '';
  const mine = state.requests.filter(r => r.name === ui.me).slice().sort((a, b) => b.createdAt - a.createdAt);
  if (!mine.length) return '';
  return '<div class="card req-card"><b style="font-size:13.5px">Your requests</b>' +
    mine.slice(0, 6).map(r =>
      '<div class="req-item">' +
      '<div class="req-head"><span class="req-when">' + esc(r.duty) + ' | ' + esc(r.worship) + ' ' + esc(r.service) + ', ' + esc(fmtDate(r.date)) + '</span>' +
      statusChip(effectiveRequestStatus(r)) + '</div>' +
      (r.note ? '<div class="req-note">' + esc(r.note) + '</div>' : '') +
      '</div>').join('') +
    '</div>';
}
export function pendingRequestsCount() {
  return state.requests.filter(r => r.status === 'pending').length;
}
export function actionableDepartmentForDuty(duty) {
  const api = permissionApi();
  if (typeof api.departmentForDuty === 'function') {
    try { return api.departmentForDuty(duty, permissionConfig()) || ''; }
    catch (_error) { /* use the local category map below */ }
  }
  return dutyCategory(duty).name;
}
export function actionableDepartments(item) {
  const out = [];
  const add = value => {
    if (!value) return;
    const department = String(value).trim();
    if (department && out.indexOf(department) === -1) out.push(department);
  };
  (Array.isArray(item && item.departments) ? item.departments : []).forEach(add);
  add(item && (item.department || item.category));
  (Array.isArray(item && item.duties) ? item.duties : []).forEach(duty => add(actionableDepartmentForDuty(duty)));
  if (!out.length && item && item.duty) add(actionableDepartmentForDuty(item.duty));
  return out;
}
export function actionableCountsForViewer() {
  const result = { requests: 0, conflicts: 0, total: 0, byDepartment: {}, message: '' };
  const actor = authActor();
  const allowed = authorizedDepartments().filter(department => department !== 'All');
  if (!actor || !allowed.length) return result;
  const admin = canPermission('isAdmin', actor);
  const canSee = item => {
    const departments = actionableDepartments(item);
    if (admin) return true;
    return departments.some(department => allowed.indexOf(department) !== -1);
  };
  const add = (kind, item) => {
    const departments = actionableDepartments(item);
    if (!canSee(item)) return;
    result[kind] += 1;
    result.total += 1;
    (departments.length ? departments : ['unassigned']).forEach(department => {
      if (!result.byDepartment[department]) result.byDepartment[department] = { requests: 0, conflicts: 0 };
      result.byDepartment[department][kind] += 1;
    });
  };
  const seenRequests = {};
  (state.requests || []).forEach(request => {
    if (!requestIsActionable(request)) return;
    const id = request.id || [request.name, request.date, request.service, request.duty].join('|');
    if (seenRequests[id]) return;
    seenRequests[id] = true;
    add('requests', request);
  });
  const seenConflicts = {};
  (state.services || []).forEach(service => {
    if (!service || service.date < todayISO() || !manageServiceVisible(service)) return;
    activeConflicts(service).forEach(conflict => {
      const id = [svcId(service), conflict.name, conflict.duties.join('|')].join('|');
      if (seenConflicts[id]) return;
      seenConflicts[id] = true;
      add('conflicts', Object.assign({}, conflict, {
        serviceId: svcId(service), date: service.date, service: service.service,
        duties: conflict.duties
      }));
    });
  });
  const parts = [];
  if (result.requests) parts.push(result.requests + ' request' + (result.requests === 1 ? '' : 's'));
  if (result.conflicts) parts.push(result.conflicts + ' conflict' + (result.conflicts === 1 ? '' : 's'));
  if (parts.length) result.message = parts.join(' and ') + ' ' + (result.total === 1 ? 'needs' : 'need') + ' your attention';
  return result;
}

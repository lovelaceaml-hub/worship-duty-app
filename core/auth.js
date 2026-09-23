import {CATEGORIES} from './constants.js';
import {verifiedSession, state, ui} from './state.js';

export function isVerifiedSession() {
  return !!(verifiedSession && verifiedSession.memberName && verifiedSession.memberId);
}
export function isForcedSession() {
  return isVerifiedSession() && verifiedSession.mustChangePin === true;
}
export function authActor() {
  if (!isVerifiedSession()) return null;
  return Object.assign({}, verifiedSession, {
    name: verifiedSession.memberName,
    member: verifiedSession.memberName,
    claims: verifiedSession,
    token: verifiedSession
  });
}
export function permissionApi() {
  return window.WorshipDutyPermissions || window.WDS_PERMISSIONS || {};
}
export function permissionConfig() {
  const api = permissionApi();
  return state.permissionConfig || (state.settings && state.settings.permissionConfig) ||
    api.DEFAULT_PERMISSION_CONFIG || {};
}
export function canPermission(method, ...args) {
  const api = permissionApi();
  if (typeof api[method] !== 'function') return false;
  try { return !!api[method](...args, permissionConfig()); }
  catch (_error) { return false; }
}
export function authorizedDepartments() {
  const actor = authActor();
  if (!actor) return [];
  const api = permissionApi();
  if (canPermission('isAdmin', actor)) {
    const all = typeof api.allDepartments === 'function'
      ? api.allDepartments(permissionConfig())
      : CATEGORIES.map(category => category.name);
    return ['All'].concat(all.filter(department => department !== 'All'));
  }
  if (typeof api.departmentsForLeader !== 'function') return [];
  try { return api.departmentsForLeader(actor, permissionConfig()); }
  catch (_error) { return []; }
}
export function canManageAnyDepartment() {
  return authorizedDepartments().length > 0;
}
export function selectedManageDepartment() {
  const allowed = authorizedDepartments();
  if (allowed.indexOf(ui.manageDept) !== -1) return ui.manageDept;
  ui.manageDept = allowed[0] || '';
  return ui.manageDept;
}
export function canManageSelectedDepartment(department) {
  if (!department || department === 'All') return canPermission('isAdmin', authActor());
  return canPermission('canManageDepartment', authActor(), department);
}

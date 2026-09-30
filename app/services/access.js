/* Who may do what. The rules live in permissions.js, which the server also
   uses; this module applies them to the signed-in member and the leader
   configuration in app/leaderConfig. */
import { DEPARTMENTS } from '../config/duties.js';
import { data, session } from '../store.js';

function rules() { return window.WorshipDutyPermissions; }

function config() { return data.leaderConfig || rules().DEFAULT_PERMISSION_CONFIG; }

function actor() {
  const member = session.status === 'verified' ? session.member : null;
  if (!member) return null;
  return Object.assign({}, member, { name: member.memberName, member: member.memberName, claims: member, token: member });
}

function check(method, ...args) {
  const who = actor();
  if (!who) return false;
  try { return !!rules()[method](who, ...args, config()); }
  catch (_error) { return false; }
}

export const isAdmin = () => check('isAdmin');
export const canManageLeaders = () => check('canManageLeaders');
export const canCreateService = () => check('canCreateService');
export const canEditDuty = duty => check('canEditDuty', duty);
export const canResolveRequest = request => check('canResolveRequest', request);
export const canAcknowledgeConflict = conflict => check('canAcknowledgeConflict', conflict);
export const canResetPin = (name, department) => check('canResetPin', { name, departments: [department] });
export const canEditSongsFor = service => check('canEditSongs', service || {});

/* Departments this member can manage: every department for an
   administrator (with 'All' first), otherwise the ones they lead. */
export function managedDepartments() {
  const who = actor();
  if (!who) return [];
  if (isAdmin()) return ['All'].concat(DEPARTMENTS.map(department => department.name));
  try { return rules().departmentsForLeader(who, config()) || []; }
  catch (_error) { return []; }
}

export function canManageAnyDepartment() { return managedDepartments().length > 0; }

export function canManageDepartment(department) {
  if (!department || department === 'All') return isAdmin();
  return check('canManageDepartment', department);
}

export function departmentForDuty(duty) {
  try { return rules().departmentForDuty(duty, config()) || ''; }
  catch (_error) { return ''; }
}

/* Names of the leaders of one department, from the leader configuration. */
export function leadersOf(department) {
  const leaders = config().departmentLeaders || {};
  return Array.isArray(leaders[department]) ? leaders[department] : [];
}

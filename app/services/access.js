/* Who may do what. The rules live in permissions.js, which the server also
   uses; this module applies them to the signed-in member and the leader
   configuration in app/leaderConfig. */
import { DEPARTMENTS, SEPARATE_DEPARTMENTS, departmentOf } from '../config/duties.js';
import { data, session, ui } from '../store.js';

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

/* Whether `name` holds a role beyond member: administrator, leader manager,
   department leader or choir song editor. Only an administrator resets their
   PIN (the server refuses anyone else). */
export function isPrivileged(name) {
  try {
    const methods = rules(), settings = config();
    return !!(methods.isAdmin(name, settings) || methods.canManageLeaders(name, settings) ||
      (methods.departmentsForLeader(name, settings) || []).length || methods.canEditSongs(name, {}, settings));
  } catch (_error) {
    return false;
  }
}

/* The departments `name` serves in: the lists they are on and the
   departments of every duty they hold or held in the schedule. */
function departmentsOf(name) {
  const out = new Set();
  if (!name) return out;
  Object.entries(data.rosters || {}).forEach(([department, names]) => {
    if (Array.isArray(names) && names.includes(name)) out.add(department);
  });
  (data.services || []).forEach(service => {
    Object.entries(service.assignments || {}).forEach(([duty, holder]) => {
      const department = holder === name ? departmentOf(duty) : null;
      if (department) out.add(department.name);
    });
  });
  return out;
}

/* The one department the signed-in member may see, or '' for every
   department. A member whose only department is a separate one (Children's
   Teachers) sees only that department's duties; serving anywhere else, or
   leading, editing songs or administering, shows everything as before. */
export function onlyDepartment() {
  const name = ui.me;
  if (!name || isPrivileged(name)) return '';
  const mine = departmentsOf(name);
  if (mine.size !== 1) return '';
  const [department] = mine;
  return SEPARATE_DEPARTMENTS.includes(department) ? department : '';
}

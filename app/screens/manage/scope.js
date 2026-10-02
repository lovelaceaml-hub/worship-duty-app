/* What Manage is looking at: the department being managed ('All' for
   administrators, or one department), the services a leader of it looks
   after, and the month the planner shows. Every Manage section reads these
   from here, so the sections do not import one another.

   Fill's proposals belong to one department and month. Anything that would
   show another (the month arrows, the department picker, opening, adding or
   moving a service elsewhere) asks the leader to save or discard them first. */
import { plural } from '../../html.js';
import { data, ui } from '../../store.js';
import { notice } from '../../ui/banners.js';
import { DEPARTMENTS, departmentNamed } from '../../config/duties.js';
import { serviceId } from '../../lib/services.js';
import { todayISO, monthName } from '../../lib/dates.js';
import { managedDepartments } from '../../services/access.js';
import { legacyRoster } from '../../services/departments.js';
import { waitingScope, proposals, proposalCount, forgetNotes } from '../../services/planner.js';

/* The department being managed: the one picked, while this member may still
   manage it, else the first they may ('All' for administrators). */
export function managedDepartment() {
  const allowed = managedDepartments();
  return allowed.includes(ui.manageDepartment) ? ui.manageDepartment : (allowed[0] || '');
}

export function departmentsShown() {
  const department = managedDepartment();
  return department === 'All' ? DEPARTMENTS : DEPARTMENTS.filter(item => item.name === department);
}

/* Services a leader of `department` looks after: any with one of its duties,
   or with one of its members serving. (Manage, Checks uses this too.) */
export function shownFor(department) {
  return service => {
    if (department === 'All') return true;
    const assignments = service.assignments || {};
    const own = (departmentNamed(department) || { duties: [] }).duties;
    return Object.keys(assignments).some(duty => own.includes(duty)) ||
      Object.values(assignments).some(name => name && legacyRoster(department).includes(name));
  };
}

/* The month the planner shows, 'YYYY-MM'. */
export const planMonth = () => ui.plan.month || (ui.plan.month = todayISO().slice(0, 7));

export const serviceById = id => data.services.find(service => serviceId(service) === id);

export const currentScope = () => ({ department: managedDepartment(), month: planMonth() });

/* "Usher Sisters, July 2026" */
export const scopeName = scope => (scope.department === 'All' ? 'all departments' : scope.department) + ', ' + monthName(scope.month);

const saveFirst = () => notice('Save or discard the ' + plural(proposalCount(), 'filled duty', 'filled duties') + ' waiting in ' + scopeName(waitingScope()) + ' first.', true);

/* Whether the planner may move to `next` ({ department, month }, either one)
   now. While Fill's proposals wait somewhere else, it says where and stays. */
export function mayShow(next) {
  const target = Object.assign(currentScope(), next);
  const waiting = waitingScope();
  if (waiting && (waiting.department !== target.department || waiting.month !== target.month)) {
    saveFirst();
    return false;
  }
  if (target.month !== planMonth() || target.department !== managedDepartment()) forgetNotes();
  return true;
}

/* Whether a service may move to another day or be deleted now. Its
   proposals are kept by its id, which the date is part of, so they would be
   left behind and never saved. */
export function mayMove(service) {
  const id = serviceId(service);
  if (!Object.keys(proposals()).some(key => key.startsWith(id + '|'))) return true;
  saveFirst();
  return false;
}

/* Manage another department, when the planner may move there. */
export function setManagedDepartment(name) {
  if (!managedDepartments().includes(name) || !mayShow({ department: name })) return false;
  ui.manageDepartment = name;
  ui.departmentView = null;
  return true;
}

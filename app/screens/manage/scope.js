/* What Manage is looking at: the department being managed ('All' for
   administrators, or one department), the services a leader of it looks
   after, and the month the planner shows. Every Manage section reads these
   from here, so the sections do not import one another. */
import { data, ui } from '../../store.js';
import { DEPARTMENTS } from '../../config/duties.js';
import { serviceId } from '../../lib/services.js';
import { todayISO } from '../../lib/dates.js';
import { managedDepartments } from '../../services/access.js';
import { legacyRoster } from '../../services/departments.js';

/* The department being managed: 'All' (administrators) or one department. */
export function managedDepartment() {
  const allowed = managedDepartments();
  if (!allowed.includes(ui.manageDepartment)) ui.manageDepartment = allowed[0] || '';
  return ui.manageDepartment;
}

export function departmentsShown() {
  const department = managedDepartment();
  return department === 'All' ? DEPARTMENTS : DEPARTMENTS.filter(item => item.name === department);
}

/* Services a leader of `department` looks after: any with one of its duties,
   or with one of its members serving. (Manage, Planning uses this too.) */
export function shownFor(department) {
  return service => {
    if (department === 'All') return true;
    const assignments = service.assignments || {};
    const own = (DEPARTMENTS.find(item => item.name === department) || { duties: [] }).duties;
    return Object.keys(assignments).some(duty => own.includes(duty)) ||
      Object.values(assignments).some(name => name && legacyRoster(department).includes(name));
  };
}

/* The month the planner shows, 'YYYY-MM'. */
export const planMonth = () => ui.plan.month || (ui.plan.month = todayISO().slice(0, 7));

export const serviceById = id => data.services.find(service => serviceId(service) === id);

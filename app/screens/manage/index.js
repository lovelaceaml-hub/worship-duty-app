/* Manage: the leaders' tab. Leaders work in the departments they lead;
   administrators can also pick "All departments" and see the whole app.
   Each section is its own module; a section's opened() runs when the leader
   switches to it. Manage opens on Requests when some wait, otherwise on the
   month plan. */
import { html } from '../../html.js';
import { defineActions } from '../../actions.js';
import { ui } from '../../store.js';
import { render as redraw } from '../../render.js';
import { empty } from '../../ui/components.js';
import { managedDepartments, canManageAnyDepartment, canManageLeaders, isAdmin } from '../../services/access.js';
import { attentionCounts } from '../../services/attention.js';
import * as departments from './departments.js';
import * as services from './services.js';
import * as planning from './planning.js';
import * as requests from './requests.js';
import * as leaders from './leaders.js';
import * as features from './features.js';
import * as dataSection from './data.js';
import * as feedback from './feedback.js';
import { managedDepartment, setManagedDepartment } from './scope.js';

/* [id, label, module, count, whether the department picker applies]. The
   counts are attentionCounts(), worked out once per drawing by render. */
function sections(counts = {}) {
  const list = [
    ['services', 'Month plan', services, counts.replacements, true],
    ['requests', 'Requests', requests, counts.requests, true],
    ['planning', 'Checks', planning, counts.conflicts, true],
    ['departments', 'Departments', departments, 0, true]
  ];
  if (canManageLeaders()) list.push(['leaders', 'Leaders', leaders]);
  if (isAdmin()) list.push(['features', 'Features', features], ['data', 'Data', dataSection], ['feedback', 'Feedback', feedback]);
  return list;
}

/* The section shown: the one picked. When Manage opens without one, it is
   Requests when some wait, else the month plan, and it stays put after that
   (answering the last request does not move the leader away). */
function currentSection(list) {
  const picked = list.find(([id]) => id === ui.manage);
  if (picked) return picked;
  const first = list.find(([id, , , count]) => id === 'requests' && count) || list[0];
  ui.manage = first[0];
  return first;
}

export function render() {
  if (!canManageAnyDepartment()) return empty('Your account does not manage a department.');
  const list = sections(attentionCounts());
  const current = currentSection(list);
  const department = managedDepartment();
  const allowed = managedDepartments();
  // The picker only where it changes what shows; Departments has its own title.
  const picker = !current[4] ? ''
    : allowed.length > 1 ? html`<label class="picker"><span>Department</span>
      <select data-change="manage-department">${allowed.map(name => html`<option value="${name}"${name === department ? ' selected' : ''}>${name === 'All' ? 'All departments' : name}</option>`)}</select>
    </label>` : current[0] === 'departments' ? '' : html`<p class="picker-single">${department}</p>`;
  return html`
    ${picker}
    <nav class="sections scroll-x" aria-label="Manage sections" data-subnav>
      ${list.map(([id, label, , count]) => html`<button type="button" class="${id === current[0] ? 'is-active' : ''}" data-act="manage-section" data-section="${id}"
        ${id === current[0] ? html`aria-current="page"` : ''}>${label}${count ? html` <span class="count">${count}</span>` : ''}</button>`)}
    </nav>
    <div class="manage-section">${current[2].render()}</div>`;
}

export function mounted(view) {
  const current = sections().find(([id]) => id === ui.manage);
  if (current && current[2].mounted) current[2].mounted(view);
}

defineActions({
  'manage-section': el => {
    const section = sections().find(([id]) => id === el.dataset.section);
    if (!section) return;
    ui.manage = section[0];
    ui.departmentView = null;
    if (section[2].opened) section[2].opened();
    redraw();
  },
  'manage-department': {
    allowed: el => managedDepartments().includes(el.value),
    run: el => {
      // Fill's proposals stay with their department until saved or discarded.
      setManagedDepartment(el.value);
      redraw();
    }
  }
});

/* Manage: the leaders' tab. Leaders work in the departments they lead;
   administrators can also pick "All departments" and see the whole app.
   Each section is its own module. */
import { html } from '../../html.js';
import { defineActions } from '../../actions.js';
import { ui } from '../../store.js';
import { render as redraw } from '../../render.js';
import { empty } from '../../ui/components.js';
import { notice } from '../../ui/banners.js';
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

function sections() {
  const counts = attentionCounts();
  const list = [
    ['departments', 'Departments', departments],
    ['services', 'Services', services, counts.replacements],
    ['planning', 'Planning', planning, counts.conflicts],
    ['requests', 'Requests', requests, counts.requests]
  ];
  if (canManageLeaders()) list.push(['leaders', 'Leaders', leaders]);
  if (isAdmin()) list.push(['features', 'Features', features], ['data', 'Data', dataSection], ['feedback', 'Feedback', feedback]);
  return list;
}

/* The department being managed: 'All' (administrators) or one department. */
export function managedDepartment() {
  const allowed = managedDepartments();
  if (!allowed.includes(ui.manageDepartment)) ui.manageDepartment = allowed[0] || '';
  return ui.manageDepartment;
}

export function render() {
  if (!canManageAnyDepartment()) return empty('Your account does not manage a department.');
  const list = sections();
  if (!list.some(([id]) => id === ui.manage)) ui.manage = isAdmin() ? 'services' : 'departments';
  const current = list.find(([id]) => id === ui.manage);
  const department = managedDepartment();
  const allowed = managedDepartments();
  return html`
    ${allowed.length > 1 ? html`<label class="picker"><span>Department</span>
      <select data-change="manage-department">${allowed.map(name => html`<option value="${name}"${name === department ? ' selected' : ''}>${name === 'All' ? 'All departments' : name}</option>`)}</select>
    </label>` : html`<p class="picker-single">${department}</p>`}
    <nav class="sections scroll-x" aria-label="Manage sections" data-subnav>
      ${list.map(([id, label, , count]) => html`<button type="button" class="${id === ui.manage ? 'is-active' : ''}" data-act="manage-section" data-section="${id}"
        ${id === ui.manage ? html`aria-current="page"` : ''}>${label}${count ? html` <span class="count">${count}</span>` : ''}</button>`)}
    </nav>
    <div class="manage-section">${current[2].render()}</div>`;
}

export function mounted(view) {
  const current = sections().find(([id]) => id === ui.manage);
  if (current && current[2].mounted) current[2].mounted(view);
}

defineActions({
  'manage-section': el => { ui.manage = el.dataset.section; ui.departmentView = null; redraw(); },
  'manage-department': {
    allowed: el => managedDepartments().includes(el.value),
    run: el => {
      // Fill's proposals belong to the departments shown; keep them in view until saved.
      if (Object.keys(ui.plan.proposals).length) { notice('Save or discard the filled duties first.', true); redraw(); return; }
      ui.manageDepartment = el.value;
      ui.departmentView = null;
      ui.plan.unfilled = {};
      redraw();
    }
  }
});

/* Manage, Month plan: every service of a month, with the duties of the
   department being managed. On a wide screen it is a grid like the Sheet
   (duties down the side, services across); on a phone, the month's services
   one under another. Changing a duty saves it at once. Fill proposes a member
   for each empty duty the service usually has; the leader checks the
   proposals, then saves or discards them. A service's heading opens its
   details. The pieces: plan-cell.js (one duty), plan-grid.js (the month),
   plan-fill.js (Fill and its bar) and service-details.js. */
import { html } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, ui, feature } from '../../store.js';
import { render as redraw, renderSoon, goTo } from '../../render.js';
import { empty } from '../../ui/components.js';
import { SERVICE_LABELS, WORSHIP_TYPES, DEFAULT_TIMES } from '../../config/duties.js';
import { serviceId, byStart, isUpcoming } from '../../lib/services.js';
import { todayISO, addMonths, monthName } from '../../lib/dates.js';
import { fillDuties } from '../../lib/fill.js';
import { isAdmin, canCreateService, canEditDuty } from '../../services/access.js';
import { loadRoster, refreshRosters } from '../../services/departments.js';
import { addService } from '../../services/schedule.js';
import { saveSettings } from '../../services/data-tools.js';
import { departmentsShown, planMonth, serviceById, managedDepartment, mayShow, setManagedDepartment } from './scope.js';
import { planContext } from './plan-cell.js';
import { grid, list, legend, rosterNotes } from './plan-grid.js';
import { fillControls, fillHint, fillBar } from './plan-fill.js';
import { details } from './service-details.js';

/* Open a service's details in the planner, from anywhere in the app. While
   Fill's proposals wait in another month, the planner stays with them. */
export function openService(id) {
  const service = serviceById(id);
  ui.manage = 'services';
  if (!service || mayShow({ month: service.date.slice(0, 7) })) {
    ui.plan.open = id;
    ui.plan.scroll = true;
    if (service) ui.plan.month = service.date.slice(0, 7);
  }
  goTo('manage');
}

const wide = () => !window.matchMedia || window.matchMedia('(min-width: 900px)').matches;
if (window.matchMedia) window.matchMedia('(min-width: 900px)').addEventListener('change', () => { if (ui.tab === 'manage') renderSoon(); });

/* ---- notes above the month ---- */

function notes() {
  const settings = data.settings || {};
  const out = [];
  // While the app does not write to the Sheet, the Sheet's import wins.
  if (feature('sheetSync') && !feature('sheetWrite')) {
    out.push(html`<p class="card-note">The Google Sheet is the main copy. A duty the Sheet already fills goes back to the Sheet's name at its next import (every 2 hours), so change it in the Sheet too.</p>`);
  }
  if (settings.sheetStatus && settings.sheetStatus.ok === false) {
    out.push(html`<p class="card-note is-warning">Changes are not reaching the Google Sheet: ${settings.sheetStatus.message}${isAdmin() ? ' See Manage, Data.' : ''}</p>`);
  }
  if (isAdmin() && settings.feastNotice && settings.feastNotice.year) {
    out.push(html`<p class="card-note">The regular services for ${settings.feastNotice.year} are in. Add that year's feast services.
      <button type="button" class="link" data-act="feast-done">Done</button></p>`);
  }
  return out;
}

function addForm() {
  if (!canCreateService()) return '';
  return html`<details class="plan-add"${ui.plan.adding ? ' open' : ''}>
    <summary data-act="plan-add-toggle">Add a service</summary>
    <form class="inline-form add-service" data-act="service-add">
      <input type="date" name="date" value="${planMonth() + '-01'}" required aria-label="Date">
      <input type="time" name="time" value="${DEFAULT_TIMES.Morning}" required aria-label="Time">
      <select name="service" aria-label="Service">${SERVICE_LABELS.map(label => html`<option${label === 'Morning' ? ' selected' : ''}>${label}</option>`)}</select>
      <input type="text" name="worship" list="worship-types" value="Sabbath Day" aria-label="Worship">
      <button type="submit" class="primary">Add service</button>
    </form>
  </details>`;
}

export function render() {
  const departments = departmentsShown();
  departments.forEach(item => loadRoster(item.name));
  const current = planMonth();
  // The services still to come; a month that is over shows what happened.
  const inMonth = data.services.filter(service => service.date.startsWith(current)).sort(byStart);
  const coming = inMonth.filter(service => isUpcoming(service));
  const services = coming.length ? coming : inMonth;
  const context = planContext(services, fillDuties(data.services, todayISO()));
  const open = ui.plan.open && serviceById(ui.plan.open);
  const canFill = coming.length > 0 && departments.some(department => department.duties.some(canEditDuty));
  return html`
    ${notes()}
    <div class="plan-toolbar">
      <div class="month-nav">
        <h2 class="month-title">${monthName(current)}</h2>
        <div class="month-buttons">
          <button type="button" class="icon-button" data-act="plan-month" data-step="-1" aria-label="Previous month">‹</button>
          <button type="button" class="icon-button" data-act="plan-month" data-step="1" aria-label="Next month">›</button>
        </div>
      </div>
      ${canFill ? fillControls() : ''}
    </div>
    ${canFill ? fillHint() : ''}
    ${rosterNotes()}
    ${addForm()}
    <datalist id="worship-types">${WORSHIP_TYPES.map(type => html`<option>${type}</option>`)}</datalist>
    ${services.length ? legend() : ''}
    ${open && wide() ? html`<section class="card">${details(open, context)}</section>` : ''}
    ${services.length ? (wide() ? grid(services, context) : list(services, context))
      : empty('No services in ' + monthName(current) + '.' + (isAdmin() ? ' Add a year of services in Manage, Data, or add one above.' : ''))}
    ${fillBar()}`;
}

/* Opening the month plan reads the department lists again. */
export function opened() { refreshRosters(departmentsShown().map(department => department.name)); }

/* After Fill, the first proposal comes into view; after opening a service,
   its details do. */
export function mounted(view) {
  const proposal = ui.plan.scrollTo === 'proposal' && view.querySelector('.plan-cell.is-proposed');
  ui.plan.scrollTo = '';
  if (proposal) proposal.scrollIntoView({ block: 'center', inline: 'center' });
  if (!ui.plan.scroll) return;
  ui.plan.scroll = false;
  const target = view.querySelector('.plan-detail');
  if (target) target.scrollIntoView({ block: 'start' });
}

/* ---- actions ---- */

defineActions({
  'plan-month': el => {
    const next = addMonths(planMonth(), Number(el.dataset.step));
    if (!mayShow({ month: next })) return;
    ui.plan.month = next;
    ui.plan.open = '';
    redraw();
  },
  'plan-open': el => {
    ui.plan.open = ui.plan.open === el.dataset.service ? '' : el.dataset.service;
    ui.plan.scroll = !!ui.plan.open;
    redraw();
  },
  'plan-close': () => { ui.plan.open = ''; redraw(); },
  'plan-add-toggle': () => { ui.plan.adding = !ui.plan.adding; },
  'planning-open': el => openService(el.dataset.service),
  // From a note about an empty list: that department's roster.
  'plan-roster-open': el => {
    ui.manage = 'departments';
    if (managedDepartment() !== el.dataset.department) setManagedDepartment(el.dataset.department);
    redraw();
  },
  'feast-done': { allowed: () => isAdmin(), run: () => saveSettings({ feastNotice: null }) },
  'service-add': {
    allowed: () => canCreateService(),
    run: async form => {
      const values = new FormData(form);
      const fields = { date: values.get('date'), time: values.get('time'), service: values.get('service'), worship: String(values.get('worship') || '').trim() };
      if (!fields.date || !fields.time || !mayShow({ month: fields.date.slice(0, 7) })) return;
      const service = await addService(fields);
      if (service) {
        Object.assign(ui.plan, { month: service.date.slice(0, 7), open: serviceId(service), scroll: true, adding: false });
        redraw();
      }
    }
  }
});

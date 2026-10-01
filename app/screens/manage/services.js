/* Manage, Services: the month planner. Every service of a month, with the
   duties of the department being managed. On a wide screen it is a grid like
   the Sheet (duties down the side, services across); on a phone, the month's
   services one under another. Changing a duty saves it at once. Fill proposes
   a member for each empty duty the service usually has; the leader checks the
   proposals, then saves or discards them. A service's heading opens its
   details: date, time, choir song, "needs a replacement" flags, double
   duties, an administrator's override with a reason, and delete.
   The pieces live in plan-cell.js, plan-grid.js, plan-fill.js and
   service-details.js. */
import { html } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, ui } from '../../store.js';
import { render as redraw, renderSoon, goTo } from '../../render.js';
import { notice } from '../../ui/banners.js';
import { empty } from '../../ui/components.js';
import { SERVICE_LABELS, WORSHIP_TYPES, DEFAULT_TIMES } from '../../config/duties.js';
import { serviceId, byStart, isUpcoming } from '../../lib/services.js';
import { todayISO, addMonths, monthName } from '../../lib/dates.js';
import { fillDuties } from '../../lib/fill.js';
import { isAdmin, canCreateService, canEditDuty } from '../../services/access.js';
import { loadRoster } from '../../services/departments.js';
import { addService } from '../../services/schedule.js';
import { fb, write, problem } from '../../firebase.js';
import { departmentsShown, planMonth, serviceById } from './scope.js';
import { planned } from './plan-cell.js';
import { grid, list } from './plan-grid.js';
import { fillControls, fillBar, proposalCount } from './plan-fill.js';
import { details } from './service-details.js';

/* Open a service's details in the planner, from anywhere in the app. */
export function openService(id) {
  const service = serviceById(id);
  ui.manage = 'services';
  ui.plan.open = id;
  ui.plan.scroll = true;
  if (service) ui.plan.month = service.date.slice(0, 7);
  goTo('manage');
}

const wide = () => !window.matchMedia || window.matchMedia('(min-width: 900px)').matches;
if (window.matchMedia) window.matchMedia('(min-width: 900px)').addEventListener('change', () => { if (ui.tab === 'manage') renderSoon(); });

/* ---- notes above the month ---- */

function notes() {
  const settings = data.settings || {};
  const out = [];
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
  const counts = {};
  services.forEach(service => Object.values(planned(service)).forEach(name => { if (name) counts[name] = (counts[name] || 0) + 1; }));
  const context = { usual: fillDuties(data.services, todayISO()), counts };
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
    ${addForm()}
    <datalist id="worship-types">${WORSHIP_TYPES.map(type => html`<option>${type}</option>`)}</datalist>
    ${open && wide() ? html`<section class="card">${details(open)}</section>` : ''}
    ${services.length ? (wide() ? grid(services, context) : list(services, context))
      : empty('No services in ' + monthName(current) + '.' + (isAdmin() ? ' Add a year of services in Manage, Data, or add one above.' : ''))}
    ${fillBar()}`;
}

export function mounted(view) {
  if (!ui.plan.scroll) return;
  ui.plan.scroll = false;
  const target = view.querySelector('.plan-detail');
  if (target) target.scrollIntoView({ block: 'start' });
}

/* ---- actions ---- */

defineActions({
  'plan-month': el => {
    if (proposalCount()) { notice('Save or discard the filled duties first.', true); return; }
    ui.plan.month = addMonths(planMonth(), Number(el.dataset.step));
    ui.plan.open = '';
    ui.plan.unfilled = {};
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
  'feast-done': {
    allowed: () => isAdmin(),
    run: async () => {
      try {
        await write(() => fb.setDoc(fb.doc(fb.db, 'app', 'settings'), { feastNotice: null }, { merge: true }));
        data.settings.feastNotice = null;
      } catch (error) {
        notice('That was not saved: ' + problem(error), true);
      }
      renderSoon();
    }
  },
  'service-add': {
    allowed: () => canCreateService(),
    run: async form => {
      const values = new FormData(form);
      const fields = { date: values.get('date'), time: values.get('time'), service: values.get('service'), worship: String(values.get('worship') || '').trim() };
      if (!fields.date || !fields.time) return;
      const service = await addService(fields);
      if (service) {
        Object.assign(ui.plan, { month: service.date.slice(0, 7), open: serviceId(service), scroll: true, adding: false });
        redraw();
      }
    }
  }
});

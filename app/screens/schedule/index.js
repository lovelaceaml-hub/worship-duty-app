/* The Schedule tab: a month calendar beside the chosen day (calendar.js).
   The tools are built here: search, the
   department filter, month navigation, past services, "You serve here",
   "Edit assignments" for leaders, and the list of all services, a page at a
   time. Until a member picks a day, the Schedule follows the service under
   way (for 20 minutes after it starts, shown as "Now"), else the next one. */
import { html, plural } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, ui, feature, nameOf, readText, writeText } from '../../store.js';
import { render as redraw } from '../../render.js';
import { DEPARTMENTS, dutyName, departmentNamed } from '../../config/duties.js';
import { serviceId, byStart, startsAt, isUpcoming, isNow, departmentHasAssignments, serviceClock } from '../../lib/services.js';
import { addMonths, monthName, longDate, shortDate, todayISO } from '../../lib/dates.js';
import { canManageAnyDepartment, onlyDepartment } from '../../services/access.js';
import { openService } from '../manage/services.js';
import { serviceCard, serviceList, isCurrent } from '../../ui/components.js';
import * as calendar from './calendar.js';

const PAGE = 12; // services in the list before "Show more services"

ui.departmentFilter = (function saved() {
  const value = readText('wds-dept', 'All');
  return value === 'All' || DEPARTMENTS.some(department => department.name === value) ? value : 'All';
})();

export function render() {
  return calendar.render();
}

/* ---- what is on the schedule ---- */

/* The department the Schedule shows: the member's only department when it
   is a separate one (see onlyDepartment), else the filter they picked. */
export function shownDepartment() {
  return onlyDepartment() || ui.departmentFilter;
}

/* Search looks at what the screen shows: duty names as members know them
   ("Opening Prayer", not the stored "Sermon"), names, dates and services. */
function matches(service, query) {
  const only = onlyDepartment();
  const duties = only ? departmentNamed(only).duties : null;
  const text = [service.worship, service.service, service.date, longDate(service.date), shortDate(service.date), only ? '' : service.choirSong]
    .concat(Object.entries(service.assignments || {}).flatMap(([duty, name]) => name && (!duties || duties.includes(duty)) ? [dutyName(duty), name, nameOf(name)] : []))
    .join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(word => text.includes(word));
}

function fits(service) {
  const department = shownDepartment();
  return department === 'All' || departmentHasAssignments(service, department);
}

function pastShown() { return feature('pastServices') && ui.showPast; }

/* Services the member can see with the current department filter and
   search, oldest first: those still to come or under way, and the past ones
   too while "Show past services" is on. */
export function shownServices({ includePast = pastShown() } = {}) {
  return data.services.filter(service => Number.isFinite(startsAt(service)) && (includePast || isCurrent(service)) &&
    fits(service) && (!ui.schedule.query || matches(service, ui.schedule.query))).sort(byStart);
}

/* Of services in start order: the one under way (the later one if two
   overlap), else the next to start, else none. */
export function nowOrNext(services) {
  return services.filter(service => isNow(service)).pop() || services.find(service => isUpcoming(service)) || null;
}

/* The service a day or month opens on: under way or next, else the last. */
function openingService(services) {
  return nowOrNext(services) || services[services.length - 1] || null;
}

/* The chosen month, day and service. Without a member's choice, these
   follow the service under way or the next one to start. */
export function selection() {
  const all = shownServices();
  const pick = ui.schedule;
  let service = pick.chosen ? all.find(item => serviceId(item) === pick.service) : null;
  if (!pick.chosen) {
    service = openingService(all);
    pick.month = service ? service.date.slice(0, 7) : (pick.month || todayISO().slice(0, 7));
    pick.date = service ? service.date : '';
  }
  const month = pick.month;
  const date = service ? service.date : pick.date;
  const onDate = all.filter(item => item.date === date);
  if (!service && onDate.length) service = openingService(onDate);
  return { all, month, date, service, onDate, inMonth: all.filter(item => item.date.startsWith(month)) };
}

export function serves(service) {
  return !!ui.me && Object.values(service.assignments || {}).includes(ui.me);
}

/* ---- shared pieces ---- */

export function monthNav(month) {
  return html`<div class="month-nav">
    <h2 class="month-title">${monthName(month)}</h2>
    <div class="month-buttons">
      <button type="button" class="icon-button" data-act="schedule-month" data-step="-1" aria-label="Previous month">‹</button>
      <button type="button" class="icon-button" data-act="schedule-month" data-step="1" aria-label="Next month">›</button>
    </div>
  </div>`;
}

/* The layout's own view of a day or month, or the list of all services.
   The list has the same name in every appearance. */
export function modeToggle(dayLabel) {
  return html`<div class="segmented" role="group" aria-label="View">
    <button type="button" data-act="schedule-mode" data-mode="day" aria-pressed="${ui.schedule.mode !== 'all'}">${dayLabel}</button>
    <button type="button" data-act="schedule-mode" data-mode="all" aria-pressed="${ui.schedule.mode === 'all'}">All services</button>
  </div>`;
}

/* Back to the service under way or the next one, from any month or day. */
export function todayButton() {
  return html`<button type="button" class="ghost small" data-act="schedule-today">Next service</button>`;
}

export function searchBox() {
  return html`<label class="search">
    <span class="sr-only">Search the schedule</span>
    <input type="search" id="schedule-search" data-input="schedule-search" value="${ui.schedule.query}" placeholder="Search names, duties, services" autocomplete="off">
    <kbd aria-hidden="true">/</kbd>
  </label>`;
}

/* Past services: one switch, the same words in every layout. */
export function pastControl() {
  if (!feature('pastServices')) return '';
  return html`<button type="button" class="link schedule-past" data-act="toggle-past">${ui.showPast ? 'Hide past services' : 'Show past services'}</button>`;
}

export function timeButtons(services, selected) {
  if (services.length < 2) return '';
  return html`<div class="time-buttons" role="group" aria-label="Service time">
    ${services.map(service => html`<button type="button" data-act="schedule-service" data-service="${serviceId(service)}"
      aria-pressed="${!!selected && serviceId(selected) === serviceId(service)}">${serviceClock(service)} <span>${service.service}</span></button>`)}
  </div>`;
}

/* "You serve here: Presider, Opening Prayer" when the member has duties at it. */
function myDutiesAt(service) {
  const duties = Object.entries(service.assignments || {}).filter(([, name]) => name && name === ui.me).map(([duty]) => dutyName(duty));
  return duties.length ? html`<p class="my-duties-note">You serve here: <strong>${duties.join(', ')}</strong></p>` : '';
}

function editLink(service) {
  if (!canManageAnyDepartment()) return '';
  return html`<button type="button" class="link edit-link" data-act="schedule-edit" data-service="${serviceId(service)}">Edit assignments</button>`;
}

/* One service as the Schedule shows it: "You serve here", its team, and
   "Edit assignments" for leaders. */
export function servicePanel(service, { withDate = false } = {}) {
  return html`${myDutiesAt(service)}${serviceCard(service, { only: shownDepartment(), withDate })}${editLink(service)}`;
}

/* Why nothing shows, given the search and the department filter. `where`
   is "this month", "on this day" and so on. */
export function emptyText(where) {
  if (ui.schedule.query) return 'No services match your search.';
  const department = shownDepartment();
  return department === 'All' ? 'No services ' + where + '.' : 'No services for ' + department + ' ' + where + '.';
}

/* An empty view, with a way out when a department filter caused it. */
export function noServices(text) {
  return html`<div class="empty schedule-empty"><p>${text}</p>${ui.departmentFilter !== 'All' && !onlyDepartment()
    ? html`<button type="button" class="link" data-act="department-filter" data-department="All">Show all departments</button>` : ''}</div>`;
}

/* Every shown service from the chosen month on, or every match while
   searching, a page at a time. `skip` leaves out a service shown above. */
export function allServicesList(sel, { skip = null } = {}) {
  const query = ui.schedule.query;
  const from = query ? '' : sel.month + '-01';
  const services = sel.all.filter(service => service !== skip && service.date >= from);
  const shown = services.slice(0, ui.schedule.size || PAGE);
  const where = skip && skip.date >= from ? 'after this one' : 'in ' + monthName(sel.month) + ' or later';
  return html`<section class="month-list" aria-label="All services">
    ${query && services.length ? html`<p class="schedule-count">${plural(services.length, 'service')} ${services.length === 1 ? 'matches' : 'match'} your search.</p>` : ''}
    ${shown.length ? serviceList(shown, shownDepartment()) : noServices(emptyText(where))}
    ${services.length > shown.length ? html`<div class="center"><button type="button" class="ghost" data-act="schedule-more">Show more services</button></div>` : ''}
  </section>`;
}

/* ---- actions ---- */

function choose(changes) {
  Object.assign(ui.schedule, changes, { chosen: true, size: PAGE });
  redraw();
}

/* Search waits for a pause in typing, then redraws with the field blurred
   (a focused field pauses redraws) and puts the caret back. */
let searchTimer = 0;
/* The redraw keeps the search box focused with its caret (ui/replace.js). */
function applySearch() {
  redraw();
}

defineActions({
  'department-filter': {
    public: true,
    run: el => {
      ui.departmentFilter = el.dataset.department || el.value || 'All';
      writeText('wds-dept', ui.departmentFilter);
      ui.schedule.size = PAGE;
      redraw();
    }
  },
  'schedule-month': {
    public: true,
    run: el => choose({ month: addMonths(selection().month, Number(el.dataset.step)), date: '', service: '' })
  },
  'schedule-today': {
    public: true,
    run: () => { Object.assign(ui.schedule, { chosen: false, query: '', size: PAGE }); redraw(); }
  },
  'schedule-date': {
    public: true,
    run: el => {
      const onDate = shownServices({ includePast: true }).filter(service => service.date === el.dataset.date);
      const service = openingService(onDate);
      if (service && !isCurrent(service)) ui.showPast = true;
      choose({ month: el.dataset.date.slice(0, 7), date: el.dataset.date, service: service ? serviceId(service) : '', mode: 'day' });
    }
  },
  'schedule-service': {
    public: true,
    run: el => {
      const service = data.services.find(item => serviceId(item) === el.dataset.service);
      if (!service) return;
      if (!isCurrent(service)) ui.showPast = true;
      choose({ month: service.date.slice(0, 7), date: service.date, service: el.dataset.service, mode: 'day' });
    }
  },
  'schedule-mode': { public: true, run: el => { ui.schedule.mode = el.dataset.mode === 'all' ? 'all' : 'day'; ui.schedule.size = PAGE; redraw(); } },
  'schedule-search': {
    public: true,
    run: el => {
      ui.schedule.query = el.value;
      ui.schedule.size = PAGE;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(applySearch, 150);
    }
  },
  'schedule-more': { public: true, run: () => { ui.schedule.size = (ui.schedule.size || PAGE) + PAGE; redraw(); } },
  'toggle-past': { public: true, run: () => { ui.showPast = !ui.showPast; ui.schedule.size = PAGE; redraw(); } },
  'schedule-edit': {
    allowed: () => canManageAnyDepartment(),
    run: el => openService(el.dataset.service)
  }
});

/* "/" jumps to the search box. */
document.addEventListener('keydown', event => {
  if (event.key !== '/' || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  const input = document.getElementById('schedule-search');
  if (input) { event.preventDefault(); input.focus(); }
});

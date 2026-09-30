/* The Schedule tab. Each appearance lays it out its own way (see
   appearance/registry.js), all from the same selection and the same pieces:
     list      Original: next service, then every service by date
     calendar  Prism: a month calendar beside the chosen day
     strip     Aurora: a strip of service days above the chosen day
     rail      Navy & Cream: a date rail and a day card
   Until a member picks a day, the Schedule follows the next service to
   start (Pacific time), and moves on at each service's start minute. */
import { html, plural } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, ui, feature, nameOf, readText, writeText } from '../../store.js';
import { render as redraw } from '../../render.js';
import { DEPARTMENTS } from '../../config/duties.js';
import { upcoming, past, nextService, serviceId, byStart, isUpcoming, departmentHasAssignments, assignedCount } from '../../lib/services.js';
import { addMonths, monthName, clockTime, longDate, dayOfMonth, monthShort, weekdayShort, todayISO } from '../../lib/dates.js';
import { canManageAnyDepartment } from '../../services/access.js';
import { openService } from '../manage/services.js';
import { layoutFor, currentAppearance } from '../../appearance/picker.js';
import * as list from './list.js';
import * as calendar from './calendar.js';
import * as strip from './strip.js';
import * as rail from './rail.js';

const LAYOUTS = { list, calendar, strip, rail };

ui.departmentFilter = (function saved() {
  const value = readText('wds-dept', 'All');
  return value === 'All' || DEPARTMENTS.some(department => department.name === value) ? value : 'All';
})();

export function render() {
  const layout = LAYOUTS[layoutFor(currentAppearance())] || list;
  return layout.render();
}

/* ---- what is on the schedule ---- */

function matches(service, query) {
  const text = [service.worship, service.service, service.date, longDate(service.date), service.choirSong]
    .concat(Object.entries(service.assignments || {}).flatMap(([duty, name]) => name ? [duty, name, nameOf(name)] : []))
    .join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(word => text.includes(word));
}

/* Services the member can see with the current department filter and
   search, oldest first. Past services only when "Show past" is on. */
export function shownServices({ includePast = pastShown() } = {}) {
  const list = includePast ? upcoming(data.services).concat(past(data.services)).sort(byStart) : upcoming(data.services);
  return list.filter(service => (ui.departmentFilter === 'All' || departmentHasAssignments(service, ui.departmentFilter)) &&
    (!ui.schedule.query || matches(service, ui.schedule.query)));
}

export function pastShown() { return feature('pastServices') && ui.showPast; }
export function pastCount() { return feature('pastServices') ? past(data.services).length : 0; }

/* The chosen month, day and service. Without a member's choice, these
   follow the next service to start. */
export function selection() {
  const all = shownServices();
  const pick = ui.schedule;
  let service = pick.chosen ? all.find(item => serviceId(item) === pick.service) : null;
  if (!pick.chosen) {
    service = nextService(all);
    pick.month = service ? service.date.slice(0, 7) : (pick.month || todayISO().slice(0, 7));
    pick.date = service ? service.date : '';
  }
  const month = pick.month;
  const date = service ? service.date : pick.date;
  const onDate = all.filter(item => item.date === date);
  if (!service && onDate.length) service = nextService(onDate);
  return { all, month, date, service, onDate, inMonth: all.filter(item => item.date.startsWith(month)) };
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

export function modeToggle(dayLabel, allLabel) {
  return html`<div class="segmented" role="group" aria-label="View">
    <button type="button" data-act="schedule-mode" data-mode="day" aria-pressed="${ui.schedule.mode !== 'all'}">${dayLabel}</button>
    <button type="button" data-act="schedule-mode" data-mode="all" aria-pressed="${ui.schedule.mode === 'all'}">${allLabel}</button>
  </div>`;
}

export function searchBox() {
  return html`<label class="search">
    <span class="sr-only">Search the schedule</span>
    <input type="search" id="schedule-search" data-input="schedule-search" value="${ui.schedule.query}" placeholder="Search names, duties, services" autocomplete="off">
    <kbd aria-hidden="true">/</kbd>
  </label>`;
}

export function pastToggle() {
  if (!feature('pastServices')) return '';
  return html`<label class="check"><input type="checkbox" data-change="schedule-past"${ui.showPast ? ' checked' : ''}> Include past services</label>`;
}

export function dayButton(date, services, selected) {
  return html`<button type="button" class="day-button${date === selected ? ' is-selected' : ''}" data-act="schedule-date"
    data-date="${date}" aria-pressed="${date === selected}" aria-label="${longDate(date)}, ${plural(services.length, 'service')}">
    <span class="day-weekday">${weekdayShort(date)}</span>
    <span class="day-number">${dayOfMonth(date)}</span>
    <span class="day-dots" aria-hidden="true">${services.map(() => html`<i></i>`)}</span>
  </button>`;
}

export function datesIn(services) {
  return Array.from(new Set(services.map(service => service.date))).sort();
}

export function timeButtons(services, selected) {
  if (services.length < 2) return '';
  return html`<div class="time-buttons" role="group" aria-label="Service time">
    ${services.map(service => html`<button type="button" data-act="schedule-service" data-service="${serviceId(service)}"
      aria-pressed="${!!selected && serviceId(selected) === serviceId(service)}">${clockTime(service.time)} <span>${service.service}</span></button>`)}
  </div>`;
}

export function dayHero(service) {
  const people = new Set(Object.values(service.assignments || {}).filter(Boolean)).size;
  return html`<section class="day-hero">
    <p class="day-hero-worship">${service.worship || 'Service'}</p>
    <div class="day-hero-date"><span class="day-hero-day">${dayOfMonth(service.date)}</span><span class="day-hero-month">${monthShort(service.date)}</span></div>
    <div class="day-hero-text">
      <h2>${longDate(service.date)}</h2>
      <p>${clockTime(service.time)} · ${service.service} · Pacific time</p>
    </div>
    <p class="day-hero-count">${assignedCount(service)} duties filled · ${plural(people, 'person', 'people')}</p>
  </section>`;
}

/* "You serve here: Presider, Sermon" when the member has duties at it. */
export function myDutiesAt(service) {
  const duties = Object.entries(service.assignments || {}).filter(([, name]) => name && name === ui.me).map(([duty]) => duty);
  return duties.length ? html`<p class="my-duties-note">You serve here: <strong>${duties.join(', ')}</strong></p>` : '';
}

export function editLink(service) {
  if (!canManageAnyDepartment()) return '';
  return html`<button type="button" class="link edit-link" data-act="schedule-edit" data-service="${serviceId(service)}">Edit assignments</button>`;
}

export function noServices(text = 'No services match.') {
  return html`<p class="empty">${text}</p>`;
}

/* ---- actions ---- */

function choose(changes) {
  Object.assign(ui.schedule, changes, { chosen: true });
  redraw();
}

defineActions({
  'department-filter': {
    public: true,
    run: el => {
      ui.departmentFilter = el.dataset.department || el.value || 'All';
      writeText('wds-dept', ui.departmentFilter);
      redraw();
    }
  },
  'schedule-month': {
    public: true,
    run: el => choose({ month: addMonths(selection().month, Number(el.dataset.step)), date: '', service: '' })
  },
  'schedule-today': {
    public: true,
    run: () => { Object.assign(ui.schedule, { chosen: false, query: '' }); redraw(); }
  },
  'schedule-date': {
    public: true,
    run: el => {
      const onDate = shownServices({ includePast: true }).filter(service => service.date === el.dataset.date);
      const service = nextService(onDate);
      if (service && !isUpcoming(service)) ui.showPast = true;
      choose({ month: el.dataset.date.slice(0, 7), date: el.dataset.date, service: service ? serviceId(service) : '', mode: 'day' });
    }
  },
  'schedule-service': {
    public: true,
    run: el => {
      const service = data.services.find(item => serviceId(item) === el.dataset.service);
      if (!service) return;
      if (!isUpcoming(service)) ui.showPast = true;
      choose({ month: service.date.slice(0, 7), date: service.date, service: el.dataset.service, mode: 'day' });
    }
  },
  'schedule-mode': { public: true, run: el => { ui.schedule.mode = el.dataset.mode === 'all' ? 'all' : 'day'; redraw(); } },
  'schedule-search': {
    public: true,
    run: el => {
      // Redraw with the field blurred (a focused field pauses redraws), then
      // put the caret back where it was.
      ui.schedule.query = el.value;
      const caret = el.selectionStart;
      el.blur();
      redraw();
      const input = document.getElementById('schedule-search');
      if (input) { input.focus(); try { input.setSelectionRange(caret, caret); } catch (_error) { /* not a text field */ } }
    }
  },
  'schedule-past': { public: true, run: el => { ui.showPast = el.checked; redraw(); } },
  'toggle-past': { public: true, run: () => { ui.showPast = !ui.showPast; redraw(); } },
  'schedule-edit': {
    allowed: () => canManageAnyDepartment(),
    run: el => openService(el.dataset.service)
  }
});

/* "/" jumps to the search box where there is one. */
document.addEventListener('keydown', event => {
  if (event.key !== '/' || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  const input = document.getElementById('schedule-search');
  if (input) { event.preventDefault(); input.focus(); }
});

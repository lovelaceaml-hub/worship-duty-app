/* Manage, Services: the month planner. Every service of a month, with the
   duties of the department being managed. On a wide screen it is a grid like
   the Sheet (duties down the side, services across); on a phone, the month's
   services one under another. Changing a duty saves it at once. Fill proposes
   a member for each empty duty the service usually has; the leader checks the
   proposals, then saves or discards them. A service's heading opens its
   details: date, time, choir song, "needs a replacement" flags, double
   duties, an administrator's override with a reason, and delete. */
import { html, plural } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, ui, feature, nameOf } from '../../store.js';
import { render as redraw, renderSoon, goTo } from '../../render.js';
import { notice } from '../../ui/banners.js';
import { empty } from '../../ui/components.js';
import { DEPARTMENTS, SERVICE_LABELS, WORSHIP_TYPES, DEFAULT_TIMES, departmentOf, dutyName } from '../../config/duties.js';
import { serviceId, byStart, isUpcoming } from '../../lib/services.js';
import { clockTime, todayISO, addMonths, monthName, longDate, weekdayShort, dayOfMonth } from '../../lib/dates.js';
import { canTake } from '../../lib/availability.js';
import { openDoubleDuties, doubleDuties, isMarkedOk } from '../../lib/conflicts.js';
import { workload, suggestReplacements, usualDuties } from '../../lib/workload.js';
import { fill } from '../../lib/fill.js';
import { isAdmin, canCreateService, canEditDuty, canEditSongsFor, canAcknowledgeConflict } from '../../services/access.js';
import { roster, profileOf, profileNamed, loadRoster, assign, unassign, departments as departmentState, legacyRoster } from '../../services/departments.js';
import { addService, updateService, deleteService, markDoubleDuty } from '../../services/schedule.js';
import { replaceDuty } from '../../services/requests.js';
import { saveChanges, reasonText } from '../../services/planner.js';
import { fb, write, problem } from '../../firebase.js';
import { managedDepartment } from './index.js';

const find = id => data.services.find(service => serviceId(service) === id);
const busy = new Set();
const KEEP = '__current';

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

export function departmentsShown() {
  const department = managedDepartment();
  return department === 'All' ? DEPARTMENTS : DEPARTMENTS.filter(item => item.name === department);
}

/* Open a service's details in the planner, from anywhere in the app. */
export function openService(id) {
  const service = find(id);
  ui.manage = 'services';
  ui.plan.open = id;
  ui.plan.scroll = true;
  if (service) ui.plan.month = service.date.slice(0, 7);
  goTo('manage');
}

const month = () => ui.plan.month || (ui.plan.month = todayISO().slice(0, 7));
const wide = () => !window.matchMedia || window.matchMedia('(min-width: 900px)').matches;
if (window.matchMedia) window.matchMedia('(min-width: 900px)').addEventListener('change', () => { if (ui.tab === 'manage') renderSoon(); });

const keyOf = (id, duty) => id + '|' + duty;
const proposalCount = () => Object.keys(ui.plan.proposals).length;

/* A service's duties with the planner's proposals laid over them. */
function planned(service) {
  const id = serviceId(service);
  const out = Object.assign({}, service.assignments);
  Object.entries(ui.plan.proposals).forEach(([key, proposal]) => {
    const [serviceKey, duty] = key.split('|');
    if (serviceKey === id) out[duty] = proposal.memberName;
  });
  return out;
}

/* ---- one duty cell ---- */

function cell(service, duty, context) {
  const id = serviceId(service), key = keyOf(id, duty);
  const department = departmentOf(duty).name;
  const current = (service.assignments || {})[duty] || '';
  const proposal = ui.plan.proposals[key];
  const unusual = !context.usual(service).includes(duty);
  const classes = ['plan-cell'];
  if (proposal) classes.push('is-proposed');
  if (unusual && !current && !proposal) classes.push('is-unusual');
  const label = dutyName(duty) + ', ' + weekdayShort(service.date) + ' ' + dayOfMonth(service.date) + ' ' + service.service;
  if (!isUpcoming(service) || !canEditDuty(duty)) {
    return html`<td class="${classes.concat('is-fixed').join(' ')}"><span class="plan-name">${current ? nameOf(current) : ''}</span></td>`;
  }
  const people = roster(department);
  if (!people.length) {
    return html`<td class="${classes.join(' ')}"><span class="plan-name">${current ? nameOf(current) : (departmentState.loading[department] ? '…' : '')}</span></td>`;
  }
  const assignments = planned(service);
  const serving = new Set(Object.entries(assignments).filter(([other, name]) => other !== duty && name).map(([, name]) => name));
  const choices = people.filter(profile => !serving.has(profile.memberName) && canTake(profile, service, duty));
  // Who the cell shows: the proposal, else whoever holds the duty now. Someone
  // who holds it but could not be given it now stays shown, and flagged.
  const shown = proposal ? proposal.memberName : current;
  const chosen = shown && choices.find(profile => profile.memberName === shown);
  const flagged = !proposal && current && (!chosen ||
    (feature('conflictWarnings') && openDoubleDuties(service).some(item => item.name === current)));
  if (flagged) classes.push('is-flagged');
  if (busy.has(key)) classes.push('is-busy');
  const count = name => context.counts[name] ? ' · ' + context.counts[name] : '';
  return html`<td class="${classes.join(' ')}"${flagged ? html` title="${nameOf(current)} cannot take this duty now, or has another duty in this service"` : ''}>
    <select data-change="plan-assign" data-service="${id}" data-duty="${duty}" aria-label="${label}"${busy.has(key) || ui.plan.busy ? ' disabled' : ''}>
      <option value=""${shown ? '' : ' selected'}></option>
      ${shown && !chosen ? html`<option value="${KEEP}" selected>${nameOf(shown)}</option>` : ''}
      ${choices.map(profile => profile === chosen
        ? html`<option value="${profile.memberUid}" selected>${nameOf(profile.memberName)}</option>`
        : html`<option value="${profile.memberUid}">${nameOf(profile.memberName)}${count(profile.memberName)}</option>`)}
    </select></td>`;
}

/* ---- the month, as a grid or a list ---- */

/* What needs a look in a service, for the departments shown: duties flagged
   "needs a replacement", and double duties. Past services need nothing. */
function flagsOf(service) {
  if (!isUpcoming(service)) return 0;
  const shown = new Set(departmentsShown().flatMap(department => department.duties));
  const assignments = service.assignments || {};
  const replacements = Object.entries(service.needsReplacement || {})
    .filter(([duty, marker]) => shown.has(duty) && marker && assignments[duty] === marker.memberName).length;
  const doubles = feature('conflictWarnings') ? openDoubleDuties(service).filter(item => item.duties.some(duty => shown.has(duty))).length : 0;
  return replacements + doubles;
}

function serviceHeading(service) {
  const id = serviceId(service);
  const flags = flagsOf(service);
  return html`<button type="button" class="plan-service" data-act="plan-open" data-service="${id}" aria-expanded="${ui.plan.open === id}">
    <b>${weekdayShort(service.date)} ${dayOfMonth(service.date)}</b>
    <span>${clockTime(service.time)}</span><span>${service.service}</span>
    ${flags ? html`<span class="plan-flag">${plural(flags, 'thing', 'things')} to check</span>` : ''}
  </button>`;
}

function grid(services, context) {
  const departments = departmentsShown();
  const all = departments.length > 1;
  return html`<div class="plan-scroll scroll-x" role="region" aria-label="${monthName(month())} duties" tabindex="0">
    <table class="plan-grid">
      <thead><tr><th scope="col" class="plan-corner">Duty</th>
        ${services.map(service => html`<th scope="col" class="plan-head${isUpcoming(service) ? '' : ' is-past'}">${serviceHeading(service)}</th>`)}</tr></thead>
      <tbody>${departments.map(department => html`
        ${all ? html`<tr class="plan-group" style="--dept: ${department.color}"><th scope="rowgroup" colspan="${services.length + 1}"><span>${department.name}</span></th></tr>` : ''}
        ${department.duties.map(duty => html`<tr><th scope="row">${dutyName(duty)}</th>${services.map(service => cell(service, duty, context))}</tr>`)}`)}
      </tbody>
    </table>
  </div>`;
}

function list(services, context) {
  const departments = departmentsShown();
  return html`<div class="plan-days">${services.map(service => {
    const id = serviceId(service), open = ui.plan.open === id;
    return html`<section class="card plan-day${isUpcoming(service) ? '' : ' is-past'}">
      ${serviceHeading(service)}
      ${open ? details(service) : html`<table class="plan-lines"><tbody>${departments.map(department => html`
        ${departments.length > 1 ? html`<tr class="plan-group" style="--dept: ${department.color}"><th scope="rowgroup" colspan="2"><span>${department.name}</span></th></tr>` : ''}
        ${department.duties.map(duty => html`<tr><th scope="row">${dutyName(duty)}</th>${cell(service, duty, context)}</tr>`)}`)}
      </tbody></table>`}
    </section>`;
  })}</div>`;
}

/* ---- a service's details ---- */

function dutySelect(service, duty) {
  const department = departmentOf(duty).name;
  const people = roster(department);
  const current = (service.assignments || {})[duty] || '';
  const currentProfile = profileNamed(department, current);
  const choices = people.filter(profile => canTake(profile, service, duty));
  const flagged = feature('conflictWarnings') && current && openDoubleDuties(service).some(item => item.name === current);
  const busyNow = departmentState.busy[serviceId(service) + '::' + duty];
  let options;
  if (!people.length) options = html`<option value="" selected disabled>${departmentState.loading[department] ? 'Loading…' : 'Roster not loaded'}</option>`;
  else {
    options = html`<option value="">Not filled</option>
      ${current && !choices.some(profile => profile.memberName === current) ? html`<option value="" selected disabled>${nameOf(current)} (cannot take this now)</option>` : ''}
      ${choices.map(profile => html`<option value="${profile.memberUid}"${currentProfile && currentProfile.memberUid === profile.memberUid ? ' selected' : ''}>${nameOf(profile.memberName)}</option>`)}`;
  }
  const others = people.filter(profile => !choices.includes(profile));
  return html`<select data-change="assign" data-service="${serviceId(service)}" data-duty="${duty}" aria-label="${dutyName(duty)}"
      class="${flagged ? 'is-flagged' : ''}"${busyNow || !canEditDuty(duty) ? ' disabled' : ''}>${options}</select>
    ${isAdmin() && others.length ? html`<details class="override">
      <summary>Assign someone else</summary>
      <p class="hint">For someone who normally could not take this duty now. Give a reason; it is kept with the change.</p>
      <form class="inline-form" data-act="assign-override" data-service="${serviceId(service)}" data-duty="${duty}">
        <select name="uid" aria-label="Member">${people.map(profile => html`<option value="${profile.memberUid}">${nameOf(profile.memberName)}</option>`)}</select>
        <input type="text" name="reason" maxlength="240" placeholder="Reason" aria-label="Reason" required>
        <button type="submit" class="ghost small">Assign</button>
      </form>
    </details>` : ''}`;
}

function replacementPanel(service) {
  const flags = Object.entries(service.needsReplacement || {})
    .filter(([duty, marker]) => (service.assignments || {})[duty] === (marker && marker.memberName) && canEditDuty(duty));
  if (!flags.length) return '';
  const stats = workload(data.services, data.members, todayISO());
  return html`<div class="replacements">${flags.map(([duty, marker]) => {
    const department = departmentOf(duty).name;
    const suggestions = suggestReplacements(service, duty, roster(department), stats, { exclude: marker.memberName, limit: 5 });
    return html`<form class="card-note is-warning" data-act="replace-duty" data-service="${serviceId(service)}" data-duty="${duty}">
      <p><strong>${nameOf(marker.memberName)}</strong> can no longer make ${dutyName(duty)}.</p>
      <div class="inline-form">
        <select name="uid" aria-label="Replacement for ${dutyName(duty)}"><option value="">Leave ${dutyName(duty)} open</option>
          ${suggestions.map(profile => html`<option value="${profile.memberUid}">${nameOf(profile.memberName)}</option>`)}</select>
        <button type="submit" class="ghost small">Save</button>
      </div>
    </form>`;
  })}</div>`;
}

function doubleDutyNotes(service) {
  if (!feature('conflictWarnings')) return '';
  const acknowledge = conflict => canAcknowledgeConflict(Object.assign({}, conflict, { serviceId: serviceId(service), date: service.date, service: service.service }));
  return doubleDuties(service).filter(acknowledge).map(conflict => isMarkedOk(service, conflict)
    ? html`<p class="card-note">${nameOf(conflict.name)} has ${conflict.duties.map(dutyName).join(' and ')} (marked OK).
        <button type="button" class="link" data-act="double-duty" data-service="${serviceId(service)}" data-name="${conflict.name}" data-ok="false">Show the warning again</button></p>`
    : html`<p class="card-note is-warning">${nameOf(conflict.name)} has ${conflict.duties.map(dutyName).join(' and ')} in this service.
        <button type="button" class="link" data-act="double-duty" data-service="${serviceId(service)}" data-name="${conflict.name}" data-ok="true">Mark OK</button></p>`);
}

function details(service) {
  const id = serviceId(service);
  const admin = isAdmin();
  const field = (label, input) => html`<label class="field"><span>${label}</span>${input}</label>`;
  return html`<div class="service-editor plan-detail" data-service="${id}">
    <div class="card-title-row"><h3 class="card-subtitle">${longDate(service.date)} · ${service.worship || 'Service'} ${service.service}</h3>
      <button type="button" class="link" data-act="plan-close">Close</button></div>
    <div class="field-grid">
      ${field('Date', html`<input type="date" value="${service.date}" data-change="service-field" data-service="${id}" data-field="date"${admin ? '' : ' disabled'}>`)}
      ${field('Time', html`<input type="time" value="${service.time}" data-change="service-field" data-service="${id}" data-field="time"${admin ? '' : ' disabled'}>`)}
      ${field('Worship', html`<input type="text" value="${service.worship}" list="worship-types" data-change="service-field" data-service="${id}" data-field="worship"${admin ? '' : ' disabled'}>`)}
      ${canEditSongsFor(service) ? field('Choir song', html`<input type="text" value="${service.choirSong || ''}" placeholder="#311 I Repent of My Sin" data-change="service-field" data-service="${id}" data-field="choirSong">`) : ''}
    </div>
    ${replacementPanel(service)}
    ${doubleDutyNotes(service)}
    ${departmentsShown().map(department => html`<div class="duty-group" style="--dept: ${department.color}">
      <h4 class="duty-group-name">${department.name}</h4>
      <div class="field-grid">${department.duties.map(duty => html`<label class="field"><span>${dutyName(duty)}</span>${dutySelect(service, duty)}</label>`)}</div>
    </div>`)}
    ${admin ? html`<div class="right"><button type="button" class="link danger" data-act="service-delete" data-service="${id}">Delete this service</button></div>` : ''}
  </div>`;
}

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
      <input type="date" name="date" value="${month() + '-01'}" required aria-label="Date">
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
  const current = month();
  // The services still to come; a month that is over shows what happened.
  const inMonth = data.services.filter(service => service.date.startsWith(current)).sort(byStart);
  const coming = inMonth.filter(service => isUpcoming(service));
  const services = coming.length ? coming : inMonth;
  const counts = {};
  services.forEach(service => Object.values(planned(service)).forEach(name => { if (name) counts[name] = (counts[name] || 0) + 1; }));
  const context = { usual: usualDuties(data.services), counts };
  const open = ui.plan.open && find(ui.plan.open);
  const proposals = proposalCount();
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
      ${canFill ? html`<button type="button" class="primary" data-act="plan-fill"${proposals || ui.plan.busy ? ' disabled' : ''}>Fill empty duties</button>` : ''}
    </div>
    ${addForm()}
    <datalist id="worship-types">${WORSHIP_TYPES.map(type => html`<option>${type}</option>`)}</datalist>
    ${open && wide() ? html`<section class="card">${details(open)}</section>` : ''}
    ${services.length ? (wide() ? grid(services, context) : list(services, context))
      : empty('No services in ' + monthName(current) + '.' + (isAdmin() ? ' Add a year of services in Manage, Data, or add one above.' : ''))}
    ${proposals ? html`<div class="sticky-actions plan-actions" role="status">
      <span>Fill picked ${plural(proposals, 'member')}${ui.plan.unfilled ? '; ' + plural(ui.plan.unfilled, 'duty has', 'duties have') + ' no one free' : ''}. Change any of them, then save.</span>
      <div class="button-row">
        <button type="button" class="primary" data-act="plan-save"${ui.plan.busy ? ' disabled' : ''}>${ui.plan.busy ? 'Saving…' : 'Save'}</button>
        <button type="button" class="ghost" data-act="plan-discard"${ui.plan.busy ? ' disabled' : ''}>Discard</button>
      </div>
    </div>` : ''}`;
}

export function mounted(view) {
  if (!ui.plan.scroll) return;
  ui.plan.scroll = false;
  const target = view.querySelector('.plan-detail');
  if (target) target.scrollIntoView({ block: 'start' });
}

/* ---- actions ---- */

async function saveCell(service, duty, memberUid) {
  const key = keyOf(serviceId(service), duty);
  busy.add(key);
  renderSoon();
  const result = await saveChanges([{ serviceId: serviceId(service), duty, memberUid, expectedMemberName: (service.assignments || {})[duty] || '' }]);
  busy.delete(key);
  if (result.skipped.length && result.skipped[0].reason !== 'error') notice(dutyName(duty) + ' was not saved: ' + reasonText(result.skipped[0].reason) + '.', true);
  renderSoon();
}

defineActions({
  'plan-month': el => {
    if (proposalCount()) { notice('Save or discard the filled duties first.', true); return; }
    ui.plan.month = addMonths(month(), Number(el.dataset.step));
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
  'plan-assign': {
    allowed: el => canEditDuty(el.dataset.duty),
    run: el => {
      const service = find(el.dataset.service);
      if (!service || el.value === KEEP) return;
      const duty = el.dataset.duty, key = keyOf(el.dataset.service, duty);
      if (ui.plan.proposals[key]) {
        // A proposed duty changes the proposal; nothing is saved until Save.
        if (!el.value) delete ui.plan.proposals[key];
        else {
          const profile = profileOf(departmentOf(duty).name, el.value);
          if (profile) ui.plan.proposals[key] = { memberUid: profile.memberUid, memberName: profile.memberName };
        }
        redraw();
        return;
      }
      saveCell(service, duty, el.value);
    }
  },
  'plan-fill': {
    allowed: () => departmentsShown().some(department => department.duties.some(canEditDuty)),
    run: () => {
      const departments = departmentsShown();
      if (departments.some(department => !roster(department.name).length)) { notice('The rosters are still loading. Try again in a moment.', true); return; }
      const editable = departments.flatMap(department => department.duties).filter(canEditDuty);
      const usual = usualDuties(data.services);
      const services = data.services.filter(service => service.date.startsWith(month()) && isUpcoming(service));
      const stats = workload(data.services, data.members, todayISO());
      const result = fill(services, service => usual(service).filter(duty => editable.includes(duty)), duty => roster(departmentOf(duty).name), stats);
      ui.plan.proposals = {};
      result.proposals.forEach(item => { ui.plan.proposals[keyOf(item.serviceId, item.duty)] = { memberUid: item.memberUid, memberName: item.memberName }; });
      ui.plan.unfilled = result.unfilled.length;
      if (!result.proposals.length) notice(result.unfilled.length ? 'No one is free for the empty duties this month.' : 'The usual duties this month are all filled.');
      redraw();
    }
  },
  'plan-save': async () => {
    const changes = Object.entries(ui.plan.proposals).map(([key, proposal]) => {
      const [id, duty] = key.split('|');
      return { serviceId: id, duty, memberUid: proposal.memberUid, expectedMemberName: '' };
    });
    if (!changes.length) return;
    ui.plan.busy = true;
    redraw();
    const result = await saveChanges(changes);
    ui.plan.busy = false;
    ui.plan.proposals = {};
    ui.plan.unfilled = 0;
    const firstReason = result.skipped.find(item => item.reason !== 'error');
    const left = result.skipped.length === 1 ? '1 was' : result.skipped.length + ' were';
    notice('Saved ' + plural(result.saved, 'duty', 'duties') + '.' +
      (firstReason ? ' ' + left + ' not saved, for example because ' + reasonText(firstReason.reason) + '.' : ''), !!result.skipped.length);
    renderSoon();
  },
  'plan-discard': () => { ui.plan.proposals = {}; ui.plan.unfilled = 0; redraw(); },
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
  },
  'service-field': {
    allowed: el => el.dataset.field === 'choirSong' ? canEditSongsFor(find(el.dataset.service)) : isAdmin(),
    run: el => {
      const service = find(el.dataset.service);
      if (!service) return;
      const value = el.value.trim();
      if (!value && el.dataset.field !== 'choirSong') { redraw(); return; }
      if (el.dataset.field === 'date' || el.dataset.field === 'service') {
        const moved = Object.assign({}, service, { [el.dataset.field]: value });
        Object.assign(ui.plan, { open: serviceId(moved), month: moved.date.slice(0, 7) });
      }
      updateService(service, el.dataset.field, value);
    }
  },
  'service-delete': {
    allowed: () => isAdmin(),
    run: el => {
      const service = find(el.dataset.service);
      if (service && confirm('Delete the ' + service.service + ' service on ' + service.date + '? Its duties are deleted with it.')) {
        ui.plan.open = '';
        deleteService(service);
      }
    }
  },
  assign: {
    allowed: el => canEditDuty(el.dataset.duty),
    run: el => {
      const service = find(el.dataset.service);
      if (!service) return;
      if (!el.value) { unassign(service, el.dataset.duty); return; }
      const profile = profileOf(departmentOf(el.dataset.duty).name, el.value);
      if (profile) assign(service, el.dataset.duty, profile);
    }
  },
  'assign-override': {
    allowed: () => isAdmin(),
    run: form => {
      const service = find(form.dataset.service);
      const values = new FormData(form);
      const profile = service && profileOf(departmentOf(form.dataset.duty).name, values.get('uid'));
      const reason = String(values.get('reason') || '').trim();
      if (!profile || !reason) { notice('Choose a member and give a reason.', true); return; }
      assign(service, form.dataset.duty, profile, { override: true, reason });
    }
  },
  'double-duty': {
    allowed: el => {
      const service = find(el.dataset.service);
      const conflict = service && doubleDuties(service).find(item => item.name === el.dataset.name);
      return !!conflict && canAcknowledgeConflict(Object.assign({}, conflict, { serviceId: el.dataset.service, date: service.date, service: service.service }));
    },
    run: el => {
      const service = find(el.dataset.service);
      if (service) markDoubleDuty(service, el.dataset.name, el.dataset.ok === 'true');
    }
  },
  'replace-duty': {
    allowed: form => canEditDuty(form.dataset.duty),
    run: async form => {
      const service = find(form.dataset.service);
      if (!service) return;
      const uid = String(new FormData(form).get('uid') || '');
      try {
        await replaceDuty(service, form.dataset.duty, uid);
        notice(uid ? 'Replacement saved.' : dutyName(form.dataset.duty) + ' is open now.');
      } catch (error) {
        notice('That was not saved: ' + problem(error), true);
      }
    }
  }
});

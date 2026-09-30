/* Manage, Services: fill the duties of each upcoming service. A duty can
   only go to a member of its department who can take that duty, can be
   scheduled, and is available then. Administrators can override that with a
   reason. Leaders also answer "needs a replacement" flags here. */
import { html } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, ui, feature, nameOf } from '../../store.js';
import { render as redraw } from '../../render.js';
import { notice } from '../../ui/banners.js';
import { dutyGroups, choirLine, dateHeading, empty } from '../../ui/components.js';
import { DEPARTMENTS, SERVICE_LABELS, WORSHIP_TYPES, departmentOf } from '../../config/duties.js';
import { upcoming, serviceId } from '../../lib/services.js';
import { clockTime, todayISO } from '../../lib/dates.js';
import { canTake } from '../../lib/availability.js';
import { openDoubleDuties, doubleDuties, isMarkedOk } from '../../lib/conflicts.js';
import { workload, suggestReplacements } from '../../lib/workload.js';
import { isAdmin, canCreateService, canEditDuty, canEditSongsFor, canAcknowledgeConflict } from '../../services/access.js';
import { roster, profileOf, profileNamed, loadRoster, assign, unassign, departments as departmentState, legacyRoster } from '../../services/departments.js';
import { addService, updateService, deleteService, markDoubleDuty } from '../../services/schedule.js';
import { replaceDuty } from '../../services/requests.js';
import { problem } from '../../firebase.js';
import { managedDepartment } from './index.js';

const find = id => data.services.find(service => serviceId(service) === id);

/* Services a leader of `department` looks after: any with one of its duties,
   or with one of its members serving. */
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

function dutySelect(service, duty) {
  const department = departmentOf(duty).name;
  const people = roster(department);
  const current = (service.assignments || {})[duty] || '';
  const currentProfile = profileNamed(department, current);
  const choices = people.filter(profile => canTake(profile, service, duty));
  const flagged = feature('conflictWarnings') && current && openDoubleDuties(service).some(item => item.name === current);
  const busy = departmentState.busy[serviceId(service) + '::' + duty];
  let options;
  if (!people.length) options = html`<option value="" selected disabled>${departmentState.loading[department] ? 'Loading…' : 'Roster not loaded'}</option>`;
  else {
    options = html`<option value="">Not filled</option>
      ${current && !choices.some(profile => profile.memberName === current) ? html`<option value="" selected disabled>${nameOf(current)} (cannot take this now)</option>` : ''}
      ${choices.map(profile => html`<option value="${profile.memberUid}"${currentProfile && currentProfile.memberUid === profile.memberUid ? ' selected' : ''}>${nameOf(profile.memberName)}</option>`)}`;
  }
  const others = people.filter(profile => !choices.includes(profile));
  return html`<select data-change="assign" data-service="${serviceId(service)}" data-duty="${duty}" aria-label="${duty}"
      class="${flagged ? 'is-flagged' : ''}"${busy || !canEditDuty(duty) ? ' disabled' : ''}>${options}</select>
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
      <p><strong>${nameOf(marker.memberName)}</strong> can no longer make ${duty}.</p>
      <div class="inline-form">
        <select name="uid" aria-label="Replacement for ${duty}"><option value="">Leave ${duty} open</option>
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
    ? html`<p class="card-note">${nameOf(conflict.name)} has ${conflict.duties.join(' and ')} (marked OK).
        <button type="button" class="link" data-act="double-duty" data-service="${serviceId(service)}" data-name="${conflict.name}" data-ok="false">Show the warning again</button></p>`
    : html`<p class="card-note is-warning">${nameOf(conflict.name)} has ${conflict.duties.join(' and ')} in this service.
        <button type="button" class="link" data-act="double-duty" data-service="${serviceId(service)}" data-name="${conflict.name}" data-ok="true">Mark OK</button></p>`);
}

function editor(service) {
  const id = serviceId(service);
  const admin = isAdmin();
  const field = (name, label, input) => html`<label class="field"><span>${label}</span>${input}</label>`;
  return html`<div class="service-editor">
    <div class="field-grid">
      ${field('date', 'Date', html`<input type="date" value="${service.date}" data-change="service-field" data-service="${id}" data-field="date"${admin ? '' : ' disabled'}>`)}
      ${field('time', 'Time', html`<input type="time" value="${service.time}" data-change="service-field" data-service="${id}" data-field="time"${admin ? '' : ' disabled'}>`)}
      ${field('worship', 'Worship', html`<input type="text" value="${service.worship}" list="worship-types" data-change="service-field" data-service="${id}" data-field="worship"${admin ? '' : ' disabled'}>`)}
      ${canEditSongsFor(service) ? field('choir', 'Choir song', html`<input type="text" value="${service.choirSong || ''}" placeholder="#311 I Repent of My Sin" data-change="service-field" data-service="${id}" data-field="choirSong">`) : ''}
    </div>
    ${replacementPanel(service)}
    ${doubleDutyNotes(service)}
    ${departmentsShown().map(department => html`<div class="duty-group" style="--dept: ${department.color}">
      <h4 class="duty-group-name">${department.name}</h4>
      <div class="field-grid">${department.duties.map(duty => html`<label class="field"><span>${duty}</span>${dutySelect(service, duty)}</label>`)}</div>
    </div>`)}
    ${admin ? html`<div class="right"><button type="button" class="link danger" data-act="service-delete" data-service="${id}">Delete this service</button></div>` : ''}
  </div>`;
}

export function render() {
  const department = managedDepartment();
  departmentsShown().forEach(item => loadRoster(item.name));
  const list = upcoming(data.services).filter(shownFor(department));
  let lastDate = '';
  return html`
    ${canCreateService() ? html`<form class="card inline-form add-service" data-act="service-add">
      <input type="date" name="date" value="${todayISO()}" required aria-label="Date">
      <input type="time" name="time" value="09:00" required aria-label="Time">
      <select name="service" aria-label="Service">${SERVICE_LABELS.map(label => html`<option${label === 'Morning' ? ' selected' : ''}>${label}</option>`)}</select>
      <input type="text" name="worship" list="worship-types" value="Sabbath Day" aria-label="Worship">
      <button type="submit" class="primary">Add service</button>
    </form>` : ''}
    <datalist id="worship-types">${WORSHIP_TYPES.map(type => html`<option>${type}</option>`)}</datalist>
    ${list.length ? list.map(service => {
      const id = serviceId(service), open = !!ui.expanded['service:' + id];
      const heading = service.date !== lastDate ? dateHeading(service.date) : '';
      lastDate = service.date;
      return html`${heading}<article class="card service-card${open ? ' is-open' : ''}" data-service="${id}">
        <button type="button" class="service-head" data-act="expand" data-key="service:${id}" aria-expanded="${open}">
          <span class="service-title">${service.worship || 'Service'} <span class="service-label">${service.service}</span></span>
          <span class="service-time">${clockTime(service.time)}</span>
        </button>
        ${open ? editor(service) : html`${choirLine(service, department)}${dutyGroups(service, { only: department })}${replacementPanel(service)}`}
      </article>`;
    }) : empty('No upcoming services.')}`;
}

export function mounted(view) {
  const open = view.querySelector('.service-card.is-open');
  if (open && ui.scrollToService) {
    open.scrollIntoView({ block: 'start' });
    ui.scrollToService = false;
  }
}

defineActions({
  'service-add': {
    allowed: () => canCreateService(),
    run: async form => {
      const values = new FormData(form);
      const fields = { date: values.get('date'), time: values.get('time'), service: values.get('service'), worship: String(values.get('worship') || '').trim() };
      if (!fields.date || !fields.time) return;
      const service = await addService(fields);
      if (service) { ui.expanded['service:' + serviceId(service)] = true; redraw(); }
    }
  },
  'service-field': {
    allowed: el => el.dataset.field === 'choirSong' ? canEditSongsFor(find(el.dataset.service)) : isAdmin(),
    run: el => {
      const service = find(el.dataset.service);
      if (!service) return;
      const value = el.value.trim();
      if (!value && el.dataset.field !== 'choirSong') { redraw(); return; }
      if (el.dataset.field === 'date' || el.dataset.field === 'service') ui.expanded['service:' + serviceId(Object.assign({}, service, { [el.dataset.field]: value }))] = true;
      updateService(service, el.dataset.field, value);
    }
  },
  'service-delete': {
    allowed: () => isAdmin(),
    run: el => {
      const service = find(el.dataset.service);
      if (service && confirm('Delete the ' + service.service + ' service on ' + service.date + '? Its duties are deleted with it.')) deleteService(service);
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
        notice(uid ? 'Replacement saved.' : form.dataset.duty + ' is open now.');
      } catch (error) {
        notice('That was not saved: ' + problem(error), true);
      }
    }
  }
});

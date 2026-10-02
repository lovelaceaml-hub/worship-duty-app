/* Manage, month plan: a service's details, opened from its heading. Date,
   time, worship and choir song, members who can no longer make a duty, double
   duties, each duty of the departments shown (the same control as the grid,
   so Fill's proposals show and wait here too), an administrator's override
   with a reason, and delete. A service that has started shows what happened
   and changes nothing. */
import { html, plural } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, ui, nameOf } from '../../store.js';
import { render as redraw, renderSoon } from '../../render.js';
import { notice } from '../../ui/banners.js';
import { WORSHIP_TYPES, departmentOf, dutyName } from '../../config/duties.js';
import { serviceId, isUpcoming, serviceClock } from '../../lib/services.js';
import { hasChoir } from '../../lib/worship.js';
import { longDate, todayISO } from '../../lib/dates.js';
import { doubleDuties, isMarkedOk } from '../../lib/conflicts.js';
import { candidates } from '../../lib/availability.js';
import { workload, suggestReplacements } from '../../lib/workload.js';
import { reasonText } from '../../lib/reasons.js';
import { isAdmin, canEditDuty, canEditSongsFor, canAcknowledgeConflict } from '../../services/access.js';
import { roster, profileOf, departments as departmentState } from '../../services/departments.js';
import { updateService, deleteService, markDoubleDuty } from '../../services/schedule.js';
import { replaceDuty } from '../../services/requests.js';
import { overrideDuty, keepOnDuty } from '../../services/planner.js';
import { problem } from '../../firebase.js';
import { departmentsShown, serviceById, mayShow, mayMove } from './scope.js';
import { field, planned, atService, showsPrayers, prayers } from './plan-cell.js';

const KEEP = '__keep', OPEN = '__open', OTHER = '__other';

/* The kind of worship: a select of the usual kinds, so a typo cannot turn a
   Sabbath into a feast day (with other duties), and "Other..." for a feast's
   own name, typed in the field that then shows. `attributes` go on both. */
export function worshipControl(value, attributes) {
  const known = WORSHIP_TYPES.includes(value);
  return html`<select ${attributes} data-worship="choice">
      ${WORSHIP_TYPES.map(type => html`<option${type === value ? ' selected' : ''}>${type}</option>`)}
      ${value && !known ? html`<option selected>${value}</option>` : ''}
      <option value="${OTHER}">Other…</option>
    </select>
    <input type="text" ${attributes} data-worship="other" maxlength="80" placeholder="Name of the feast or service" aria-label="Worship, other" hidden>`;
}

/* "Other..." shows the field for a name of its own; nothing is saved yet. */
export function choseOther(el) {
  if (el.value !== OTHER) return false;
  const other = el.parentElement.querySelector('[data-worship="other"]');
  if (other) { other.hidden = false; other.focus(); }
  return true;
}

/* An administrator can put someone on a duty they could not normally take,
   with a reason the server keeps with the change. */
function overrideForm(service, duty, context) {
  const people = roster(departmentOf(duty).name);
  const others = people.filter(profile => !candidates(service, duty, [profile], planned(service, context)).length);
  if (!others.length) return '';
  return html`<details class="override">
    <summary>Assign someone else to ${dutyName(duty)}</summary>
    <p class="hint">For someone who normally could not take this duty now. Give a reason; it is kept with the change.</p>
    <form class="inline-form" data-act="assign-override" data-service="${serviceId(service)}" data-duty="${duty}">
      <select name="uid" aria-label="Member">${others.map(profile => html`<option value="${profile.memberUid}">${nameOf(profile.memberName)}</option>`)}</select>
      <input type="text" name="reason" maxlength="240" placeholder="Why, for example: filling in this week" aria-label="Reason" required>
      <button type="submit" class="ghost small">Assign</button>
    </form>
  </details>`;
}

/* What the replacement form's button says for a choice. */
function replaceLabel(choice, marker, people) {
  if (choice === KEEP) return 'Keep ' + nameOf(marker.memberName);
  if (choice === OPEN) return 'Leave it open';
  const profile = people.find(item => item.memberUid === choice);
  return profile ? 'Give it to ' + nameOf(profile.memberName) : 'Save';
}

/* Duties whose member said they can no longer make it. The leader keeps
   them on it, gives it to someone else, or leaves it open; every member who
   can take it is listed, the best suggestions first. */
function replacementPanel(service) {
  const flags = Object.entries(service.needsReplacement || {})
    .filter(([duty, marker]) => marker && (service.assignments || {})[duty] === marker.memberName && canEditDuty(duty));
  if (!flags.length) return '';
  const stats = workload(data.services, data.members, todayISO());
  return html`<div class="replacements">${flags.map(([duty, marker]) => {
    const people = roster(departmentOf(duty).name);
    const ranked = suggestReplacements(service, duty, people, stats, { exclude: marker.memberName, limit: Infinity });
    const choiceKey = 'replace::' + serviceId(service) + '|' + duty;
    const choice = departmentState.choices[choiceKey] || '';
    const option = profile => html`<option value="${profile.memberUid}"${choice === profile.memberUid ? ' selected' : ''}>${nameOf(profile.memberName)}</option>`;
    const busy = departmentState.busy[choiceKey];
    return html`<form class="card-note is-warning replacement" data-act="replace-duty" data-service="${serviceId(service)}" data-duty="${duty}">
      <p><strong>${nameOf(marker.memberName)}</strong> can no longer make ${dutyName(duty)}.</p>
      <div class="inline-form">
        <select name="uid" data-change="replace-choice" data-key="${choiceKey}" aria-label="What to do with ${dutyName(duty)}"${busy ? ' disabled' : ''}>
          <option value=""${choice ? '' : ' selected'} disabled>Choose…</option>
          <option value="${KEEP}"${choice === KEEP ? ' selected' : ''}>Keep ${nameOf(marker.memberName)} on it</option>
          <option value="${OPEN}"${choice === OPEN ? ' selected' : ''}>Leave it open</option>
          ${ranked.length ? html`<optgroup label="Suggested">${ranked.slice(0, 3).map(option)}</optgroup>` : ''}
          ${ranked.length > 3 ? html`<optgroup label="Others who can take it">${ranked.slice(3).map(option)}</optgroup>` : ''}
        </select>
        <button type="submit" class="ghost small"${choice && !busy ? '' : ' disabled'}>${busy ? 'Saving…' : replaceLabel(choice, marker, people)}</button>
      </div>
      ${ranked.length ? '' : html`<p class="hint small">No one else on the ${departmentOf(duty).name} list can take it then.</p>`}
    </form>`;
  })}</div>`;
}

function doubleDutyNotes(service) {
  const acknowledge = conflict => canAcknowledgeConflict(Object.assign({}, conflict, { serviceId: serviceId(service), date: service.date, service: service.service }));
  return doubleDuties(service).filter(acknowledge).map(conflict => isMarkedOk(service, conflict)
    ? html`<p class="card-note">${nameOf(conflict.name)} has ${conflict.duties.map(dutyName).join(' and ')} (marked OK).
        <button type="button" class="link" data-act="double-duty" data-service="${serviceId(service)}" data-name="${conflict.name}" data-ok="false">Show the warning again</button></p>`
    : html`<p class="card-note is-warning">${nameOf(conflict.name)} has ${conflict.duties.map(dutyName).join(' and ')} in this service.
        <button type="button" class="link" data-act="double-duty" data-service="${serviceId(service)}" data-name="${conflict.name}" data-ok="true">Mark OK</button></p>`);
}

export function details(service, context) {
  const id = serviceId(service);
  const admin = isAdmin();
  const upcoming = isUpcoming(service);
  const input = (label, control) => html`<label class="field"><span>${label}</span>${control}</label>`;
  const songs = canEditSongsFor(service) && (hasChoir(service.worship || 'Sabbath Day') || service.choirSong);
  return html`<div class="service-editor plan-detail" data-service="${id}">
    <div class="card-title-row"><h3 class="card-subtitle">${longDate(service.date)} · ${service.worship || 'Service'} ${service.service} · ${serviceClock(service)}</h3>
      <button type="button" class="link" data-act="plan-close">Close</button></div>
    ${upcoming ? '' : html`<p class="hint">This service has started, so it shows what happened and nothing here can be changed.</p>`}
    ${upcoming && (admin || songs) ? html`<div class="field-grid">
      ${admin ? html`${input('Date', html`<input type="date" value="${service.date}" data-change="service-field" data-service="${id}" data-field="date">`)}
        ${input('Time', html`<input type="time" value="${service.time}" data-change="service-field" data-service="${id}" data-field="time">`)}
        ${input('Worship', worshipControl(service.worship || 'Sabbath Day', html`data-change="service-field" data-service="${id}" data-field="worship"`))}` : ''}
      ${songs ? input('Choir song', html`<input type="text" value="${service.choirSong || ''}" placeholder="e.g. 311 I Repent of My Sin" data-change="service-field" data-service="${id}" data-field="choirSong">`) : ''}
    </div>` : (service.choirSong ? html`<p class="hint">Choir song: ${service.choirSong}</p>` : '')}
    ${upcoming ? replacementPanel(service) : ''}
    ${upcoming ? doubleDutyNotes(service) : ''}
    ${showsPrayers() && prayers(service) ? html`<p class="plan-praying">Praying: ${prayers(service)}</p>` : ''}
    ${departmentsShown().map(department => {
      const duties = department.duties.filter(duty => atService(service, duty));
      return duties.length ? html`<div class="duty-group" style="--dept: ${department.color}">
        <h4 class="duty-group-name">${department.name}</h4>
        <div class="field-grid">${duties.map(duty => html`<div>${field(service, duty, context)}${upcoming && admin ? overrideForm(service, duty, context) : ''}</div>`)}</div>
      </div>` : '';
    })}
    ${admin ? html`<div class="right"><button type="button" class="link danger" data-act="service-delete" data-service="${id}">Delete this service</button></div>` : ''}
  </div>`;
}

defineActions({
  'service-field': {
    allowed: el => el.dataset.field === 'choirSong' ? canEditSongsFor(serviceById(el.dataset.service)) : isAdmin(),
    run: el => {
      const service = serviceById(el.dataset.service);
      if (!service || choseOther(el)) return;
      const value = el.value.trim();
      if (!value && el.dataset.field !== 'choirSong') { redraw(); return; }
      if (!isUpcoming(service)) { notice(reasonText('service-started'), true); redraw(); return; }
      if (el.dataset.field === 'date') {
        // The planner follows the service to its new month.
        if (!mayShow({ month: value.slice(0, 7) }) || !mayMove(service)) { redraw(); return; }
        const moved = Object.assign({}, service, { date: value });
        Object.assign(ui.plan, { open: serviceId(moved), month: value.slice(0, 7) });
      }
      updateService(service, el.dataset.field, value);
    }
  },
  'service-delete': {
    allowed: () => isAdmin(),
    run: el => {
      const service = serviceById(el.dataset.service);
      if (service && !mayMove(service)) return;
      const people = service ? Object.values(service.assignments || {}).filter(Boolean).length : 0;
      if (service && confirm('Delete the ' + service.service + ' service on ' + longDate(service.date) + '? ' +
        (people ? 'Its ' + plural(people, 'duty', 'duties') + ' are deleted with it.' : 'It has no duties filled.'))) {
        ui.plan.open = '';
        deleteService(service);
      }
    }
  },
  'assign-override': {
    allowed: () => isAdmin(),
    run: form => {
      const service = serviceById(form.dataset.service);
      const values = new FormData(form);
      const profile = service && profileOf(departmentOf(form.dataset.duty).name, values.get('uid'));
      const reason = String(values.get('reason') || '').trim();
      if (!profile || !reason) { notice('Choose a member and give a reason.', true); return; }
      overrideDuty(service, form.dataset.duty, profile, reason);
    }
  },
  'double-duty': {
    allowed: el => {
      const service = serviceById(el.dataset.service);
      const conflict = service && doubleDuties(service).find(item => item.name === el.dataset.name);
      return !!conflict && canAcknowledgeConflict(Object.assign({}, conflict, { serviceId: el.dataset.service, date: service.date, service: service.service }));
    },
    run: el => {
      const service = serviceById(el.dataset.service);
      if (service) markDoubleDuty(service, el.dataset.name, el.dataset.ok === 'true');
    }
  },
  'replace-choice': el => { departmentState.choices[el.dataset.key] = el.value; redraw(); },
  'replace-duty': {
    allowed: form => canEditDuty(form.dataset.duty),
    run: async form => {
      const service = serviceById(form.dataset.service);
      const duty = form.dataset.duty;
      const choiceKey = 'replace::' + form.dataset.service + '|' + duty;
      const choice = departmentState.choices[choiceKey];
      if (!service || !choice || departmentState.busy[choiceKey]) return;
      const marker = (service.needsReplacement || {})[duty] || {};
      departmentState.busy[choiceKey] = true;
      renderSoon();
      try {
        if (choice === KEEP) {
          await keepOnDuty(service, duty);
          notice(nameOf(marker.memberName) + ' stays on ' + dutyName(duty) + '.');
        } else {
          await replaceDuty(service, duty, choice === OPEN ? '' : choice);
          notice(choice === OPEN ? dutyName(duty) + ' is open now. Fill it in the month plan.' : 'Replacement saved.');
        }
        delete departmentState.choices[choiceKey];
      } catch (error) {
        // Someone else changed the duty first: the flag no longer applies.
        const reason = error && error.details && error.details.reason;
        notice('That was not saved: ' + (['not-holder', 'changed'].includes(reason) && marker.memberName
          ? nameOf(marker.memberName) + ' is no longer on ' + dutyName(duty) + '. Someone else changed it first.' : problem(error)), true);
      }
      delete departmentState.busy[choiceKey];
      renderSoon();
    }
  }
});

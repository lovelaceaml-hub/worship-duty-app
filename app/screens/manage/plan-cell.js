/* Manage, month plan: one duty at one service, drawn the same in the grid,
   the phone list and a service's details. It shows who is on the duty, or
   Fill's proposal, or the name being saved, marked so a leader can read the
   month at a glance:
     Not filled (amber)   an empty duty the service usually has
     Not filled (quiet)   an empty duty it does not usually have
     blue                 Fill's proposal, not saved yet
     red, with why        the person on it cannot take it now, or has a
                          double duty
     a calm edge          an usher who also prays in that service (allowed)
   and one short line saying why, when there is something to say. Changing
   it saves at once; changing a duty Fill proposed changes the proposal,
   which waits for Save. Who can be chosen is availability.js whyNot, the
   rule the server and Fill use too. */
import { html } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, ui, nameOf } from '../../store.js';
import { render as redraw } from '../../render.js';
import { notice } from '../../ui/banners.js';
import { DUTY_DEFAULTS, PRAYER_DUTIES, departmentOf, dutyName, dutyDefault } from '../../config/duties.js';
import { serviceId, isUpcoming } from '../../lib/services.js';
import { hasDuty } from '../../lib/worship.js';
import { weekdayShort, dayOfMonth } from '../../lib/dates.js';
import { whyNot, candidates } from '../../lib/availability.js';
import { doubleDuties, isMarkedOk, otherDuties, isUsher, prayerOf } from '../../lib/conflicts.js';
import { UNFILLED_REASONS } from '../../lib/fill.js';
import { reasonText, reasonNote, holderNote } from '../../lib/reasons.js';
import { canEditDuty } from '../../services/access.js';
import { roster, rosterLoaded, profileOf } from '../../services/departments.js';
import { keyOf, proposalsIn, changeProposal, savingName, saveDuty } from '../../services/planner.js';
import { serviceById, currentScope, departmentsShown } from './scope.js';

const KEEP = '__current';

/* What every cell of one drawing shares: the duties each service usually
   has, how many duties each person has this month, and the proposals in
   view. Built once per drawing (services.js). */
export function planContext(services, usual) {
  const proposals = proposalsIn(currentScope());
  const context = { usual, proposals, counts: {} };
  services.forEach(service => Object.values(planned(service, context)).forEach(name => {
    if (name) context.counts[name] = (context.counts[name] || 0) + 1;
  }));
  return context;
}

/* A service's duties as the planner shows them: what is stored, with the
   names being saved and Fill's proposals laid over it. */
export function planned(service, context) {
  const id = serviceId(service);
  const out = Object.assign({}, service.assignments);
  Object.entries(ui.plan.saving).forEach(([key, name]) => { if (key.startsWith(id + '|')) out[key.slice(id.length + 1)] = name; });
  Object.entries(context.proposals).forEach(([key, proposal]) => { if (key.startsWith(id + '|')) out[key.slice(id.length + 1)] = proposal.memberName; });
  return out;
}

/* The default member of each duty that has one (Opening Prayer). */
export function dutyDefaults() {
  const out = {};
  Object.keys(DUTY_DEFAULTS).forEach(duty => { const name = dutyDefault(data.settings, duty); if (name) out[duty] = name; });
  return out;
}

/* A duty shows at a service that has it, or when someone already holds it. */
export const atService = (service, duty) => hasDuty(service, duty) || !!(service.assignments || {})[duty];

/* Usher leaders see the prayers of each service too, read-only: an usher
   may also give Thanks Prayer or Closing Prayer there. */
export const showsPrayers = () => {
  const departments = departmentsShown();
  return departments.some(department => department.duties.some(isUsher)) && !departments.some(department => department.name === 'Worship');
};

/* "S. Hannah (Thanks Prayer), M. Ruth (Closing Prayer)" for a service. */
export function prayers(service) {
  const assignments = service.assignments || {};
  return PRAYER_DUTIES.filter(duty => assignments[duty]).map(duty => nameOf(assignments[duty]) + ' (' + dutyName(duty) + ')').join(', ');
}

/* Whether the planner can change duties of `department` now: its list has
   loaded and has people on it. */
const ready = department => rosterLoaded(department) && roster(department).length > 0;

/* Everything one cell shows: who, what to call it, and why. */
function dutyState(service, duty, context) {
  const id = serviceId(service), key = keyOf(id, duty);
  const department = departmentOf(duty).name;
  const holder = (service.assignments || {})[duty] || '';
  const proposal = context.proposals[key];
  const saving = savingName(service, duty);
  const shown = proposal ? proposal.memberName : (saving !== null ? saving : holder);
  const upcoming = isUpcoming(service);
  const state = {
    id, key, duty, department, shown, proposal, saving: saving !== null, upcoming,
    none: !holder && !hasDuty(service, duty),
    editable: upcoming && canEditDuty(duty) && ready(department),
    usual: context.usual(service).includes(duty),
    classes: ['plan-cell'], note: '', tone: ''
  };
  if (state.none) return state;
  const people = roster(department);
  const assignments = planned(service, context);
  state.people = people;
  state.assignments = assignments;
  const say = (note, tone, kind) => { if (!state.note) { state.note = note; state.tone = tone; } if (kind) state.classes.push(kind); };
  if (proposal) state.classes.push('is-proposed');
  if (state.saving) say('Saving…', 'quiet', 'is-busy');
  const skipped = upcoming && ui.plan.skipped[key];
  if (skipped && !proposal && !state.saving) say('Not saved: ' + reasonNote(skipped.reason), 'danger', 'is-skipped');
  if (shown && upcoming && ready(department)) {
    // Whether the person shown can have the duty now, and their other duty here.
    const profile = people.find(item => item.memberName === shown) || people.find(item => nameOf(item.memberName) === nameOf(shown)) || null;
    const also = otherDuties(assignments, shown, duty);
    const double = doubleDuties({ assignments }).find(item => item.name === shown && item.duties.includes(duty));
    const why = whyNot(profile, service, duty) || (double && !isMarkedOk(service, double) ? 'already-serving' : '');
    state.why = why;
    const marker = (service.needsReplacement || {})[duty];
    if (why) say(holderNote(why, { department, duty: dutyName(duty), also: also.map(dutyName) }), 'danger', 'is-flagged');
    else if (!proposal && marker && marker.memberName === holder) say('Can no longer make it', 'warn', 'is-flagged');
    const prayer = isUsher(duty) && prayerOf(assignments, shown);
    if (prayer) say('Also ' + dutyName(prayer), 'calm', 'is-paired');
  }
  if (!shown) {
    const unfilled = upcoming && ui.plan.unfilled[key];
    if (unfilled) say(UNFILLED_REASONS[unfilled][0], 'warn', 'is-unfilled');
    state.classes.push(upcoming && state.usual ? 'is-empty' : 'is-unusual');
  }
  return state;
}

/* "S. Esther (Closing Prayer, 3 this month)": the name, the prayer they also
   have there or "default", and how many duties they have this month. */
function optionLabel(profile, duty, assignments, context) {
  const notes = [];
  const prayer = isUsher(duty) && prayerOf(assignments, profile.memberName);
  if (prayer) notes.push(dutyName(prayer));
  else if (dutyDefaults()[duty] === profile.memberName) notes.push('default');
  const count = context.counts[profile.memberName];
  if (count) notes.push(count + ' this month');
  return nameOf(profile.memberName) + (notes.length ? ' (' + notes.join(', ') + ')' : '');
}

/* The select of a duty: "Not filled", the person on it when they could not
   be chosen now (kept, so a list never erases anyone), then everyone who can
   take it, those praying in the service first for an usher duty. */
function picker(service, state, context, change, describedBy) {
  const { duty, shown, assignments } = state;
  const choices = candidates(service, duty, state.people, assignments);
  const chosen = shown && choices.find(profile => profile.memberName === shown);
  const option = profile => html`<option value="${profile.memberUid}"${profile === chosen ? ' selected' : ''}>${optionLabel(profile, duty, assignments, context)}</option>`;
  const praying = isUsher(duty) ? choices.filter(profile => prayerOf(assignments, profile.memberName)) : [];
  const label = dutyName(duty) + ', ' + weekdayShort(service.date) + ' ' + dayOfMonth(service.date) + ' ' + service.service;
  const attributes = html`data-service="${state.id}" data-duty="${duty}" aria-label="${label}"${describedBy ? html` aria-describedby="${describedBy}"` : ''}${state.saving || ui.plan.busy ? ' disabled' : ''}`;
  const options = html`<option value=""${shown ? '' : ' selected'}>Not filled</option>
    ${shown && !chosen ? html`<option value="${KEEP}" selected>${nameOf(shown)}${state.note ? ', ' + state.note.charAt(0).toLowerCase() + state.note.slice(1) : ''}</option>` : ''}
    ${praying.length ? html`<optgroup label="Praying in this service">${praying.map(option)}</optgroup>
      <optgroup label="Others">${choices.filter(profile => !praying.includes(profile)).map(option)}</optgroup>` : choices.map(option)}`;
  // The grid and the details answer the same way, under their own names, so
  // a redraw puts the focus back on the right one.
  return change === 'assign' ? html`<select data-change="assign" ${attributes}>${options}</select>`
    : html`<select data-change="plan-assign" ${attributes}>${options}</select>`;
}

/* The name as it shows, and the select over it (or the name alone where
   nothing can be changed), then the short line saying why. */
function body(service, state, context, change, idPrefix) {
  const noteId = state.note ? idPrefix + state.key.replace(/[^A-Za-z0-9-]+/g, '-') : '';
  const value = html`<span class="plan-value">${state.shown ? nameOf(state.shown) : 'Not filled'}</span>`;
  return html`${state.editable
    ? html`<span class="plan-pick">${value}${picker(service, state, context, change, noteId)}</span>`
    : html`<span class="plan-name">${value}</span>`}
    ${state.note ? html`<span class="plan-note is-${state.tone}" id="${noteId}">${state.note}</span>` : ''}`;
}

/* One cell of the grid or the phone list. */
export function cell(service, duty, context) {
  const state = dutyState(service, duty, context);
  if (state.none) return html`<td class="plan-cell is-none"><span class="sr-only">Not at this service</span></td>`;
  if (!state.editable) state.classes.push('is-fixed');
  return html`<td class="${state.classes.join(' ')}">${body(service, state, context, 'plan-assign', 'pn-')}</td>`;
}

/* One duty in a service's details: its name above the same control. */
export function field(service, duty, context) {
  const state = dutyState(service, duty, context);
  // The field's own box carries the marks, not a grid cell's.
  const marks = state.classes.filter(name => name !== 'plan-cell');
  return html`<div class="field plan-field ${marks.join(' ')}"><span>${dutyName(duty)}</span>${body(service, state, context, 'assign', 'dn-')}</div>`;
}

/* Whether a duty at a service needs a look (a red name, or a member who can
   no longer make it): null, or { note } as the cell says it, with `double`
   for a double duty. For the counts in the service headings and Checks. */
export function needsLook(service, duty, context) {
  const state = dutyState(service, duty, context);
  return !state.none && state.classes.includes('is-flagged') ? { note: state.note, double: state.why === 'already-serving' } : null;
}

/* Whether a duty is empty where the service usually has it filled. */
export function notFilled(service, duty, context) {
  const state = dutyState(service, duty, context);
  return !state.none && !state.shown && state.usual;
}

/* A duty changed in the grid, the phone list or the details. */
function changeDuty(el) {
  const service = serviceById(el.dataset.service);
  if (!service || el.value === KEEP) return;
  const duty = el.dataset.duty;
  const key = keyOf(serviceId(service), duty);
  const profile = el.value ? profileOf(departmentOf(duty).name, el.value) : null;
  // Every early return draws again, so the select shows what is stored.
  if (el.value && !profile) { redraw(); return; }
  if (!isUpcoming(service)) { notice(reasonText('service-started'), true); redraw(); return; }
  const context = { proposals: proposalsIn(currentScope()) };
  if (context.proposals[key]) {
    changeProposal(key, profile);
    redraw();
    return;
  }
  const why = profile && whyNot(profile, service, duty, planned(service, context));
  if (why) {
    notice(nameOf(profile.memberName) + ' cannot take ' + dutyName(duty) + ' there: ' + reasonText(why), true);
    redraw();
    return;
  }
  saveDuty(service, duty, profile);
}

defineActions({
  'plan-assign': { allowed: el => canEditDuty(el.dataset.duty), run: changeDuty },
  assign: { allowed: el => canEditDuty(el.dataset.duty), run: changeDuty }
});

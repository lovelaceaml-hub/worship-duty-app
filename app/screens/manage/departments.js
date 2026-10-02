/* Manage, Departments. A leader sees their department's roster: add members
   by name or with an invite link, and open a member to set the duties they
   can take, whether they can be scheduled and when they are available, to
   make them inactive or active again, or to reset their PIN. */
import { html, plural } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, ui, nameOf } from '../../store.js';
import { render as redraw } from '../../render.js';
import { notice, banner } from '../../ui/banners.js';
import { empty } from '../../ui/components.js';
import { DUTY_DEFAULTS, departmentNamed, departmentOf, dutyName, dutyDefault } from '../../config/duties.js';
import { normalizeAvailability, takesDuty, timeLabel, dutiesFor, WEEKLY_TIMES, SPECIAL_TIMES } from '../../lib/availability.js';
import { longDate, todayISO, shortDate, shortStamp } from '../../lib/dates.js';
import { managedDepartments, canManageDepartment, canResetPin, leadersOf, isAdmin, isPrivileged } from '../../services/access.js';
import {
  departments as state, roster, rosterLoaded, loadRoster, draftOf, hasDraft, editDraft, editAvailability, dropDraft, saveProfile, profileSaving, setStatus,
  searchMembers, addMember, addByName, missingMembers, servedDuties, resetPin, TEMPORARY_PIN, createInvite, cancelInvite, activeInvites, inviteLink, saveDutyDefault
} from '../../services/departments.js';
import { managedDepartment, setManagedDepartment } from './scope.js';

const dutiesOf = department => (departmentNamed(department) || { duties: [] }).duties;

/* ---- all departments ---- */

function departmentList() {
  const names = managedDepartments().filter(name => name !== 'All');
  return html`<div class="card department-list">${names.map(name => {
    const department = departmentNamed(name);
    const loaded = state.rosters[name];
    const leaders = leadersOf(name);
    return html`<button type="button" class="department-row" data-act="department-open" data-department="${name}" style="--dept: ${department ? department.color : 'currentColor'}">
      <span class="department-name">${name}</span>
      <span class="department-meta">${leaders.length ? 'Led by ' + leaders.map(nameOf).join(', ') : 'No leader set'}${loaded ? ' · ' + plural(loaded.length, 'member') : ''}</span>
      <span class="department-go" aria-hidden="true">›</span>
    </button>`;
  })}</div>`;
}

/* ---- one department ---- */

/* What Add gives someone: "any Usher Sisters duty", or the duties named. */
function addsWith(department, duties) {
  if (!duties.length) return 'no duties yet';
  return duties.length === dutiesOf(department).length ? 'any ' + department + ' duty' : duties.map(dutyName).join(', ');
}

function searchPanel(department) {
  const search = state.search && state.search.department === department ? state.search : null;
  const pages = search ? Math.max(1, Math.ceil(search.total / 10)) : 1;
  let results = '';
  if (search && search.busy) results = html`<p class="hint">Searching…</p>`;
  else if (search && search.error) results = html`<p class="form-error">${search.error}</p>`;
  else if (search && search.done && !search.members.length) results = html`<p class="hint">No member has that name. Check the spelling. Names come from the church's member list; if someone is missing, ask an administrator.</p>`;
  else if (search) {
    results = html`<div class="list">${search.members.map(member => {
      const already = roster(department).some(profile => profile.memberUid === member.memberUid);
      return html`<div class="list-row"><span>${nameOf(member.memberName)}</span>${already
        ? html`<span class="hint">Already in ${department}</span>`
        : html`<button type="button" class="ghost small" data-act="department-add" data-department="${department}" data-uid="${member.memberUid}"
            data-name="${member.memberName}"${search.adding ? ' disabled' : ''}>Add</button>`}</div>`;
    })}</div>
    ${pages > 1 ? html`<div class="pager">
      <button type="button" class="ghost small" data-act="department-search-page" data-page="${search.page - 1}"${search.page <= 1 ? ' disabled' : ''}>Previous</button>
      <span class="hint">Page ${search.page} of ${pages}</span>
      <button type="button" class="ghost small" data-act="department-search-page" data-page="${search.page + 1}"${search.page >= pages ? ' disabled' : ''}>Next</button>
    </div>` : ''}`;
  }
  return html`<section class="card">
    <h3 class="card-subtitle">Add a member</h3>
    <p class="hint">${department === 'Worship' ? 'Then choose the Worship duties they can take.' : 'They can take any ' + department + ' duty; change that in their profile.'}</p>
    <form class="inline-form" data-act="department-search" data-department="${department}">
      <input type="search" name="query" minlength="2" maxlength="80" placeholder="Name, 2 letters or more" aria-label="Member name" value="${search ? search.query : ''}" required>
      <button type="submit" class="primary"${search && search.busy ? ' disabled' : ''}>Search</button>
    </form>
    ${results}
    <h3 class="card-subtitle">Invite link</h3>
    <p class="hint">Send a link instead. Whoever opens it and signs in joins ${department}. A link works for 7 days and only once. Then choose the duties they can take in their profile.</p>
    ${activeInvites(department).map(invite => html`<div class="invite">
      <input type="text" readonly value="${inviteLink(invite.token)}" aria-label="Invite link" data-no-swipe>
      <div class="button-row">
        <button type="button" class="ghost small" data-act="invite-copy" data-token="${invite.token}">Copy</button>
        ${navigator.share ? html`<button type="button" class="ghost small" data-act="invite-share" data-token="${invite.token}" data-department="${department}">Share</button>` : ''}
        <button type="button" class="link danger" data-act="invite-cancel" data-token="${invite.token}" data-department="${department}">Cancel link</button>
      </div>
      <p class="hint small">Works until ${shortDate(new Date(invite.expiresAt).toLocaleDateString('en-CA'))}.</p>
    </div>`)}
    <button type="button" class="ghost" data-act="invite-create" data-department="${department}">Make an invite link</button>
  </section>`;
}

/* The default member of each of this department's duties that has one
   (Worship: Opening Prayer). Fill always gives the duty to them. */
function defaultsPanel(department, canEdit) {
  const duties = Object.keys(DUTY_DEFAULTS).filter(duty => (departmentOf(duty) || {}).name === department);
  return duties.map(duty => {
    const current = dutyDefault(data.settings, duty);
    const takers = roster(department).filter(profile => takesDuty(profile, duty));
    const listed = !current || takers.some(profile => profile.memberName === current);
    const busy = state.busy['default::' + duty];
    return html`<section class="card duty-default">
      <label class="field"><span>Default for ${dutyName(duty)}</span>
        <select data-change="duty-default" data-duty="${duty}"${canEdit && !busy ? '' : ' disabled'}>
          <option value=""${current ? '' : ' selected'}>No default</option>
          ${listed ? '' : html`<option value="${current}" selected>${nameOf(current)}</option>`}
          ${takers.map(profile => html`<option value="${profile.memberName}"${profile.memberName === current ? ' selected' : ''}>${nameOf(profile.memberName)}</option>`)}
        </select></label>
      <p class="hint">Fill always gives ${dutyName(duty)} to the default, and new services start with them on it. When someone else gives it, choose them by hand in the month plan.</p>
      ${listed ? '' : html`<p class="card-note is-warning">${nameOf(current)} does not take ${dutyName(duty)} in ${department}, so Fill leaves it empty. Add it to their duties, or choose another default.</p>`}
    </section>`;
  });
}

/* People serving in this department who are not on its list yet. */
function missingPanel(department) {
  const missing = missingMembers(department, todayISO());
  if (!missing.length) return '';
  return html`<section class="card missing-members">
    <div class="card-title-row"><h3 class="card-subtitle">Not on the list yet <span class="count">${missing.length}</span></h3>
      <button type="button" class="primary small" data-act="department-add-missing" data-department="${department}"${state.addingAll ? ' disabled' : ''}>${state.addingAll ? 'Adding…' : 'Add all'}</button></div>
    <p class="hint">They serve in ${department} duties or were on its old list, but are not members here, so the planner cannot offer them. Add puts them on the list with the duties shown${department === 'Worship' ? ' (the Worship duties they have served)' : ''}; someone who has not served in the last 5 weeks is added as inactive.</p>
    <div class="list">${missing.map(item => html`<div class="list-row">
      <span><strong>${nameOf(item.name)}</strong> <span class="hint">${addsWith(department, item.duties)}${item.status === 'inactive' ? ' · added as inactive' : ''}</span></span>
      <button type="button" class="ghost small" data-act="department-add-name" data-department="${department}" data-name="${item.name}"${state.addingAll ? ' disabled' : ''}>Add</button></div>`)}</div>
  </section>`;
}

/* Why an active member cannot be scheduled yet, or ''. */
function notReady(profile) {
  if (profile.status !== 'active') return '';
  if (!profile.eligibleDuties.length) return 'No duties chosen';
  return profile.schedulable ? '' : 'Not set to be scheduled';
}

const isNew = profile => Number(profile.createdAt) > Date.now() - 14 * 864e5;

function memberRow(department, profile) {
  const waiting = notReady(profile);
  const summary = waiting || ('Can be scheduled · ' + plural(profile.eligibleDuties.length, 'duty', 'duties'));
  return html`<button type="button" class="member-row${profile.status === 'inactive' ? ' is-inactive' : ''}" data-act="department-member" data-uid="${profile.memberUid}">
    <span class="member-open">
      <span class="member-name">${nameOf(profile.memberName)}</span>
      <span class="member-tags">${leadersOf(department).includes(profile.memberName) ? html`<span class="tag">Leader</span>` : ''}
        ${waiting ? html`<span class="tag is-warning">Not ready</span>` : ''}
        ${isNew(profile) ? html`<span class="tag">New</span>` : ''}
        ${hasDraft(department, profile.memberUid) ? html`<span class="tag is-warning">Unsaved changes</span>` : ''}</span>
      <span class="hint">${summary}</span>
    </span>
    <span class="member-go" aria-hidden="true">›</span>
  </button>`;
}

function departmentRoster(department) {
  loadRoster(department);
  const canEdit = canManageDepartment(department);
  // Only administrators have the list of every department to go back to.
  const back = managedDepartments().includes('All') ? html`<button type="button" class="link" data-act="department-list">All departments</button>` : '';
  if (!rosterLoaded(department)) {
    return state.errors[department]
      ? html`${back}<section class="card"><p class="form-error">${state.errors[department]}</p>
        <button type="button" class="primary" data-act="department-retry" data-department="${department}">Try again</button></section>`
      : html`${back}${empty('Loading the ' + department + ' roster…')}`;
  }
  const people = roster(department);
  // Members who still need setting up come first.
  const active = people.filter(profile => profile.status === 'active').sort((a, b) => !notReady(a) - !notReady(b));
  const archived = people.filter(profile => profile.status !== 'active');
  return html`${back}
    <h2 class="screen-title">${department}</h2>
    <p class="hint"><strong>Leaders:</strong> ${leadersOf(department).map(nameOf).join(', ') || 'none set'}</p>
    ${defaultsPanel(department, canEdit)}
    ${canEdit ? missingPanel(department) : ''}
    ${canEdit ? searchPanel(department) : ''}
    <h3 class="section-heading">Members <span class="count">${active.length}</span></h3>
    ${active.length ? html`<div class="list roster">${active.map(profile => memberRow(department, profile))}</div>` : empty('No members yet.')}
    ${archived.length ? html`<h3 class="section-heading">Inactive <span class="count">${archived.length}</span></h3>
      <div class="list roster">${archived.map(profile => memberRow(department, profile))}</div>` : ''}`;
}

/* ---- one member ---- */

/* Who changed a profile last, in plain words: a leader's name, or what the
   app did by itself. */
const SYSTEM_CHANGES = [[/^Added from the schedule$|^system:/, 'added from the schedule'], [/^Name fixed$/, 'name fixed by an administrator'], [/^Merged /, 'two names joined into one']];

function lastChange(profile) {
  const when = Number(profile.updatedAt);
  if (!when) return '';
  const by = String(profile.updatedBy || '');
  const system = SYSTEM_CHANGES.find(([pattern]) => pattern.test(by));
  const who = !system && by && !/^member:|^[A-Za-z0-9_-]{20,}$/.test(by) ? nameOf(by) : '';
  return html`<p class="hint small">Last changed${who ? ' by ' + who : ''} on ${shortStamp(when, { year: true })}${system ? ' (' + system[1] + ')' : ''}.</p>`;
}

function pastDuties(profile) {
  const seed = profile.historySeed || profile.provenance;
  const entries = seed && Array.isArray(seed.evidence) ? seed.evidence : (Array.isArray(profile.history) ? profile.history : []);
  if (!entries.length) return '';
  return html`<section class="card">
    <h3 class="card-subtitle">Duties served before</h3>
    <p class="hint">From the schedule history. Use it to pick the duties above.</p>
    <ul class="plain-list">${entries.map(entry => html`<li><strong>${entry.duty ? dutyName(entry.duty) : entry.role || 'Duty'}</strong>
      ${[entry.service, entry.date && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) ? longDate(entry.date) : entry.date].filter(Boolean).join(' · ')}</li>`)}</ul>
  </section>`;
}

function weekRow(key, availability, disabled, covers) {
  const on = availability.recurring[key] !== 'unavailable';
  return html`<label class="availability-row"><span>${timeLabel(key)}${covers ? html`<small class="profile-covers">${covers}</small>` : ''}</span><select data-change="profile-week" data-key="${key}"${disabled}>
    <option value="available"${on ? ' selected' : ''}>Available</option><option value="unavailable"${on ? '' : ' selected'}>Not available</option></select></label>`;
}

function memberProfile(department, uid) {
  const profile = draftOf(department, uid);
  if (!profile) return departmentRoster(department);
  const canEdit = canManageDepartment(department);
  const availability = normalizeAvailability(profile.availability);
  const dates = Object.keys(availability.exceptions).sort().filter(date => date >= todayISO());
  const disabled = canEdit ? '' : ' disabled';
  const changed = hasDraft(department, uid);
  const saving = profileSaving(department, uid);
  const inactive = profile.status !== 'active';
  const waiting = notReady(profile);
  // Only administrators reset the PIN of a leader, an administrator or a song
  // editor, or of someone inactive here (the server counts active members only).
  const reset = canResetPin(profile.memberName, department) && (isAdmin() || (!inactive && !isPrivileged(profile.memberName)));
  return html`<button type="button" class="link" data-act="department-member-back">Back to ${department}</button>
    <h2 class="screen-title">${nameOf(profile.memberName)} <span class="status profile-status${inactive ? ' is-inactive' : ''}">${inactive ? 'Inactive' : 'Active'}</span></h2>
    ${lastChange(profile)}
    ${canEdit || reset ? html`<div class="button-row profile-actions">
      ${canEdit ? html`<button type="button" class="ghost small" data-act="department-status" data-status="${inactive ? 'active' : 'inactive'}"${saving ? ' disabled' : ''}>${inactive ? 'Make active' : 'Make inactive'}</button>` : ''}
      ${reset ? html`<button type="button" class="ghost small" data-act="department-reset-pin" data-name="${profile.memberName}">Reset PIN</button>` : ''}
    </div>` : ''}
    ${waiting ? html`<p class="card-note is-warning">${nameOf(profile.memberName)} cannot be scheduled yet: ${waiting === 'No duties chosen' ? 'choose the duties they can take' : 'turn on Can be scheduled'}, then save.</p>` : ''}
    <section class="card">
      <h3 class="card-subtitle">Duties they can take</h3>
      <div class="check-grid">${dutiesOf(department).map(duty => html`<label class="check"><input type="checkbox" data-change="profile-duty" data-duty="${duty}"
        ${profile.eligibleDuties.some(item => item.toLowerCase() === duty.toLowerCase()) ? ' checked' : ''}${disabled}> ${dutyName(duty)}</label>`)}</div>
      <label class="switch-row"><span><strong>Can be scheduled</strong><small>Show them as a choice when filling duties.</small></span>
        <input type="checkbox" role="switch" data-change="profile-schedulable"${profile.schedulable ? ' checked' : ''}${disabled}></label>
    </section>
    <section class="card">
      <h3 class="card-subtitle">Every week</h3>
      <p class="hint">Not available keeps them off every service at that time.</p>
      <div class="availability-grid">${WEEKLY_TIMES.map(([key, covers]) => weekRow(key, availability, disabled, covers))}</div>
      <h3 class="card-subtitle">Feast days and special services</h3>
      <div class="availability-grid">${SPECIAL_TIMES.map(key => weekRow(key, availability, disabled, ''))}</div>
      <h3 class="card-subtitle">Days that are different</h3>
      ${dates.length ? html`<div class="exceptions">${dates.map(date => Object.entries(availability.exceptions[date]).map(([key, status]) => html`
        <div class="exception"><span><strong>${longDate(date)}</strong> ${timeLabel(key)}</span>
          <span class="exception-status is-${status}">${status === 'available' ? 'Available' : 'Not available'}</span>
          ${canEdit ? html`<button type="button" class="link danger" data-act="profile-day-remove" data-date="${date}" data-key="${key}">Remove</button>` : ''}</div>`))}</div>`
        : html`<p class="hint">No days added.</p>`}
      ${canEdit ? html`<form class="inline-form exception-form" data-act="profile-day-add">
        <input type="date" name="date" min="${todayISO()}" required aria-label="Date">
        <select name="key" aria-label="Service time"><option value="*">All day</option>${WEEKLY_TIMES.map(([key]) => key).concat(SPECIAL_TIMES).map(key => html`<option value="${key}">${timeLabel(key)}</option>`)}</select>
        <select name="status" aria-label="Available or not"><option value="unavailable">Not available</option><option value="available">Available</option></select>
        <button type="submit" class="ghost">Add day</button></form>` : ''}
    </section>
    ${pastDuties(profile)}
    ${canEdit && changed ? html`<div class="button-row sticky-actions profile-save" role="status">
      <span>Unsaved changes to ${nameOf(profile.memberName)}</span>
      <button type="button" class="primary" data-act="profile-save"${saving ? ' disabled' : ''}>${saving ? 'Saving…' : 'Save changes'}</button>
      <button type="button" class="ghost" data-act="profile-discard"${saving ? ' disabled' : ''}>Discard</button>
    </div>` : ''}`;
}

export function render() {
  const department = managedDepartment();
  if (department === 'All') return departmentList();
  if (ui.departmentView && ui.departmentView.department === department) return memberProfile(department, ui.departmentView.uid);
  return departmentRoster(department);
}

/* ---- actions ---- */

const current = () => ({ department: managedDepartment(), uid: ui.departmentView && ui.departmentView.uid });
const editing = () => canManageDepartment(managedDepartment());

async function copy(text, done) {
  try { await navigator.clipboard.writeText(text); notice(done); }
  catch (_error) { banner('Copy this link: ' + text); }
}

const openProfile = (department, uid) => { ui.departmentView = { department, uid }; redraw(); window.scrollTo({ top: 0 }); };

defineActions({
  'department-open': {
    allowed: el => managedDepartments().includes(el.dataset.department),
    run: el => { if (setManagedDepartment(el.dataset.department)) redraw(); }
  },
  'department-list': {
    allowed: () => managedDepartments().includes('All'),
    run: () => { if (setManagedDepartment('All')) redraw(); }
  },
  'department-retry': el => { loadRoster(el.dataset.department, true); },
  'duty-default': {
    allowed: el => canManageDepartment((departmentOf(el.dataset.duty) || {}).name),
    run: el => saveDutyDefault(el.dataset.duty, el.value)
  },
  'department-member': el => openProfile(managedDepartment(), el.dataset.uid),
  // Unsaved changes stay; the roster marks the member until they are saved or discarded.
  'department-member-back': () => { ui.departmentView = null; redraw(); },
  'department-search': {
    allowed: editing,
    run: form => {
      const query = String(new FormData(form).get('query') || '').trim();
      if (query.length < 2) { notice('Type at least two letters of the name.', true); return; }
      searchMembers(form.dataset.department, query, 1);
    }
  },
  'department-search-page': { allowed: editing, run: el => searchMembers(state.search.department, state.search.query, Number(el.dataset.page)) },
  'department-add': {
    allowed: editing,
    run: async el => {
      const department = el.dataset.department;
      const member = { memberUid: el.dataset.uid, memberName: el.dataset.name };
      const added = await addMember(department, member, { eligibleDuties: dutiesFor(department, servedDuties(department, member.memberName)) });
      // Their profile opens, so the leader checks what they can take.
      if (added && managedDepartment() === department) openProfile(department, added.memberUid);
    }
  },
  'department-add-name': {
    allowed: editing,
    run: el => {
      const item = missingMembers(el.dataset.department, todayISO()).find(entry => entry.name === el.dataset.name);
      if (item) addByName(el.dataset.department, item);
    }
  },
  'department-add-missing': {
    allowed: editing,
    run: async el => {
      const department = el.dataset.department;
      const missing = missingMembers(department, todayISO());
      if (!missing.length || !confirm('Add ' + plural(missing.length, 'person', 'people') + ' to ' + department + ' with the duties shown?')) return;
      state.addingAll = true;
      redraw();
      let added = 0;
      for (const item of missing) if (await addByName(department, item, { quiet: true })) added += 1;
      state.addingAll = false;
      notice(plural(added, 'person', 'people') + ' added to ' + department + '.');
      redraw();
    }
  },
  'department-status': {
    allowed: editing,
    run: el => {
      const { department, uid } = current();
      const profile = draftOf(department, uid);
      if (!profile) return;
      if (el.dataset.status === 'inactive' &&
        !confirm('Make ' + nameOf(profile.memberName) + ' inactive in ' + department + '? Fill and the planner stop offering them. They keep the duties they already have.')) return;
      setStatus(department, uid, el.dataset.status);
    }
  },
  'department-reset-pin': {
    allowed: el => canResetPin(el.dataset.name, managedDepartment()),
    run: el => {
      if (confirm('Reset the PIN for ' + nameOf(el.dataset.name) + '? They sign in with ' + TEMPORARY_PIN + ', then choose a new PIN. Their phones get no alerts until they sign in again.')) resetPin(el.dataset.name);
    }
  },
  'invite-create': { allowed: el => canManageDepartment(el.dataset.department), run: el => createInvite(el.dataset.department) },
  'invite-copy': el => copy(inviteLink(el.dataset.token), 'Invite link copied.'),
  'invite-share': el => {
    navigator.share({ title: 'Join ' + el.dataset.department, text: 'Open this link and sign in to join ' + el.dataset.department + '.', url: inviteLink(el.dataset.token) })
      .catch(() => { /* closed without sharing */ });
  },
  'invite-cancel': {
    allowed: el => canManageDepartment(el.dataset.department),
    run: el => { if (confirm('Cancel this invite link? Anyone who has not used it yet will not be able to.')) cancelInvite(el.dataset.department, el.dataset.token); }
  },
  'profile-duty': {
    allowed: editing,
    run: el => {
      const { department, uid } = current();
      const duties = draftOf(department, uid).eligibleDuties.filter(duty => duty.toLowerCase() !== el.dataset.duty.toLowerCase());
      editDraft(department, uid, { eligibleDuties: el.checked ? duties.concat(el.dataset.duty) : duties });
    }
  },
  'profile-schedulable': { allowed: editing, run: el => { const { department, uid } = current(); editDraft(department, uid, { schedulable: el.checked }); } },
  'profile-week': {
    allowed: editing,
    run: el => { const { department, uid } = current(); editAvailability(department, uid, { week: el.dataset.key, value: el.value === 'available' ? 'available' : 'unavailable' }); }
  },
  'profile-day-add': {
    allowed: editing,
    run: form => {
      const values = new FormData(form);
      const date = String(values.get('date') || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const { department, uid } = current();
      editAvailability(department, uid, { day: date, key: String(values.get('key')), status: String(values.get('status')) });
    }
  },
  'profile-day-remove': {
    allowed: editing,
    run: el => { const { department, uid } = current(); editAvailability(department, uid, { remove: el.dataset.date, key: el.dataset.key }); }
  },
  'profile-save': { allowed: editing, run: () => { const { department, uid } = current(); saveProfile(department, uid); } },
  'profile-discard': () => { const { department, uid } = current(); dropDraft(department, uid); }
});

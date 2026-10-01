/* Manage, Departments. A leader sees their department's roster: add members
   by name or with an invite link, archive or restore them, reset a PIN, and
   open a member to set the duties they can take, whether they can be
   scheduled, and when they are available. */
import { html, plural } from '../../html.js';
import { defineActions } from '../../actions.js';
import { ui, nameOf } from '../../store.js';
import { render as redraw } from '../../render.js';
import { notice } from '../../ui/banners.js';
import { empty } from '../../ui/components.js';
import { SERVICE_LABELS, departmentNamed, dutyName } from '../../config/duties.js';
import { isLeaderProfile, normalizeAvailability, timeKey, timeLabel } from '../../lib/availability.js';
import { longDate, todayISO, shortDate } from '../../lib/dates.js';
import { managedDepartments, canManageDepartment, canResetPin, leadersOf } from '../../services/access.js';
import {
  departments as state, roster, loadRoster, draftOf, hasDraft, editDraft, dropDraft, saveProfile, setStatus,
  searchMembers, addMember, resetPin, createInvite, cancelInvite, activeInvites, inviteLink
} from '../../services/departments.js';
import { managedDepartment } from './index.js';

/* ---- all departments ---- */

function departmentList() {
  const names = managedDepartments().filter(name => name !== 'All');
  return html`<div class="department-grid">${names.map(name => {
    const department = departmentNamed(name);
    const loaded = state.rosters[name];
    const leaders = leadersOf(name);
    return html`<article class="card department-card" style="--dept: ${department ? department.color : 'currentColor'}">
      <h3>${name}</h3>
      <p class="hint">${loaded ? plural(loaded.length, 'member') : 'Open to see the members'}</p>
      <p class="hint"><strong>Leaders:</strong> ${leaders.length ? leaders.map(nameOf).join(', ') : 'none set'}</p>
      <button type="button" class="primary" data-act="department-open" data-department="${name}">Open</button>
    </article>`;
  })}</div>`;
}

/* ---- one department ---- */

function searchPanel(department) {
  const search = state.search && state.search.department === department ? state.search : null;
  const pages = search ? Math.max(1, Math.ceil(search.total / 10)) : 1;
  let results = '';
  if (search && search.busy) results = html`<p class="hint">Searching…</p>`;
  else if (search && search.error) results = html`<p class="form-error">${search.error}</p>`;
  else if (search && search.done && !search.members.length) results = html`<p class="hint">No member has that name. Check the spelling. Someone who has never signed in cannot be added yet.</p>`;
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
    <form class="inline-form" data-act="department-search" data-department="${department}">
      <input type="search" name="query" minlength="2" maxlength="80" placeholder="Type at least two letters of their name" aria-label="Member name" value="${search ? search.query : ''}" required>
      <button type="submit" class="primary"${search && search.busy ? ' disabled' : ''}>Search</button>
    </form>
    ${results}
    <h3 class="card-subtitle">Invite link</h3>
    <p class="hint">Send a link instead. Whoever opens it and signs in joins ${department}. A link works for 7 days and only once.</p>
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

function memberRow(department, profile, canEdit) {
  const summary = [profile.schedulable ? 'Can be scheduled' : 'Not scheduled',
    plural(profile.eligibleDuties.length, 'duty', 'duties')].join(' · ');
  return html`<div class="member-row${profile.status === 'inactive' ? ' is-inactive' : ''}">
    <button type="button" class="member-open" data-act="department-member" data-uid="${profile.memberUid}">
      <span class="member-name">${nameOf(profile.memberName)}</span>${isLeaderProfile(profile) ? html`<span class="tag">Leader</span>` : ''}
      <span class="hint">${summary}</span>
    </button>
    <div class="button-row">
      ${canEdit ? html`<button type="button" class="ghost small" data-act="department-status" data-uid="${profile.memberUid}"
        data-status="${profile.status === 'active' ? 'inactive' : 'active'}">${profile.status === 'active' ? 'Archive' : 'Restore'}</button>` : ''}
      ${canResetPin(profile.memberName, department) ? html`<button type="button" class="ghost small" data-act="department-reset-pin" data-name="${profile.memberName}">Reset PIN</button>` : ''}
    </div>
  </div>`;
}

function departmentRoster(department) {
  loadRoster(department);
  const canEdit = canManageDepartment(department);
  const back = managedDepartments().length > 1 ? html`<button type="button" class="link" data-act="department-list">All departments</button>` : '';
  if (state.loading[department]) return html`${back}${empty('Loading the ' + department + ' roster…')}`;
  if (state.errors[department]) {
    return html`${back}<section class="card"><p class="form-error">${state.errors[department]}</p>
      <button type="button" class="primary" data-act="department-retry" data-department="${department}">Try again</button></section>`;
  }
  const people = roster(department);
  const active = people.filter(profile => profile.status === 'active');
  const archived = people.filter(profile => profile.status !== 'active');
  return html`${back}
    <h2 class="screen-title">${department}</h2>
    <p class="hint"><strong>Leaders:</strong> ${leadersOf(department).map(nameOf).join(', ') || 'none set'}</p>
    ${canEdit ? searchPanel(department) : ''}
    <h3 class="section-heading">Members <span class="count">${active.length}</span></h3>
    ${active.length ? html`<div class="list">${active.map(profile => memberRow(department, profile, canEdit))}</div>` : empty('No members yet.')}
    ${archived.length ? html`<h3 class="section-heading">Archived <span class="count">${archived.length}</span></h3>
      <div class="list">${archived.map(profile => memberRow(department, profile, canEdit))}</div>` : ''}`;
}

/* ---- one member ---- */

function lastChange(profile) {
  const when = Number(profile.updatedAt);
  if (!when) return '';
  const who = profile.updatedBy && !/^member:|^[A-Za-z0-9_-]{20,}$/.test(profile.updatedBy) ? nameOf(profile.updatedBy) : '';
  return html`<p class="hint small">Last changed${who ? ' by ' + who : ''} on ${new Date(when).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.</p>`;
}

function pastDuties(profile) {
  const seed = profile.historySeed || profile.provenance;
  const entries = seed && Array.isArray(seed.evidence) ? seed.evidence : (Array.isArray(profile.history) ? profile.history : []);
  if (!entries.length) return '';
  return html`<section class="card">
    <h3 class="card-subtitle">Duties served before</h3>
    <p class="hint">From the schedule history. Use it to pick the duties above.</p>
    <ul class="plain-list">${entries.map(entry => html`<li><strong>${entry.duty || entry.role || 'Duty'}</strong>
      ${[entry.service, entry.date && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) ? longDate(entry.date) : entry.date].filter(Boolean).join(' · ')}</li>`)}</ul>
  </section>`;
}

function memberProfile(department, uid) {
  const profile = draftOf(department, uid);
  if (!profile) { ui.departmentView = null; return departmentRoster(department); }
  const canEdit = canManageDepartment(department);
  const duties = (departmentNamed(department) || { duties: [] }).duties;
  const availability = normalizeAvailability(profile.availability);
  const dates = Object.keys(availability.exceptions).sort().filter(date => date >= todayISO());
  const disabled = canEdit ? '' : ' disabled';
  const changed = hasDraft(department, uid);
  return html`<button type="button" class="link" data-act="department-member-back">Back to ${department}</button>
    <h2 class="screen-title">${nameOf(profile.memberName)} <span class="status status-${profile.status === 'active' ? 'approved' : 'declined'}">${profile.status === 'active' ? 'Active' : 'Archived'}</span></h2>
    ${lastChange(profile)}
    <section class="card">
      <h3 class="card-subtitle">Duties they can take</h3>
      <div class="check-grid">${duties.map(duty => html`<label class="check"><input type="checkbox" data-change="profile-duty" data-duty="${duty}"
        ${profile.eligibleDuties.some(item => item.toLowerCase() === duty.toLowerCase()) ? ' checked' : ''}${disabled}> ${dutyName(duty)}</label>`)}</div>
      <label class="switch-row"><span><strong>Can be scheduled</strong><small>Show them as a choice when filling duties.</small></span>
        <input type="checkbox" role="switch" data-change="profile-schedulable"${profile.schedulable ? ' checked' : ''}${disabled}></label>
    </section>
    <section class="card">
      <h3 class="card-subtitle">Every week</h3>
      <div class="availability-grid">${SERVICE_LABELS.map(label => {
        const key = timeKey(label), on = availability.recurring[key] === 'available';
        return html`<label class="availability-row"><span>${label}</span><select data-change="profile-week" data-key="${key}"${disabled}>
          <option value="available"${on ? ' selected' : ''}>Available</option><option value="unavailable"${on ? '' : ' selected'}>Not available</option></select></label>`;
      })}</div>
      <h3 class="card-subtitle">Days that are different</h3>
      ${dates.length ? html`<div class="exceptions">${dates.map(date => Object.entries(availability.exceptions[date]).map(([key, status]) => html`
        <div class="exception"><span><strong>${longDate(date)}</strong> ${timeLabel(key)}</span>
          <span class="exception-status is-${status}">${status === 'available' ? 'Available' : 'Not available'}</span>
          ${canEdit ? html`<button type="button" class="link danger" data-act="profile-day-remove" data-date="${date}" data-key="${key}">Remove</button>` : ''}</div>`))}</div>`
        : html`<p class="hint">No days added.</p>`}
      ${canEdit ? html`<form class="inline-form exception-form" data-act="profile-day-add">
        <input type="date" name="date" min="${todayISO()}" required aria-label="Date">
        <select name="key" aria-label="Service time"><option value="*">All services that day</option>${SERVICE_LABELS.map(label => html`<option value="${timeKey(label)}">${label}</option>`)}</select>
        <select name="status" aria-label="Available or not"><option value="unavailable">Not available</option><option value="available">Available</option></select>
        <button type="submit" class="ghost">Add day</button></form>` : ''}
    </section>
    ${pastDuties(profile)}
    ${canEdit ? html`<div class="button-row sticky-actions">
      <button type="button" class="primary" data-act="profile-save"${changed ? '' : ' disabled'}>Save changes</button>
      ${changed ? html`<button type="button" class="ghost" data-act="profile-discard">Discard changes</button>` : ''}
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

function changeAvailability(update) {
  const { department, uid } = current();
  const profile = draftOf(department, uid);
  const availability = normalizeAvailability(profile.availability);
  update(availability);
  editDraft(department, uid, { availability });
}

async function copy(text, done) {
  try { await navigator.clipboard.writeText(text); notice(done); }
  catch (_error) { notice('Copy this link: ' + text); }
}

defineActions({
  'department-open': {
    allowed: el => managedDepartments().includes(el.dataset.department),
    run: el => { ui.manageDepartment = el.dataset.department; ui.departmentView = null; redraw(); }
  },
  'department-list': () => { ui.manageDepartment = managedDepartments()[0] || ''; ui.departmentView = null; redraw(); },
  'department-retry': el => { loadRoster(el.dataset.department, true); },
  'department-member': el => { ui.departmentView = { department: managedDepartment(), uid: el.dataset.uid }; redraw(); window.scrollTo({ top: 0 }); },
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
    run: el => addMember(el.dataset.department, { memberUid: el.dataset.uid, memberName: el.dataset.name })
  },
  'department-status': { allowed: editing, run: el => setStatus(managedDepartment(), el.dataset.uid, el.dataset.status) },
  'department-reset-pin': {
    allowed: el => canResetPin(el.dataset.name, managedDepartment()),
    run: el => { if (confirm('Reset the PIN for ' + nameOf(el.dataset.name) + '?')) resetPin(el.dataset.name); }
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
    run: el => changeAvailability(availability => { availability.recurring[el.dataset.key] = el.value === 'available' ? 'available' : 'unavailable'; })
  },
  'profile-day-add': {
    allowed: editing,
    run: form => {
      const values = new FormData(form);
      const date = String(values.get('date') || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      changeAvailability(availability => {
        availability.exceptions[date] = Object.assign({}, availability.exceptions[date], { [values.get('key')]: values.get('status') });
      });
    }
  },
  'profile-day-remove': {
    allowed: editing,
    run: el => changeAvailability(availability => {
      const day = availability.exceptions[el.dataset.date];
      if (!day) return;
      delete day[el.dataset.key];
      if (!Object.keys(day).length) delete availability.exceptions[el.dataset.date];
    })
  },
  'profile-save': { allowed: editing, run: () => { const { department, uid } = current(); saveProfile(department, uid); } },
  'profile-discard': () => { const { department, uid } = current(); dropDraft(department, uid); }
});

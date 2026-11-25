/* Manage, Leaders: who leads each department, and who may edit choir songs.
   A new leader chooses a new PIN the next time they sign in. */
import { html } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, nameOf, canonical } from '../../store.js';
import { renderSoon } from '../../render.js';
import { notice } from '../../ui/banners.js';
import { memberOptions } from '../../ui/components.js';
import { DEPARTMENTS } from '../../config/duties.js';
import { byTitle } from '../../lib/names.js';
import { call, problem } from '../../firebase.js';
import { canManageLeaders, isAdmin, leadersOf } from '../../services/access.js';

import { resetPin } from '../../services/departments.js';

function songEditors() {
  const config = data.leaderConfig || window.WorshipDutyPermissions.DEFAULT_PERMISSION_CONFIG;
  return Array.isArray(config.songEditors) ? config.songEditors : [];
}

function roleBlock(title, names, role, department, hint) {
  const others = data.members.filter(name => !names.includes(name)).sort(byTitle);
  return html`<section class="card">
    <h3 class="card-subtitle">${title}</h3>
    ${hint ? html`<p class="hint">${hint}</p>` : ''}
    ${names.length ? html`<div class="list">${names.map(name => html`<div class="list-row"><span>${nameOf(name)}</span>
      <button type="button" class="link danger" data-act="role-remove" data-role="${role}" data-department="${department}" data-name="${name}">Remove</button></div>`)}</div>`
      : html`<p class="hint">No one yet.</p>`}
    <form class="inline-form" data-act="role-add" data-role="${role}" data-department="${department}">
      <select name="name" aria-label="Add to ${title}" required>${memberOptions(others)}</select>
      <button type="submit" class="ghost">Add</button>
    </form>
  </section>`;
}

function accountRecovery() {
  if (!isAdmin()) return '';
  return html`<section class="card">
    <h3 class="card-subtitle">Member sign-in</h3>
    <form class="inline-form" data-act="account-issue-pin">
      <select name="name" aria-label="Member receiving a temporary PIN" required>${memberOptions([...data.members].sort(byTitle))}</select>
      <button type="submit" class="ghost">Issue temporary PIN</button>
    </form>
  </section>`;
}

export function render() {
  return html`${accountRecovery()}${DEPARTMENTS.map(department => roleBlock(department.name + ' leaders', leadersOf(department.name), 'departmentLeader', department.name, ''))}
    ${roleBlock('Choir song editors', songEditors(), 'songEditor', '', 'They can change choir songs and plan songs for any service. They do not get other leader rights.')}`;
}

/* "a Worship leader", "a choir song editor" */
const roleName = (role, department) => role === 'songEditor' ? 'a choir song editor' : 'a ' + department + ' leader';

async function saveRole(role, department, name, enabled) {
  const memberName = canonical(name);
  if (!memberName) return;
  try {
    const result = await call('updateRoleConfiguration', { roleType: role, department, memberName, enabled });
    if (result && result.config) data.leaderConfig = result.config;
    // A role change signs the member out of their role until they sign in again with a new PIN.
    notice(enabled ? nameOf(memberName) + ' is ' + roleName(role, department) + ' now. They sign in again and choose a new PIN.'
      : nameOf(memberName) + ' is no longer ' + roleName(role, department) + '.');
  } catch (error) {
    notice('That was not saved: ' + problem(error), true);
  }
  renderSoon();
}

defineActions({
  'account-issue-pin': {
    allowed: () => isAdmin(),
    run: form => resetPin(canonical(new FormData(form).get('name')))
  },
  'role-add': { allowed: () => canManageLeaders(), run: form => saveRole(form.dataset.role, form.dataset.department, new FormData(form).get('name'), true) },
  'role-remove': {
    allowed: () => canManageLeaders(),
    run: el => {
      if (confirm('Remove ' + nameOf(el.dataset.name) + ' as ' + roleName(el.dataset.role, el.dataset.department) + '?')) saveRole(el.dataset.role, el.dataset.department, el.dataset.name, false);
    }
  }
});

/* View as, inside My Duties for an administrator: pick a member and the app
   shows itself the way they see it, with changes off (services/view-as.js).
   The account menu's item, and the banner, lead back. */
import { html } from '../html.js';
import { defineActions } from '../actions.js';
import { data, nameOf } from '../store.js';
import { goTo } from '../render.js';
import { canViewAs, viewingAs, roleOf, startViewAs, stopViewAs, realMember } from '../services/view-as.js';

const GROUPS = [['department leader', 'Department leaders'], ['song editor', 'Song editors'], ['member', 'Members'], ['administrator', 'Administrators']];

export function render() {
  const me = realMember().memberName;
  const people = data.members.filter(name => name !== me).slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const roles = new Map(people.map(name => [name, roleOf(name)]));
  return html`<section class="card">
    <p class="hint">See the app the way another member sees it: their duties, their tabs and what Manage shows them. Nothing can be changed while you look, and nothing is sent to them.</p>
    <form class="inline-form" data-act="view-as-start">
      <select name="member" aria-label="Member to view as" required>
        <option value="">Choose a member</option>
        ${GROUPS.map(([role, label]) => {
          const names = people.filter(name => roles.get(name) === role);
          return names.length ? html`<optgroup label="${label}">${names.map(name => html`<option value="${name}"${name === viewingAs() ? ' selected' : ''}>${nameOf(name)}</option>`)}</optgroup>` : '';
        })}
      </select>
      <button type="submit" class="primary">View as</button>
    </form>
    ${viewingAs() ? html`<button type="button" class="ghost" data-act="view-as-stop">Back to me</button>` : ''}
  </section>`;
}

defineActions({
  'view-as-menu': {
    allowed: canViewAs,
    run: () => {
      if (viewingAs()) { stopViewAs(); goTo('schedule', { asked: true }); }
      else goTo('my', { account: 'view-as' });
    }
  },
  'view-as-start': {
    allowed: canViewAs,
    run: form => {
      const name = String(new FormData(form).get('member') || '');
      if (startViewAs(name)) goTo('schedule', { asked: true });
    }
  },
  'view-as-stop': {
    allowed: canViewAs,
    run: () => { stopViewAs(); goTo('schedule', { asked: true }); }
  }
});

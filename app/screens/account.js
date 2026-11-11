/* The account menu's views, shown inside My Duties: Availability,
   Settings, and View as for an administrator (screens/view-as.js).
   Availability: one weekly pattern and one list of days that are different,
   saved to every department the member belongs to. Nothing is stored until
   Save: a bar says so meanwhile, and leaving the view asks first. Duties the
   member can no longer make are flagged for their leader to fill.
   Settings: notifications, the calendar link, and the PIN. */
import { html } from '../html.js';
import { defineActions } from '../actions.js';
import { ui } from '../store.js';
import { render as redraw, setLeaveGuard } from '../render.js';
import { empty } from '../ui/components.js';
import { accountView, ACCOUNT_VIEWS } from '../ui/header.js';
import { notifyControls } from './my-duties.js';
import * as viewAs from './view-as.js';
import { viewingAs, canViewAs } from '../services/view-as.js';
import { pinForm } from './lock.js';
import { SERVICE_LABELS } from '../config/duties.js';
import { departments, loadOwnProfiles } from '../services/rosters.js';
import { saveOwnAvailability } from '../services/departments.js';
import { normalizeAvailability, timeKey, timeLabel } from '../lib/availability.js';
import { longDate, todayISO } from '../lib/dates.js';

/* The regular services behind each weekly row (functions/service-year.js
   adds them for the year). The other times are held on feast days and
   special occasions only. Availability is stored by time of day, so a row
   also covers that time on a feast day. */
const WEEKLY = { Morning: 'Saturdays', Afternoon: 'Saturdays', Evening: 'Saturdays and Tuesdays' };

function listText(items) {
  return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

/* ---- availability ---- */

/* The member's availability as shown, with any changes not saved yet.
   Unchanged, it follows the saved record. Changes belong to the member who
   made them: a draft left on this device by someone else is dropped, never
   shown or saved. */
function draft() {
  const held = ui.availabilityDraft;
  if (!held || held.owner !== ui.me || !ui.availabilityChanged) {
    const first = (departments.own || [])[0];
    ui.availabilityDraft = { owner: ui.me, availability: normalizeAvailability(first && first.availability) };
    ui.availabilityChanged = false;
  }
  return ui.availabilityDraft.availability;
}

function unsaved() {
  return !!ui.availabilityChanged && !!ui.availabilityDraft && ui.availabilityDraft.owner === ui.me;
}

function discard() {
  ui.availabilityDraft = null;
  ui.availabilityChanged = false;
}

/* Departments whose saved times differ from the first one's, which is what
   the page starts from. */
function differing() {
  const own = departments.own || [];
  const text = profile => JSON.stringify(normalizeAvailability(profile.availability));
  return own.filter(profile => text(profile) !== text(own[0])).map(profile => profile.departmentId);
}

function weekRow(current, label) {
  const key = timeKey(label);
  const on = current.recurring[key] !== 'unavailable';
  return html`<label class="availability-row"><span class="availability-label">${label}${WEEKLY[label] ? html`<small>${WEEKLY[label]}</small>` : ''}</span>
    <select data-change="availability-week" data-key="${key}">
      <option value="available"${on ? ' selected' : ''}>Available</option>
      <option value="unavailable"${on ? '' : ' selected'}>Not available</option>
    </select></label>`;
}

const dayLabel = key => key === '*' ? 'All day' : timeLabel(key);

function availability() {
  // Availability belongs to the member's own sign-in, which View as does not have.
  if (viewingAs()) return html`<section class="card"><p class="hint">A member's availability is not shown while you view as them. Open it from Manage, Departments.</p></section>`;
  if (!departments.own && !departments.ownLoading) loadOwnProfiles();
  if (!departments.own) {
    return departments.ownError
      ? html`<section class="card"><p class="form-error">${departments.ownError}</p><button type="button" class="primary" data-act="availability-retry">Try again</button></section>`
      : empty('Loading your availability…');
  }
  if (!departments.own.length) {
    return html`<section class="card"><p class="hint">You are not on a department roster yet, so there is nothing to set. Your department leader adds you.</p></section>`;
  }
  const current = draft();
  const names = departments.own.map(profile => profile.departmentId);
  const others = differing();
  const dates = Object.keys(current.exceptions).sort().filter(date => date >= todayISO());
  return html`<section class="card availability">
    <p class="hint">Applies to ${listText(names)}. Your leaders see the same record.</p>
    ${others.length ? html`<p class="hint warn">This page shows your times for ${names[0]}. ${listText(others)} ${others.length === 1 ? 'has' : 'have'} different times saved. Saving uses these times for all your departments.</p>` : ''}
    <h3 class="card-subtitle">Every week</h3>
    <p class="hint">Not available keeps you off every one of these services, feast days included. To miss one date, add it under Days that are different.</p>
    <div class="availability-grid">${SERVICE_LABELS.filter(label => WEEKLY[label]).map(label => weekRow(current, label))}</div>
    <h3 class="card-subtitle">Feast days and special services</h3>
    <div class="availability-grid">${SERVICE_LABELS.filter(label => !WEEKLY[label]).map(label => weekRow(current, label))}</div>
    <h3 class="card-subtitle">Days that are different</h3>
    <p class="hint">A day here overrides the weekly pattern for that date.</p>
    ${dates.length ? html`<div class="exceptions">${dates.map(date => Object.entries(current.exceptions[date]).map(([key, status]) => html`
      <div class="exception"><span><strong>${longDate(date)}</strong> ${dayLabel(key)}</span>
        <span class="exception-status is-${status}">${status === 'available' ? 'Available' : 'Not available'}</span>
        <button type="button" class="link danger" data-act="availability-remove" data-date="${date}" data-key="${key}">Remove</button></div>`))}</div>`
      : html`<p class="hint">No days added.</p>`}
    <form class="inline-form exception-form" data-act="availability-add">
      <input type="date" name="date" min="${todayISO()}" required aria-label="Date">
      <select name="key" aria-label="Service time"><option value="*">All day</option>
        ${SERVICE_LABELS.map(label => html`<option value="${timeKey(label)}">${label}</option>`)}</select>
      <select name="status" aria-label="Available or not"><option value="unavailable">Not available</option><option value="available">Available</option></select>
      <button type="submit" class="ghost">Add day</button>
    </form>
    ${unsaved() ? html`<div class="sticky-actions availability-unsaved">
      <p class="availability-unsaved-text">Unsaved changes. Save them to tell your leaders.</p>
      <div class="button-row">
        <button type="button" class="primary" data-act="availability-save">Save availability</button>
        <button type="button" class="ghost" data-act="availability-discard">Discard changes</button>
      </div>
    </div>` : ''}
  </section>`;
}

/* ---- settings ---- */

function pinCard() {
  const open = !!ui.expanded['change-pin'];
  return html`<section class="card account-pin"><h3 class="card-subtitle">PIN</h3>
    ${open
      ? html`<p class="hint">Pick a PIN of 4 to 6 digits that only you know.</p>
        ${pinForm(html`<button type="button" class="ghost" data-act="pin-cancel">Cancel</button>`)}`
      : html`<p class="hint">If you still sign in with the PIN you were first given, change it to one only you know.</p>
        <button type="button" class="ghost" data-act="pin-open">Change your PIN</button>`}
    <p class="hint small">Forgot your PIN? Your department leader or an administrator can reset it to 0000. You then choose a new one when you sign in.</p>
  </section>`;
}

function settings() {
  const controls = notifyControls();
  return html`
    <section class="card"><h3 class="card-subtitle">Notifications and calendar</h3>
      ${controls || html`<p class="hint">Notifications and the calendar link are turned off for everyone right now.</p>`}</section>
    ${pinCard()}`;
}

export function render() {
  const view = accountView();
  return html`<div class="account-view">
    <h2 class="screen-title" tabindex="-1">${ACCOUNT_VIEWS[view] || 'Settings'}</h2>
    ${view === 'availability' ? availability() : view === 'view-as' && canViewAs() ? viewAs.render() : settings()}
  </div>`;
}

function change(update) {
  const current = draft();
  update(current);
  ui.availabilityChanged = true;
  redraw();
}

/* Leaving Availability with changes not saved asks first (tabs, swipes,
   the logo, the account menu, signing out); leaving anyway drops them. A
   reload or closing the app asks through the browser. */
setLeaveGuard((_tab, options = {}) => {
  if (!unsaved() || accountView() !== 'availability' || options.account === 'availability') return true;
  if (!confirm('Your availability changes are not saved. Leave without saving them?')) return false;
  discard();
  return true;
});
window.addEventListener('beforeunload', event => {
  if (!unsaved()) return;
  event.preventDefault();
  event.returnValue = '';
});

defineActions({
  'availability-week': el => change(current => { current.recurring[el.dataset.key] = el.value === 'available' ? 'available' : 'unavailable'; }),
  'availability-add': form => {
    const values = new FormData(form);
    const date = String(values.get('date') || ''), key = String(values.get('key') || '*'), status = String(values.get('status'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    change(current => { current.exceptions[date] = Object.assign({}, current.exceptions[date], { [key]: status }); });
  },
  'availability-remove': el => change(current => {
    const day = current.exceptions[el.dataset.date];
    if (!day) return;
    delete day[el.dataset.key];
    if (!Object.keys(day).length) delete current.exceptions[el.dataset.date];
  }),
  'availability-save': async () => {
    if (!await saveOwnAvailability(draft())) return;
    discard();
    redraw();
  },
  'availability-discard': () => { discard(); redraw(); },
  'availability-retry': () => { departments.ownError = ''; loadOwnProfiles(true); },
  'pin-open': () => { ui.expanded['change-pin'] = true; ui.signIn.error = ''; redraw(); },
  'pin-cancel': () => { ui.expanded['change-pin'] = false; ui.signIn.error = ''; redraw(); }
});

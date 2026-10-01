/* The account menu's two views, shown inside My Duties.
   Availability: one weekly pattern and one list of dates off, saved to every
   department the member belongs to. Duties the member can no longer make are
   flagged for their leader to fill.
   Settings: notifications, the calendar link, the appearance, and PIN help. */
import { html } from '../html.js';
import { defineActions } from '../actions.js';
import { ui } from '../store.js';
import { render as redraw } from '../render.js';
import { empty } from '../ui/components.js';
import { accountView } from '../ui/header.js';
import { notifyControls } from './my-duties.js';
import { SERVICE_LABELS } from '../config/duties.js';
import { departments, loadOwnProfiles, saveOwnAvailability } from '../services/departments.js';
import { normalizeAvailability, timeKey, timeLabel } from '../lib/availability.js';
import { longDate, todayISO } from '../lib/dates.js';

function draft() {
  if (!ui.availabilityDraft) {
    const first = (departments.own || [])[0];
    ui.availabilityDraft = normalizeAvailability(first && first.availability);
  }
  return ui.availabilityDraft;
}

function differs() {
  const own = departments.own || [];
  const text = profile => JSON.stringify(normalizeAvailability(profile.availability));
  return own.length > 1 && own.some(profile => text(profile) !== text(own[0]));
}

function availability() {
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
  const changed = ui.availabilityChanged;
  const dates = Object.keys(current.exceptions).sort().filter(date => date >= todayISO());
  return html`<section class="card availability">
    <p class="hint">Saved for ${departments.own.map(profile => profile.departmentId).join(', ')}. Your leaders see the same record.</p>
    ${differs() && !changed ? html`<p class="hint warn">Your departments have different times saved. Saving uses these for all of them.</p>` : ''}
    <h3 class="card-subtitle">Every week</h3>
    <div class="availability-grid">${SERVICE_LABELS.map(label => {
      const key = timeKey(label);
      const on = current.recurring[key] !== 'unavailable';
      return html`<label class="availability-row"><span>${label}</span>
        <select data-change="availability-week" data-key="${key}">
          <option value="available"${on ? ' selected' : ''}>Available</option>
          <option value="unavailable"${on ? '' : ' selected'}>Not available</option>
        </select></label>`;
    })}</div>
    <h3 class="card-subtitle">Days that are different</h3>
    <p class="hint">A day here overrides the weekly pattern for that date.</p>
    ${dates.length ? html`<div class="exceptions">${dates.map(date => Object.entries(current.exceptions[date]).map(([key, status]) => html`
      <div class="exception"><span><strong>${longDate(date)}</strong> ${timeLabel(key)}</span>
        <span class="exception-status is-${status}">${status === 'available' ? 'Available' : 'Not available'}</span>
        <button type="button" class="link danger" data-act="availability-remove" data-date="${date}" data-key="${key}">Remove</button></div>`))}</div>`
      : html`<p class="hint">No days added.</p>`}
    <form class="inline-form exception-form" data-act="availability-add">
      <input type="date" name="date" min="${todayISO()}" required aria-label="Date">
      <select name="key" aria-label="Service time"><option value="*">All services that day</option>
        ${SERVICE_LABELS.map(label => html`<option value="${timeKey(label)}">${label}</option>`)}</select>
      <select name="status" aria-label="Available or not"><option value="unavailable">Not available</option><option value="available">Available</option></select>
      <button type="submit" class="ghost">Add day</button>
    </form>
    <div class="button-row">
      <button type="button" class="primary" data-act="availability-save"${changed ? '' : ' disabled'}>Save availability</button>
      ${changed ? html`<button type="button" class="ghost" data-act="availability-discard">Discard changes</button>` : ''}
    </div>
  </section>`;
}

function settings() {
  const controls = notifyControls();
  return html`
    <section class="card"><h3 class="card-subtitle">Notifications and calendar</h3>
      ${controls || html`<p class="hint">Notifications and the calendar link are turned off for everyone right now.</p>`}</section>
    <section class="card"><h3 class="card-subtitle">Appearance</h3>
      <p class="hint">Choose how the app looks on this device. The schedule stays the same.</p>
      <button type="button" class="ghost" data-act="appearance-open">Change appearance</button></section>
    <section class="card"><h3 class="card-subtitle">PIN</h3>
      <p class="hint">To change your PIN, ask your department leader or an administrator to reset it. You choose a new one the next time you sign in.</p></section>`;
}

export function render() {
  const view = accountView();
  return html`<div class="account-view">
    <h2 class="screen-title" tabindex="-1">${view === 'availability' ? 'Availability' : 'Settings'}</h2>
    ${view === 'availability' ? availability() : settings()}
  </div>`;
}

function change(update) {
  const current = draft();
  update(current);
  ui.availabilityChanged = true;
  redraw();
}

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
    ui.availabilityDraft = null;
    ui.availabilityChanged = false;
    redraw();
  },
  'availability-discard': () => { ui.availabilityDraft = null; ui.availabilityChanged = false; redraw(); },
  'availability-retry': () => { departments.ownError = ''; loadOwnProfiles(true); }
});

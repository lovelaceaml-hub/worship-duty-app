/* My Duties: the signed-in member's upcoming duties, one card per day. A
   member can ask for a change to a duty, open the song planner for a
   Presider duty, and see everyone else serving at the same service. */
import { html, raw, plural } from '../html.js';
import { defineActions } from '../actions.js';
import { data, ui, feature, canonical } from '../store.js';
import { render as redraw, goTo } from '../render.js';
import { notice } from '../ui/banners.js';
import { dutyGroups, statusChip, empty } from '../ui/components.js';
import { dutiesOf, upcoming, serviceId } from '../lib/services.js';
import { longDate, clockTime, dayBadge, dayOfMonth, weekdayShort, shortDate } from '../lib/dates.js';
import { openRequestFor, shownStatus } from '../lib/requests.js';
import { sendRequest } from '../services/requests.js';
import { recentUpdates, clearRecentUpdates, notificationsOn, turnOn, turnOff } from '../services/notifications.js';
import { canEditSongsFor } from '../services/access.js';
import { dutyName } from '../config/duties.js';

const SWAP_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4 3 8l4 4"/><path d="M3 8h13"/><path d="m17 20 4-4-4-4"/><path d="M21 16H8"/></svg>';

/* ---- notifications and calendar (also in Settings) ---- */

function calendarUrl(scheme) {
  return scheme + '//' + location.host + '/ics/' + encodeURIComponent(canonical(ui.me));
}

export function notifyControls() {
  const canNotify = 'Notification' in window && (feature('notifications') || feature('reminders'));
  const calendar = feature('calendarExport');
  if (!canNotify && !calendar) return '';
  return html`<div class="button-row">
      ${canNotify ? (notificationsOn()
        ? html`<button type="button" class="ghost is-on" data-act="notify-off">Notifications on</button>`
        : html`<button type="button" class="primary" data-act="notify-on">Turn on notifications</button>`) : ''}
      ${calendar ? html`<button type="button" class="ghost" data-act="calendar-subscribe">Add my duties to my calendar</button>` : ''}
    </div>
    <details class="help">
      <summary>How this works</summary>
      <p>${canNotify ? 'With notifications on, you hear when a duty is added for you and get a reminder the day before. ' : ''}${calendar
        ? 'The calendar link keeps your phone calendar in step with the schedule, so a moved service updates by itself.' : ''}</p>
      ${calendar ? html`<p>On Android, copy the link and add it in Google Calendar under Other calendars, From URL.</p>
        <button type="button" class="ghost small" data-act="calendar-copy">Copy calendar link</button>` : ''}
    </details>`;
}

/* ---- songs for a Presider duty ---- */

export function songState(id) {
  const setlist = data.setlists[id];
  if (!setlist) return null;
  const count = (setlist.songs || []).length;
  const confirmedAt = setlist.confirmedAt || 0, updatedAt = setlist.updatedAt || 0;
  return { count, confirmed: !!(count && confirmedAt && confirmedAt >= updatedAt), changed: !!(count && confirmedAt && confirmedAt < updatedAt) };
}

function songTag(id) {
  const state = songState(id);
  if (!state || !state.count) return '';
  const songs = plural(state.count, 'song');
  if (state.confirmed) return html`<span class="tag is-done">Songs confirmed</span>`;
  return html`<span class="tag">${songs}${state.changed ? ', confirm again' : ', not confirmed'}</span>`;
}

function songPrompt(duties) {
  const first = duties.find(item => item.duty === 'Presider');
  if (!feature('songPicker') || !first) return '';
  const id = serviceId(first.service);
  const state = songState(id);
  const [label, note] = state && state.confirmed ? ['See your songs', 'Your songs for ' + shortDate(first.service.date) + ' are confirmed.']
    : state && state.changed ? ['Confirm your songs again', 'You changed the songs after confirming them.']
      : state && state.count ? ['Finish your songs', 'You picked ' + plural(state.count, 'song') + ' but have not confirmed them.']
        : ['Plan your songs', 'You preside on ' + shortDate(first.service.date) + '. Pick the songs for that service.'];
  return html`<section class="song-prompt">
    <p class="hint">${note}</p>
    <button type="button" class="primary" data-act="open-songs" data-service="${id}">${label}</button>
  </section>`;
}

/* ---- change requests ---- */

function requestControl(item) {
  if (!feature('changeRequests')) return '';
  const id = serviceId(item.service);
  if (openRequestFor(data.requests, data.services, id, item.duty, ui.me)) return html`<span class="tag">Change asked</span>`;
  const key = id + ':' + item.duty;
  if (ui.requestDraft && ui.requestDraft.key === key) return '';
  return html`<button type="button" class="icon-button request-button" data-act="request-open" data-key="${key}"
    aria-label="Ask for a change to ${dutyName(item.duty)}" title="Ask for a change">${raw(SWAP_ICON)}</button>`;
}

function requestForm(item) {
  const id = serviceId(item.service), key = id + ':' + item.duty;
  if (!feature('changeRequests') || !ui.requestDraft || ui.requestDraft.key !== key) return '';
  return html`<form class="request-form" data-act="request-send" data-service="${id}" data-duty="${item.duty}">
    <label class="field-label" for="request-note">Why do you need a change? (optional)</label>
    <textarea id="request-note" data-input="request-note" rows="2" maxlength="500">${ui.requestDraft.note}</textarea>
    <div class="button-row">
      <button type="submit" class="primary">Send to my leader</button>
      <button type="button" class="ghost" data-act="request-cancel">Cancel</button>
    </div>
  </form>`;
}

function myRequests() {
  const mine = data.requests.filter(request => request.name === ui.me).sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  if (!mine.length) return '';
  return html`<section class="card">
    <h2 class="card-title">Your change requests</h2>
    ${mine.map(request => html`<div class="list-item">
      <div class="list-item-head"><span>${dutyName(request.duty)} · ${shortDate(request.date)} ${request.service}</span>${statusChip(shownStatus(request, data.services, canonical))}</div>
      ${request.note ? html`<p class="hint">${request.note}</p>` : ''}
    </div>`)}
  </section>`;
}

/* ---- the screen ---- */

function recent() {
  const updates = recentUpdates();
  if (!updates.length) return '';
  return html`<section class="card">
    <div class="card-title-row"><h2 class="card-title">Recent updates</h2><button type="button" class="link" data-act="clear-updates">Clear</button></div>
    ${updates.slice(0, 6).map(update => html`<p class="update"><span class="update-date">${new Date(update.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> ${update.txt}</p>`)}
  </section>`;
}

function dayCard(date, services, duties) {
  const key = 'day:' + date;
  const open = !!ui.expanded[key];
  const badge = dayBadge(date);
  return html`<article class="card duty-card${open ? ' is-open' : ''}">
    <button type="button" class="duty-card-toggle" data-act="expand" data-key="${key}" aria-expanded="${open}">
      <span class="sr-only">${open ? 'Hide' : 'Show'} details for ${longDate(date)}</span>
    </button>
    <div class="duty-date" aria-hidden="true"><b>${dayOfMonth(date)}</b><small>${weekdayShort(date)}</small></div>
    <div class="duty-body">
      ${services.map((service, index) => {
        const id = serviceId(service);
        const mine = duties.filter(item => serviceId(item.service) === id);
        return html`${index ? html`<hr class="duty-divider">` : ''}
          <div class="duty-when"><span class="duty-time">${clockTime(service.time)}</span><span class="duty-worship">${service.worship || service.service}</span>${index === 0 && badge ? html`<span class="tag">${badge}</span>` : ''}</div>
          <span class="sr-only">${longDate(date)}${badge ? ', ' + badge : ''}</span>
          ${mine.map(item => html`
            <div class="duty-line"><span class="dot" style="background: ${item.department.color}"></span><span class="duty-title">${dutyName(item.duty)}</span>${requestControl(item)}</div>
            ${open && item.duty === 'Presider' && feature('songPicker') ? html`<div class="duty-extra">${songTag(id)}
              <button type="button" class="link" data-act="open-songs" data-service="${id}">${songState(id) && songState(id).count ? 'Open songs' : 'Pick songs'}</button></div>` : ''}
            ${requestForm(item)}`)}
          ${open && feature('whoElse') ? html`<div class="duty-team">${dutyGroups(service)}</div>` : ''}`;
      })}
    </div>
  </article>`;
}

export function render() {
  if (!ui.me) return empty('Sign in to see your duties.');
  // A duty leaves this list at its service's start minute.
  const duties = dutiesOf(ui.me, upcoming(data.services));
  const days = [];
  duties.forEach(item => {
    let day = days.find(entry => entry.date === item.service.date);
    if (!day) days.push(day = { date: item.service.date, services: [] });
    if (!day.services.includes(item.service)) day.services.push(item.service);
  });
  return html`
    ${notifyControls()}
    ${recent()}
    ${duties.length ? html`
      <p class="hint">You have ${plural(duties.length, 'upcoming duty', 'upcoming duties')}.</p>
      ${songPrompt(duties)}
      ${days.map(day => dayCard(day.date, day.services, duties))}`
      : empty('You have no upcoming duties. They show up here as soon as one is assigned to you.')}
    ${myRequests()}`;
}

defineActions({
  'notify-on': () => turnOn(),
  'notify-off': () => turnOff(),
  'calendar-subscribe': () => { location.href = calendarUrl('webcal:'); },
  'calendar-copy': () => {
    const url = calendarUrl('https:');
    const done = () => notice('Calendar link copied. In Google Calendar, add it under Other calendars, From URL.');
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => notice('Your calendar link: ' + url));
    else notice('Your calendar link: ' + url);
  },
  'clear-updates': () => { clearRecentUpdates(); redraw(); },
  'open-songs': {
    allowed: el => !!data.services.find(service => serviceId(service) === el.dataset.service) || canEditSongsFor({}),
    run: el => goTo('songs', { service: el.dataset.service })
  },
  'request-open': el => { ui.requestDraft = { key: el.dataset.key, note: '' }; redraw(); },
  'request-cancel': () => { ui.requestDraft = null; redraw(); },
  'request-note': el => { if (ui.requestDraft) ui.requestDraft.note = el.value; },
  'request-send': {
    allowed: form => {
      const service = data.services.find(item => serviceId(item) === form.dataset.service);
      return !!service && (service.assignments || {})[form.dataset.duty] === ui.me;
    },
    run: form => {
      const service = data.services.find(item => serviceId(item) === form.dataset.service);
      const note = ui.requestDraft ? ui.requestDraft.note : '';
      ui.requestDraft = null;
      sendRequest(service, form.dataset.duty, note);
    }
  }
});

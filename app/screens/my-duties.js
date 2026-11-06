/* My Duties: the signed-in member's duties, one card per day, starting with
   the next one. A duty stays here until 20 minutes after its service
   starts, shown as "Now" meanwhile. A member can ask for a change to a duty
   still to come and withdraw the request while it waits, open the song
   planner for a Presider duty, and see everyone else serving at the same
   service. Notifications and the calendar link sit in a quiet card at the end. */
import { html, raw, plural } from '../html.js';
import { defineActions } from '../actions.js';
import { data, session, ui, feature, canonical, loaded } from '../store.js';
import { render as redraw, goTo } from '../render.js';
import { banner } from '../ui/banners.js';
import { dutyGroups, statusChip, empty, isCurrent, nowTag } from '../ui/components.js';
import { dutiesOf, serviceId, serviceClock, isUpcoming, isNow } from '../lib/services.js';
import { longDate, dayBadge, dayOfMonth, monthShort, weekdayShort, shortDate, addDays, todayISO } from '../lib/dates.js';
import { openRequestFor, shownStatus, isOpen } from '../lib/requests.js';
import { sendRequest, withdrawRequest } from '../services/requests.js';
import { recentUpdates, clearRecentUpdates, notificationsOn, turnOn, turnOff } from '../services/notifications.js';
import { canEditSongsFor, onlyDepartment } from '../services/access.js';
import { dutyName } from '../config/duties.js';

const SWAP_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4 3 8l4 4"/><path d="M3 8h13"/><path d="m17 20 4-4-4-4"/><path d="M21 16H8"/></svg>';

/* Where focus goes after the next draw, when the control that had it is
   gone (the request form opening or closing). */
let focusNext = '';

/* ---- notifications and calendar (also in Settings) ---- */

function calendarUrl(scheme) {
  return scheme + '//' + location.host + '/ics/' + encodeURIComponent(canonical(ui.me));
}

/* Android's browser cannot open a webcal: link, so there copying the link
   is the main way in. */
export function notifyControls() {
  const canNotify = 'Notification' in window && (feature('notifications') || feature('reminders'));
  const calendar = feature('calendarExport');
  if (!canNotify && !calendar) return '';
  const android = /Android/i.test(navigator.userAgent);
  return html`
    ${canNotify ? (Notification.permission === 'denied'
      ? html`<p class="hint">Notifications are blocked for this site. Allow them in your browser settings to hear about new duties.</p>`
      : html`<label class="switch-row"><span>Notifications<small>Hear when a duty is added for you, and get a reminder the day before.</small></span>
        <input type="checkbox" role="switch" data-change="notify-switch"${notificationsOn() ? ' checked' : ''}></label>`) : ''}
    ${calendar ? html`<div class="button-row">${android
      ? html`<button type="button" class="ghost" data-act="calendar-copy">Copy calendar link</button>`
      : html`<button type="button" class="ghost" data-act="calendar-subscribe">Add my duties to my calendar</button>`}</div>
    <details class="help">
      <summary>How the calendar link works</summary>
      <p>Your phone calendar follows the schedule, so a moved service updates by itself.</p>
      <p>On Android, copy the link and add it in Google Calendar under Other calendars, From URL.</p>
      ${android ? '' : html`<button type="button" class="ghost small" data-act="calendar-copy">Copy calendar link</button>`}
    </details>` : ''}`;
}

function reminders() {
  const controls = notifyControls();
  return controls ? html`<section class="card reminders"><h2 class="card-title">Notifications and calendar</h2>${controls}</section>` : '';
}

/* ---- songs for a Presider duty ---- */

function songState(id) {
  const setlist = data.setlists[id];
  if (!setlist) return null;
  const count = (setlist.songs || []).length;
  const confirmedAt = setlist.confirmedAt || 0, updatedAt = setlist.updatedAt || 0;
  return { count, confirmed: !!(count && confirmedAt && confirmedAt >= updatedAt), changed: !!(count && confirmedAt && confirmedAt < updatedAt) };
}

/* The one name for opening the song planner from My Duties. */
function songLabel(id) {
  const state = songState(id);
  return state && state.confirmed ? 'See your songs' : 'Plan your songs';
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
  const when = shortDate(first.service.date);
  const note = state && state.confirmed ? 'Your songs for ' + when + ' are confirmed.'
    : state && state.changed ? 'You changed the songs for ' + when + ' after confirming them. Confirm them again.'
      : state && state.count ? 'You picked ' + plural(state.count, 'song') + ' for ' + when + ' but have not confirmed them.'
        : 'You preside on ' + when + '. Pick the songs for that service.';
  return html`<section class="song-prompt">
    <p class="hint">${note}</p>
    <button type="button" class="primary" data-act="open-songs" data-service="${id}" data-from="prompt">${songLabel(id)}</button>
  </section>`;
}

/* ---- change requests ---- */

function requestKey(item) { return serviceId(item.service) + ':' + item.duty; }

/* The request being written for this duty, if it is this member's. A draft
   left by someone else on this device is never shown. */
function draftFor(key) {
  const draft = ui.requestDraft;
  return draft && draft.owner === ui.me && draft.key === key ? draft : null;
}

function openRequest(item) {
  return openRequestFor(data.requests, data.services, serviceId(item.service), item.duty, ui.me);
}

/* A duty flagged for the member's leader after they marked the day off. */
function flagged(item) {
  const flag = (item.service.needsReplacement || {})[item.duty];
  if (!flag) return false;
  return canonical(flag.memberName) === ui.me || (!!flag.memberUid && !!session.user && flag.memberUid === session.user.uid);
}

function requestControl(item) {
  if (!feature('changeRequests') || !isUpcoming(item.service) || openRequest(item) || flagged(item) || draftFor(requestKey(item))) return '';
  return html`<button type="button" class="icon-button request-button" data-act="request-open" data-key="${requestKey(item)}"
    aria-label="Ask for a change to ${dutyName(item.duty)}, ${shortDate(item.service.date)}, ${serviceClock(item.service)}" title="Ask for a change">${raw(SWAP_ICON)}</button>`;
}

/* What happens with a duty the member asked about or cannot make. */
function dutyState(item) {
  const request = feature('changeRequests') ? openRequest(item) : null;
  if (request) {
    return html`<p class="duty-state">Asked. You stay on this duty until your leader answers.
      <button type="button" class="link" data-act="request-withdraw" data-id="${request.id}">Withdraw</button></p>`;
  }
  return flagged(item) ? html`<p class="duty-state">Your leader was told you cannot make it.</p>` : '';
}

function requestForm(item) {
  const key = requestKey(item);
  const draft = feature('changeRequests') ? draftFor(key) : null;
  if (!draft) return '';
  return html`<form class="request-form" data-act="request-send" data-key="${key}" data-service="${serviceId(item.service)}" data-duty="${item.duty}">
    <label class="field-label" for="request-note">Why do you need a change? (optional)</label>
    <textarea id="request-note" data-input="request-note" rows="2" maxlength="500">${draft.note}</textarea>
    <p class="hint">Your leader finds someone else. You stay on this duty until they answer.</p>
    <div class="button-row">
      <button type="submit" class="primary"${draft.busy ? ' disabled' : ''}>${draft.busy ? 'Sending…' : 'Send to my leader'}</button>
      <button type="button" class="ghost" data-act="request-cancel" data-key="${key}">Cancel</button>
    </div>
  </form>`;
}

/* The member's requests for services still to come or in the last 30 days,
   newest first. */
function myRequests() {
  const since = addDays(todayISO(), -30);
  const mine = data.requests.filter(request => request.name === ui.me && String(request.date || '') >= since)
    .sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  return {
    waiting: mine.some(request => isOpen(request, data.services, canonical)),
    card: mine.length ? html`<section class="card duty-requests">
      <h2 class="card-title">Your change requests</h2>
      ${mine.map(request => html`<div class="list-item">
        <div class="list-item-head"><span>${dutyName(request.duty)} · ${shortDate(request.date)} ${request.service}</span>${statusChip(shownStatus(request, data.services, canonical))}</div>
        ${request.note ? html`<p class="hint">${request.note}</p>` : ''}
      </div>`)}
    </section>` : ''
  };
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

function availabilityLink() {
  return html`<p class="duty-availability">Can't make a date? <button type="button" class="link" data-act="account" data-view="availability">Set your availability</button></p>`;
}

function dutyLine(item, open) {
  const id = serviceId(item.service);
  return html`<div class="duty-line"><span class="dot" style="--dept: ${item.department.color}"></span><span class="duty-title">${dutyName(item.duty)}</span>${requestControl(item)}</div>
    ${dutyState(item)}
    ${open && item.duty === 'Presider' && feature('songPicker') ? html`<div class="duty-extra">${songTag(id)}
      <button type="button" class="link" data-act="open-songs" data-service="${id}" data-from="card">${songLabel(id)}</button></div>` : ''}
    ${requestForm(item)}`;
}

/* One day: the date tile with its month, then each service's time and the
   member's duties there. Opening the card shows who else serves. */
function dayCard({ date, services }, duties, next = false) {
  const key = 'day:' + date;
  const open = !!ui.expanded[key];
  const badge = dayBadge(date);
  return html`<article class="card duty-card${open ? ' is-open' : ''}${next ? ' is-next' : ''}">
    <button type="button" class="duty-card-toggle" data-act="expand" data-key="${key}" aria-expanded="${open}">
      <span class="sr-only">${open ? 'Hide' : 'Show'} details for ${longDate(date)}</span>
    </button>
    <div class="duty-date" aria-hidden="true"><small class="duty-month">${monthShort(date)}</small><b>${dayOfMonth(date)}</b><small>${weekdayShort(date)}</small></div>
    <div class="duty-body">
      <h3 class="sr-only">${longDate(date)}${badge ? ', ' + badge : ''}</h3>
      ${services.map((service, index) => html`${index ? html`<hr class="duty-divider">` : ''}
        <div class="duty-when"><span class="duty-time">${serviceClock(service)}</span><span class="duty-worship">${service.worship || service.service}</span>${isNow(service)
          ? nowTag(service) : index === 0 && badge ? html`<span class="tag">${badge}</span>` : ''}</div>
        ${duties.filter(item => item.service === service).map(item => dutyLine(item, open))}
        ${open && feature('whoElse') ? html`<div class="duty-team">${dutyGroups(service, { only: onlyDepartment() })}</div>` : ''}`)}
    </div>
  </article>`;
}

export function render() {
  if (!ui.me) return empty('Sign in to see your duties.');
  const duties = dutiesOf(ui.me, data.services.filter(isCurrent));
  const days = [];
  duties.forEach(item => {
    let day = days.find(entry => entry.date === item.service.date);
    if (!day) days.push(day = { date: item.service.date, services: [] });
    if (!day.services.includes(item.service)) day.services.push(item.service);
  });
  const [first, ...rest] = days;
  const requests = myRequests();
  return html`
    <h2 class="screen-title">My Duties</h2>
    ${first ? html`
      <p class="hint duty-count">You have ${plural(duties.length, 'upcoming duty', 'upcoming duties')}.</p>
      ${dayCard(first, duties, true)}
      ${songPrompt(duties)}
      ${requests.waiting ? requests.card : ''}
      ${rest.map(day => dayCard(day, duties))}`
      : loaded.schedule ? empty('You have no upcoming duties. They show up here as soon as one is assigned to you.')
        : empty('Loading the schedule…')}
    ${requests.waiting ? '' : requests.card}
    ${recent()}
    ${availabilityLink()}
    ${reminders()}`;
}

export function mounted(view) {
  if (!focusNext) return;
  const target = view.querySelector(focusNext);
  focusNext = '';
  if (target) target.focus();
}

defineActions({
  'notify-switch': el => (el.checked ? turnOn() : turnOff()),
  'calendar-subscribe': () => { location.href = calendarUrl('webcal:'); },
  'calendar-copy': () => {
    const url = calendarUrl('https:');
    const done = () => banner('Calendar link copied. In Google Calendar, add it under Other calendars, From URL.');
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => banner('Your calendar link: ' + url));
    else banner('Your calendar link: ' + url);
  },
  'clear-updates': () => { clearRecentUpdates(); redraw(); },
  'open-songs': {
    allowed: el => !!data.services.find(service => serviceId(service) === el.dataset.service) || canEditSongsFor({}),
    run: el => goTo('songs', { service: el.dataset.service })
  },
  'request-open': el => {
    ui.requestDraft = { owner: ui.me, key: el.dataset.key, note: '', busy: false };
    focusNext = '#request-note';
    redraw();
  },
  'request-cancel': el => {
    ui.requestDraft = null;
    focusNext = '[data-act="request-open"][data-key="' + CSS.escape(el.dataset.key) + '"]';
    redraw();
  },
  'request-note': el => { if (ui.requestDraft) ui.requestDraft.note = el.value; },
  'request-send': {
    allowed: form => {
      const service = data.services.find(item => serviceId(item) === form.dataset.service);
      return !!service && (service.assignments || {})[form.dataset.duty] === ui.me;
    },
    // The note stays in the form until the request is stored, so a failed
    // send can be tried again.
    run: async form => {
      const draft = draftFor(form.dataset.key);
      if (!draft || draft.busy) return;
      const service = data.services.find(item => serviceId(item) === form.dataset.service);
      draft.busy = true;
      redraw();
      const sent = await sendRequest(service, form.dataset.duty, draft.note);
      if (ui.requestDraft === draft) {
        if (sent) ui.requestDraft = null;
        else draft.busy = false;
      }
      redraw();
    }
  },
  'request-withdraw': {
    allowed: el => data.requests.some(request => request.id === el.dataset.id && request.name === ui.me),
    run: el => withdrawRequest(data.requests.find(request => request.id === el.dataset.id))
  }
});

/* A service in the planner: who presides, who prays, how far the songs are,
   and what can be done with them. */
import { html, plural } from '../html.js';
import { ui, nameOf } from '../store.js';
import { planner, view } from './state.js';
import { canEdit } from './access.js';
import { isConfirmed, changedSinceConfirmed, totalTime } from './data.js';
import { songNumber, minutes } from './catalog.js';
import { dutyName } from '../config/duties.js';
import { hasChoir, hasThanks } from '../lib/worship.js';
import { serviceId, isUpcoming } from '../lib/services.js';
import { shortDate, dayBadge, todayISO, clockTime } from '../lib/dates.js';

function songStatus(setlist) {
  const count = setlist ? (setlist.songs || []).length : 0;
  if (setlist && setlist.status === 'sung') return ['sung', 'Sung'];
  if (!count) return ['none', 'No songs yet'];
  if (isConfirmed(setlist)) return ['confirmed', 'Confirmed'];
  if (changedSinceConfirmed(setlist)) return ['changed', 'Changed'];
  return ['picked', 'Songs picked'];
}

/* What a service has, by its worship name and label. */
export function kindOf(setlist, service) {
  const worship = (setlist && setlist.worshipType) || (service && service.worship) || '';
  const label = (setlist && setlist.serviceLabel) || (service && service.service) || '';
  return { choir: hasChoir(worship), thanks: hasThanks(worship, label) };
}

/* Opening Prayer, Thanks Prayer, Closing Prayer and Choir Song, for the
   services that have them, as [label, value] pairs. The card and the Signal
   copy both use this order. */
export function roleLines(setlist, service) {
  const a = (service && service.assignments) || {};
  const kind = kindOf(setlist, service);
  const person = duty => [dutyName(duty), a[duty] ? nameOf(a[duty]) : ''];
  const lines = [person('Sermon')];
  if (kind.thanks || a['Prayer of Thanks']) lines.push(person('Prayer of Thanks'));
  if (kind.choir) lines.push(person('Closing Prayer'), ['Choir Song', (service && service.choirSong) || '']);
  return lines;
}

/* "Preparation Songs", then "Glory Song" (or "Glory & Thanks Song"), each
   with its song ids; empty sections are left out. */
export function songSections(setlist, service) {
  if (!setlist) return [];
  const thanks = kindOf(setlist, service).thanks || !!setlist.thanksSong;
  return [
    { title: 'Preparation Songs', ids: (setlist.songs || []).filter(id => id !== setlist.glorySong && id !== setlist.thanksSong) },
    { title: thanks ? 'Glory & Thanks Song' : 'Glory Song', ids: [setlist.glorySong, setlist.thanksSong].filter(Boolean) }
  ].filter(section => section.ids.length);
}

function roles(setlist, service) {
  return html`<div class="svc-roles">${roleLines(setlist, service).map(([label, value]) => html`<div class="svc-role"><span>${label}</span>
    ${value ? html`<strong>${value}</strong>` : html`<strong class="is-empty">Not set</strong>`}</div>`)}</div>`;
}

/* The songs of a service, in the card's format. */
function songList(setlist, service) {
  return html`<div class="order">${songSections(setlist, service).map(section => html`<h4 class="order-head">${section.title}</h4>
    ${section.ids.map(id => planner.songById[id]).filter(Boolean).map(song => html`<div class="order-step"><span class="num">${songNumber(song)}</span>
      <span class="step">${song.title}</span><span class="who">${minutes(song.durationSec)}</span></div>`)}`)}</div>`;
}

/* Who prays and what is sung, for the runsheet and a view-only list. */
export function serviceSheet(setlist, service) {
  return html`${service ? roles(setlist, service) : ''}${songList(setlist, service)}`;
}

/* The songs show once they are confirmed, until the presider hides them. */
function songsShown(id, setlist) {
  return id in view.songsShown ? view.songsShown[id] : isConfirmed(setlist);
}

/* One service, with or without a song list yet. `home` adds the runsheet
   and the actions a presider needs before and after the service. */
export function serviceCard(service, setlist, { home = false } = {}) {
  const id = setlist ? setlist.id : serviceId(service);
  const date = service ? service.date : setlist.date;
  const presider = (service && service.assignments && service.assignments.Presider) || (setlist && setlist.presider) || '';
  const editable = canEdit(setlist || service);
  const songs = setlist ? setlist.songs || [] : [];
  const [statusClass, statusLabel] = songStatus(setlist);
  const sung = setlist && setlist.status === 'sung';
  const open = !!songs.length && songsShown(id, setlist);
  const today = date === todayISO();
  const badge = dayBadge(date);
  const worship = (setlist && setlist.worshipType) || (service && service.worship) || '';
  const label = (setlist && setlist.serviceLabel) || (service && service.service) || '';
  const needsConfirm = editable && setlist && !sung && songs.length && !isConfirmed(setlist);
  const actions = [];
  if (home && today) actions.push(html`<button type="button" class="primary small" data-act="song-runsheet" data-id="${id}">Runsheet</button>`);
  if (editable && !sung) {
    if (needsConfirm) actions.push(html`<button type="button" class="primary small" data-act="song-confirm" data-id="${id}">${changedSinceConfirmed(setlist) ? 'Confirm again' : 'Confirm songs'}</button>`);
    actions.push(html`<button type="button" class="${needsConfirm || (home && today) ? 'ghost' : 'primary'} small" data-act="song-edit" data-id="${id}">${songs.length ? 'Edit songs' : 'Add songs'}</button>`);
    if (setlist && songs.length && !(service && isUpcoming(service))) actions.push(html`<button type="button" class="ghost small" data-act="song-mark-sung" data-id="${id}">Mark as sung</button>`);
  }
  if (editable && sung) actions.push(html`<button type="button" class="ghost small" data-act="song-edit" data-id="${id}">Edit songs</button>`,
    html`<button type="button" class="link danger" data-act="song-undo-sung" data-id="${id}">Undo sung</button>`);
  if (!editable) actions.push(html`<span class="hint small">View only</span>`);
  if (songs.length) actions.push(html`<button type="button" class="ghost small" data-act="song-toggle-songs" data-id="${id}" aria-expanded="${open}">${open ? 'Hide songs' : 'Show songs'}</button>`);
  if (songs.length) actions.push(html`<button type="button" class="ghost small" data-act="song-copy" data-id="${id}">Copy for Signal</button>`);
  // An empty list for a scheduled service comes back when the planner opens, so only a real list can be deleted.
  if (editable && setlist && (songs.length || !service)) actions.push(html`<button type="button" class="link danger" data-act="song-delete" data-id="${id}">Delete</button>`);
  return html`<article class="card svc-card${presider === ui.me ? '' : ' is-other'}">
    <div class="svc-head">
      <h3 class="svc-title">${worship} <span class="service-label">${label}</span></h3>
      ${presider ? html`<span class="presider"><span class="sr-only">Presider: </span>${nameOf(presider)}</span>` : ''}
      ${setlist && setlist.source === 'signal' ? html`<span class="tag">From Signal</span>` : ''}
    </div>
    <p class="svc-meta"><span>${shortDate(date)}${badge ? ' · ' + badge : ''}${service && service.time ? ' · ' + clockTime(service.time) : ''}</span>
      <span>${songs.length ? plural(songs.length, 'song') + ' · ' + minutes(totalTime(setlist)) + ' · ' : ''}<span class="song-state is-${statusClass}">${statusLabel}</span></span></p>
    ${service ? roles(setlist, service) : ''}
    <div class="button-row">${actions}</div>
    ${open ? songList(setlist, service) : ''}
  </article>`;
}


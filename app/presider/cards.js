/* A service in the planner: who presides, how far the songs are, and what
   can be done with them. Also the order of worship shown in the runsheet. */
import { html, plural } from '../html.js';
import { ui, nameOf } from '../store.js';
import { planner, view } from './state.js';
import { canEdit } from './access.js';
import { isConfirmed, changedSinceConfirmed, totalTime } from './data.js';
import { songLabel, songNumber, minutes } from './catalog.js';
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

function roles(service) {
  const a = (service && service.assignments) || {};
  const rows = [['Sermon', a.Sermon], ['Prayer of Thanks', a['Prayer of Thanks']], ['Closing Prayer', a['Closing Prayer']]].filter(([, name]) => name);
  const choir = service && service.choirSong;
  if (!rows.length && !choir) return '';
  return html`<div class="svc-roles">${rows.map(([duty, name]) => html`<div class="svc-role"><span>${duty}</span><strong>${nameOf(name)}</strong></div>`)}
    ${choir ? html`<div class="svc-role"><span>Choir song</span><strong>${choir}</strong></div>` : ''}</div>`;
}

/* Steps of the service with the chosen songs and the people on duty. */
export function orderOfWorship(setlist, service) {
  if (!service) return '';
  const a = service.assignments || {};
  const worship = (setlist && setlist.worshipType) || service.worship;
  const label = (setlist && setlist.serviceLabel) || service.service;
  const steps = [{ step: 'Glory song', note: songLabel(setlist && setlist.glorySong) || 'Stand and sing' }, { step: 'Opening prayer', who: a.Sermon }];
  if (worship === 'Sabbath Day' && label === 'Morning') {
    steps.push({ step: 'Thanks song', note: songLabel(setlist && setlist.thanksSong) }, { step: 'Prayer of thanks', who: a['Prayer of Thanks'] });
  }
  steps.push({ step: 'Choir song', note: service.choirSong || '' }, { step: 'Sermon', who: a.Sermon }, { step: 'Closing prayer', who: a['Closing Prayer'] });
  const preparation = (setlist ? setlist.songs || [] : []).filter(id => id !== setlist.glorySong && id !== setlist.thanksSong)
    .map(id => planner.songById[id]).filter(Boolean);
  return html`<div class="order">
    ${preparation.length ? html`<h4 class="order-head">Songs before the service</h4>
      ${preparation.map(song => html`<div class="order-step"><span class="num">${songNumber(song)}</span><span class="step">${song.title}</span><span class="who">${minutes(song.durationSec)}</span></div>`)}` : ''}
    <h4 class="order-head">Order of worship</h4>
    ${steps.map((item, index) => html`<div class="order-step"><span class="num">${index + 1}</span>
      <span class="step">${item.step}${item.note ? html`<span class="step-note"> · ${item.note}</span>` : ''}</span>
      ${'who' in item ? html`<span class="who">${item.who ? nameOf(item.who) : '-'}</span>` : ''}</div>`)}
  </div>`;
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
  const open = view.openService === id;
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
  if (service) actions.push(html`<button type="button" class="ghost small" data-act="song-toggle-order" data-id="${id}" aria-expanded="${open}">${open ? 'Hide order' : 'Order of worship'}</button>`);
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
    ${service ? roles(service) : ''}
    ${open ? orderOfWorship(setlist, service) : ''}
    <div class="button-row">${actions}</div>
  </article>`;
}


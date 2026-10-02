/* The planner's sections. */
import { html, plural } from '../html.js';
import { data, ui, nameOf } from '../store.js';
import { planner, view, SECTIONS, SECTION_NAMES, SORTS, RECENT_DAYS } from './state.js';
import { canEdit, canManageSongs } from './access.js';
import { myServices, current, isConfirmed, changedSinceConfirmed, totalTime, countedSongs } from './data.js';
import { serviceCard, serviceSheet, kindOf, missingSongs } from './cards.js';
import { filteredSongs, pages, categories, categoryColor, songNumber, minutes, statsFor } from './catalog.js';
import { serviceId, byStart } from '../lib/services.js';
import { shortDate, longDate, dayBadge, todayISO, daysSince, daysUntil, relativeDay } from '../lib/dates.js';
import { SERVICE_LABELS, WORSHIP_TYPES } from '../config/duties.js';

/* ---- frame ---- */

/* A song editor with no Presider duty coming up works on everyone's lists. */
function editorOnly() { return !myServices().length && canManageSongs(); }

function header() {
  const next = myServices()[0];
  return html`<div class="planner-head">
    <span class="planner-role">${editorOnly() ? 'Song editor' : 'Presider'}</span><span class="planner-name">${nameOf(ui.me)}</span>
    ${next ? html`<span class="planner-next">Next: ${shortDate(next.date)} · ${next.service}</span>` : ''}
  </div>`;
}

function sections() {
  return html`<nav class="planner-sections" aria-label="Presider sections" data-subnav>
    ${SECTIONS.map(section => html`<button type="button" class="${view.section === section ? 'is-active' : ''}" data-act="song-section"
      data-section="${section}"${view.section === section ? ' aria-current="page"' : ''}>${SECTION_NAMES[section]}</button>`)}
  </nav>`;
}

/* Services and song lists together: every current service on the schedule,
   plus song lists made for other dates. */
function allCurrent() {
  const byId = {};
  data.services.filter(current).forEach(service => { byId[serviceId(service)] = { service, setlist: planner.setlists[serviceId(service)] || null }; });
  Object.values(planner.setlists).forEach(setlist => {
    if (byId[setlist.id] || setlist.status === 'sung' || setlist.date < todayISO()) return;
    byId[setlist.id] = { service: null, setlist };
  });
  const asService = item => item.service || { date: item.setlist.date, service: item.setlist.serviceLabel };
  return Object.values(byId).sort((a, b) => byStart(asService(a), asService(b)));
}

function pastLists() {
  const liveIds = new Set(allCurrent().map(item => (item.setlist || {}).id));
  return Object.values(planner.setlists).filter(setlist => !liveIds.has(setlist.id) && (setlist.status === 'sung' || setlist.date <= todayISO()))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function serviceFor(setlist) { return data.services.find(service => serviceId(service) === setlist.id) || null; }

function pastBlock(list) {
  if (!list.length) return '';
  return html`<div class="center"><button type="button" class="link" data-act="song-toggle-past">${view.showPast ? 'Hide past services' : 'Show ' + list.length + ' past services'}</button></div>
    ${view.showPast ? list.map(setlist => serviceCard(serviceFor(setlist), setlist, { home: true })) : ''}`;
}

/* ---- Home ---- */

export function home() {
  const mine = view.scope === 'mine' && (view.scopeChosen || !editorOnly());
  const items = mine ? myServices().map(service => ({ service, setlist: planner.setlists[serviceId(service)] || null })) : allCurrent();
  // A Presider duty in the next three days with no songs yet.
  const soon = mine && items.find(item => daysUntil(item.service.date) <= 3 && !(item.setlist && (item.setlist.songs || []).length));
  const loading = !data.services.length || !planner.loaded.setlists;
  const past = pastLists().filter(setlist => !mine || setlist.presider === ui.me || (serviceFor(setlist) || { assignments: {} }).assignments.Presider === ui.me);
  return html`
    <div class="segmented" role="group" aria-label="Which services">
      <button type="button" data-act="song-scope" data-scope="mine" aria-pressed="${mine}">My services</button>
      <button type="button" data-act="song-scope" data-scope="all" aria-pressed="${!mine}">All services</button>
    </div>
    ${soon ? html`<div class="banner"><span><strong>${soon.service.worship} ${soon.service.service}</strong> on ${shortDate(soon.service.date)} has no songs yet.</span>
      <button type="button" class="link" data-act="song-edit" data-id="${serviceId(soon.service)}">Pick songs</button></div>` : ''}
    ${items.length ? items.map(item => serviceCard(item.service, item.setlist, { home: true }))
      : loading ? html`<p class="empty">Loading the schedule…</p>`
        : html`<p class="empty">${mine ? 'You have no Presider duty coming up.' : 'No services coming up.'}</p>`}
    ${pastBlock(past)}`;
}

/* ---- Library: the song list being built, then the songs ---- */

/* How the Library works, until a list is open or the tip is hidden. */
function help() {
  if (view.helpHidden || view.setlist) return '';
  return html`<div class="banner"><span>Choose your service, add songs from the list below, then confirm them. Confirmed songs are counted as sung after the service.</span>
    <button type="button" class="banner-close" data-act="song-help-hide" aria-label="Hide these tips">&times;</button></div>`;
}

function servicePicker() {
  const mine = myServices();
  return html`<section class="card">
    <h3 class="card-subtitle">Your service</h3>
    ${mine.length ? html`<select data-change="song-pick-service" aria-label="Choose your service">
        <option value="">Choose your service</option>
        ${mine.map(service => html`<option value="${serviceId(service)}">${shortDate(service.date)} · ${service.worship} · ${service.service}</option>`)}
      </select>` : html`<p class="hint">You have no Presider duty coming up.</p>`}
    ${canManageSongs() ? (view.otherDate
      ? html`<form class="inline-form" data-act="song-other-date">
          <input type="date" name="date" value="${todayISO()}" aria-label="Date" required>
          <select name="worship" aria-label="Worship">${WORSHIP_TYPES.map(type => html`<option>${type}</option>`)}</select>
          <select name="label" aria-label="Service">${SERVICE_LABELS.map(label => html`<option${label === 'Morning' ? ' selected' : ''}>${label}</option>`)}</select>
          <button type="submit" class="primary">Start</button>
        </form>`
      : html`<button type="button" class="link" data-act="song-other-open">Plan another date</button>`) : ''}
  </section>`;
}

const SLOT_NAMES = { glory: 'Glory', thanks: 'Thanks', choir: 'Choir' };

/* The Glory, Thanks or Choir song as a row under the preparation songs, with
   a tag to choose it from the list. A choir song is text on the service,
   such as "358 Children of Jerusalem". */
function slotRow(slot, song, text = '') {
  const selecting = view.slot === slot;
  const [, number, title] = song ? [, songNumber(song), song.title] : /^#?([A-Z]?\d+)\s+(.+)$/.exec(text) || [, '', text];
  return html`<li class="set-row is-slot${selecting ? ' is-selecting' : ''}">
    ${number ? html`<span class="num">${number}</span>` : html`<span></span>`}
    <span class="title${title ? '' : ' is-empty'}">${title || SLOT_NAMES[slot] + ' song not chosen'}</span>
    <span class="time">${song ? minutes(song.durationSec) : ''}</span>
    <button type="button" class="slot-tag" data-act="song-slot" data-slot="${slot}" aria-pressed="${selecting}"
      aria-label="${(title ? 'Change the ' : 'Choose the ') + SLOT_NAMES[slot] + ' song'}">${title ? 'Change' : 'Choose'}</button>
    ${title ? html`<button type="button" class="icon-button" data-act="song-slot-clear" data-slot="${slot}" aria-label="Remove the ${SLOT_NAMES[slot]} song">&times;</button>` : ''}
  </li>`;
}

function builder(setlist) {
  const service = serviceFor(setlist);
  if (!canEdit(setlist)) {
    return html`<section class="card"><h3 class="card-subtitle">${setlist.worshipType} <span class="service-label">${setlist.serviceLabel}</span></h3>
      <p class="hint">View only. The assigned Presider, a song editor or an administrator can change these songs.</p>
      ${serviceSheet(setlist, service)}
      <button type="button" class="link" data-act="song-close-list">Choose another service</button></section>`;
  }
  const songs = setlist.songs || [];
  const main = songs.map((id, index) => ({ id, index })).filter(item => item.id !== setlist.glorySong && item.id !== setlist.thanksSong);
  const kind = kindOf(setlist, service);
  const thanks = kind.thanks || !!setlist.thanksSong;
  const sung = setlist.status === 'sung';
  return html`<section class="card builder">
    <div class="svc-head"><h3 class="svc-title">${setlist.worshipType} <span class="service-label">${setlist.serviceLabel}</span></h3>
      <span class="hint">${shortDate(setlist.date)}${dayBadge(setlist.date) ? ' · ' + dayBadge(setlist.date) : ''}</span></div>
    <button type="button" class="link" data-act="song-close-list">Choose another service</button>
    <div class="total"><span>Total time</span><strong>${minutes(totalTime(setlist))}</strong><span>${countedSongs(setlist).length} songs (${thanks ? 'Glory and Thanks songs' : 'Glory song'} not counted)</span></div>
    <ol class="set-list">${main.map((item, position) => {
      const song = planner.songById[item.id];
      if (!song) return '';
      return html`<li class="set-row"><span class="num">${songNumber(song)}</span><span class="title">${song.title}</span><span class="time">${minutes(song.durationSec)}</span>
        <span class="move">
          <button type="button" class="icon-button" data-act="song-move" data-from="${item.index}" data-to="${position > 0 ? main[position - 1].index : -1}" aria-label="Move up"${position > 0 ? '' : ' disabled'}>↑</button>
          <button type="button" class="icon-button" data-act="song-move" data-from="${item.index}" data-to="${position < main.length - 1 ? main[position + 1].index : -1}" aria-label="Move down"${position < main.length - 1 ? '' : ' disabled'}>↓</button>
        </span>
        <button type="button" class="icon-button" data-act="song-remove" data-index="${item.index}" aria-label="Remove ${song.title}">&times;</button></li>`;
    })}
      ${slotRow('glory', planner.songById[setlist.glorySong])}
      ${thanks ? slotRow('thanks', planner.songById[setlist.thanksSong]) : ''}
      ${kind.choir && service ? slotRow('choir', null, service.choirSong) : ''}
    </ol>
    ${main.length ? '' : html`<p class="hint">No preparation songs yet. Tap + next to a song below.</p>`}
    ${sung ? '' : isConfirmed(setlist)
      ? html`<p class="confirm is-done">Songs confirmed${setlist.confirmedBy ? ' by ' + nameOf(setlist.confirmedBy) : ''}. Change them any time and confirm again.</p>`
      : songs.length ? html`<div class="confirm${changedSinceConfirmed(setlist) ? ' is-changed' : ''}">
          <p>${changedSinceConfirmed(setlist) ? 'You changed the songs after confirming. Confirm again so others see the final list.' : 'Ready? Confirm so the list shows as done.'}
            ${missingSongs(setlist, service).length ? html`<strong class="confirm-missing">${missingSongs(setlist, service).join(' ')}</strong>` : ''}</p>
          <button type="button" class="primary" data-act="song-confirm" data-id="${setlist.id}">${changedSinceConfirmed(setlist) ? 'Confirm again' : 'Confirm songs'}</button></div>` : ''}
  </section>`;
}

/* Shown at the top while a Glory, Thanks or Choir song is being chosen. */
function selecting() {
  if (!view.slot) return '';
  return html`<div class="banner selecting" role="status"><span><strong>Selecting ${SLOT_NAMES[view.slot]} song</strong>. Tap + next to a song below.</span>
    <button type="button" class="banner-close" data-act="song-slot-cancel" aria-label="Stop choosing the ${SLOT_NAMES[view.slot]} song">&times;</button></div>`;
}

function songRow(song, setlist) {
  const stats = statsFor(song.id);
  const open = view.openSong === song.id;
  const inList = setlist ? (setlist.songs || []).filter(id => id === song.id).length : 0;
  const recent = daysSince(stats.lastSung) <= RECENT_DAYS;
  const canAdd = setlist && canEdit(setlist) && setlist.status !== 'sung';
  const manage = canManageSongs();
  return html`<div class="song${open ? ' is-open' : ''}">
    <button type="button" class="song-row" data-act="song-open" data-id="${song.id}" aria-expanded="${open}">
      <span class="num">${songNumber(song)}</span><span class="dot" style="background: ${categoryColor(song.category)}" title="${song.category}"></span>
      <span class="title">${song.title}</span><span class="time">${minutes(song.durationSec)}</span><span class="times" title="Times sung">${stats.timesSung}×</span>
    </button>
    ${canAdd ? html`<button type="button" class="add${inList ? ' is-in' : ''}${recent ? ' is-recent' : ''}" data-act="song-add" data-id="${song.id}"
      aria-label="${view.slot ? 'Use ' + song.title : 'Add ' + song.title}">+${inList ? html`<span class="add-count">${inList}</span>` : ''}</button>` : ''}
    ${open ? html`<div class="song-detail">
      <p class="hint">${song.category}${recent ? ' · sung ' + relativeDay(stats.lastSung) : ''}</p>
      ${stats.history && stats.history.length ? html`<ul class="plain-list">${stats.history.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(entry => {
        const list = planner.setlists[entry.service];
        return html`<li><span>${shortDate(entry.date)}</span> ${list ? list.worshipType + ' ' + list.serviceLabel : entry.backfilled ? 'Added by hand' : entry.service}
          ${manage ? html`<button type="button" class="link danger small" data-act="song-history-remove" data-id="${song.id}" data-service="${entry.service}">Remove</button>` : ''}</li>`;
      })}</ul>` : html`<p class="hint">Not sung yet.</p>`}
      ${!setlist ? html`<p class="hint">Choose your service above to add songs.</p>` : ''}
      ${manage ? html`<button type="button" class="ghost small" data-act="song-past-date" data-id="${song.id}">Add a past date</button>` : ''}
    </div>` : ''}
  </div>`;
}

export function library() {
  const setlist = view.setlist ? planner.setlists[view.setlist] : null;
  const list = filteredSongs();
  const groups = pages(list);
  view.page = Math.max(0, Math.min(view.page, groups.length - 1));
  const last = Math.min(view.page + view.more, groups.length - 1);
  const shown = groups.slice(view.page, last + 1).flatMap(group => group.songs);
  return html`<div class="library">
    ${setlist ? selecting() : ''}
    <div class="library-set">${help()}${setlist ? builder(setlist) : servicePicker()}</div>
    <section class="library-songs" aria-label="Songs">
      <div class="song-controls">
        <input type="search" data-input="song-search" value="${view.search}" placeholder="Search by title or number" aria-label="Search songs" autocomplete="off">
        <div class="chips scroll-x" role="group" aria-label="Category">${['All', 'Appendix'].concat(categories()).map(category => html`<button type="button"
          class="chip${view.category === category ? ' is-active' : ''}" data-act="song-category" data-category="${category}" aria-pressed="${view.category === category}">${category}</button>`)}</div>
        <label class="sort"><span>Sort</span><select data-change="song-sort">${SORTS.map(([value, label]) => html`<option value="${value}"${view.sort === value ? ' selected' : ''}>${label}</option>`)}</select>
          <span class="hint">${list.length} songs</span></label>
      </div>
      ${groups.length > 1 ? html`<div class="pager">
        <button type="button" class="icon-button" data-act="song-page" data-page="${view.page - 1}"${view.page <= 0 ? ' disabled' : ''} aria-label="Previous group">‹</button>
        <span>${groups.slice(view.page, last + 1).map(group => group.label).join(', ')}</span>
        <button type="button" class="icon-button" data-act="song-page" data-page="${last + 1}"${last >= groups.length - 1 ? ' disabled' : ''} aria-label="Next group">›</button>
      </div>` : ''}
      <div class="song-list">${shown.length ? shown.map(song => songRow(song, setlist)) : html`<p class="empty">No songs match.</p>`}</div>
      ${last < groups.length - 1 ? html`<div class="center"><button type="button" class="ghost small" data-act="song-more">Show the next ${groups[last + 1].songs.length} songs</button></div>` : ''}
    </section>
  </div>`;
}

/* ---- Services ---- */

export function services() {
  const items = allCurrent();
  return html`<h3 class="section-heading">Coming up</h3>
    ${items.length ? items.map(item => serviceCard(item.service, item.setlist)) : html`<p class="empty">No services coming up.</p>`}
    ${pastBlock(pastLists())}`;
}

/* ---- History ---- */

export function history() {
  const byNumber = (a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
  const least = planner.songs.slice().sort((a, b) => statsFor(a.id).timesSung - statsFor(b.id).timesSung || byNumber(a, b)).slice(0, 15);
  // Songs never sung already lead "Sung least"; this list is of songs sung before.
  const sungBefore = planner.songs.filter(song => statsFor(song.id).timesSung > 0);
  const longest = sungBefore.slice().sort((a, b) => daysSince(statsFor(b.id).lastSung) - daysSince(statsFor(a.id).lastSung) || byNumber(a, b)).slice(0, 15);
  const neverSung = planner.songs.length - sungBefore.length;
  const row = song => html`<div class="song-row is-static"><span class="num">${songNumber(song)}</span>
    <span class="dot" style="background: ${categoryColor(song.category)}"></span><span class="title">${song.title}</span>
    <span class="times">${statsFor(song.id).timesSung}×</span><span class="time">${relativeDay(statsFor(song.id).lastSung)}</span></div>`;
  const byCategory = categories().map(category => {
    const inCategory = planner.songs.filter(song => song.category === category);
    const sung = inCategory.filter(song => statsFor(song.id).timesSung > 0).length;
    return { category, sung, total: inCategory.length };
  });
  const backfill = view.backfill;
  return html`
    <section class="card"><h3 class="card-subtitle">Sung least</h3>${least.map(row)}</section>
    <section class="card"><h3 class="card-subtitle">Not sung for the longest</h3>
      ${neverSung ? html`<p class="hint">Of songs sung before. ${plural(neverSung, 'song has', 'songs have')} never been sung.</p>` : ''}
      ${longest.length ? longest.map(row) : html`<p class="hint">No song has been sung yet.</p>`}</section>
    <section class="card"><h3 class="card-subtitle">Songs sung, by category</h3>
      ${byCategory.map(item => html`<div class="bar-row"><span>${item.category}</span>
        <span class="bar"><span style="width: ${item.total ? Math.round(item.sung / item.total * 100) : 0}%"></span></span>
        <span class="hint">${item.sung} of ${item.total}</span></div>`)}</section>
    <section class="card"><h3 class="card-subtitle">Download</h3>
      <p class="hint">Every date each song was sung, as a spreadsheet file.</p>
      <button type="button" class="ghost small" data-act="song-download">Download history (CSV)</button></section>
    ${canManageSongs() ? html`<section class="card"><h3 class="card-subtitle">Add a past date</h3>
      <p class="hint">Record a song that was sung before this app was used. You can remove it later from that song in the Library.</p>
      ${backfill ? html`<form class="inline-form" data-act="song-past-save">
          <select name="song" aria-label="Song" required><option value="">Choose a song</option>
            ${planner.songs.map(song => html`<option value="${song.id}"${song.id === backfill.songId ? ' selected' : ''}>${song.number} · ${song.title}</option>`)}</select>
          <input type="date" name="date" max="${todayISO()}" aria-label="Date sung" required>
          <button type="submit" class="primary small">Save</button>
          <button type="button" class="link" data-act="song-past-cancel">Cancel</button>
        </form>`
        : html`<button type="button" class="ghost small" data-act="song-past-date" data-id="">Add a past date</button>`}
    </section>` : ''}`;
}

/* ---- Runsheet: today's service, full screen ---- */

function runsheet() {
  const setlist = planner.setlists[view.runsheet];
  const service = data.services.find(item => serviceId(item) === view.runsheet);
  if (!setlist && !service) { view.runsheet = null; return home(); }
  const date = (service || setlist).date;
  return html`<section class="runsheet">
    <div class="runsheet-head"><h2>${(setlist && setlist.worshipType) || service.worship} · ${(setlist && setlist.serviceLabel) || service.service}</h2>
      <button type="button" class="ghost small" data-act="song-runsheet-close">Close</button></div>
    <p class="hint">${longDate(date)}</p>
    <div class="card">${serviceSheet(setlist, service)}</div>
  </section>`;
}

export function frame(body) {
  if (view.runsheet) return runsheet();
  return html`${header()}${sections()}<div class="planner-body">${body}</div>`;
}

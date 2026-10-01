/* The Presider song planner, loaded when a presider opens the Presider tab.
   Home lists the presider's services; Library builds a service's song list
   from the New Song list; Services lists every service; History shows what
   has been sung. */
import { defineActions } from '../actions.js';
import { data, ui, writeText } from '../store.js';
import { notice } from '../ui/banners.js';
import { planner, view, SECTIONS } from './state.js';
import { canEdit, canManageSongs } from './access.js';
import { loadSeed, loadPublished, songLine, statsFor } from './catalog.js';
import { roleLines, songSections } from './cards.js';
import { updateService } from '../services/schedule.js';
import {
  listen, ensureSetlist, addSong, removeSong, moveSong, setSlot, clearSlot, confirmSongs,
  markSung, undoSung, deleteSetlist, addPastDate, removePastEntry
} from './data.js';
import { frame, home, library, services, history } from './screens.js';
import { serviceId } from '../lib/services.js';
import { shortDate, todayISO } from '../lib/dates.js';

let root = null, started = false;
const wired = new WeakSet();

const BODIES = { home, library, services, history };

export function draw() {
  if (!root || !root.isConnected) return;
  root.innerHTML = String(frame(BODIES[view.section]()));
}

function findService(id) { return data.services.find(service => serviceId(service) === id) || null; }

/* Open a service's song list in the Library, making the list if needed. */
function openList(id) {
  const service = findService(id);
  const target = planner.setlists[id] || service;
  if (!target || !canEdit(target)) { notice('Only the assigned Presider or a song editor can change these songs.', true); return false; }
  if (!planner.setlists[id] && service) ensureSetlist(service, 'schedule');
  view.setlist = id;
  view.section = 'library';
  view.slot = null;
  view.search = '';
  return true;
}

function wireSwipe(element) {
  if (wired.has(element)) return;
  wired.add(element);
  let start = null;
  element.addEventListener('touchstart', event => {
    if (event.touches.length !== 1 || event.target.closest('input, select, textarea, .chips, .planner-sections')) { start = null; return; }
    start = { x: event.touches[0].clientX, y: event.touches[0].clientY, at: Date.now() };
  }, { passive: true });
  element.addEventListener('touchend', event => {
    if (!start) return;
    const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y;
    const quick = Date.now() - start.at < 600;
    start = null;
    if (!quick || Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    if (view.runsheet) { view.runsheet = null; draw(); return; }
    const next = SECTIONS[SECTIONS.indexOf(view.section) + (dx < 0 ? 1 : -1)];
    if (next) { view.section = next; view.slot = null; draw(); }
  }, { passive: true });
}

export function mount(element) {
  root = element;
  if (!started) {
    started = true;
    loadSeed();
    listen();
    loadPublished().then(replaced => { if (replaced) draw(); });
  }
  wireSwipe(root);
  if (ui.songNav) {
    ui.songNav = false;
    view.runsheet = null;
    view.slot = null;
    if (!ui.songService || !openList(ui.songService)) view.section = 'home';
    ui.songService = null;
  }
  draw();
}

/* ---- actions ---- */

/* The service card as a Signal message: who prays, then each song list. */
function signalText(setlist) {
  const service = findService(setlist.id);
  const head = [setlist.worshipType + ' ' + setlist.serviceLabel + ' - ' + shortDate(setlist.date)]
    .concat(roleLines(setlist, service).filter(([, value]) => value).map(([label, value]) => label + ': ' + value));
  const sections = songSections(setlist, service)
    .map(section => section.title + '\n\n' + section.ids.map(songLine).filter(Boolean).map(line => '* ' + line).join('\n'));
  return [head.join('\n')].concat(sections.length ? [sections.join('\n\n\n')] : []).join('\n\n');
}

function downloadHistory() {
  const escape = value => /[",\n]/.test(String(value)) ? '"' + String(value).replace(/"/g, '""') + '"' : String(value);
  const rows = [['songId', 'number', 'title', 'date', 'service', 'by', 'addedByHand'].join(',')];
  planner.songs.forEach(song => (statsFor(song.id).history || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .forEach(entry => rows.push([song.id, song.number, song.title, entry.date || '', entry.service || '', entry.by || '', entry.backfilled ? 'yes' : 'no'].map(escape).join(','))));
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
  link.download = 'song-history-' + todayISO() + '.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

const listOf = el => planner.setlists[el.dataset.id];
const canEditList = el => !!listOf(el) && canEdit(listOf(el));

defineActions({
  'song-section': el => { view.section = el.dataset.section; view.slot = null; view.runsheet = null; draw(); },
  'song-scope': el => { view.scope = el.dataset.scope === 'all' ? 'all' : 'mine'; view.showPast = false; draw(); },
  'song-toggle-past': () => { view.showPast = !view.showPast; draw(); },
  'song-toggle-songs': el => { view.songsShown[el.dataset.id] = el.getAttribute('aria-expanded') !== 'true'; draw(); },
  'song-runsheet': el => { view.runsheet = el.dataset.id; draw(); window.scrollTo({ top: 0 }); },
  'song-runsheet-close': () => { view.runsheet = null; draw(); },
  'song-edit': el => { if (openList(el.dataset.id)) { draw(); window.scrollTo({ top: 0 }); } },
  'song-close-list': () => { view.setlist = null; view.slot = null; draw(); },
  'song-pick-service': el => { if (el.value && openList(el.value)) draw(); },
  'song-other-open': { allowed: () => canManageSongs(), run: () => { view.otherDate = true; draw(); } },
  'song-other-date': {
    allowed: () => canManageSongs(),
    run: form => {
      const values = new FormData(form);
      const service = { date: String(values.get('date')), service: String(values.get('label')), worship: String(values.get('worship')), assignments: {} };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(service.date)) return;
      view.setlist = ensureSetlist(findService(serviceId(service)) || service, 'manual');
      view.otherDate = false;
      draw();
    }
  },
  'song-help-hide': () => { view.helpHidden = true; writeText('nss-help-dismissed', '1'); draw(); },
  'song-search': el => {
    view.search = el.value;
    view.page = 0;
    view.more = 0;
    const caret = el.selectionStart;
    draw();
    const input = root && root.querySelector('[data-input="song-search"]');
    if (input) { input.focus(); try { input.setSelectionRange(caret, caret); } catch (_error) { /* not a text field */ } }
  },
  'song-category': el => { view.category = el.dataset.category; view.page = 0; view.more = 0; draw(); },
  'song-sort': el => { view.sort = el.value; view.page = 0; view.more = 0; draw(); },
  'song-page': el => { view.page = Number(el.dataset.page); view.more = 0; draw(); root.querySelector('.song-controls').scrollIntoView({ block: 'start' }); },
  'song-more': () => { view.more += 1; draw(); },
  'song-open': el => { view.openSong = view.openSong === el.dataset.id ? null : el.dataset.id; draw(); },
  'song-add': {
    allowed: () => !!view.setlist && canEdit(planner.setlists[view.setlist]),
    run: el => {
      if (view.slot === 'choir') {
        const service = findService(view.setlist);
        if (service) updateService(service, 'choirSong', songLine(el.dataset.id));
        view.slot = null;
      } else if (view.slot) { setSlot(view.setlist, view.slot, el.dataset.id); view.slot = null; }
      else addSong(view.setlist, el.dataset.id);
      draw();
    }
  },
  'song-remove': { allowed: () => !!view.setlist && canEdit(planner.setlists[view.setlist]), run: el => { removeSong(view.setlist, Number(el.dataset.index)); draw(); } },
  'song-move': { allowed: () => !!view.setlist && canEdit(planner.setlists[view.setlist]), run: el => { moveSong(view.setlist, Number(el.dataset.from), Number(el.dataset.to)); draw(); } },
  'song-slot': el => { view.slot = view.slot === el.dataset.slot ? null : el.dataset.slot; draw(); },
  'song-slot-clear': {
    allowed: () => !!view.setlist && canEdit(planner.setlists[view.setlist]),
    run: el => {
      if (el.dataset.slot !== 'choir') clearSlot(view.setlist, el.dataset.slot);
      else if (findService(view.setlist)) updateService(findService(view.setlist), 'choirSong', '');
      draw();
    }
  },
  'song-slot-cancel': () => { view.slot = null; draw(); },
  'song-confirm': { allowed: canEditList, run: el => { confirmSongs(el.dataset.id); draw(); } },
  'song-mark-sung': {
    allowed: canEditList,
    run: el => { if (confirm('Mark these songs as sung? This adds one to each song’s count. Do this after the service.')) markSung(el.dataset.id); }
  },
  'song-undo-sung': {
    allowed: canEditList,
    run: el => { if (confirm('Undo Mark as sung? Each song’s count goes back down.')) undoSung(el.dataset.id); }
  },
  'song-delete': {
    allowed: canEditList,
    run: el => {
      if (!confirm('Delete this song list? This cannot be undone. Songs already counted as sung keep their count.')) return;
      if (view.setlist === el.dataset.id) view.setlist = null;
      deleteSetlist(el.dataset.id);
    }
  },
  'song-copy': el => {
    const text = signalText(listOf(el));
    navigator.clipboard.writeText(text).then(() => notice('Copied. Paste it into Signal.'), () => window.prompt('Copy this message:', text));
  },
  'song-download': () => downloadHistory(),
  'song-past-date': { allowed: () => canManageSongs(), run: el => { view.section = 'history'; view.backfill = { songId: el.dataset.id }; draw(); } },
  'song-past-cancel': () => { view.backfill = null; draw(); },
  'song-past-save': {
    allowed: () => canManageSongs(),
    run: async form => {
      const values = new FormData(form);
      if (!values.get('song') || !values.get('date')) return;
      if (await addPastDate(String(values.get('song')), String(values.get('date')))) { view.backfill = null; notice('Past date saved.'); draw(); }
    }
  },
  'song-history-remove': {
    allowed: () => canManageSongs(),
    run: el => { if (confirm('Remove this date from the song’s history? Its count goes down by one.')) removePastEntry(el.dataset.id, el.dataset.service); }
  }
});

/* The New Song list: loaded from song-seed.js, then replaced by the
   published Google Sheet copy when that loads and looks right. */
import { planner, view, PAGE_SIZE } from './state.js';
import { daysSince } from '../lib/dates.js';

const CATALOG_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR60X_ipfHfqs9WZAdX21vvreetI8CyR7F_vusELR3gt0jfw_t3USeip4y25lF-ePzwY-o8FzCtd10a/pub?output=csv';
const CATEGORIES = ['Festival', 'Glory', 'Gratitude', 'Faith', 'Hope', 'Love', 'Sacrifice', 'Repentance', 'Preaching', 'Prayer', 'Ceremony', 'Meditation'];
const MIN_SONGS = 400;
const TITLE_FIXES = { '284': 'Holy Is Your Sacrifice' };
const COLORS = {
  Festival: 'var(--accent)', Glory: 'var(--accent-2)', Gratitude: 'var(--ok)', Faith: 'var(--warn)', Hope: 'var(--accent)',
  Love: 'var(--danger)', Sacrifice: 'var(--accent-2)', Repentance: 'var(--warn)', Preaching: 'var(--ok)', Prayer: 'var(--accent)',
  Ceremony: 'var(--muted)', Meditation: 'var(--faint)'
};

export function categoryColor(category) { return COLORS[category] || 'var(--muted)'; }

function use(songs) {
  songs.forEach(song => { if (TITLE_FIXES[song.id]) song.title = TITLE_FIXES[song.id]; });
  planner.songs = songs;
  planner.songById = {};
  songs.forEach(song => { planner.songById[song.id] = song; });
}

export function loadSeed() {
  use(((window.SONG_SEED && window.SONG_SEED.songs) || []).slice());
}

/* "A57" for appendix songs, the number otherwise. */
export function songNumber(song) {
  const match = /^Appx\.?\s*(\d+)/i.exec((song && song.number) || '');
  return match ? 'A' + match[1] : (song && song.number) || '';
}

export function songLabel(id) {
  const song = id && planner.songById[id];
  return song ? '#' + song.number + ' ' + song.title : '';
}

export function minutes(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

export function statsFor(id) {
  return planner.stats[id] || { songId: id, timesSung: 0, lastSung: null, history: [] };
}

export function categories() {
  return Array.from(new Set(planner.songs.map(song => song.category)));
}

export function filteredSongs() {
  const query = view.search.trim().toLowerCase();
  const list = planner.songs.filter(song => {
    if (view.category === 'Appendix' ? !song.id.startsWith('appx-') : (view.category !== 'All' && song.category !== view.category)) return false;
    return !query || song.title.toLowerCase().includes(query) || String(song.number).toLowerCase().includes(query);
  });
  const byNumber = (a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
  return list.sort((a, b) => {
    const sa = statsFor(a.id), sb = statsFor(b.id);
    if (view.sort === 'times' && sb.timesSung !== sa.timesSung) return sb.timesSung - sa.timesSung;
    if (view.sort === 'last' && daysSince(sa.lastSung) !== daysSince(sb.lastSung)) return daysSince(sb.lastSung) - daysSince(sa.lastSung);
    if (view.sort === 'duration' && b.durationSec !== a.durationSec) return b.durationSec - a.durationSec;
    return byNumber(a, b);
  });
}

/* Groups of 100 numbered songs, then the appendix. */
export function pages(list) {
  const numbered = list.filter(song => !song.id.startsWith('appx-'));
  const appendix = list.filter(song => song.id.startsWith('appx-'));
  const out = [];
  for (let i = 0; i < numbered.length; i += PAGE_SIZE) {
    const group = numbered.slice(i, i + PAGE_SIZE);
    out.push({ label: group[0].number + '–' + group[group.length - 1].number, songs: group });
  }
  if (appendix.length) out.push({ label: 'Appendix', songs: appendix });
  return out.length ? out : [{ label: '', songs: [] }];
}

/* ---- the published song list ---- */

function parseCSV(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); field = ''; rows.push(row); row = []; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function songsFromCSV(text) {
  const rows = parseCSV(String(text || ''));
  const headerAt = rows.findIndex(row => {
    const cells = row.map(cell => String(cell).trim().toLowerCase());
    return cells.includes('category') && cells.includes('duration');
  });
  if (headerAt === -1) return [];
  const header = rows[headerAt].map(cell => String(cell).trim().toLowerCase());
  const col = names => header.findIndex(cell => names.includes(cell));
  const at = { category: col(['category']), number: col(['#', 'no', 'no.', 'number']), title: col(['new song', 'title', 'song']), duration: col(['duration']) };
  if (Object.values(at).some(index => index === -1)) return [];
  const out = [];
  rows.slice(headerAt + 1).forEach(row => {
    const cell = index => String(row[index] == null ? '' : row[index]).trim();
    const number = cell(at.number), title = cell(at.title), time = cell(at.duration).match(/^(\d+):([0-5]?\d)$/);
    if (!number || !title || !time) return;
    const appendix = number.match(/^Appx\.?\s*(\d+)$/i), plain = number.match(/^(\d+)$/);
    if (!appendix && !plain) return;
    const id = appendix ? 'appx-' + Number(appendix[1]) : String(Number(plain[1])).padStart(3, '0');
    out.push({ id, number: appendix ? 'Appx. ' + Number(appendix[1]) : id, category: cell(at.category), title, durationSec: Number(time[1]) * 60 + Number(time[2]) });
  });
  return out;
}

function looksRight(songs) {
  const ids = new Set();
  return songs.length >= MIN_SONGS && songs.every(song => {
    if (!song.id || !song.title || !(song.durationSec > 0) || ids.has(song.id) || !CATEGORIES.includes(song.category)) return false;
    ids.add(song.id);
    return true;
  });
}

/* Returns true when the published list replaced the one in song-seed.js. */
export async function loadPublished() {
  try {
    const response = await fetch(CATALOG_URL, { cache: 'no-store' });
    if (!response.ok) return false;
    const songs = songsFromCSV(await response.text());
    if (!looksRight(songs)) return false;
    use(songs);
    return true;
  } catch (_error) {
    return false;
  }
}

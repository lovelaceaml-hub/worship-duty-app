// `state` is not imported from app.js: app.js also imports from this module,
// and a real import back to app.js would make the whole module graph one
// cyclic component, deferring this file's own top-level initializers
// (CATEGORIES, FEATURES, ...) until after modules that need them already
// ran. app.js instead pushes the live reference in once, right after its own
// `state` is declared, through this setter (same pattern as
// setSharedNameMap, going the other direction).
let state;
export function setConstantsStateRef(value) { state = value; }

/* ================= constants ================= */

export const CATEGORIES = [
  { name: 'Worship',        color: '#4338ca', duties: ['Presider', 'Sermon', 'Prayer of Thanks', 'Closing Prayer'] },
  { name: 'Usher Sisters',  color: '#be185d', duties: ['Usher Door', 'Usher Front', 'Usher Back'] },
  { name: 'Usher Brothers', color: '#0369a1', duties: ['Usher #1', 'Usher #2', 'Lobby Security'] },
  { name: 'Lobby',          color: '#b45309', duties: ['Lobby Desk #1', 'Lobby Desk #2'] },
  { name: 'Translation',    color: '#047857', duties: ['Translation #1', 'Translation #2'] },
  { name: 'Media',          color: '#6d28d9', duties: ['Media Booth #1', 'Media Booth #2'] },
  { name: 'Parking Lot',    color: '#3f6212', duties: ['Parking #1', 'Parking #2', 'Parking #3', 'Parking #4', 'Parking #5'] },
  { name: 'Offering',       color: '#a21caf', duties: ['Offering #1', 'Offering #2', 'Offering #3', 'Offering #4', 'Offering #5', 'Offering #6'] }
];
export const SERVICE_LABELS = ['Morning', 'Afternoon', 'Evening', 'Early Morning', 'Commemoration'];
export const WORSHIP_TYPES = ['Sabbath Day', 'Third Day', 'Prayer Week', 'Ascension Day', 'Pentecost', 'Heavenly Parent\'s Day'];

/* Seed data for state.departments (categoryName -> member names), used only
   the first time app/departments is missing/empty in Firestore (or local mode). */
export const DEPARTMENTS_SEED = {
  'Worship': ['B. Anthony', 'B. Brent', 'B. Davidson', 'B. Giomar', 'B. James', 'B. Jason', 'B. Jordan', 'D. Aaron', 'D. Caleb', 'M. Chloe', 'D. Chris', 'D. Danielle', 'D. Kenya', 'D. Roza', 'E. Simon', 'M. Chad', 'S. Adrienne', 'S. Martha', 'S. Paola', 'S. Skye'],
  'Usher Sisters': ['M. Chloe', 'D. Danielle', 'D. Kenya', 'D. Roza', 'S. Adrienne', 'S. Estefany', 'S. Hana', 'S. Lisa', 'S. Melissa', 'S. Paola', 'S. Skye', 'S. Taylor'],
  'Usher Brothers': ['B. Alex', 'B. Anthony', 'B. Clyde', 'B. Davidson', 'B. Delvin', 'B. Drew', 'B. Dustin', 'B. Giomar', 'B. Irvin', 'B. James S', 'B. Jordan', 'D. Chris'],
  'Lobby': ['S. Adrienne', 'S. Anessa', 'S. Bridgette', 'S. Ivonne', 'S. Leslie', 'S. Lupita', 'S. Mercie', 'S. Nichol', 'S. Paola'],
  'Translation': ['B. Irvin', 'B. Jason', 'D. Roza', 'S. Elena', 'S. Elisa', 'S. Leslie', 'S. Martha', 'S. Monica C', 'S. Monica S', 'S. Paola'],
  'Media': [],
  'Parking Lot': [],
  'Offering': []
};
export const DATA_KEY = 'wds-data-v2';
/* Release stamp appended to every lazily-loaded local file. scripts/deploy.sh
   rewrites the 'DEV' token here, in index.html and in sw.js at release time, so
   long-lived browser caching can never serve a member a stale mix of files. */
export const ASSET_V = '?v=DEV';
// Fallback site-passcode hash, used only on a brand-new device before app/
// settings.sitePinHash is set. The live code is managed in Manage → Features
// and its plaintext is intentionally not recorded here (see docs).
export const DEFAULT_SITE_HASH = '1dffd68e5364ca2371d1627e59141f261264a7539f81c1746000b7320b5ad65b';
export const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSi0PRu7yJ9wbRn612zWq7rpInps6vWBcU7O9uHCp9W18sOCCF2U2ALS5EOo8hWrTSYXAfGmqiKYkaF/pub?gid=453135143&single=true&output=csv';

/* Name cleanup after the sheet's Raw Data tab was tidied up, maps old
   variant spellings to their canonical form. See 'unify-names'. This constant
   is the seed/fallback for the shared Firestore doc app/nameMap, which both
   this app and the song app read so canonicalization stays consistent. */
export const NAME_UNIFY_MAP = {
  'B. Anthony L': 'B. Anthony', 'D. Chris K': 'D. Chris', 'D. Chris Kane': 'D. Chris',
  'B. James D': 'B. James', 'B. Jason S': 'B. Jason', 'S. Martha B': 'S. Martha',
  'S. Monica Salazar': 'S. Monica S', 'M.Chad': 'M. Chad', 'B. Gio': 'B. Giomar',
  'D. Chloe': 'M. Chloe', 'B,James': 'B. James', 'BJason': 'B. Jason',
  'S. Melisaa': 'S. Melissa', 'S. Monica C.': 'S. Monica C',
  'S. Monica S.': 'S. Monica S'
};

/* Live copy of app/nameMap; null until the snapshot arrives (or in local mode). */
export let sharedNameMap = null;
export function unifiedNameMap() { return Object.assign({}, NAME_UNIFY_MAP, sharedNameMap || {}); }

/* Presentation-only cleanup. Stored member IDs and auth claims stay unchanged. */
export function memberLabel(value) {
  const raw = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  const fixed = {
    'B,James': 'B. James', 'BJason': 'B. Jason', 'D,Armani': 'D. Armani',
    'H.Elena': 'H. Elena', 'S. Melisaa': 'S. Melissa'
  }[raw];
  const source = fixed || raw;
  const match = source.match(/^([A-Za-z])(?:\.|,)?\s*(.*)$/);
  if (!match) return source;
  const title = match[1].toUpperCase() + '.';
  const words = match[2].trim().split(/\s+/).filter(Boolean);
  if (!words.length) return title;
  const first = words[0].replace(/[.,]+$/g, '');
  const key = title.toLowerCase() + ' ' + first.toLowerCase();
  const peers = (state && state.members || []).filter(name => {
    const parsed = String(name || '').trim().match(/^([A-Za-z])(?:\.|,)?\s*(.*)$/);
    if (!parsed) return false;
    const peerFirst = parsed[2].trim().split(/\s+/)[0]?.replace(/[.,]+$/g, '') || '';
    return parsed[1].toLowerCase() + '. ' + peerFirst.toLowerCase() === key;
  });
  if (peers.length < 2 || words.length < 2) return title + ' ' + first;
  const lastInitial = words[words.length - 1].replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();
  return title + ' ' + first + (lastInitial ? ' ' + lastInitial + '.' : '');
}

/* Feature toggles, managed live in Manage → Features, synced to every device */
export const FEATURES = [
  { id: 'siteLock',       label: 'Site passcode',             desc: 'Everyone must enter the 4-digit passcode before the app opens on a new device.', def: true },
  { id: 'editorLock',     label: 'Editor passcode',           desc: 'Require the passcode before anyone can open Manage and edit the schedule.', def: true },
  { id: 'notifications',  label: 'New-duty alerts',           desc: 'Members are alerted when a duty is added for them.', def: true },
  { id: 'reminders',      label: 'Day-before reminders',      desc: 'Members are reminded within 24 hours of each duty.', def: true },
  { id: 'calendarExport', label: 'Add-to-calendar button',    desc: 'Members can download their duties to their phone calendar with built-in reminders.', def: true },
  { id: 'whoElse',        label: '"Who else is serving?"',    desc: 'My Duties can expand the full lineup for each service.', def: true },
  { id: 'choirSong',      label: 'Choir song on services',    desc: 'Show the choir song line on each service card.', def: true },
  { id: 'songPicker',     label: 'Presider song picker',      desc: 'Presiders get a Presider tab and buttons in My Duties to plan the songs for their service.', def: true },
  { id: 'pastServices',   label: 'Past services',             desc: 'Allow browsing services that already happened.', def: true },
  { id: 'emptyDuties',    label: 'Show unassigned duties',    desc: 'The schedule shows every duty slot, even ones without a name yet.', def: false },
  { id: 'conflictWarnings', label: 'Double-duty warnings',    desc: 'Show a notice when one person has two duties in the same service.', def: true },
  { id: 'sheetSync',      label: 'Google Sheet sync',        desc: 'Pull schedule updates from the published Google Sheet automatically.', def: true },
  { id: 'changeRequests', label: 'Change requests',          desc: 'Members can request schedule changes from My Duties; the scheduler is notified.', def: true }
];

export function feat(id) {
  const f = (state.settings && state.settings.features) || {};
  if (id in f) return !!f[id];
  const d = FEATURES.find(x => x.id === id);
  return d ? d.def : true;
}

export async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
}

export function siteHash() { return (state.settings && state.settings.sitePinHash) || DEFAULT_SITE_HASH; }
export function siteUnlocked() { return localStorage.getItem('wds-site-unlock') === siteHash(); }

export function sheetUrl() { return (state.settings && state.settings.sheetUrl) || DEFAULT_SHEET_URL; }


export function setSharedNameMap(map) { sharedNameMap = map; }

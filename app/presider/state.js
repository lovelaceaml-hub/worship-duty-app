/* The song planner's own state. Songs come from song-seed.js (replaced by
   the published song list when it loads), song lists from setlists/*, and
   times sung from songStats/*. The schedule itself is the app's. */
import { readText } from '../store.js';

export const SECTIONS = ['home', 'library', 'services', 'history'];
export const SECTION_NAMES = { home: 'Home', library: 'Library', services: 'Services', history: 'History' };

export const planner = {
  songs: [],        // [{ id, number, category, title, durationSec }]
  songById: {},
  setlists: {},     // id -> setlist
  stats: {},        // song id -> { songId, timesSung, lastSung, history }
  listening: false,
  loaded: { setlists: false, stats: false }
};

export const view = {
  section: 'home',
  scope: 'mine',          // Home: 'mine' or 'all'
  setlist: null,          // id of the song list open in the Library
  slot: null,             // 'glory' or 'thanks' while picking that song
  runsheet: null,         // id of the service shown full screen
  otherDate: false,       // "Plan another date" form open
  search: '',
  category: 'All',
  sort: 'number',
  page: 0,                // first 100-song group shown
  more: 0,                // groups added below it by scrolling
  openSong: null,
  openService: null,
  showPast: false,
  backfill: null,         // { songId, date } while adding a past date
  helpHidden: readText('nss-help-dismissed') === '1'
};

/* Plain values the planner shows in several places. */
export const RECENT_DAYS = 28;
export const PAGE_SIZE = 100;
export const SORTS = [['number', 'Number'], ['times', 'Times sung'], ['last', 'Longest since sung'], ['duration', 'Length']];

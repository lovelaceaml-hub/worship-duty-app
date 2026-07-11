'use strict';

/* =================================================================
   song-lib.js — pure, side-effect-free helpers for the New Song
   selection feature, shared by THREE consumers:

   1. song-app.js (the in-app presider song picker) — via window.SongLib
   2. the Signal ingest daemon (~/tools/song-ingest/ingest.js) — via
      require('worship-duty-app/song-lib.js') under Node
   3. any Node test harness

   The logic here is lifted byte-for-byte from the old stand-alone
   new-song-app/app.js. It is the single source of truth for how a
   setlist becomes "sung" history, so the in-app "Mark as sung" button
   and the Signal pipeline can never diverge.

   Dual-environment footer at the bottom exports the same surface under
   Node (module.exports) and the browser (window.SongLib). No side
   effects at load — requiring or <script>-including this file never
   touches the DOM, network, or Firestore.

   ⚠️  Do NOT change serviceIdFor's output. Its slug scheme defines the
   existing setlists/{id} Firestore document ids. Changing it would
   orphan every existing setlist.
   ================================================================= */

/** Build serviceId matching the duty app: YYYY-MM-DD_<service-slug>. */
function serviceIdFor(date, serviceLabel) {
  return date + '_' + String(serviceLabel || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/* ---- pure mark-as-sung / undo / backfill helpers ----
   These operate purely on plain data so they can be unit-tested with no
   DOM/Firebase. A statsMap is { songId: { songId, timesSung, lastSung,
   history:[{date,service,by,markedAt}] } }. They return a *new* map of
   only the songStats docs that changed, so callers can upsert exactly
   those. history is the append-only source of truth; timesSung/lastSung
   are recomputed caches. */

function recompute(history) {
  const timesSung = history.length;
  let lastSung = null;
  history.forEach(h => { if (h.date && (!lastSung || h.date > lastSung)) lastSung = h.date; });
  return { timesSung, lastSung };
}

/** Apply a setlist being marked sung. Returns { changed: {songId: statsDoc},
    removed: [] } — `changed` docs should be upserted. Idempotent per service. */
function applySung(statsMap, setlist, opts) {
  opts = opts || {};
  const by = opts.by || '';
  const markedAt = opts.markedAt || Date.now();
  const date = setlist.date;
  const service = setlist.id;
  const changed = {};
  (setlist.songs || []).forEach(songId => {
    const prev = statsMap[songId];
    const history = prev && Array.isArray(prev.history) ? prev.history.slice() : [];
    // idempotency: skip if this service already recorded for this song
    if (history.some(h => h.service === service)) return;
    history.push({ date: date, service: service, by: by, markedAt: markedAt });
    const c = recompute(history);
    changed[songId] = { songId: songId, timesSung: c.timesSung, lastSung: c.lastSung, history: history };
  });
  return { changed: changed, removed: [] };
}

/** Reverse a mark-sung for a setlist. Returns { changed: {songId: statsDoc},
    removed: [songId] }. Keeps the doc with recomputed values; deletes only
    when history becomes empty. */
function applyUndo(statsMap, setlist) {
  const service = setlist.id;
  const changed = {};
  const removed = [];
  (setlist.songs || []).forEach(songId => {
    const prev = statsMap[songId];
    if (!prev || !Array.isArray(prev.history)) return;
    const history = prev.history.filter(h => h.service !== service);
    if (history.length === prev.history.length) return; // nothing removed
    if (history.length === 0) {
      removed.push(songId);
    } else {
      const c = recompute(history);
      changed[songId] = { songId: songId, timesSung: c.timesSung, lastSung: c.lastSung, history: history };
    }
  });
  return { changed: changed, removed: removed };
}

/** Build a backfill history-entry service key: backfill-<date>-<songId>.
    One per song+date pair, so re-backfilling the same song/date is idempotent. */
function backfillServiceId(date, songId) {
  return 'backfill-' + date + '-' + songId;
}

/** Append one backfilled history entry for a single song. Returns the new
    stats doc for that song (recomputed), or null if this exact backfill
    (same song+date) already exists (idempotent). */
function applyBackfill(statsMap, songId, date, opts) {
  opts = opts || {};
  const by = opts.by || 'Backfill';
  const markedAt = opts.markedAt || Date.now();
  const service = backfillServiceId(date, songId);
  const prev = statsMap[songId];
  const history = prev && Array.isArray(prev.history) ? prev.history.slice() : [];
  if (history.some(h => h.service === service)) return null; // already backfilled for this date
  history.push({ date: date, service: service, by: by, markedAt: markedAt, backfilled: true });
  const c = recompute(history);
  return { songId: songId, timesSung: c.timesSung, lastSung: c.lastSung, history: history };
}

/** Remove a single history entry (by its `service` key) from one song's
    stats. Returns { changed: statsDoc|null, removed: bool } — removed=true
    with changed=null means the doc should be deleted (history now empty). */
function removeHistoryEntry(statsMap, songId, service) {
  const prev = statsMap[songId];
  if (!prev || !Array.isArray(prev.history)) return { changed: null, removed: false };
  const history = prev.history.filter(h => h.service !== service);
  if (history.length === prev.history.length) return { changed: null, removed: false };
  if (history.length === 0) return { changed: null, removed: true };
  const c = recompute(history);
  return { changed: { songId: songId, timesSung: c.timesSung, lastSung: c.lastSung, history: history }, removed: false };
}

/** Total duration (seconds) of a song-id list, using the catalog map. */
function totalDuration(songIds, songById) {
  return (songIds || []).reduce((sum, id) => sum + ((songById[id] && songById[id].durationSec) || 0), 0);
}

/** Song ids that count toward a setlist's total time — everything except the
    Glory and Thanks songs, which are sung outside the "new songs" portion of
    the service and so are excluded from the running total. */
function countedSongIds(sl) {
  return (sl.songs || []).filter(sid => sid !== sl.glorySong && sid !== sl.thanksSong);
}

/* ---- dual-environment export ---- */
const SongLibAPI = {
  serviceIdFor, recompute, applySung, applyUndo,
  backfillServiceId, applyBackfill, removeHistoryEntry,
  totalDuration, countedSongIds
};
if (typeof module !== 'undefined' && module.exports) module.exports = SongLibAPI;
if (typeof window !== 'undefined') window.SongLib = SongLibAPI;

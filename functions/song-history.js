'use strict';

/*
 * Pure server copies of the setlist/song-history semantics in the root
 * song-lib.js (serviceIdFor, recompute, applySung, removeHistoryEntry),
 * plus applyCorrection for an authorized correction to already-recorded
 * history. Kept independent so `functions/` never requires the root
 * song-lib.js (the deploy package only ships the functions directory).
 * `serviceIdFor`'s slug scheme must stay byte-for-byte identical to the
 * root copy: it defines existing setlists/{id} document ids.
 */

function serviceIdFor(date, serviceLabel) {
  return date + '_' + String(serviceLabel || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function recompute(history) {
  const timesSung = history.length;
  let lastSung = null;
  history.forEach(h => { if (h.date && (!lastSung || h.date > lastSung)) lastSung = h.date; });
  return { timesSung, lastSung };
}

/* Apply a setlist being marked sung. Returns { changed: {songId: statsDoc} },
   idempotent per service: a song that already carries an entry for this
   service is skipped. */
function applySung(statsMap, setlist, opts = {}) {
  const by = opts.by || '';
  const markedAt = opts.markedAt || Date.now();
  const source = opts.source || 'automatic';
  const date = setlist.date;
  const service = setlist.id;
  const changed = {};
  (setlist.songs || []).forEach(songId => {
    const prev = statsMap[songId];
    const history = prev && Array.isArray(prev.history) ? prev.history.slice() : [];
    if (history.some(h => h.service === service)) return;
    history.push({ date, service, by, markedAt, source });
    const c = recompute(history);
    changed[songId] = { songId, timesSung: c.timesSung, lastSung: c.lastSung, history };
  });
  return { changed };
}

/* Remove a single history entry (by its `service` key) from one song's
   stats. Returns { changed: statsDoc|null, removed: bool } — removed=true
   with changed=null means the doc should be deleted (history now empty). */
function removeHistoryEntry(statsMap, songId, service) {
  const prev = statsMap[songId];
  if (!prev || !Array.isArray(prev.history)) return { changed: null, removed: false };
  const history = prev.history.filter(h => h.service !== service);
  if (history.length === prev.history.length) return { changed: null, removed: false };
  if (history.length === 0) return { changed: null, removed: true };
  const c = recompute(history);
  return { changed: { songId, timesSung: c.timesSung, lastSung: c.lastSung, history }, removed: false };
}

/*
 * Apply an authorized correction to a recorded (status: 'sung') setlist:
 * oldSongIds -> newSongIds. Songs dropped lose their entry for this
 * service (the stats doc is marked for deletion when history becomes
 * empty); songs added get one 'corrected' entry; songs kept are untouched.
 * Returns { changed: {songId: statsDoc}, removed: [songId], addedIds,
 * removedIds } so the caller can write exactly what changed and report
 * `changedSongs`.
 */
function applyCorrection(statsMap, setlist, newSongIds, opts = {}) {
  const by = opts.by || '';
  const markedAt = opts.markedAt || Date.now();
  const date = setlist.date;
  const service = setlist.id;
  const oldIds = new Set(setlist.songs || []);
  const nextIds = new Set(newSongIds || []);
  const removedIds = Array.from(oldIds).filter(id => !nextIds.has(id));
  const addedIds = Array.from(nextIds).filter(id => !oldIds.has(id));

  const changed = {};
  const removed = [];

  removedIds.forEach(songId => {
    const result = removeHistoryEntry(statsMap, songId, service);
    if (result.removed) removed.push(songId);
    else if (result.changed) changed[songId] = result.changed;
  });

  addedIds.forEach(songId => {
    const prev = statsMap[songId];
    const history = prev && Array.isArray(prev.history) ? prev.history.slice() : [];
    if (history.some(h => h.service === service)) return;
    history.push({ date, service, by, markedAt, source: 'corrected' });
    const c = recompute(history);
    changed[songId] = { songId, timesSung: c.timesSung, lastSung: c.lastSung, history };
  });

  return { changed, removed, addedIds, removedIds };
}

module.exports = {
  serviceIdFor,
  recompute,
  applySung,
  removeHistoryEntry,
  applyCorrection
};

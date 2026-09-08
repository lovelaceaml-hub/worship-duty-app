'use strict';

/* Pure setlist confirmation and status rules. Setlist records and their
   timestamp values are supplied by callers, so this module stays browser and
   persistence free. */
(function expose(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.window) {
    const app = root.window.WorshipApp || (root.window.WorshipApp = {});
    const domain = app.domain || (app.domain = {});
    domain.setlist = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSetlistDomain() {
  /* Keep the truthy guard and native relational comparison intact. Firestore
     Timestamp values implement comparable value semantics, so callers must
     provide them unchanged. */
  function isConfirmed(setlist) {
    return !!(setlist && setlist.confirmedAt && setlist.confirmedAt >= (setlist.updatedAt || 0));
  }

  function isChanged(setlist) {
    return !!(setlist && setlist.confirmedAt && setlist.confirmedAt < (setlist.updatedAt || 0));
  }

  function status(setlist) {
    const count = (setlist && setlist.songs || []).length;
    if (setlist && setlist.status === 'sung') return 'sung';
    if (!count) return 'empty';
    if (isConfirmed(setlist)) return 'confirmed';
    if (isChanged(setlist)) return 'changed';
    return 'picked';
  }

  function summary(setlistsById, serviceId) {
    const setlist = setlistsById && setlistsById[serviceId];
    if (!setlist) return null;
    const count = (setlist.songs || []).length;
    return {
      count,
      confirmed: !!(count && isConfirmed(setlist)),
      changed: !!(count && isChanged(setlist))
    };
  }

  return { isConfirmed, isChanged, status, summary };
});

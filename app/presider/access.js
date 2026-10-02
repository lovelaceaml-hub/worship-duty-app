/* Who may change songs: the service's assigned Presider, song editors and
   administrators (permissions.js canEditSongs). Song history, and song lists
   for dates with no Presider duty, are for song editors and administrators. */
import { data } from '../store.js';
import { canEditSongsFor } from '../services/access.js';

function withPresider(setlist) {
  const service = data.services.find(item => item.date === setlist.date &&
    String(item.service || '').toLowerCase() === String(setlist.serviceLabel || setlist.service || '').toLowerCase());
  const presider = (service && service.assignments && service.assignments.Presider) || setlist.presider || '';
  return Object.assign({}, service || {}, setlist, { presider });
}

/* Whether this member may change a list. A list counted as sung is history:
   it stays as it was sung, so the song counts stay right (song editors
   correct a song's history in History). */
export function canEdit(setlistOrService) {
  if (setlistOrService && setlistOrService.status === 'sung') return false;
  return !!setlistOrService && canEditSongsFor(withPresider(setlistOrService));
}

export function canManageSongs() {
  return canEditSongsFor({});
}

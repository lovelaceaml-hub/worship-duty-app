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

export function canEdit(setlistOrService) {
  return !!setlistOrService && canEditSongsFor(withPresider(setlistOrService));
}

export function canManageSongs() {
  return canEditSongsFor({});
}

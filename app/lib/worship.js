/* What each kind of service has, by its worship name and label.

   - Every service has a Glory song.
   - Only Sabbath Day and Third Day services have a choir song and a closing
     prayer (not Prayer Week or Preaching Week, and not feast days).
   - A Thanks song and Thanks Prayer come at Sabbath Day Morning and at the
     Morning service of a feast day. A feast day is any worship name that is
     not one of the weekly or week-long ones below.
   Names come from the Sheet as typed, so they are compared without extra
   spaces and whatever their capitals ("Sabbath day " is Sabbath Day). */
const WEEKLY = ['sabbath day', 'third day', 'prayer week', 'preaching week'];

function plain(name) {
  return String(name == null ? '' : name).trim().replace(/\s+/g, ' ').toLowerCase();
}

export function hasChoir(worship) {
  const name = plain(worship);
  return name === 'sabbath day' || name === 'third day';
}

export function isFeast(worship) {
  const name = plain(worship);
  return !!name && !WEEKLY.includes(name);
}

export function hasThanks(worship, label) {
  return plain(label) === 'morning' && (plain(worship) === 'sabbath day' || isFeast(worship));
}

/* Whether a service has this duty at all: Thanks Prayer ("Prayer of
   Thanks") only with a Thanks song, Closing Prayer only with a choir song.
   A service with no worship name is a Sabbath Day service. */
export function hasDuty(service, duty) {
  const worship = plain(service && service.worship) || 'sabbath day';
  if (duty === 'Prayer of Thanks') return hasThanks(worship, service && service.service);
  if (duty === 'Closing Prayer') return hasChoir(worship);
  return true;
}

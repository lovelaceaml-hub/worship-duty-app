/* What each kind of service has, by its worship name and label.

   - Every service has a Glory song.
   - Only Sabbath Day and Third Day services have a choir song and a closing
     prayer (not Prayer Week or Preaching Week, and not feast days).
   - A Thanks song and Thanks Prayer come at Sabbath Day Morning and at the
     Morning service of a feast day. A feast day is any worship name that is
     not one of the weekly or week-long ones below. */
const WEEKLY = ['Sabbath Day', 'Third Day', 'Prayer Week', 'Preaching Week'];

export function hasChoir(worship) {
  return worship === 'Sabbath Day' || worship === 'Third Day';
}

export function isFeast(worship) {
  return !!worship && !WEEKLY.includes(worship);
}

export function hasThanks(worship, label) {
  return label === 'Morning' && (worship === 'Sabbath Day' || isFeast(worship));
}

/* Whether a service has this duty at all: Thanks Prayer ("Prayer of
   Thanks") only with a Thanks song, Closing Prayer only with a choir song.
   A service with no worship name is a Sabbath Day service. */
export function hasDuty(service, duty) {
  const worship = (service && service.worship) || 'Sabbath Day';
  if (duty === 'Prayer of Thanks') return hasThanks(worship, service && service.service);
  if (duty === 'Closing Prayer') return hasChoir(worship);
  return true;
}

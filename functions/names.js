'use strict';

/* Member names. A stored name may be an older spelling: app/nameMap maps old
   spellings to the current one (Manage, Data, Fix a member's name keeps it),
   and BUILT_IN_NAME_MAP holds the spellings fixed before that existed. It is
   the same list as app/lib/names.js (a test keeps the two equal).
   canonicalName() is the one way the server compares and addresses members:
   sign-in, alerts, the calendar feed, the nightly job, the Sheet import and
   every "already serving" check. */

const BUILT_IN_NAME_MAP = Object.freeze({
  'B. Anthony L': 'B. Anthony', 'D. Chris K': 'D. Chris', 'D. Chris Kane': 'D. Chris',
  'B. James D': 'B. James', 'B. Jason S': 'B. Jason', 'S. Martha B': 'S. Martha',
  'S. Monica Salazar': 'S. Monica S', 'M.Chad': 'M. Chad', 'B. Gio': 'B. Giomar',
  'D. Chloe': 'M. Chloe', 'B,James': 'B. James', 'BJason': 'B. Jason',
  'S. Melisaa': 'S. Melissa', 'S. Monica C.': 'S. Monica C', 'S. Monica S.': 'S. Monica S'
});

const tidy = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

/* The current spelling of a name: app/nameMap first, then the built-in list,
   again and again until the name stops changing, so a member renamed twice
   is still found under their first spelling. A spelling a rename chose (a
   value in app/nameMap) stays as it is, even when the built-in list would
   change it back, so renaming "S. Monica S" to "S. Monica Salazar" holds.
   A loop stops at the last new name. app/lib/names.js does the same. */
function canonicalName(raw, nameMap = {}) {
  let value = tidy(raw);
  const seen = new Set([value]);
  const map = nameMap && typeof nameMap === 'object' ? nameMap : {};
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const chosen = new Set(Object.values(map).map(tidy));
  for (;;) {
    const mapped = has(map, value) ? map[value] : !chosen.has(value) && has(BUILT_IN_NAME_MAP, value) ? BUILT_IN_NAME_MAP[value] : '';
    const next = tidy(mapped);
    if (!next || next === value || seen.has(next)) return value;
    seen.add(next);
    value = next;
  }
}

/* A name typed into the Sheet, cleaned the way the Sheet's own script cleans
   it for its Raw Data tab (control characters and extra spaces removed, the
   title initial written "B. "), then put in its current spelling. */
function cleanName(raw, nameMap = {}) {
  let value = String(raw == null ? '' : raw).replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!value) return '';
  value = value.replace(/^([BDSEM])[.\s]+\s*/i, (_match, title) => title.toUpperCase() + '. ');
  return canonicalName(value, nameMap);
}

/* Whether a name can be a member's sign-in name (an accounts document id). */
function usableMemberName(name) {
  const value = tidy(name);
  return !!value && value.length <= 80 && !value.includes('/') && value !== '.' && value !== '..';
}

/* Names shown for duties whose stored name is older; the same map as
   DUTY_NAMES in app/config/duties.js. */
const DUTY_NAMES = Object.freeze({ Sermon: 'Opening Prayer', 'Prayer of Thanks': 'Thanks Prayer' });

function dutyName(duty) {
  return DUTY_NAMES[duty] || duty;
}

module.exports = { BUILT_IN_NAME_MAP, canonicalName, cleanName, usableMemberName, DUTY_NAMES, dutyName };

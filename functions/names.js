'use strict';

/* Member names typed into the Sheet are cleaned the way the Sheet's own
   script cleans them for its Raw Data tab: control characters and extra
   spaces removed, the title initial written "B. ", and known old spellings
   mapped to the current one. BUILT_IN_NAME_MAP is the same list as
   app/lib/names.js (a test keeps the two equal); app/nameMap then applies. */

const BUILT_IN_NAME_MAP = Object.freeze({
  'B. Anthony L': 'B. Anthony', 'D. Chris K': 'D. Chris', 'D. Chris Kane': 'D. Chris',
  'B. James D': 'B. James', 'B. Jason S': 'B. Jason', 'S. Martha B': 'S. Martha',
  'S. Monica Salazar': 'S. Monica S', 'M.Chad': 'M. Chad', 'B. Gio': 'B. Giomar',
  'D. Chloe': 'M. Chloe', 'B,James': 'B. James', 'BJason': 'B. Jason',
  'S. Melisaa': 'S. Melissa', 'S. Monica C.': 'S. Monica C', 'S. Monica S.': 'S. Monica S'
});

function cleanName(raw, nameMap = {}) {
  let value = String(raw == null ? '' : raw).replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!value) return '';
  value = value.replace(/^([BDSEM])[.\s]+\s*/i, (_match, title) => title.toUpperCase() + '. ');
  value = BUILT_IN_NAME_MAP[value] || value;
  return (nameMap && nameMap[value]) || value;
}

module.exports = { BUILT_IN_NAME_MAP, cleanName };

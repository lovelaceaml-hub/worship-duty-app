/* Member names are written "B. Anthony": a title initial, then the name.
   B. Brother, S. Sister, D. Deacon or Deaconess, M. Missionary, E. Elder,
   P. Pastor. The shared document app/nameMap maps old spellings to the
   current one; BUILT_IN_NAME_MAP covers devices that have not loaded it. */

export const BUILT_IN_NAME_MAP = {
  'B. Anthony L': 'B. Anthony', 'D. Chris K': 'D. Chris', 'D. Chris Kane': 'D. Chris',
  'B. James D': 'B. James', 'B. Jason S': 'B. Jason', 'S. Martha B': 'S. Martha',
  'S. Monica Salazar': 'S. Monica S', 'M.Chad': 'M. Chad', 'B. Gio': 'B. Giomar',
  'D. Chloe': 'M. Chloe', 'B,James': 'B. James', 'BJason': 'B. Jason',
  'S. Melisaa': 'S. Melissa', 'S. Monica C.': 'S. Monica C', 'S. Monica S.': 'S. Monica S'
};

/* Spelling fixes applied when a name is shown. Stored names do not change. */
const DISPLAY_FIXES = {
  'B,James': 'B. James', 'BJason': 'B. Jason', 'D,Armani': 'D. Armani',
  'H.Elena': 'H. Elena', 'S. Melisaa': 'S. Melissa'
};

/* The current spelling of a stored name, exactly as the server works it out
   (functions/names.js canonicalName), so the app and the server always name
   a member the same way: spaces tidied, then app/nameMap, else the built-in
   spellings, again and again until the name stops changing (a member renamed
   twice is found under their first spelling); a loop stops at the last new
   name. Answers are kept per name map, because every redraw asks for the
   same few hundred names. */
const canonicals = new WeakMap();
const NO_MAP = {};

export function canonicalName(name, nameMap) {
  const map = nameMap && typeof nameMap === 'object' ? nameMap : NO_MAP;
  let known = canonicals.get(map);
  if (!known) canonicals.set(map, known = new Map());
  const key = String(name == null ? '' : name);
  let value = known.get(key);
  if (value === undefined) {
    value = currentSpelling(key, map);
    known.set(key, value);
  }
  return value;
}

const oneSpaced = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
const has = (map, key) => Object.prototype.hasOwnProperty.call(map, key);

function currentSpelling(raw, map) {
  let value = oneSpaced(raw);
  const seen = new Set([value]);
  for (;;) {
    const next = oneSpaced(has(map, value) ? map[value] : has(BUILT_IN_NAME_MAP, value) ? BUILT_IN_NAME_MAP[value] : '');
    if (!next || next === value || seen.has(next)) return value;
    seen.add(next);
    value = next;
  }
}

function split(name) {
  // A title is one letter followed by a dot, comma or space: "B. Anthony", "M.Chad".
  // "Bridgette" has no title and shows as it is.
  const match = String(name || '').trim().match(/^([A-Za-z])(?:[.,]\s*|\s+)(.*)$/);
  if (!match) return null;
  const words = match[2].trim().split(/\s+/).filter(Boolean);
  return { title: match[1].toUpperCase() + '.', first: (words[0] || '').replace(/[.,]+$/g, ''), words };
}

function tidy(name) {
  const raw = String(name == null ? '' : name).trim().replace(/\s+/g, ' ');
  return DISPLAY_FIXES[raw] || raw;
}

const shortKey = parts => (parts.title + ' ' + parts.first).toLowerCase();
const lastWord = parts => parts.words.length > 1 ? parts.words[parts.words.length - 1].replace(/[^A-Za-z]/g, '') : '';

/* Who shares a title and first name, built once per member list (the list
   is replaced whenever it changes), with every name shown so far. */
const indexes = new WeakMap();
function indexOf(members) {
  let index = indexes.get(members);
  if (!index || index.size !== members.length) {
    index = { size: members.length, groups: new Map(), shown: new Map() };
    members.forEach(member => {
      const name = tidy(member);
      const parts = split(name);
      if (!parts || !parts.first) return;
      const key = shortKey(parts);
      if (!index.groups.has(key)) index.groups.set(key, new Set());
      index.groups.get(key).add(name);
    });
    indexes.set(members, index);
  }
  return index;
}

/* "B. Anthony". When two people share a title and first name, a last
   initial tells them apart ("S. Monica C."), and the whole last name when
   the initials match too ("B. Adam Hill", "B. Adam Hart"). A name missing
   from the member list still counts, so it never looks like a member's. */
export function displayName(name, members = []) {
  const index = indexOf(members);
  const key = String(name == null ? '' : name);
  let shown = index.shown.get(key);
  if (shown === undefined) {
    shown = showName(tidy(key), index);
    index.shown.set(key, shown);
  }
  return shown;
}

function showName(raw, index) {
  if (!raw) return '';
  const parts = split(raw);
  if (!parts) return raw;
  if (!parts.first) return parts.title;
  const short = parts.title + ' ' + parts.first;
  const sharing = new Set(index.groups.get(shortKey(parts)) || []);
  sharing.add(raw);
  const last = lastWord(parts);
  if (sharing.size < 2 || !last) return short;
  const initial = last.charAt(0).toUpperCase();
  const clash = Array.from(sharing).some(other => {
    if (other === raw) return false;
    const otherLast = lastWord(split(other));
    return otherLast && otherLast.charAt(0).toUpperCase() === initial && otherLast.toLowerCase() !== last.toLowerCase();
  });
  return short + ' ' + (clash ? last : initial + '.');
}

export function initials(name) {
  return String(name || '').split(/\s+/).map(part => part.replace(/[^A-Za-z0-9]/g, '').charAt(0))
    .filter(Boolean).slice(0, 2).join('').toUpperCase();
}

/* Pastor, Elder, Missionary, Deacon, then Brothers and Sisters together,
   each group by name. */
const TITLE_ORDER = { 'P.': 0, 'E.': 1, 'M.': 2, 'D.': 3, 'B.': 4, 'S.': 4 };
export function byTitle(a, b) {
  const pa = split(a), pb = split(b);
  const ra = pa && TITLE_ORDER[pa.title] != null ? TITLE_ORDER[pa.title] : 5;
  const rb = pb && TITLE_ORDER[pb.title] != null ? TITLE_ORDER[pb.title] : 5;
  if (ra !== rb) return ra - rb;
  const na = pa ? pa.words.join(' ') : String(a), nb = pb ? pb.words.join(' ') : String(b);
  return na.localeCompare(nb) || String(a).localeCompare(String(b));
}

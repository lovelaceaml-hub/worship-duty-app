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

export function canonicalName(name, nameMap) {
  const value = String(name == null ? '' : name).trim();
  if (!value) return '';
  return (nameMap && nameMap[value]) || BUILT_IN_NAME_MAP[value] || value;
}

function split(name) {
  const match = String(name || '').trim().match(/^([A-Za-z])(?:\.|,)?\s*(.*)$/);
  if (!match) return null;
  const words = match[2].trim().split(/\s+/).filter(Boolean);
  return { title: match[1].toUpperCase() + '.', first: (words[0] || '').replace(/[.,]+$/g, ''), words };
}

/* "B. Anthony". Adds a last initial when two members share a title and
   first name ("S. Monica C."). */
export function displayName(name, members = []) {
  const raw = String(name == null ? '' : name).trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  const parts = split(DISPLAY_FIXES[raw] || raw);
  if (!parts) return raw;
  if (!parts.first) return parts.title;
  const key = (parts.title + ' ' + parts.first).toLowerCase();
  const sharing = members.filter(member => {
    const other = split(member);
    return other && (other.title + ' ' + other.first).toLowerCase() === key;
  });
  if (sharing.length < 2 || parts.words.length < 2) return parts.title + ' ' + parts.first;
  const lastInitial = parts.words[parts.words.length - 1].replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();
  return parts.title + ' ' + parts.first + (lastInitial ? ' ' + lastInitial + '.' : '');
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

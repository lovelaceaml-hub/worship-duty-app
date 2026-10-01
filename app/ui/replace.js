/* Replacing part of the screen with new markup, the way every redraw does,
   keeps what the member was doing there:
   - the control that had focus, and the text selected in it;
   - values typed or chosen in fields that no saved state holds yet (fields
     without data-change or data-input, such as the sign-in name and PIN or
     the "Days that are different" form), until their form is submitted;
   - how far each scrolling row was scrolled.
   A control is found again by what it is and does: its id, or its tag with
   data-act / data-change / data-input, the other data-* keys, name and type,
   inside the same form. */

const FIELDS = ':is(input, select, textarea):not([data-change], [data-input], [type="hidden"], [type="file"], [type="submit"], [type="button"])';
const SCROLLERS = '.scroll-x';
/* Controls that can take focus back for a control that is gone. Text fields
   are left out: focusing one would pause live updates. */
const CONTROLS = 'button, a[href], summary, [tabindex]:not([tabindex="-1"]), input[type="checkbox"], input[type="radio"]';
const TEXT_TYPES = ['text', 'search', 'url', 'password', 'email', 'tel'];

/* A focused control that was disabled at the redraw (it is saving) gets
   focus back once it is enabled again, unless the member moved on. */
let pending = null;

function selector(el) {
  if (el.id) return '#' + CSS.escape(el.id);
  let key = el.tagName.toLowerCase();
  const keep = name => { key += '[' + name + '="' + CSS.escape(el.getAttribute(name)) + '"]'; };
  Array.from(el.attributes).forEach(attribute => { if (attribute.name.startsWith('data-')) keep(attribute.name); });
  ['name', 'type'].forEach(name => { if (el.hasAttribute(name)) keep(name); });
  if ((el.type === 'radio' || el.type === 'checkbox') && el.hasAttribute('value')) keep('value');
  if (el.matches(SCROLLERS)) {
    if (el.classList[0]) key += '.' + CSS.escape(el.classList[0]);
    ['role', 'aria-label'].forEach(name => { if (el.hasAttribute(name)) keep(name); });
  }
  const form = el.parentElement && el.parentElement.closest('form');
  return form ? selector(form) + ' ' + key : key;
}

/* Where to find `el` again: its selector, and which of the matches it is. */
function place(el, within) {
  const key = selector(el);
  try {
    return { key, at: Math.max(0, Array.from(within.querySelectorAll(key)).indexOf(el)) };
  } catch (_error) {
    return null;
  }
}

function find(root, spot) {
  if (!spot) return null;
  try {
    const all = root.querySelectorAll(spot.key);
    return all[spot.at] || (all.length === 1 ? all[0] : null);
  } catch (_error) {
    return null;
  }
}

function isText(el) {
  return el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && TEXT_TYPES.includes((el.type || 'text').toLowerCase()));
}

function initialValue(field) {
  if (field.tagName !== 'SELECT') return field.defaultValue;
  const chosen = Array.from(field.options).filter(option => option.defaultSelected).pop() || field.options[0];
  return chosen ? chosen.value : '';
}

/* A field the member changed since it was drawn. */
function changed(field) {
  if (field.type === 'checkbox' || field.type === 'radio') return field.checked !== field.defaultChecked;
  return field.value !== initialValue(field);
}

/* Submitting a form uses its values: from then on, redraws show the form
   the way the screen draws it. */
document.addEventListener('submit', event => {
  event.target.querySelectorAll(FIELDS).forEach(field => {
    if (field.type === 'checkbox' || field.type === 'radio') field.defaultChecked = field.checked;
    else if (field.tagName === 'SELECT') Array.from(field.options).forEach(option => { option.defaultSelected = option.selected; });
    else field.defaultValue = field.value;
  });
}, true);

function focusable(el) {
  return !!el && !el.disabled && !el.closest('[hidden], [inert]');
}

function focusOn(el, selection) {
  el.focus({ preventScroll: true });
  if (document.activeElement !== el) return false;
  if (selection && isText(el)) {
    try { el.setSelectionRange(selection.start, selection.end, selection.direction); } catch (_error) { /* not a text field */ }
  }
  return true;
}

/* When the focused control is gone, the nearest control before it that is
   still there takes focus (a card's toggle when its button turned into a
   form), so the member keeps their place in the page. */
function nearestBefore(root, old, lost) {
  const before = Array.from(old.querySelectorAll(CONTROLS))
    .filter(el => el !== lost && (lost.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING));
  for (let i = before.length - 1; i >= 0 && i >= before.length - 40; i--) {
    const twin = find(root, place(before[i], old));
    if (focusable(twin) && focusOn(twin)) return true;
  }
  return false;
}

/* Put `markup` into `root`. With `keep` (the same screen drawn again) the
   focus, unsaved field values and scroll positions carry over. */
export function replaceMarkup(root, markup, { keep = true } = {}) {
  if (!keep) {
    pending = null;
    root.innerHTML = markup;
    return;
  }
  const active = document.activeElement;
  const lost = active && active !== root && root.contains(active) ? active : null;
  const focus = lost ? place(lost, root) : null;
  const selection = lost && isText(lost) ? { start: lost.selectionStart, end: lost.selectionEnd, direction: lost.selectionDirection } : null;
  const values = Array.from(root.querySelectorAll(FIELDS)).filter(changed)
    .map(field => ({ spot: place(field, root), value: field.value, checked: field.checked }));
  const scrolls = Array.from(root.querySelectorAll(SCROLLERS)).filter(el => el.scrollLeft || el.scrollTop)
    .map(el => ({ spot: place(el, root), left: el.scrollLeft, top: el.scrollTop }));
  const old = document.createDocumentFragment();
  if (lost) old.append(...root.childNodes);

  root.innerHTML = markup;

  values.forEach(item => {
    const field = find(root, item.spot);
    if (!field) return;
    if (field.type === 'checkbox' || field.type === 'radio') field.checked = item.checked;
    else if (field.tagName !== 'SELECT' || Array.from(field.options).some(option => option.value === item.value)) field.value = item.value;
  });
  scrolls.forEach(item => {
    const el = find(root, item.spot);
    if (el) { el.scrollLeft = item.left; el.scrollTop = item.top; }
  });
  if (lost) {
    pending = null;
    const twin = find(root, focus);
    if (focusable(twin) && focusOn(twin, selection)) return;
    if (twin) pending = { focus, selection, until: Date.now() + 10000 };
    else nearestBefore(root, old, lost);
  } else if (pending) {
    const waiting = pending;
    const moved = document.activeElement && document.activeElement !== document.body;
    if (moved || Date.now() > waiting.until) { pending = null; return; }
    const twin = find(root, waiting.focus);
    if (focusable(twin) && focusOn(twin, waiting.selection)) pending = null;
  }
}

/* Markup helpers. Every screen builds its HTML with the html`` tag, which
   escapes each ${value} unless the value is itself html`` or raw().
   true and false write nothing, so ${ready && html`...`} works, except inside
   an attribute's quotes, where they are written out: aria-pressed="${on}".
   null and undefined always write nothing. */

class Html {
  constructor(text) { this.text = text; }
  toString() { return this.text; }
}

export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Whether markup written so far ends inside an attribute value: its last
   quote is an opening one, right after "=". Values are escaped, so every
   quote in it comes from the template itself. */
function inAttribute(text) {
  const quote = text.lastIndexOf('"');
  return quote > 0 && /=\s*$/.test(text.slice(Math.max(0, quote - 4), quote));
}

function part(value) {
  if (value == null || value === false || value === true) return '';
  if (value instanceof Html) return value.text;
  if (Array.isArray(value)) return value.map(part).join('');
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => {
    out += (typeof value === 'boolean' && inAttribute(out) ? String(value) : part(value)) + strings[i + 1];
  });
  return new Html(out);
}

/* Trusted markup (icons, text already escaped). Never pass member input. */
export function raw(text) {
  return new Html(String(text == null ? '' : text));
}

export function plural(count, one, many = one + 's') {
  return count + ' ' + (count === 1 ? one : many);
}

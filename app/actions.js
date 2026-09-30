/* One event system for the whole app. Markup names what should happen:
     data-act="name"     on a button (click) or a form (submit)
     data-change="name"  on an input or select (change)
     data-input="name"   on a text field (every keystroke)
   and the module that owns that part of the screen registers the handler:
     defineActions({ name: { run(el, event), allowed(el), public: true } })
   `run` may be the whole definition. An action needs a signed-in member
   unless it is `public`, and `allowed` can narrow it further. */
import { session } from './store.js';
import { notice } from './ui/banners.js';

const registry = new Map();

export function defineActions(map) {
  Object.entries(map).forEach(([name, definition]) => {
    if (registry.has(name)) throw new Error('Action defined twice: ' + name);
    registry.set(name, typeof definition === 'function' ? { run: definition } : definition);
  });
}

function signedIn() { return session.status === 'verified'; }

function runAction(name, el, event) {
  const action = registry.get(name);
  if (!action) { console.warn('No handler for action:', name); return; }
  if ((!action.public && !signedIn()) || (action.allowed && !action.allowed(el))) {
    notice('Your account is not allowed to do that.', true);
    return;
  }
  action.run(el, event);
}

document.addEventListener('click', event => {
  const el = event.target.closest('[data-act]');
  if (!el || el.tagName === 'FORM' || el.disabled) return;
  runAction(el.dataset.act, el, event);
});
document.addEventListener('submit', event => {
  const form = event.target.closest('form[data-act]');
  if (!form) return;
  event.preventDefault();
  // Submitting ends the typing, so the screen may redraw with the result.
  if (form.contains(document.activeElement)) document.activeElement.blur();
  runAction(form.dataset.act, form, event);
});
document.addEventListener('change', event => {
  const el = event.target.closest('[data-change]');
  if (el) runAction(el.dataset.change, el, event);
});
document.addEventListener('input', event => {
  const el = event.target.closest('[data-input]');
  if (el) runAction(el.dataset.input, el, event);
});
/* Cards and rows that act as buttons also answer Enter and Space. */
document.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const el = event.target.closest('[data-act][role="button"]');
  if (!el || el !== event.target) return;
  event.preventDefault();
  runAction(el.dataset.act, el, event);
});

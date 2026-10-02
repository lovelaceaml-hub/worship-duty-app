/* One event system for the whole app. Markup names what should happen:
     data-act="name"     on a button (click) or a form (submit)
     data-change="name"  on an input or select (change)
     data-input="name"   on a text field (every keystroke)
   and the module that owns that part of the screen registers the handler:
     defineActions({ name: { run(el, event), allowed(el), public: true } })
   `run` may be the whole definition. An action needs a signed-in member
   unless it is `public`, and `allowed` can narrow it further: it returns
   false, or a sentence saying why not ("This duty is no longer yours.").
   When `run` fails, the member is told. */
import { session } from './store.js';
import { problem } from './firebase.js';
import { notice } from './ui/banners.js';

const registry = new Map();

export function defineActions(map) {
  Object.entries(map).forEach(([name, definition]) => {
    if (registry.has(name)) throw new Error('Action defined twice: ' + name);
    registry.set(name, typeof definition === 'function' ? { run: definition } : definition);
  });
}

/* Why the member cannot do this now, in plain words, or ''. */
function refusal(action, el) {
  if (!action.public && session.status !== 'verified') {
    if (session.status === 'offline') return 'You are offline. Connect to do that.';
    if (session.status === 'loading') return 'The app is still opening. Try again in a moment.';
    return 'Sign in first.';
  }
  const answer = action.allowed ? action.allowed(el) : true;
  if (typeof answer === 'string') return answer;
  return answer ? '' : 'Your account is not allowed to do that.';
}

function failed(error) {
  console.warn('That action failed:', error);
  notice(problem(error), true);
}

function runAction(name, el, event) {
  const action = registry.get(name);
  if (!action) { console.warn('No handler for action:', name); return; }
  const refused = refusal(action, el);
  if (refused) { notice(refused, true); return; }
  try {
    const result = action.run(el, event);
    if (result && typeof result.then === 'function') result.catch(failed);
  } catch (error) {
    failed(error);
  }
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
  // Submitting ends the typing, so the screen may redraw with the result:
  // focus moves from the field to the button that sent the form.
  const active = document.activeElement;
  if (form.contains(active) && active.matches('input, select, textarea')) {
    const button = event.submitter || form.querySelector('[type="submit"]');
    if (button && !button.disabled) button.focus({ preventScroll: true });
    else active.blur();
  }
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

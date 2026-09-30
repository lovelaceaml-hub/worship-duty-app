/* Manage, Feedback: notes members sent with the feedback button, newest
   first (the latest 100). */
import { html } from '../../html.js';
import { defineActions } from '../../actions.js';
import { nameOf } from '../../store.js';
import { render as redraw } from '../../render.js';
import { statusChip, empty } from '../../ui/components.js';
import { KINDS, feedback, loadFeedback, markDone, deleteFeedback } from '../../services/feedback.js';
import { SCREEN_NAMES } from '../../ui/header.js';
import { APPEARANCES } from '../../appearance/registry.js';
import { isAdmin } from '../../services/access.js';

function entry(item) {
  const kind = (KINDS.find(([value]) => value === item.kind) || KINDS[0])[1];
  const details = [
    item.createdAt ? new Date(item.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '',
    SCREEN_NAMES[item.screen] ? 'on ' + SCREEN_NAMES[item.screen] : '',
    APPEARANCES[item.appearance] ? APPEARANCES[item.appearance].name : ''
  ].filter(Boolean).join(' · ');
  return html`<article class="card">
    <div class="card-title-row"><h3 class="card-subtitle">${nameOf(item.name) || 'A member'} · ${kind}</h3>${statusChip(item.status === 'done' ? 'done' : 'new')}</div>
    <p class="message">${item.message}</p>
    <p class="hint small">${details}</p>
    <div class="button-row">
      ${item.status === 'done' ? '' : html`<button type="button" class="ghost small" data-act="feedback-done" data-id="${item.id}">Mark done</button>`}
      <button type="button" class="link danger" data-act="feedback-delete" data-id="${item.id}">Delete</button>
    </div>
  </article>`;
}

export function render() {
  if (feedback.state === 'idle') loadFeedback();
  if (feedback.state === 'loading') return empty('Loading feedback…');
  if (feedback.state === 'error') return html`${empty(feedback.error)}<button type="button" class="ghost" data-act="feedback-refresh">Try again</button>`;
  const list = feedback.list || [];
  const fresh = list.filter(item => item.status !== 'done');
  const done = list.filter(item => item.status === 'done');
  return html`<div class="button-row"><button type="button" class="ghost small" data-act="feedback-refresh">Refresh</button></div>
    ${fresh.length ? fresh.map(entry) : empty(list.length ? 'Nothing new.' : 'No feedback yet.')}
    ${done.length ? html`<button type="button" class="link" data-act="feedback-show-done">${feedback.showDone ? 'Hide done' : 'Show done (' + done.length + ')'}</button>
      ${feedback.showDone ? done.map(entry) : ''}` : ''}`;
}

defineActions({
  'feedback-refresh': { allowed: () => isAdmin(), run: () => loadFeedback(true) },
  'feedback-show-done': () => { feedback.showDone = !feedback.showDone; redraw(); },
  'feedback-done': { allowed: () => isAdmin(), run: el => markDone(el.dataset.id) },
  'feedback-delete': {
    allowed: () => isAdmin(),
    run: el => { if (confirm('Delete this note? This cannot be undone.')) deleteFeedback(el.dataset.id); }
  }
});

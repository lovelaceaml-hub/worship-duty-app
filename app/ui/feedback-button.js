/* The round feedback button and the form it opens. Both sit outside #view,
   so live updates never touch a message while it is being typed. On phones
   the button is hidden (it covered row buttons at the right edge) and the
   account menu's "Feedback about the app" opens the same form. */
import { html, raw } from '../html.js';
import { defineActions } from '../actions.js';
import { KINDS, sendFeedback } from '../services/feedback.js';
import { notice } from './banners.js';

const ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H9l-4.5 2.5 1.2-4.2A7.5 7.5 0 0 1 12.5 4 7.5 7.5 0 0 1 20 11.5Z"/><path d="M9 10h7M9 13.5h4.5"/></svg>';

let button = null, dialog = null, sending = false;

export function syncFeedbackButton(show) {
  if (show && !button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'feedback-button';
    button.setAttribute('aria-label', 'Feedback about the app');
    button.title = 'Feedback about the app';
    button.innerHTML = ICON;
    button.addEventListener('click', open);
    document.body.appendChild(button);
  }
  if (button) button.hidden = !show;
  if (!show && dialog && dialog.open) dialog.close();
}

function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'feedback-dialog';
  dialog.setAttribute('aria-labelledby', 'feedback-title');
  dialog.innerHTML = String(html`
    <form method="dialog" class="feedback-form" novalidate>
      <h2 id="feedback-title">Feedback about the app</h2>
      <p class="hint">Tell the app administrators what works, what does not, or what you would change. This goes to them, not to your department leader.</p>
      <div class="choice-row" role="radiogroup" aria-label="Kind of note">
        ${KINDS.map(([value, label], index) => html`<label><input type="radio" name="kind" value="${value}"${raw(index ? '' : ' checked')}><span>${label}</span></label>`)}
      </div>
      <label class="field-label" for="feedback-text">Your message</label>
      <textarea id="feedback-text" rows="5" maxlength="2000" placeholder="What happened, or what would you like to see? Say which screen you were on."></textarea>
      <p class="form-error" role="status" hidden></p>
      <div class="button-row">
        <button type="submit" class="primary" value="send">Send</button>
        <button type="button" class="ghost" data-close>Cancel</button>
      </div>
    </form>`);
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    const error = dialog.querySelector('.form-error');
    const send = dialog.querySelector('button[type="submit"]');
    const text = dialog.querySelector('textarea');
    sending = true;
    send.disabled = true;
    send.textContent = 'Sending…';
    error.hidden = true;
    try {
      await sendFeedback(new FormData(event.target).get('kind'), text.value);
      text.value = '';
      dialog.close();
      notice('Thank you. Your feedback was sent.');
    } catch (problem) {
      error.textContent = problem.code ? 'That did not send. Your message is still here, so you can try again.' : problem.message;
      error.hidden = false;
    }
    sending = false;
    send.disabled = false;
    send.textContent = 'Send';
  });
  document.body.appendChild(dialog);
}

function open() {
  if (!dialog) build();
  dialog.showModal();
  dialog.querySelector('textarea').focus({ preventScroll: true });
}

defineActions({
  'feedback-open': () => open()
});

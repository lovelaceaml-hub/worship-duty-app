/* The screens in front of the app: opening, the site passcode, sign-in, the
   first PIN change, offline without a saved member, and maintenance. */
import { html } from '../html.js';
import { defineActions } from '../actions.js';
import { data, ui, nameOf } from '../store.js';
import { render } from '../render.js';
import { unlockSite, signIn as memberSignIn, changePin as memberChangePin } from '../services/session.js';
import { pendingInvite } from '../services/departments.js';
import { byTitle } from '../lib/names.js';
import { upcoming, nextService } from '../lib/services.js';
import { longDate, clockTime } from '../lib/dates.js';

function box(title, body) {
  return html`<section class="card gate"><h2 class="gate-title">${title}</h2>${body}</section>`;
}

function error(text) {
  return text ? html`<p class="form-error" role="alert">${text}</p>` : '';
}

export const opening = {
  name: 'opening',
  render: () => html`<p class="empty">Opening the schedule…</p>`
};

export const sitePasscode = {
  name: 'site-passcode',
  render: () => box('Enter the passcode', html`
    <p class="hint">This schedule is private. Enter the 4-digit passcode you were given.</p>
    <form class="inline-form" data-act="site-unlock">
      <input type="password" id="site-passcode" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="Passcode" required>
      <button class="primary" type="submit">Open</button>
    </form>
    ${error(ui.sitePinError)}`),
  mounted: view => { const input = view.querySelector('#site-passcode'); if (input) input.focus(); }
};

export const signIn = {
  name: 'sign-in',
  render() {
    const members = Array.from(new Set(data.members)).sort(byTitle);
    const busy = ui.signIn.busy;
    return box('Sign in', html`
      <p class="hint">${pendingInvite() ? 'Sign in to join the department from your invite link.' : 'Choose your name and enter your PIN.'}</p>
      <form class="inline-form" data-act="sign-in">
        <select id="sign-in-member" aria-label="Your name" required>
          <option value="">Your name</option>
          ${members.map(name => html`<option value="${name}"${name === ui.signIn.member ? ' selected' : ''}>${nameOf(name)}</option>`)}
        </select>
        <input type="password" id="sign-in-pin" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="6" autocomplete="current-password" aria-label="PIN" placeholder="PIN" required>
        <button class="primary" type="submit"${busy ? ' disabled' : ''}>${busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      ${error(ui.signIn.error)}
      <p class="hint small">Forgot your PIN? Ask your department leader to reset it.</p>`);
  }
};

export const changePin = {
  name: 'change-pin',
  render() {
    const busy = ui.signIn.busy;
    return box('Choose a new PIN', html`
      <p class="hint">Pick a PIN of 4 to 6 digits that only you know. You will use it to sign in from now on.</p>
      <form class="inline-form" data-act="change-pin">
        <input type="password" id="new-pin" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="6" autocomplete="new-password" aria-label="New PIN" placeholder="New PIN" required>
        <input type="password" id="new-pin-again" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="6" autocomplete="new-password" aria-label="New PIN again" placeholder="New PIN again" required>
        <button class="primary" type="submit"${busy ? ' disabled' : ''}>${busy ? 'Saving…' : 'Save PIN'}</button>
      </form>
      ${error(ui.signIn.error)}
      <button type="button" class="link" data-act="sign-out">Sign out</button>`);
  }
};

export const offline = {
  name: 'offline',
  render: () => box('You are offline', html`
    <p class="hint">The app cannot reach the internet. Connect and open it again to sign in.</p>`)
};

/* Shown during a release that needs everyone out of the app for a moment.
   The upcoming schedule stays readable. */
export const maintenance = {
  name: 'maintenance',
  render() {
    const first = nextService(data.services);
    const services = first ? upcoming(data.services).slice(0, 8) : [];
    return html`<section class="card gate maintenance">
      <h2 class="gate-title">The app is being updated</h2>
      <p class="hint">Please check back in a few minutes. Nothing on the schedule is lost.</p>
      ${services.length ? html`<div class="maintenance-list">${services.map(service => html`
        <div class="maintenance-service">
          <h3>${longDate(service.date)} · ${service.service}</h3>
          <p class="hint">${service.worship || ''}${service.time ? ' at ' + clockTime(service.time) : ''}</p>
          ${Object.entries(service.assignments || {}).filter(([, name]) => name).map(([duty, name]) => html`
            <div class="duty-row"><span class="duty-name">${duty}</span><span class="person">${nameOf(name)}</span></div>`)}
        </div>`)}</div>` : ''}
    </section>`;
  }
};

defineActions({
  'site-unlock': {
    public: true,
    run: async form => {
      const ok = await unlockSite(form.querySelector('#site-passcode').value);
      ui.sitePinError = ok ? '' : 'That passcode is not right.';
      render();
    }
  },
  'sign-in': {
    public: true,
    run: form => memberSignIn(form.querySelector('#sign-in-member').value, form.querySelector('#sign-in-pin').value)
  },
  'change-pin': {
    public: true,
    run: form => memberChangePin(form.querySelector('#new-pin').value, form.querySelector('#new-pin-again').value)
  }
});

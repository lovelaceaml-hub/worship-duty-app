/* The screens in front of the app: opening, the site passcode, sign-in, the
   first PIN change, offline without a saved member, and maintenance. */
import { html } from '../html.js';
import { defineActions } from '../actions.js';
import { data, session, ui, loaded, nameOf, feature } from '../store.js';
import { render } from '../render.js';
import { notice } from '../ui/banners.js';
import { unlockSite, siteUnlocked, signIn as memberSignIn, changePin as memberChangePin } from '../services/session.js';
import { pendingInvite } from '../services/departments.js';
import { byTitle } from '../lib/names.js';
import { upcoming, nextService, serviceClock } from '../lib/services.js';
import { longDate } from '../lib/dates.js';
import { dutyName } from '../config/duties.js';


function box(title, body) {
  return html`<section class="card gate"><h2 class="gate-title">${title}</h2>${body}</section>`;
}

function error(text) {
  return text ? html`<p class="form-error" role="alert">${text}</p>` : '';
}

/* The new-PIN form, on the first-sign-in screen and in Settings. `extra`
   adds buttons after Save. */
export function pinForm(extra = '') {
  const busy = ui.signIn.busy;
  return html`<form class="inline-form pin-form" data-act="change-pin">
      <input type="password" id="new-pin" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="6" autocomplete="new-password" aria-label="New PIN" placeholder="New PIN" required>
      <input type="password" id="new-pin-again" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="6" autocomplete="new-password" aria-label="New PIN again" placeholder="New PIN again" required>
      <button class="primary" type="submit"${busy ? ' disabled' : ''}>${busy ? 'Saving…' : 'Save PIN'}</button>
      ${extra}
    </form>
    ${error(ui.signIn.error)}`;
}

export const opening = {
  name: 'opening',
  render: () => html`<p class="empty">Opening the schedule…</p>`
};

export const sitePasscode = {
  name: 'site-passcode',
  render: () => box('Enter the passcode', html`
    <p class="hint">This schedule is for LV Zion members. Enter the 4-digit passcode you were given.</p>
    <form class="inline-form" data-act="site-unlock">
      <input type="password" id="site-passcode" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="Passcode" required>
      <button class="primary" type="submit">Open</button>
    </form>
    ${error(ui.sitePinError)}`),
  mounted: view => { const input = view.querySelector('#site-passcode'); if (input) input.focus(); }
};

/* After a failed sign-in the PIN field is empty again; focus goes there once
   for each new error. */
let errorFocused = '';

export const signIn = {
  name: 'sign-in',
  render() {
    const members = Array.from(new Set(data.members)).sort(byTitle);
    const busy = ui.signIn.busy;
    return box('Sign in', html`
      <p class="hint">${pendingInvite() ? 'Sign in to join the department from your invite link.' : 'Choose your name and enter your PIN.'}</p>
      <form class="inline-form" data-act="sign-in">
        <select id="sign-in-member" data-change="sign-in-name" aria-label="Your name" required>
          <option value="">Your name</option>
          ${members.map(name => html`<option value="${name}"${name === ui.signIn.member ? ' selected' : ''}>${nameOf(name)}</option>`)}
        </select>
        <input type="password" id="sign-in-pin" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="10" autocomplete="current-password" aria-label="PIN" placeholder="PIN" required>
        <button class="primary" type="submit"${busy ? ' disabled' : ''}>${busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      ${error(ui.signIn.error)}
      <p class="hint small">Forgot your PIN? Ask your department leader or an administrator to reset it. For first sign-in or a reset, use the temporary PIN they give you.</p>`);
  },
  mounted(view) {
    const problem = ui.signIn.error;
    if (problem && problem !== errorFocused) {
      const input = view.querySelector('#sign-in-pin');
      if (input) input.focus();
    }
    errorFocused = problem;
  }
};

export const changePin = {
  name: 'change-pin',
  render() {
    return box('Choose a new PIN', html`
      <p class="hint">Pick a PIN of 4 to 6 digits that only you know. You will use it to sign in from now on.</p>
      ${pinForm()}
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
    // Names show only on a device that has entered the site passcode (or
    // when the passcode is off): the copy saved here is not a way around it.
    const open = !feature('siteLock') || siteUnlocked();
    const first = open ? nextService(data.services) : null;
    const services = first ? upcoming(data.services).slice(0, 8) : [];
    return html`<section class="card gate maintenance">
      <h2 class="gate-title">The app is being updated</h2>
      <p class="hint">Please check back in a few minutes. Nothing on the schedule is lost.</p>
      ${services.length ? html`<div class="maintenance-list">${services.map(service => html`
        <div class="maintenance-service">
          <h3>${longDate(service.date)} · ${service.service}</h3>
          <p class="hint">${service.worship ? service.worship + ' at ' : ''}${serviceClock(service)}</p>
          ${Object.entries(service.assignments || {}).filter(([, name]) => name).map(([duty, name]) => html`
            <div class="duty-row"><span class="duty-name">${dutyName(duty)}</span><span class="person">${nameOf(name)}</span></div>`)}
        </div>`)}</div>` : ''}
    </section>`;
  }
};

defineActions({
  'site-unlock': {
    public: true,
    run: async form => {
      const ok = await unlockSite(form.querySelector('#site-passcode').value);
      ui.sitePinError = ok ? '' : loaded.settings ? 'That passcode is not right.'
        : 'The app is still connecting. Your passcode is checked as soon as it does.';
      render();
    }
  },
  // The chosen name is kept, so a live update does not reset it.
  'sign-in-name': { public: true, run: el => { ui.signIn.member = el.value; } },
  'sign-in': {
    public: true,
    run: form => memberSignIn(form.querySelector('#sign-in-member').value, form.querySelector('#sign-in-pin').value)
  },
  // The first PIN change before the app opens, which signs in again with the
  // new PIN, and a member's own change in Settings.
  'change-pin': {
    public: true,
    run: async form => {
      const first = form.querySelector('#new-pin').value;
      const inApp = session.status === 'verified';
      await memberChangePin(first, form.querySelector('#new-pin-again').value);
      if (inApp && session.status === 'verified' && !ui.signIn.error && !ui.signIn.busy) {
        ui.expanded['change-pin'] = false;
        notice('Your PIN is changed. Use the new one the next time you sign in.');
        render();
      }
    }
  }
});

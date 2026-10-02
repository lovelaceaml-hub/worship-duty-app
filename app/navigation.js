/* Moving around the app: the tabs, the LV badge, the account menu, and
   reloading after an update. */
import { defineActions } from './actions.js';
import { ui } from './store.js';
import { goTo, render, mayLeave } from './render.js';
import { markDutiesSeen } from './services/notifications.js';
import { signOut } from './services/session.js';
import { ACCOUNT_VIEWS } from './ui/header.js';

export function openTab(tab) {
  if (!mayLeave(tab)) return;
  if (tab === 'my') markDutiesSeen();
  goTo(tab, { asked: true });
}

defineActions({
  tab: { public: true, run: el => openTab(el.dataset.tab) },
  home: { public: true, run: () => openTab('schedule') },
  account: {
    allowed: el => !!ACCOUNT_VIEWS[el.dataset.view],
    run: el => {
      goTo('my', { account: el.dataset.view });
      const heading = document.querySelector('#view h2');
      if (heading) heading.focus({ preventScroll: true });
    }
  },
  'sign-out': { public: true, run: () => { if (mayLeave('sign-out')) signOut(); } },
  reload: { public: true, run: () => location.reload() },
  expand: { public: true, run: el => { ui.expanded[el.dataset.key] = !ui.expanded[el.dataset.key]; render(); } }
});

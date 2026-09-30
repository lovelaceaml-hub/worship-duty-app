/* Moving around the app: the tabs, the LV badge, and the account menu. */
import { defineActions } from './actions.js';
import { ui } from './store.js';
import { goTo, render } from './render.js';
import { markDutiesSeen } from './services/notifications.js';
import { signOut } from './services/session.js';
import { ACCOUNT_VIEWS } from './ui/header.js';

export function openTab(tab) {
  if (tab === 'my') markDutiesSeen();
  goTo(tab);
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
  'sign-out': { public: true, run: () => signOut() },
  expand: { public: true, run: el => { ui.expanded[el.dataset.key] = !ui.expanded[el.dataset.key]; render(); } }
});

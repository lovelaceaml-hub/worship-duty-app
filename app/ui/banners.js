/* Short messages above the screen: confirmations, reminders and problems.
   `alert` messages are styled as warnings. Each can be dismissed. */
import { html } from '../html.js';
import { ui } from '../store.js';

export function notice(text, alert = false) {
  if (ui.banners.some(banner => banner.text === text)) return;
  ui.banners.push({ text, alert });
  paintBanners();
}

export function paintBanners(show = true) {
  const box = document.getElementById('banners');
  if (!box) return;
  box.innerHTML = show ? String(html`${ui.banners.map((banner, index) => html`
    <div class="banner${banner.alert ? ' is-alert' : ''}">
      <span>${banner.text}</span>
      <button type="button" class="banner-close" data-banner-close="${index}" aria-label="Dismiss">&times;</button>
    </div>`)}`) : '';
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-banner-close]');
  if (!button) return;
  ui.banners.splice(Number(button.dataset.bannerClose), 1);
  paintBanners();
});

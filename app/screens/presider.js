/* The Presider tab hosts the song planner (app/presider). It is loaded the
   first time a presider opens the tab, with its styles and the song list.
   A page opened before a release reloads first instead (see release.js). */
import { html } from '../html.js';
import { ui } from '../store.js';
import { newerRelease } from '../release.js';

let planner = null, loading = null;

function load(tag) {
  return new Promise((resolve, reject) => {
    tag.onload = resolve;
    tag.onerror = () => reject(new Error('Could not load ' + (tag.src || tag.href)));
    document.head.appendChild(tag);
  });
}

function loadPlanner() {
  if (planner) return Promise.resolve(planner);
  if (!loading) {
    loading = newerRelease().then(newer => {
      if (newer) throw Object.assign(new Error('A newer release is live.'), { updated: true });
      const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'styles/presider.css?v=DEV' });
      const songs = Object.assign(document.createElement('script'), { src: 'song-seed.js?v=DEV' });
      const lib = Object.assign(document.createElement('script'), { src: 'song-lib.js?v=DEV' });
      return Promise.all([load(css), load(songs), load(lib)]);
    })
      .then(() => import('../presider/index.js'))
      .then(module => { planner = module; return module; })
      .catch(error => { loading = null; throw error; });
  }
  return loading;
}

/* Once mounted, the planner redraws itself from its own live data. */
export function keep(view) {
  return !!planner && !ui.songNav && !!view.querySelector('#song-root[data-mounted]');
}

export function refresh() { planner.draw(); }

export function render() {
  return html`<div id="song-root"><p class="empty">Opening the song planner…</p></div>`;
}

export function mounted(view) {
  const root = view.querySelector('#song-root');
  loadPlanner().then(module => {
    if (ui.tab !== 'songs' || !root.isConnected) return;
    root.dataset.mounted = '';
    module.mount(root);
  }).catch(error => {
    if (!root.isConnected) return;
    if (error.updated) {
      root.innerHTML = String(html`<div class="empty"><p>The app was updated. Reload to open the song planner.</p>
        <button type="button" class="primary" data-act="reload">Reload</button></div>`);
      return;
    }
    console.warn('The song planner did not load:', error);
    root.innerHTML = '<p class="empty">The song planner did not load. Check your connection and try again.</p>';
  });
}

/* Presentation-only extensions inside the original song module's closure.
 * Original setlist IDs, catalog, actions, timing, confirmation and history stay
 * unchanged. Query hooks used by live search and infinite paging are preserved.
 */
function awSongDOM(html) { const el = document.createElement('div'); el.innerHTML = html; return el; }
function awSongIcon(name) { return window.Aurora.icon(name); }
function awSongTitle(kicker, title, note = '') {
  return '<div class="aw-section-head"><div><span class="overline">' + esc(kicker) + '</span><h2>' + esc(title) + '</h2>' + (note ? '<p>' + esc(note) + '</p>' : '') + '</div></div>';
}
const awSongHeader = renderHeader;
renderHeader = function () {
  return '<div class="aw-song-identity">' + awSongHeader() + '<span class="aw-chip">Local song plans</span></div>';
};
// Give the expandable song title and quick-add button separate native targets.
// The same root-delegated actions still handle both, including keyboard clicks.
const awOriginalSongRow = renderSongRow;
renderSongRow = function (song) {
  const dom = awSongDOM(awOriginalSongRow(song));
  const row = dom.querySelector('.song-row');
  const open = document.createElement('button'); open.type = 'button'; open.className = 'aw-song-open';
  open.dataset.songAct = row.dataset.songAct; open.dataset.id = row.dataset.id;
  open.setAttribute('aria-expanded',row.getAttribute('aria-expanded'));
  row.removeAttribute('data-song-act'); row.removeAttribute('data-id'); row.removeAttribute('role'); row.removeAttribute('tabindex'); row.removeAttribute('aria-expanded');
  Array.from(row.children).filter(el => !el.matches('.qadd')).forEach(el => open.append(el));
  row.prepend(open);
  const add = row.querySelector('.qadd');
  if (add) add.setAttribute('aria-label','Add ' + dispNumber(song) + ': ' + song.title + ' to setlist');
  return dom.innerHTML;
};
const awOriginalSongService = renderServiceCard;
renderServiceCard = function (sl, opts) {
  const dom = awSongDOM(awOriginalSongService(sl, opts));
  const head = dom.querySelector('.card-head[data-song-act="toggle-service"]');
  if (head) {
    const button = document.createElement('button');
    for (const attr of head.attributes) button.setAttribute(attr.name,attr.value);
    button.type = 'button'; button.setAttribute('aria-expanded',String(state.ui.expandedService === sl.id));
    button.innerHTML = head.innerHTML; head.replaceWith(button);
  }
  return dom.innerHTML;
};
const awOriginalLibrary = renderLibrary;
renderLibrary = function () {
  const dom = awSongDOM(awOriginalLibrary());
  const nodes = Array.from(dom.children);
  const start = nodes.findIndex(el => el.matches('.lib-controls'));
  if (start < 0) throw new Error('Aurora Library adapter: controls missing');
  const builder = document.createElement('aside'); builder.className = 'aw-setlist-panel'; builder.id = 'aw-setlist';
  builder.setAttribute('aria-label','Current service and setlist');
  builder.innerHTML = awSongTitle('YOUR SERVICE PLAN','The setlist','Choose, arrange and confirm your songs.');
  const sl = currentSetlist();
  let help = '';
  nodes.slice(0,start).forEach(el => {
    // The original onboarding banner stays readable above the workspace.
    if (el.matches('.banner') && el.querySelector('[data-song-act="dismiss-help"]')) {
      el.querySelector('span').innerHTML = '<b>Build your service plan.</b> Choose your service, add songs from the catalog, then confirm your list. After the service, use <b>Mark as sung</b> in Services.';
      help += el.outerHTML;
    } else builder.append(el);
  });
  const catalog = document.createElement('section'); catalog.className = 'aw-catalog-panel'; catalog.id = 'aw-catalog';
  catalog.setAttribute('aria-label','Song catalog');
  catalog.innerHTML = awSongTitle('EXPLORE THE CATALOG','Find the right songs','Search by title or number, then add a song to your plan.');
  nodes.slice(start).forEach(el => catalog.append(el));
  const controls = catalog.querySelector('.lib-controls'); controls.id = 'aw-library-controls';
  const search = controls.querySelector('#lib-search');
  const label = document.createElement('label'); label.className = 'aw-search'; label.htmlFor = 'lib-search';
  label.innerHTML = awSongIcon('search') + '<span class="sr-only">Search song title or number</span>';
  search.before(label); label.append(search);
  const note = builder.querySelector('#b-notes');
  if (note) { const l = document.createElement('label'); l.htmlFor = 'b-notes'; l.className = 'aw-field-caption'; l.textContent = 'Service notes'; note.before(l); }
  const slots = builder.querySelector('.slot-box');
  if (slots) slots.insertAdjacentHTML('afterbegin','<div class="aw-field-caption">Worship songs</div>');
  const jump = '<div class="aw-library-jump"><a href="#aw-catalog">' + awSongIcon('search') + ' Browse catalog</a><a href="#aw-setlist">' + awSongIcon('songs') + ' Your setlist' + (sl ? ' · ' + countedSongIds(sl).length + ' songs' : '') + '</a></div>';
  return '<div class="aw-song-library" data-aw-song-view="library">' + jump + help + '<div class="aw-song-grid">' + builder.outerHTML + catalog.outerHTML + '</div></div>';
};
const awOriginalSongHome = renderHome;
renderHome = function () {
  const dom = awSongDOM(awOriginalSongHome());
  const mine = myUpcomingSchedule(), next = mine[0];
  const confirmed = mine.filter(s => { const sl = state.setlists[serviceIdFor(s.date,s.service)]; return sl && isConfirmed(sl); }).length;
  const hero = '<section class="day-hero aw-hero aw-presider-hero"><div class="hero-orbits" aria-hidden="true"><i></i><i></i><i></i></div><div class="hero-copy"><div class="hero-eyebrow">YOUR NEXT PRESIDER SERVICE</div><h2>' + (next ? esc(fmtDate(next.date)) : 'Your song workspace.') + '</h2><p>' + (next ? esc((next.worship || '') + ' · ' + next.service + ' · ' + (next.time || '') + ' Pacific time') : 'Keep your catalog, plans and history together.') + '</p>' + (next ? '<button class="aw-hero-action" data-song-act="build-for" data-date="' + esc(next.date) + '" data-worship="' + esc(next.worship || '') + '" data-label="' + esc(next.service) + '">Open service plan ' + awSongIcon('arrow') + '</button>' : '') + '</div><div class="aw-music-emblem" aria-hidden="true">' + awSongIcon('songs') + '</div></section>';
  const side = '<aside class="aw-presider-aside"><section class="aw-panel"><span class="overline">YOUR UPCOMING PLANS</span><div class="aw-presider-numbers"><div><strong>' + mine.length + '</strong><span>Presider services</span></div><div><strong>' + confirmed + '</strong><span>Songs confirmed</span></div></div><p class="hint">Counts reflect your reference assignments and local song plans.</p></section><section class="aw-panel aw-song-cta"><div class="music-tile">' + awSongIcon('songs') + '</div><h3>A library to explore.</h3><p>Browse ' + state.songs.length + ' original songs, with categories, durations and your local history.</p><button class="primary" data-song-act="tab" data-tab="library">Explore the library ' + awSongIcon('arrow') + '</button></section><section class="aw-panel"><h3>Keep a thoughtful history</h3><p>Review least-sung songs and category coverage. No live song history is loaded in this preview.</p><button class="linkish" data-song-act="tab" data-tab="insights">Open Insights →</button></section></aside>';
  return '<div data-aw-song-view="home">' + hero + '<div class="aw-personal-grid"><section class="aw-home-services">' + dom.innerHTML + '</section>' + side + '</div></div>';
};
const awOriginalSongServices = renderServices;
renderServices = function () {
  return '<div data-aw-song-view="services">' + awSongTitle('SERVICE PLANS','Songs for every service','Review the roster, open a setlist and confirm or record what was sung.') + '<div class="aw-song-service-grid">' + awOriginalSongServices() + '</div></div>';
};
const awOriginalInsights = renderInsights;
renderInsights = function () {
  const dom = awSongDOM(awOriginalInsights());
  const cards = Array.from(dom.children);
  cards.forEach(card => {
    if (card.querySelector('.cov-row,.coverage-row') || /coverage/i.test(card.querySelector('.svc-title')?.textContent || '')) card.classList.add('aw-wide');
  });
  return '<div data-aw-song-view="insights">' + awSongTitle('SONG HISTORY','Make room for variety','Discover less-used songs and see how categories are represented.') + '<div class="aw-history-note" role="note">' + awSongIcon('check') + '<span>Local preview history only. No live congregation history or usage statistics are loaded.</span></div><div class="aw-insight-grid">' + dom.innerHTML + '</div></div>';
};
const awOriginalSongRender = render;
render = function () {
  awOriginalSongRender();
  if (!root) return;
  root.dataset.songScreen = state.ui.editorGate ? 'gate' : state.ui.runsheet ? 'runsheet' : state.ui.tab;
  root.querySelectorAll('input:not([aria-label]),select:not([aria-label]),textarea:not([aria-label])').forEach(el => {
    if (el.id && root.querySelector('label[for="' + el.id + '"]')) return;
    if (el.closest('label')) return;
    const names = {'bf-song':'Song for history entry','bf-date':'Date sung','b-service':'Choose your service'};
    el.setAttribute('aria-label',names[el.id] || el.getAttribute('placeholder') || 'Song plan field');
  });
  // Give every subview a panel relationship without changing click behavior.
  const panel = root.querySelector('.ns-view');
  if (panel && root.querySelector('.ns-tabs')) {
    panel.id = 'aw-song-tab-panel'; panel.setAttribute('role','tabpanel');
    const tabs = Array.from(root.querySelectorAll('.ns-tabs button'));
    tabs.forEach(b => { b.id = 'aw-song-tab-' + b.dataset.tab; b.setAttribute('aria-controls',panel.id); });
    panel.setAttribute('aria-labelledby','aw-song-tab-' + state.ui.tab);
  }
};

/* Aurora workspace presentation. Runs after aurora.js, before the original init.
 * All data-act/data-chg controls and domain functions remain the repository's.
 * Detached DOM composition changes layout without attaching duplicate handlers.
 */
A.icon = ai;
function awDOM(html) { const el = document.createElement('div'); el.innerHTML = html; return el; }
function awHTML(el) { return el ? el.outerHTML : ''; }
function awLabel(kicker, title, note = '') {
  return '<div class="aw-section-head"><div><span class="overline">' + esc(kicker) + '</span><h2>' + esc(title) + '</h2>' + (note ? '<p>' + esc(note) + '</p>' : '') + '</div></div>';
}
function awStat(value, label, icon) {
  return '<div class="aw-stat"><span class="aw-stat-icon">' + ai(icon) + '</span><div><strong>' + esc(value) + '</strong><span>' + esc(label) + '</span></div></div>';
}
function awHero(kicker, title, note, side = '') {
  return '<section class="day-hero aw-hero"><div class="hero-orbits" aria-hidden="true"><i></i><i></i><i></i></div><div class="hero-copy"><div class="hero-eyebrow"><span class="hero-dot"></span>' + esc(kicker) + '</div><h2>' + esc(title) + '</h2><p>' + esc(note) + '</p></div>' + side + '</section>';
}
function awFields(grid, prefix) {
  const fields = Array.from(grid.children);
  grid.classList.add('aw-fields-grid');
  for (let i = 0; i < fields.length - 1; i += 2) {
    const lab = fields[i], control = fields[i + 1];
    if (!lab.matches('.lab') || !control.matches('input,select')) continue;
    const label = document.createElement('label');
    control.id = prefix + '-' + i;
    label.htmlFor = control.id;
    label.append(lab, control);
    grid.append(label);
  }
}
function awGroupTeams(card) {
  const cats = Array.from(card.querySelectorAll(':scope > .cat-label'));
  if (!cats.length) return;
  const group = document.createElement('div'); group.className = 'aw-teams-grid';
  card.insertBefore(group, cats[0]);
  cats.forEach(cat => {
    const section = document.createElement('section'); section.className = 'aw-team-summary';
    const rows = []; let n = cat.nextElementSibling;
    while (n && n.matches('.duty-row')) { rows.push(n); n = n.nextElementSibling; }
    cat.setAttribute('role', 'heading'); cat.setAttribute('aria-level', '3');
    section.append(cat, ...rows); group.append(section);
  });
}

const awOriginalMy = renderMy;
renderMy = function () {
  const dom = awDOM(awOriginalMy());
  const picker = dom.querySelector('.me-picker');
  const pickHTML = awHTML(picker); picker?.remove();
  const duties = dutiesFor(ui.me), next = duties[0];
  const days = new Set(duties.map(d => d.svc.date)).size;
  const pending = state.requests.filter(r => r.name === ui.me && r.status === 'pending').length;
  let reminders = '', songs = '', updates = '', timeline = '', extra = '';
  const children = Array.from(dom.children);
  const consumed = new Set();
  for (const el of children) {
    if (consumed.has(el)) continue;
    if (el.matches('.notify-box')) {
      const hint = el.nextElementSibling?.matches('.hint') ? el.nextElementSibling : null;
      if (hint) { consumed.add(hint); if (el.querySelector('[data-act="open-songs"]')) hint.dataset.awPresiderNote = hint.textContent; }
      if (el.querySelector('[data-act="open-songs"]')) songs += awHTML(el) + awHTML(hint);
      else reminders += awHTML(el) + awHTML(hint);
    } else if (el.matches('.duty-card')) {
      const when = el.querySelector('.when');
      if (when) { when.setAttribute('role','heading'); when.setAttribute('aria-level','3'); }
      el.querySelectorAll('.duty-expand').forEach(awGroupTeams);
      timeline += awHTML(el);
    } else if (el.matches('.req-card')) {
      extra += awHTML(el);
    } else if (el.querySelector('.alerts-head')) {
      updates += awHTML(el);
    } else if (el.matches('.empty')) timeline += awHTML(el);
    else if (!el.matches('.hint')) extra += awHTML(el);
  }
  if (!ui.me) return '<div class="aw-my" data-aw-workspace="my"><section class="aw-panel">' + awLabel('YOUR PROFILE','Make the schedule yours','Choose your name to see only your assignments.') + pickHTML + timeline + '</section></div>';
  const side = next ? '<div class="hero-person"><div class="hero-eyebrow">NEXT SERVICE</div><strong>' + esc(fmtDate(next.svc.date)) + '</strong><p>' + esc(fmtTime(next.svc.time) + ' · ' + next.svc.service) + '</p><button data-aurora="jump-service" data-id="' + esc(svcId(next.svc)) + '">View service team ' + ai('arrow') + '</button></div>' : '';
  return '<div class="aw-my" data-aw-workspace="my">' +
    awHero('YOUR UPCOMING ASSIGNMENTS', next ? next.duty : 'You’re all caught up.', next ? ui.me + ' · ' + next.svc.worship + ' · Pacific time' : 'No upcoming duties are assigned to ' + ui.me + '.', side) +
    '<div class="aw-stats">' + awStat(duties.length,'Upcoming duties','my') + awStat(days,'Service days','schedule') + awStat(pending,'Pending requests','manage') + '</div>' +
    '<div class="aw-personal-grid"><section class="aw-personal-main">' + awLabel('YOUR SCHEDULE','Coming up for you','Every assignment, grouped by service day.') + '<div class="aw-duty-timeline">' + timeline + '</div>' + extra + '</section>' +
    '<aside class="aw-personal-aside"><section class="aw-panel aw-identity"><div class="aw-panel-title">' + personBadge(ui.me) + '<div><span class="overline">VIEWING DUTIES FOR</span><h3>' + esc(ui.me) + '</h3></div></div>' + pickHTML + '</section>' +
    (songs ? '<section class="aw-panel aw-song-cta"><div class="music-tile">' + ai('songs') + '</div><span class="overline">PRESIDER WORKSPACE</span><h3>A thoughtful setlist<br>starts here.</h3>' + songs + '</section>' : '') +
    (reminders ? '<section class="aw-panel aw-reminders"><div class="aw-panel-title">' + ai('schedule') + '<h3>Stay prepared</h3></div>' + reminders + '</section>' : '') + updates + '</aside></div></div>';
};

let awPeopleQuery = '';
const awManageCopy = {
 services:['Service assignments','Open a service to review its team or edit the assignments.'],
 planning:['Plan a balanced schedule','Resolve double duties, review gaps and compare member workloads.'],
 requests:['Change requests','Review requests, then make the assignment change in Services.'],
 people:['People & departments','Manage names and the departments available in assignment pickers.'],
 features:['Your app preferences','All switches here affect the local prototype only.'],
 data:['Data & Sync','Keep a backup, restore reference data and review local-only connections.']
};
function awForm(form, type) {
  form.classList.add('aw-create-form');
  const labels = type === 'service' ? {'svc-date':'Date','svc-time':'Time','svc-label':'Service','svc-worship':'Worship'} : {'member-name':'Member name'};
  Array.from(form.querySelectorAll('input,select')).forEach(control => {
    if (!labels[control.id]) return;
    const label = document.createElement('label'); label.htmlFor = control.id;
    const text = document.createElement('span'); text.textContent = labels[control.id];
    control.before(label); label.append(text, control);
  });
}
function awManageServices(dom) {
  const form = dom.querySelector('form[data-act="add-service"]');
  if (form) awForm(form, 'service');
  const creation = form ? '<section class="aw-panel aw-create"><div class="aw-panel-title">' + ai('schedule') + '<h3>Add a service</h3><span class="aw-chip">Local preview</span></div>' + awHTML(form) + '</section>' : '';
  form?.remove();
  dom.querySelectorAll(':scope > .card').forEach((card, index) => {
    card.classList.add('aw-manage-service');
    const head = card.querySelector('.card-head');
    if (!head) return;
    const id = head.dataset.id.slice(2);
    const svc = state.services.find(s => svcId(s) === id);
    if (!svc) return;
    card.dataset.awService = id;
    if (head.getAttribute('aria-expanded') === 'true') {
      card.classList.add('aw-editor-open');
      const meta = card.querySelector(':scope > .edit-grid');
      if (meta) { meta.classList.add('aw-service-meta'); awFields(meta, 'aw-meta-' + index); }
      const cats = Array.from(card.querySelectorAll(':scope > .cat-edit-label'));
      const grid = document.createElement('div'); grid.className = 'aw-assignment-grid';
      if (cats[0]) card.insertBefore(grid, cats[0]);
      cats.forEach((cat, c) => {
        const fields = cat.nextElementSibling;
        const section = document.createElement('section'); section.className = 'aw-department-card';
        cat.setAttribute('role','heading'); cat.setAttribute('aria-level','3');
        if (fields?.matches('.edit-grid')) { awFields(fields, 'aw-duty-' + index + '-' + c); section.append(cat,fields); }
        else section.append(cat);
        grid.append(section);
      });
    } else awGroupTeams(card);
    const summary = document.createElement('div'); summary.className = 'aw-service-summary';
    const count = Object.values(svc.assignments || {}).filter(Boolean).length;
    summary.innerHTML = ai('people') + '<span>' + count + ' assigned duties</span><span class="aw-chip">' + (head.getAttribute('aria-expanded') === 'true' ? 'Editing locally' : 'View / edit team') + '</span>';
    head.after(summary);
  });
  return creation + '<div class="aw-service-list">' + dom.innerHTML + '</div>';
}
function awManageFeatures(dom) {
  const groups = [
    ['Access & privacy',['siteLock','editorLock']],
    ['Member tools',['notifications','reminders','calendarExport','whoElse','changeRequests']],
    ['Service details',['choirSong','songPicker','pastServices','emptyDuties','conflictWarnings']],
    ['Connections',['sheetSync']]
  ];
  let result = '<div class="aw-settings-grid">';
  for (const [title, ids] of groups) {
    let items = '';
    for (const id of ids) {
      const row = dom.querySelector('[data-chg="feature"][data-id="' + id + '"]')?.closest('.feature-row');
      if (row) { items += awHTML(row); row.remove(); }
    }
    result += '<section class="aw-panel aw-settings-group"><h3>' + title + '</h3>' + items + '</section>';
  }
  result += '</div><section class="aw-account-settings">' + dom.innerHTML + '</section>';
  return result;
}
function awManagePeople(dom) {
  const form = dom.querySelector('[data-act="add-member"]');
  if (form) awForm(form, 'member');
  const top = awHTML(form); form?.remove();
  const rows = Array.from(dom.querySelectorAll(':scope > .list-row'));
  for (const row of rows) {
    row.classList.add('aw-person-card');
    const name = row.querySelector('[data-chg="member-name"]').dataset.old;
    row.dataset.awName = name.toLowerCase();
    row.hidden = !row.dataset.awName.includes(awPeopleQuery.toLowerCase());
    row.querySelectorAll('[data-chg="member-cat"]').forEach(c => c.closest('label').classList.add('aw-dept-option'));
    row.insertAdjacentHTML('afterbegin',personBadge(name));
    row.remove();
  }
  return '<section class="aw-panel">' + top + dom.innerHTML + '<label class="aw-search" for="aw-people-search">' + ai('search') + '<span class="sr-only">Find a member</span><input id="aw-people-search" type="search" placeholder="Find a member…" value="' + esc(awPeopleQuery) + '"></label><p class="aw-filter-count" role="status" id="aw-people-count"></p></section><div class="aw-people-grid">' + rows.map(awHTML).join('') + '</div>';
}
const awOriginalManage = renderManage;
renderManage = function () {
  const dom = awDOM(awOriginalManage());
  const tabs = dom.querySelector(':scope > .subnav');
  if (!tabs) return '<section class="aw-lock" data-aw-workspace="manage">' + dom.innerHTML + '</section>';
  tabs.classList.add('aw-manage-tabs'); tabs.setAttribute('aria-label','Manage sections');
  tabs.querySelectorAll('button[data-sub]').forEach(b => { if (b.classList.contains('active')) b.setAttribute('aria-current','page'); });
  const navHTML = awHTML(tabs); tabs.remove();
  let body;
  if (ui.sub === 'services') body = awManageServices(dom);
  else if (ui.sub === 'features') body = awManageFeatures(dom);
  else if (ui.sub === 'people') body = awManagePeople(dom);
  else if (ui.sub === 'data') {
    // The production offline fallback explains initial Firebase setup. In this
    // deliberately isolated preview, replace that prose, not the backup controls.
    const connection = dom.querySelector('.data-actions > .card');
    if (connection) {
      connection.classList.add('aw-connection');
      connection.innerHTML = '<div class="aw-panel-title">' + ai('check') + '<h3>Safely disconnected</h3><span class="aw-chip">Offline</span></div><p>This design preview does not connect to Firebase, Google Sheets or live calendar subscriptions. Your production app is unchanged.</p><div class="aw-connection-lines"><span>Schedule edits <b>This browser only</b></span><span>Google Sheet sync <b>Disabled in preview</b></span><span>Live notifications <b>Not sent</b></span></div>';
    }
    body = dom.innerHTML;
  } else body = '<div class="aw-' + ui.sub + '-content">' + dom.innerHTML + '</div>';
  const up = upcomingServices().filter(manageServiceVisible);
  const conflicts = up.reduce((n,s) => n + activeConflicts(s).length,0);
  const pending = state.requests.filter(request => request.status === 'pending' && manageRequestVisible(request)).length;
  const copy = awManageCopy[ui.sub] || awManageCopy.services;
  return '<div class="aw-manage" data-aw-workspace="manage" data-manage-section="' + esc(ui.sub) + '"><div class="aw-stats aw-manage-stats">' + awStat(up.length,'Upcoming services','schedule') + awStat(conflicts,'Unresolved doubles','people') + awStat(pending,'Pending requests','my') + '</div>' + navHTML + awLabel('COORDINATOR TOOLS',copy[0],copy[1]) + body + '</div>';
};

const awDecorateBase = decorate;
decorate = function () {
  awDecorateBase();
  if (ui.tab !== 'schedule') document.getElementById('heading-action').innerHTML = '<button class="ghost" data-act="tab" data-tab="schedule">' + ai('schedule') + ' View schedule</button>';
  const version = document.querySelector('.rail-version span'); if (version) version.textContent = 'DESIGN PROTOTYPE / 02';
  document.querySelectorAll('[data-aw-presider-note]').forEach(el => { el.textContent = el.dataset.awPresiderNote; });
  const calendarHint = document.querySelector('.aw-reminders .notify-box + .hint');
  if (calendarHint) calendarHint.textContent = 'Preview only: notification delivery and live calendar subscriptions are disabled. Calendar download exports a snapshot of these reference duties with the original reminders.';
  const hint = document.querySelector('.aw-account-settings > .hint');
  if (hint) hint.textContent = 'Passcodes and scheduler preferences below are local to this preview.';
  document.querySelectorAll('.plan-scroll').forEach(el => { el.tabIndex = 0; el.setAttribute('aria-label','Member workload table; scroll horizontally for all columns'); });
  document.querySelectorAll('.aw-manage .feature-row .f-label, .aw-manage .card > .f-label').forEach(el => { el.setAttribute('role','heading'); el.setAttribute('aria-level','3'); });
  const count = document.getElementById('aw-people-count');
  if (count) awFilterPeople();
};
function awFilterPeople() {
  const cards = Array.from(document.querySelectorAll('.aw-person-card'));
  let visible = 0;
  cards.forEach(card => { card.hidden = !card.dataset.awName.includes(awPeopleQuery.trim().toLowerCase()); if (!card.hidden) visible++; });
  const count = document.getElementById('aw-people-count');
  if (count) count.textContent = visible ? visible + ' of ' + cards.length + ' members' : 'No members match. Clear the search to see everyone.';
}
document.addEventListener('input', e => {
  if (e.target.id !== 'aw-people-search') return;
  awPeopleQuery = e.target.value; awFilterPeople();
});

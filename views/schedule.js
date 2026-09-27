import {CATEGORIES, feat, memberLabel} from '../core/constants.js';
import {dateBadge, esc, fmtDate, fmtTime, svcId} from '../core/format.js';
import {state, ui} from '../core/state.js';
import {conflictBadge} from '../core/conflicts.js';
import {dutiesFor, pastServices, preferredScheduleService, upcomingServices} from '../core/schedule.js';
import {getJSON, notifyOn} from '../core/notify.js';
import {requestChangeTrigger, requestChangeForm, renderYourRequests} from './requests.js';
import {renderOwnAvailability} from './departments.js';
import {songStateFor, songStateTag} from './songs.js';
import {accountView, ACCOUNT_TITLES, ACCOUNT_NOTES} from './shell.js';

export function pillFor(member) {
  const mine = ui.me && member === ui.me;
  return '<span class="pill' + (mine ? ' me' : '') + '">' + esc(memberLabel(member)) + (mine ? ' (You)' : '') + '</span>';
}
export function renderCatRows(svc, showEmpty, only) {
  let html = '';
  CATEGORIES.forEach(cat => {
    if (only && cat.name !== only) return;
    const rows = cat.duties
      .filter(duty => showEmpty || feat('emptyDuties') || (svc.assignments || {})[duty])
      .map(duty => {
        const m = (svc.assignments || {})[duty];
        return '<div class="duty-row"><div class="dname">' + esc(duty) + '</div>' +
          (m ? pillFor(m) + conflictBadge(svc, m) : '<span style="color:var(--muted);font-style:italic;font-size:13px">-</span>') + '</div>';
      });
    if (rows.length) {
      html += '<div class="cat-label"><span class="dot-c" style="background:' + cat.color + '"></span>' +
        esc(cat.name) + '</div>' + rows.join('');
    }
  });
  return html;
}
export function categoryHasAssignments(svc, catName) {
  const cat = CATEGORIES.find(c => c.name === catName);
  if (!cat) return false;
  const assignments = svc.assignments || {};
  return cat.duties.some(duty => !!assignments[duty]);
}
export function renderServiceCard(svc, deptFilter) {
  return '<div class="card">' +
    '<div class="card-head"><span class="svc-title">' + esc(svc.worship) + ' <small>· ' + esc(svc.service) + '</small></span>' +
    '<span class="time">' + fmtTime(svc.time) + '</span></div>' +
    (feat('choirSong') && svc.choirSong && (!deptFilter || deptFilter === 'All' || deptFilter === 'Worship') ? '<div class="choir-song">Choir · ' + esc(svc.choirSong) + '</div>' : '') +
    renderCatRows(svc, false, deptFilter && deptFilter !== 'All' ? deptFilter : undefined) +
    '</div>';
}
export function renderServiceList(list, deptFilter) {
  let html = '', lastDate = '';
  let pendingHead = '';
  list.forEach(svc => {
    if (svc.date !== lastDate) {
      lastDate = svc.date;
      const badge = dateBadge(svc.date);
      pendingHead = '<div class="date-head"><span class="day">' + esc(fmtDate(svc.date)) + '</span>' +
        (badge ? '<span class="badge">' + badge + '</span>' : '') + '</div>';
    }
    if (deptFilter && deptFilter !== 'All' && !categoryHasAssignments(svc, deptFilter)) return;
    if (pendingHead) { html += pendingHead; pendingHead = ''; }
    html += renderServiceCard(svc, deptFilter);
  });
  return html;
}
export function renderDeptChips() {
  const items = [{ name: 'All', color: null }].concat(CATEGORIES);
  return '<div class="subnav chips">' + items.map(c =>
    '<button data-act="dept-filter" data-val="' + esc(c.name) + '"' +
    (ui.deptFilter === c.name ? ' class="active"' : '') + '>' +
    (c.color ? '<span class="dot-c" style="background:' + c.color + '"></span>' : '') +
    esc(c.name) + '</button>').join('') + '</div>';
}
export function renderSchedule() {
  let html = renderDeptChips();
  const filter = ui.deptFilter;
  const up = upcomingServices();
  const focus = preferredScheduleService(state.services);
  if (focus && (filter === 'All' || categoryHasAssignments(focus, filter))) {
    html += '<section class="schedule-focus"><div class="date-head"><span class="day">Next service</span></div>' +
      renderServiceCard(focus, filter) + '</section><div class="date-head"><span class="day">Full schedule</span></div>';
  }
  if (!up.length) html += '<div class="empty">No upcoming services yet.<br>Add them in the <b>Manage</b> tab.</div>';
  else html += renderServiceList(up, filter);
  const past = feat('pastServices') ? pastServices() : [];
  if (past.length) {
    html += '<div style="text-align:center"><button class="linkish" data-act="toggle-past">' +
      (ui.showPast ? 'Hide past services' : 'Show ' + past.length + ' past services') + '</button></div>';
    if (ui.showPast) html += renderServiceList(past.slice().reverse(), filter);
  }
  return html;
}

/* Notifications and calendar controls (feature-gated). Shown at the top of My
   Duties and again in the account menu's Settings view, from this one source. */
export function renderNotifyControls() {
  let html = '';
  let controls = '';
  if (('Notification' in window) && (feat('notifications') || feat('reminders'))) {
    controls += notifyOn()
      ? '<button class="ghost on" data-act="notify-off">Notifications on ✓</button>'
      : '<button class="primary" data-act="notify-on">Turn on notifications</button>';
  }
  if (feat('calendarExport')) {
    controls += '<button class="ghost" data-act="subscribe-ics">Add my duties to my calendar</button>';
  }
  if (controls) {
    // The explanation (and the Android-only copy button) stays one tap away inside a
    // closed disclosure, so the duty list is not pushed down by a paragraph every visit.
    // It keeps the .hint class and its place right after .notify-box: Prism and Aurora
    // move that pair into their own panels.
    html += '<div class="notify-box">' + controls + '</div>' +
      '<details class="hint notify-help"><summary>How it works' + (feat('calendarExport') ? ' and Android steps' : '') + '</summary>' +
      '<p>You\'ll be alerted when a new duty is added for you, and reminded the day before each duty.' +
      (feat('calendarExport')
        ? ' Adding your duties to your calendar subscribes it to the live schedule, so the times stay correct by themselves if a service ever moves. On Android, tap Copy calendar link and add it in Google Calendar under Other calendars \u2192 From URL.</p>' +
          '<button class="ghost mini" data-act="copy-ics">Copy calendar link</button>'
        : '</p>') +
      '</details>';
  }
  return html;
}

/* The account menu's two personal views (see accountView()). Availability is
   the same shared-availability editor that used to sit on My Duties; Settings
   gathers what a member can set for themselves. Administrator settings stay in
   Manage. */
export function renderAccount() {
  const view = accountView();
  const title = '<h2 class="account-title" tabindex="-1">' + esc(ACCOUNT_TITLES[view]) + '</h2>' +
    '<p class="hint account-note">' + esc(ACCOUNT_NOTES[view]) + '</p>';
  if (view === 'availability') {
    return '<div class="account-view" data-account="availability">' + title +
      (renderOwnAvailability() || '<div class="card"><p class="hint" style="margin:0">You are not on a department roster yet, so there is no availability to set. Your department leader adds you to the roster.</p></div>') +
      '</div>';
  }
  const notify = renderNotifyControls();
  return '<div class="account-view" data-account="settings">' + title +
    '<section class="card"><h3 style="margin:0 0 10px">Notifications and calendar</h3>' +
    (notify || '<p class="hint" style="margin:0">Notifications and the calendar link are turned off for this app right now.</p>') + '</section>' +
    (window.WorshipDesign
      ? '<section class="card"><h3 style="margin:0 0 6px">Appearance</h3><p class="hint" style="margin:0 0 12px">Choose how the app looks on this device. Your schedule stays the same.</p>' +
        '<div class="notify-box" style="margin:0"><button type="button" class="ghost" data-design-open>Appearance</button></div></section>'
      : '') +
    '<section class="card"><h3 style="margin:0 0 6px">Member PIN</h3><p class="hint" style="margin:0">To change your PIN, ask your department leader or an administrator to reset it. You will choose a new PIN the next time you sign in.</p></section>' +
    '</div>';
}

export function renderMy() {
  let html = '';
  if (!ui.me) return '<div class="empty">Sign in to see your duties.</div>';

  html += renderNotifyControls();

  // recent alerts
  const alerts = getJSON('wds-alerts-' + ui.me, []);
  if (alerts.length) {
    html += '<div class="card"><div class="alerts-head"><b style="font-size:13.5px">Recent updates</b>' +
      '<button class="linkish alerts-clear" data-act="clear-alerts">Clear</button></div>' +
      alerts.slice(0, 6).map(a =>
        '<div class="alert-item"><span class="t">' + new Date(a.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + '</span>' +
        '<span>' + esc(a.txt) + '</span></div>').join('') +
      '</div>';
  }

  // "Your availability" moved to the account menu (member chip, Availability).

  const duties = dutiesFor(ui.me);
  if (!duties.length) {
    html += '<div class="empty">You have no upcoming duties right now. ' +
      'You\'ll see them here, and be notified, as soon as one is assigned to you.</div>';
    return html + renderYourRequests();
  }

  html += '<p class="hint">You have <b>' + duties.length + '</b> upcoming dut' + (duties.length > 1 ? 'ies' : 'y') + '.</p>';

  // Group a member's duties by day (and, within a day, by service) so every
  // duty on the same date shares one card. `dutiesFor` already returns them in
  // date → time → category order, so first-seen order here is the display order.
  const days = [];
  const dayIndex = {};
  duties.forEach(d => {
    let day = dayIndex[d.svc.date];
    if (!day) { day = dayIndex[d.svc.date] = { date: d.svc.date, edge: d.cat.color, services: [], svcIndex: {} }; days.push(day); }
    const sid = svcId(d.svc);
    let se = day.svcIndex[sid];
    if (!se) { se = day.svcIndex[sid] = { svc: d.svc, id: sid, duties: [] }; day.services.push(se); }
    se.duties.push(d);
  });

  // Presider song picker, a role-conditional door into the song-selection
  // screen (ported from the old song app). Only presiders ever see it.
  if (feat('songPicker') && duties.some(d => d.duty === 'Presider')) {
    const first = duties.find(d => d.duty === 'Presider');
    const firstId = svcId(first.svc);
    const st = songStateFor(firstId);
    const label = st && st.confirmed ? 'Review your confirmed songs'
      : st && st.changed ? 'Confirm your songs again'
      : st && st.count ? 'Finish picking your songs'
      : 'Plan songs for your service';
    const songCount = st ? st.count + ' song' + (st.count === 1 ? '' : 's') : '';
    const note = st && st.confirmed
      ? 'Your songs for the next service are confirmed. Open them any time to change the list.'
      : st && st.changed
        ? 'You changed the songs for your next service after confirming them. Confirm the list again so it shows as done.'
        : st && st.count
          ? 'You have ' + songCount + ' picked for your next service but have not confirmed the list yet.'
          : 'You\'re presiding soon. Pick the songs for your service here.';
    html += '<div class="notify-box"><button class="primary" data-act="open-songs" data-svc="' + esc(firstId) + '">' + label + '</button></div>' +
      '<p class="hint">' + esc(note) + ' Each Presider duty below also has its own button.</p>';
  }

  // Slim day card: a date tile on the left, then one compact line per service
  // (time + worship) with its duties under it. The full date stays in `.when`
  // for screen readers; the tile repeats it visually.
  days.forEach(day => {
    const badge = dateBadge(day.date);
    const dayDate = new Date(day.date + 'T12:00:00');
    html += '<div class="card duty-card" style="--edge:' + day.edge + '">' +
      '<div class="dc-date" aria-hidden="true"><b>' + dayDate.getDate() + '</b>' +
      '<small>' + esc(dayDate.toLocaleDateString(undefined, { weekday: 'short' })) + '</small></div>' +
      '<div class="dc-body">' +
      '<div class="when sr-only">' + esc(fmtDate(day.date)) + (badge ? ' · ' + badge : '') + '</div>';
    day.services.forEach((se, si) => {
      const svc = se.svc;
      if (si > 0) html += '<div class="svc-sep"></div>'; // divider between services on the same day
      html += '<div class="what"><span class="dc-time">' + fmtTime(svc.time) + '</span>' +
        '<span class="dc-worship">' + esc(svc.worship) + '</span>' +
        (si === 0 && badge ? '<span class="dc-badge" aria-hidden="true">' + badge + '</span>' : '') + '</div>';
      se.duties.forEach(d => {
        const key = se.id + ':' + d.duty;
        html += '<div class="role"><span class="dot-c" style="background:' + d.cat.color + '"></span>' +
          '<span class="rname">' + esc(d.duty) + '</span>' +
          requestChangeTrigger(d, key) + '</div>' +
          (feat('songPicker') && d.duty === 'Presider'
            ? '<div class="dc-extra">' + songStateTag(se.id) +
              '<button class="linkish" data-act="open-songs" data-svc="' + esc(se.id) + '">' +
              (songStateFor(se.id) && songStateFor(se.id).count ? 'Open songs' : 'Pick songs') + '</button></div>'
            : '') +
          requestChangeForm(d, key);
      });
      if (feat('whoElse')) {
        const wkey = se.id + ':who';
        html += '<div class="who-else"><button class="linkish" data-act="expand" data-id="' + wkey + '">' +
          (ui.expanded[wkey] ? 'Hide the others serving' : 'Who else is serving?') + '</button></div>' +
          (ui.expanded[wkey] ? '<div class="duty-expand">' + renderCatRows(svc, false) + '</div>' : '');
      }
    });
    html += '</div></div>';
  });
  html += renderYourRequests();
  return html;
}

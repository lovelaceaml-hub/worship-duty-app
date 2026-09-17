/* Shared factory used by all four layout modules. It fills in the parts of
   the renderer contract that do not vary by appearance (shell assembly, the
   six phases, the appearance/unavailable/legacy screens) from shared
   components, so each layouts/<id>.js file only has to supply its own
   weekGroup() and serviceSummary() plus a little CSS. This is code reuse
   inside one owner's files, not a second business-rule path: every value
   still comes from the shared information builders and shared components. */

function fmtDayLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/* -------- Member: My next duty / Upcoming duties -------- */

function dutyFeaturedCard(d, c) {
  return '<div class="wd-service-card wd-service-current">' +
    '<div class="wd-service-title">' + c.esc(d.worship || '') + ' &middot; ' + c.esc(d.service || '') + '</div>' +
    '<div class="wd-service-time">' + c.esc(fmtDayLabel(d.date)) + (d.time ? ' at ' + c.esc(d.time) : '') + '</div>' +
    c.assignmentRow(d.duty, 'You', { mine: true }) +
    '</div>';
}

function dutyRow(d, info, c) {
  const key = d.serviceId + ':' + d.duty;
  const base = c.assignmentRow(d.duty, 'You', { mine: true });
  let trigger = '';
  if (d.pendingRequest) trigger = '<span class="wd-request-pending">Pending</span>';
  else if (info.reqKey !== key) {
    trigger = '<button type="button" class="wd-linkish" data-act="wd-request-open" data-key="' + c.esc(key) + '">Request change</button>';
  }
  let form = '';
  if (info.reqKey === key) {
    form = '<div class="wd-request-form">' +
      '<textarea id="wd-request-note" placeholder="Why do you need a change? (optional)"></textarea>' +
      '<div class="wd-request-actions">' +
      '<button type="button" class="wd-primary" data-act="wd-request-submit" data-svc="' + c.esc(d.serviceId) + '" data-duty="' + c.esc(d.duty) + '">Submit</button>' +
      '<button type="button" class="wd-ghost" data-act="wd-request-cancel">Cancel</button>' +
      '</div></div>';
  }
  return '<div class="wd-duty-row">' + base + trigger + '</div>' + form;
}

function dutyServiceCard(se, info, c) {
  return '<div class="wd-service-card">' +
    '<div class="wd-service-title">' + c.esc(se.worship || '') + ' &middot; ' + c.esc(se.service || '') + '</div>' +
    (se.time ? '<div class="wd-service-time">' + c.esc(se.time) + '</div>' : '') +
    se.duties.map(d => dutyRow(d, info, c)).join('') +
    '</div>';
}

function dutyDayGroup(day, info, c) {
  return '<section class="wd-week-group"><div class="wd-day-label">' + c.esc(fmtDayLabel(day.date)) + '</div>' +
    day.services.map(se => dutyServiceCard(se, info, c)).join('') + '</section>';
}

function requestRow(r, c) {
  return '<div class="wd-request-item"><div class="wd-request-head">' +
    '<span>' + c.esc(r.duty) + ' | ' + c.esc(r.worship) + ' ' + c.esc(r.service) + ', ' + c.esc(fmtDayLabel(r.date)) + '</span>' +
    '<span class="wd-status-chip wd-status-' + c.esc(r.status) + '">' + c.esc(r.status) + '</span></div>' +
    (r.note ? '<div class="wd-request-note">' + c.esc(r.note) + '</div>' : '') + '</div>';
}

function screenDuties(info, c) {
  if (!info.loaded) return c.unknownState('Your duties have not loaded yet.');
  let html = '';
  if (info.next) html += '<div class="wd-week-range">Your next duty</div>' + dutyFeaturedCard(info.next, c);
  if (!info.days.length) {
    html += c.emptyState('You have no upcoming duties right now. You will see them here, and be notified, as soon as one is assigned to you.');
  } else {
    html += '<div class="wd-week-range">Upcoming (' + info.count + ')</div>' +
      info.days.map(day => dutyDayGroup(day, info, c)).join('');
  }
  if (info.requests.length) {
    html += '<div class="wd-week-range">Your requests</div>' + info.requests.map(r => requestRow(r, c)).join('');
  }
  return '<div class="wd-duties-screen">' + html + '</div>';
}

/* -------- Member: Availability -------- */

function availabilityCard(p, c) {
  const recurring = p.recurring.map(r =>
    '<div class="wd-availability-row"><span>' + c.esc(r.label) + '</span>' +
    '<button type="button" class="wd-toggle-btn' + (r.status === 'available' ? ' active' : '') + '" ' +
    'data-act="wd-availability-toggle" data-dept="' + c.esc(p.departmentId) + '" data-uid="' + c.esc(p.memberUid) + '" data-key="' + c.esc(r.key) + '">' +
    (r.status === 'available' ? 'Available' : 'Unavailable') + '</button></div>'
  ).join('');
  const exceptions = p.exceptions.length ? p.exceptions.map(e =>
    '<div class="wd-availability-exception"><span>' + c.esc(e.date) + ' &middot; ' + c.esc(e.label) + '</span>' +
    '<span class="wd-status-chip wd-status-' + c.esc(e.status) + '">' + c.esc(e.status) + '</span>' +
    '<button type="button" class="wd-danger-link" data-act="wd-availability-exception-remove" data-dept="' + c.esc(p.departmentId) + '" data-uid="' + c.esc(p.memberUid) + '" data-date="' + c.esc(e.date) + '" data-key="' + c.esc(e.key) + '">Remove</button></div>'
  ).join('') : '<p class="wd-empty-note">No date exceptions.</p>';
  const addForm = '<div class="wd-exception-form">' +
    '<input type="date" aria-label="Exception date">' +
    '<select data-role="key" aria-label="Service time">' + p.recurring.map(r => '<option value="' + c.esc(r.key) + '">' + c.esc(r.label) + '</option>').join('') + '</select>' +
    '<select data-role="status" aria-label="Availability"><option value="unavailable">Unavailable</option><option value="available">Available</option></select>' +
    '<button type="button" class="wd-ghost" data-act="wd-availability-exception-add">Add exception</button></div>';
  const saveBar = p.dirty && p.saveState ? c.saveBar(p.saveState) : '';
  const saveActions = p.dirty
    ? '<div class="wd-availability-actions">' +
      '<button type="button" class="wd-primary" data-act="wd-availability-save" data-dept="' + c.esc(p.departmentId) + '" data-uid="' + c.esc(p.memberUid) + '">Save availability</button>' +
      '<button type="button" class="wd-ghost" data-act="wd-availability-reset" data-dept="' + c.esc(p.departmentId) + '" data-uid="' + c.esc(p.memberUid) + '">Discard changes</button></div>'
    : '';
  return '<section class="wd-availability-card" data-dept="' + c.esc(p.departmentId) + '" data-uid="' + c.esc(p.memberUid) + '">' +
    '<div class="wd-service-title">' + c.esc(p.departmentId) + '</div>' +
    recurring + '<div class="wd-week-range">Date exceptions</div>' + exceptions + addForm + saveBar + saveActions +
    '</section>';
}

function screenAvailability(info, c) {
  if (!info.loaded) return c.skeleton(3);
  if (info.error) {
    return c.warning(info.error) + '<button type="button" class="wd-ghost" data-act="wd-availability-retry">Try again</button>';
  }
  if (!info.profiles.length) return c.emptyState('You are not on a department roster yet.');
  return '<div class="wd-availability-screen">' + info.profiles.map(p => availabilityCard(p, c)).join('') + '</div>';
}

/* -------- Member: Reminders -------- */

function screenReminders(info, c) {
  let html = '';
  if (info.notifySupported) {
    html += '<div class="wd-reminder-box">' +
      (info.notifyOn
        ? '<button type="button" class="wd-ghost active" data-act="wd-reminder-notify-off">Notifications on &check;</button>'
        : '<button type="button" class="wd-primary" data-act="wd-reminder-notify-on">Turn on notifications</button>') +
      '</div><p class="wd-hint">You will be alerted when a new duty is added for you, and reminded the day before each duty.</p>';
  }
  if (info.calendarEnabled) {
    html += '<div class="wd-reminder-box">' +
      '<button type="button" class="wd-ghost" data-act="wd-reminder-subscribe-ics">Add my duties to my calendar</button>' +
      '<button type="button" class="wd-ghost" data-act="wd-reminder-copy-ics">Copy calendar link</button>' +
      '</div><p class="wd-hint">Adding your duties to your calendar subscribes it to the live schedule, so the times stay correct on their own. On Android, use Copy calendar link and add it in Google Calendar under Other calendars &rarr; From URL.</p>';
  }
  if (info.alerts.length) {
    html += '<div class="wd-week-range">Recent updates</div>' +
      '<button type="button" class="wd-linkish" data-act="wd-reminder-clear-alerts">Clear</button>' +
      info.alerts.map(a => '<div class="wd-alert-item"><span>' +
        c.esc(new Date(a.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) +
        '</span><span>' + c.esc(a.txt) + '</span></div>').join('');
  }
  if (!info.notifySupported && !info.calendarEnabled && !info.alerts.length) {
    html += c.emptyState('No reminder settings are available right now.');
  }
  return '<div class="wd-reminders-screen">' + html + '</div>';
}

/* -------- Department leader / Administrator: Upcoming services -------- */

function manageServiceCard(svc, c) {
  const rows = svc.duties.map(d => c.assignmentRow(d.duty, d.memberName || '')).join('');
  return '<div class="wd-service-card">' +
    '<div class="wd-service-title">' + c.esc(svc.worship || '') + ' &middot; ' + c.esc(svc.service || '') + '</div>' +
    '<div class="wd-service-time">' + c.esc(fmtDayLabel(svc.date)) + (svc.time ? ' at ' + c.esc(svc.time) : '') + '</div>' +
    (rows || c.emptyState('No duties in your departments for this service.')) + '</div>';
}

function screenManageSchedule(info, c) {
  if (!info.loaded) return c.unknownState('The schedule has not loaded yet.');
  let html = c.searchField(info.query, 'Search services', 'wd-manage-schedule-search');
  if (!info.services.length) html += c.emptyState('No upcoming services.');
  else html += info.services.map(svc => manageServiceCard(svc, c)).join('');
  return '<div class="wd-manage-schedule-screen">' + html + '</div>';
}

/* -------- Department leader / Administrator: Needs attention -------- */

const KIND_LABEL = { request: 'Change request', replacement: 'Needs replacement', unfilled: 'Unfilled duty', conflict: 'Double duty' };

function attentionCandidatePicker(item, c) {
  if (!item.candidates.length) return '<p class="wd-empty-note">No eligible, available member found in this department.</p>';
  const options = item.candidates.map(cand =>
    '<option value="' + c.esc(cand.memberUid) + '">' + c.esc(cand.memberName) + (cand.hasAnotherDuty ? ' (already serving this service)' : '') + '</option>'
  ).join('');
  return '<div class="wd-attention-picker">' +
    '<select data-role="replacement" aria-label="Choose a replacement"><option value="">Choose a member</option>' + options + '</select>' +
    '<button type="button" class="wd-primary" data-act="wd-attention-assign" data-id="' + c.esc(item.id) + '">Assign</button>' +
    '</div>';
}

function attentionItemCard(item, c) {
  const head = '<div class="wd-request-head"><span>' + c.esc(KIND_LABEL[item.kind] || item.kind) + ' &middot; ' + c.esc(item.duty) + '</span>' +
    '<span class="wd-status-chip">' + c.esc(item.department) + '</span></div>' +
    '<div class="wd-request-note">' + c.esc(item.worship) + ' ' + c.esc(item.service) + ', ' + c.esc(fmtDayLabel(item.date)) +
    (item.memberName ? ' &middot; ' + c.esc(item.memberName) : '') + '</div>' +
    (item.note ? '<div class="wd-request-note">' + c.esc(item.note) + '</div>' : '');

  let actions = '';
  if (item.kind === 'request') {
    actions = '<div class="wd-request-actions">' +
      '<button type="button" class="wd-primary" data-act="wd-attention-approve" data-id="' + c.esc(item.id) + '">Approve, leave open</button>' +
      '<button type="button" class="wd-ghost" data-act="wd-attention-decline" data-id="' + c.esc(item.id) + '">Decline</button>' +
      '<button type="button" class="wd-linkish" data-act="wd-attention-expand" data-id="' + c.esc(item.id) + '">' +
      (item.expanded ? 'Hide replacement picker' : 'Approve with a replacement') + '</button></div>' +
      (item.expanded ? attentionCandidatePicker(item, c) : '');
  } else if (item.kind === 'unfilled' || item.kind === 'replacement') {
    actions = attentionCandidatePicker(item, c) +
      (item.kind === 'replacement'
        ? '<button type="button" class="wd-ghost" data-act="wd-attention-open" data-id="' + c.esc(item.id) + '">Leave open</button>'
        : '');
  } else if (item.kind === 'conflict') {
    actions = '<button type="button" class="wd-ghost" data-act="wd-attention-conflict-ok" data-id="' + c.esc(item.id) + '">Mark as OK</button>';
  }

  const advisory = item.conflictAdvisory
    ? c.warning('This member already serves ' + item.conflictAdvisory.duties.join(', ') + ' in this service.') +
      '<button type="button" class="wd-ghost" data-act="wd-attention-assign-anyway" data-id="' + c.esc(item.id) + '">Assign anyway</button>'
    : '';
  const error = item.error ? c.warning(item.error) : '';
  return '<div class="wd-attention-card" data-id="' + c.esc(item.id) + '">' + head + error + advisory + actions + '</div>';
}

function screenAttention(info, c) {
  if (!info.loaded) return c.unknownState('Needs attention has not loaded yet.');
  if (!info.items.length) return c.emptyState('Nothing needs attention right now.');
  return '<div class="wd-attention-screen">' +
    info.items.map(item => attentionItemCard(item, c)).join('') +
    c.pager(info.page, info.totalPages) + '</div>';
}

/* -------- Department leader / Administrator: Members -------- */

function memberRosterRow(profile, c) {
  return '<div class="wd-assignment-row"><span class="wd-assignment-duty">' + c.esc(profile.memberName) + '</span>' +
    '<span class="wd-status-chip">' + c.esc(profile.status || 'active') + '</span></div>';
}

function memberSearchRow(candidate, department, c) {
  return '<div class="wd-assignment-row"><span class="wd-assignment-duty">' + c.esc(candidate.memberName) + '</span>' +
    '<button type="button" class="wd-primary" data-act="wd-member-add" data-dept="' + c.esc(department) + '" data-uid="' + c.esc(candidate.memberUid) + '" data-name="' + c.esc(candidate.memberName) + '">Add</button></div>';
}

function screenManageMembers(info, c) {
  if (!info.departments.length) return c.emptyState('You do not manage a department yet.');
  const tabs = info.departments.length > 1
    ? '<div class="wd-secondary-tabs" role="tablist">' + info.departments.map(d =>
        '<button type="button" class="wd-tab-btn' + (d === info.department ? ' active' : '') + '" data-act="wd-members-department" data-dept="' + c.esc(d) + '">' + c.esc(d) + '</button>'
      ).join('') + '</div>'
    : '';
  let html = tabs;
  html += c.searchField(info.query, 'Search members by name', 'wd-member-search');
  if (info.query.trim().length >= 2) {
    if (!info.searchResult) html += c.skeleton(2);
    else if (info.searchResult.error) html += c.warning(info.searchResult.error);
    else if (!info.searchResult.members.length) html += c.emptyState('No registered member matches that name.');
    else html += '<div class="wd-week-range">Search results</div>' + info.searchResult.members.map(m => memberSearchRow(m, info.department, c)).join('');
  }
  html += '<div class="wd-week-range">' + info.department + ' roster</div>';
  if (!info.rosterLoaded) html += c.skeleton(3);
  else if (!info.roster.length) html += c.emptyState('No members on this roster yet.');
  else html += info.roster.map(p => memberRosterRow(p, c)).join('');
  html += '<button type="button" class="wd-ghost" data-act="wd-member-invite" data-dept="' + c.esc(info.department) + '">Create invite link</button>';
  if (info.invite) {
    html += info.invite.error ? c.warning(info.invite.error)
      : '<div class="wd-request-item"><div class="wd-request-note">Invite link (single-use, expires in 7 days):</div><div class="wd-request-note">' + c.esc(info.invite.token || '') + '</div></div>';
  }
  return '<div class="wd-manage-members-screen">' + html + '</div>';
}

/* -------- Administrator: exceptions -------- */

function screenManageExceptions(info, c) {
  return '<div class="wd-manage-exceptions-screen">' +
    c.emptyState('No unresolved membership exceptions right now. A name search that does not match a registered member appears here in a future update.') +
    '</div>';
}

/* -------- Administrator: authorized settings -------- */

function screenManageSettings(info, c) {
  if (!info.isAdmin) return c.warning('Settings are restricted to administrators.');
  return '<div class="wd-manage-settings-screen">' +
    c.emptyState('Feature flags, leader configuration, and data sync remain on the existing Manage screen for now. Open Manage from a wider screen to reach them.') +
    '</div>';
}

/* -------- Presider: My service -------- */

function presiderServiceCard(svc, c, featured) {
  const status = svc.songState;
  const label = !status || !status.count ? 'No songs picked yet'
    : status.confirmed ? 'Songs confirmed' : status.changed ? 'Changed since confirming' : status.count + ' song' + (status.count === 1 ? '' : 's') + ' picked, not confirmed';
  return '<div class="wd-service-card' + (featured ? ' wd-service-current' : '') + '">' +
    '<div class="wd-service-title">' + c.esc(svc.worship || '') + ' &middot; ' + c.esc(svc.service || '') + '</div>' +
    '<div class="wd-service-time">' + c.esc(fmtDayLabel(svc.date)) + (svc.time ? ' at ' + c.esc(svc.time) : '') + '</div>' +
    '<div class="wd-status-chip">' + c.esc(label) + '</div>' +
    '<div class="wd-request-actions">' +
    '<button type="button" class="wd-ghost" data-route="#songs/library">Open Songs</button>' +
    (featured ? '<button type="button" class="wd-primary" data-act="wd-song-confirm" data-svc="' + c.esc(svc.serviceId) + '"' + (status && status.count ? '' : ' disabled') + '>Confirm songs</button>' : '') +
    '</div></div>';
}

function screenSongsMyService(info, c) {
  if (!info.loaded) return c.unknownState('Your services have not loaded yet.');
  let html = '';
  if (info.saveState && (info.saveState.status === 'saving' || info.saveState.status === 'failed' || info.saveState.status === 'stale')) html += c.saveBar(info.saveState);
  if (!info.next) return html + c.emptyState('You have no upcoming service to preside over right now.');
  html += '<div class="wd-week-range">Your next service</div>' + presiderServiceCard(info.next, c, true);
  if (info.upcoming.length) html += '<div class="wd-week-range">Also upcoming</div>' + info.upcoming.map(svc => presiderServiceCard(svc, c, false)).join('');
  return '<div class="wd-songs-my-service-screen">' + html + '</div>';
}

/* -------- Presider: History -------- */

function historyEntryRow(entry, c) {
  const source = entry.historySource === 'automatic' ? 'Recorded automatically' : entry.historySource === 'corrected' ? 'Corrected' : 'Recorded';
  const songs = (entry.songs || []).map(s =>
    '<div class="wd-assignment-row"><span class="wd-assignment-duty">' + c.esc(s.title || s.id) + '</span>' +
    '<button type="button" class="wd-danger-link" data-act="wd-history-remove-song" data-svc="' + c.esc(entry.serviceId) + '" data-song="' + c.esc(s.id) + '">Remove</button></div>'
  ).join('');
  return '<div class="wd-request-item"><div class="wd-request-head"><span>' + c.esc(entry.worship) + ' ' + c.esc(entry.service) + ', ' + c.esc(fmtDayLabel(entry.date)) + '</span>' +
    '<span class="wd-status-chip">' + c.esc(source) + '</span></div>' + (songs || c.emptyState('No songs recorded.')) + '</div>';
}

function screenSongsHistory(info, c) {
  if (!info.loaded) return c.skeleton(3);
  if (info.error) return c.warning(info.error) + '<button type="button" class="wd-ghost" data-act="wd-history-retry">Try again</button>';
  let html = c.searchField(info.query, 'Search history', 'wd-song-history-search');
  if (!info.entries.length) html += c.emptyState('No recorded services match.');
  else html += info.entries.map(e => historyEntryRow(e, c)).join('');
  html += c.pager(info.page, info.totalPages);
  return '<div class="wd-songs-history-screen">' + html + '</div>';
}

export function createLayout(config) {
  const { id, name, stylesheet, weekGroup, serviceSummary } = config;

  function header(model, c) {
    return '<header class="wd-header" data-section="header">' +
      '<div class="wd-header-title">LV Zion Worship</div>' +
      c.appearanceButton(name) +
      '</header>';
  }

  function shell(model, c) {
    const secondaryTabs = typeof model.navigation.secondary === 'function'
      ? model.navigation.secondary(model.route, model.account) : [];
    const banners = '<div class="wd-banners" aria-live="polite">' + (model.banners || []).join('') + '</div>';
    return '<div class="wd-shell wd-shell-' + id + '">' +
      header(model, c) +
      c.secondaryTabs(secondaryTabs, model.route) +
      '<main class="wd-body" data-section="body">' + banners + (model.screenHtml || '') + '</main>' +
      c.saveBar(model.saveState) +
      c.mainNav(model.navigation, model.route) +
      '</div>';
  }

  function authWrap(bodyHtml) {
    return '<div class="wd-auth wd-auth-' + id + '"><div class="wd-auth-frame wd-legacy">' + (bodyHtml || '') + '</div></div>';
  }

  function phaseLocked(info, c) { return authWrap(info.siteLockHtml); }
  function phaseSignin(info, c) { return authWrap(info.loginHtml); }
  function phaseForcedPin(info, c) { return authWrap(info.forcedPinHtml); }
  function phaseLoading(info, c) {
    return '<div class="wd-auth"><div class="wd-auth-frame">' + c.skeleton(4) + '</div></div>';
  }
  function phaseRecovery(info, c) {
    return '<div class="wd-recovery-panel">' +
      '<h2>' + name + ' could not load</h2>' +
      '<p>Check your connection and try again, or use Original for this visit. Your saved appearance choice is not changed.</p>' +
      '<div class="wd-recovery-actions">' +
      '<button class="wd-appearance-btn" data-act="wd-appearance-retry">Retry</button>' +
      '<button class="wd-appearance-btn" data-act="wd-appearance-use-original">Use Original for now</button>' +
      '</div></div>';
  }
  function phaseMaintenance(info, c) {
    return '<div class="wd-auth"><div class="wd-auth-frame wd-legacy">' + (info.maintenanceHtml || '') + '</div></div>';
  }

  function screenSchedule(info, c) {
    if (!info.loaded) return c.unknownState('The schedule has not loaded yet.');
    let html = c.searchField(info.query, 'Search services');
    html += c.monthNav(info.month, info.months);
    if (info.focus) {
      html += '<div class="wd-week-range">Current or next service</div>' + serviceSummary(info.focus, c, { current: true });
    }
    const hasAny = info.weeks.some(week => week.days.some(day => day.services.length));
    if (!hasAny) html += c.emptyState(info.query ? 'No services match that search.' : 'No services this month.');
    else html += info.weeks.map(week => weekGroup(week, c, serviceSummary)).join('');
    return '<div class="wd-schedule-screen">' + html + '</div>';
  }

  function screenAppearance(info, c) {
    const tiles = info.layouts.map(l =>
      '<button type="button" class="wd-appearance-tile' + (l.id === info.current ? ' active' : '') + '" data-act="wd-appearance-select" data-mode="' + l.id + '" aria-pressed="' + (l.id === info.current) + '">' +
      '<strong>' + l.name + '</strong><small>' + l.description + '</small></button>'
    ).join('');
    return '<div class="wd-appearance-screen"><p class="wd-appearance-intro">One app, one shared schedule, four ways to view it. Your duties, song plans, sign-in and permissions stay the same.</p>' +
      '<div class="wd-appearance-grid">' + tiles + '</div>' +
      '<button class="wd-appearance-back" data-route="' + (info.returnRoute || '#schedule') + '">Return to workspace</button></div>';
  }

  function screenUnavailable(info, c) {
    return '<div class="wd-unavailable-screen">' + c.warning(info.message) +
      '<p><button class="wd-appearance-back" data-route="' + info.startRoute + '">Go to your workspace</button></p></div>';
  }

  function screenLegacy(info, c) {
    return '<div class="wd-legacy" id="wd-legacy-mount" data-legacy-kind="' + (info.kind || 'my') + '"></div>';
  }

  return {
    id, name, stylesheet,
    shell,
    phase: { locked: phaseLocked, signin: phaseSignin, forcedPin: phaseForcedPin, loading: phaseLoading, recovery: phaseRecovery, maintenance: phaseMaintenance },
    weekGroup, serviceSummary,
    screens: {
      schedule: screenSchedule, duties: screenDuties, availability: screenAvailability,
      reminders: screenReminders,
      manageSchedule: screenManageSchedule, attention: screenAttention, manageMembers: screenManageMembers,
      manageExceptions: screenManageExceptions, manageSettings: screenManageSettings,
      songsMyService: screenSongsMyService, songsHistory: screenSongsHistory,
      appearance: screenAppearance, unavailable: screenUnavailable, legacy: screenLegacy
    }
  };
}

/* Screen registry: id, route match, one information builder per screen. A
   builder returns plain data only (records, counts, permitted actions,
   loading/error state); layouts turn that data into HTML. Section 2 owns
   `schedule`, `appearance`, and `unavailable`. `legacy` is the compatibility
   wrapper for My duties, Manage, and the Presider planner until Section 4
   replaces them screen by screen. */

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function monthOf(dateISO) { return (dateISO || '').slice(0, 7); }

function todayMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
}

function weekStartsFor(month) {
  // Calendar weeks (Sunday start) covering every day of `month`.
  if (!month) return [];
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, (m || 1) - 1, 1);
  const last = new Date(y, (m || 1), 0);
  const starts = [];
  let cursor = new Date(first);
  cursor.setDate(cursor.getDate() - cursor.getDay());
  while (cursor <= last) {
    starts.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return starts;
}

function isoOf(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

export function groupIntoWeeks(services, month) {
  const starts = weekStartsFor(month);
  const byDate = Object.create(null);
  (services || []).forEach(svc => {
    (byDate[svc.date] || (byDate[svc.date] = [])).push(svc);
  });
  return starts.map(start => {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const days = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const iso = isoOf(d);
      days.push({ date: iso, inMonth: monthOf(iso) === month, services: (byDate[iso] || []).slice().sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))) });
    }
    return { start: isoOf(start), end: isoOf(end), days };
  });
}

export function buildScheduleInfo(host, mem) {
  const services = (host.services() || []).slice().sort((a, b) => a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || '')));
  const focus = typeof host.currentOrNext === 'function' ? host.currentOrNext() : null;
  const months = Array.from(new Set(services.map(s => monthOf(s.date)))).sort();
  let month = mem.month || monthOf(focus && focus.date) || months[months.length - 1] || todayMonth();
  if (months.length && months.indexOf(month) === -1) month = months[months.length - 1];
  const query = (mem.query || '').trim().toLowerCase();
  const matches = svc => !query || [svc.worship, svc.service, svc.date].some(v => String(v || '').toLowerCase().indexOf(query) !== -1);
  const filtered = services.filter(matches);
  const monthServices = filtered.filter(s => monthOf(s.date) === month);
  return {
    loaded: services.length > 0 || host.dataReady !== false,
    services: filtered,
    month,
    months,
    weeks: groupIntoWeeks(monthServices, month),
    query: mem.query || '',
    focus: focus && matches(focus) ? focus : null
  };
}

export function buildAppearanceInfo(host) {
  const layouts = [
    { id: 'classic', name: 'Original', description: 'The familiar interface' },
    { id: 'prism', name: 'Prism', description: 'Calendar-first, clear workspace' },
    { id: 'navy', name: 'Navy & Cream', description: 'Warm, refined service timeline' },
    { id: 'aurora', name: 'Aurora', description: 'Spacious, dynamic workspace' }
  ];
  return { layouts, current: host.appearance ? host.appearance() : 'classic' };
}

export function buildUnavailableInfo(host, route) {
  const account = host.account();
  return {
    message: 'That destination is not available right now.',
    startRoute: account ? (host.startRoute ? host.startRoute() : '#schedule') : '#schedule',
    account
  };
}

/* Member: My next duty / Upcoming duties. `next` is the soonest upcoming
   duty (host.myDuties() is already date/time/duty ordered); `days` groups the
   rest by day -> service for card display. `reqKey` (serviceId:duty) marks
   which duty's change-request form is open, read from route memory so it
   survives a re-render. */
export function buildDutiesInfo(host, mem) {
  const raw = (typeof host.myDuties === 'function' ? host.myDuties() : []) || [];
  const loaded = host.dataReady ? host.dataReady() !== false : true;
  const days = [];
  const dayIndex = Object.create(null);
  raw.forEach(d => {
    let day = dayIndex[d.date];
    if (!day) { day = dayIndex[d.date] = { date: d.date, services: [] }; days.push(day); }
    let se = day.services.find(s => s.serviceId === d.serviceId);
    if (!se) { se = { serviceId: d.serviceId, worship: d.worship, service: d.service, time: d.time, duties: [] }; day.services.push(se); }
    se.duties.push(d);
  });
  const requests = (typeof host.myRequests === 'function' ? host.myRequests() : []) || [];
  return {
    loaded,
    next: raw[0] || null,
    days,
    count: raw.length,
    requests,
    reqKey: (mem && mem.reqKey) || null
  };
}

/* Member: Availability. One record per department the member belongs to,
   each carrying its own dirty/save state so several department cards can be
   edited independently (a member may belong to more than one department). */
export function buildAvailabilityInfo(host) {
  const loaded = typeof host.availabilityReady === 'function' ? host.availabilityReady() : true;
  const error = typeof host.availabilityError === 'function' ? host.availabilityError() : '';
  const profiles = loaded && !error && typeof host.myAvailability === 'function' ? (host.myAvailability() || []) : [];
  const withState = profiles.map(p => Object.assign({}, p, {
    saveState: p.dirty && typeof host.availabilitySaveState === 'function'
      ? host.availabilitySaveState(p.departmentId, p.memberUid) : null
  }));
  return { loaded, error, profiles: withState };
}

/* Member: Reminders (notifications + calendar export + recent alerts). */
export function buildRemindersInfo(host) {
  const r = (typeof host.reminders === 'function' ? host.reminders() : {}) || {};
  return {
    notifySupported: !!r.notifySupported,
    notifyOn: !!r.notifyOn,
    calendarEnabled: !!r.calendarEnabled,
    alerts: r.alerts || []
  };
}

/* -------- Department leader / Administrator: Upcoming services -------- */

export function buildManageScheduleInfo(host, mem) {
  const departments = (typeof host.authorizedDepartments === 'function' ? host.authorizedDepartments() : []) || [];
  const isAdmin = departments.indexOf('All') !== -1;
  const loaded = host.dataReady ? host.dataReady() !== false : true;
  const query = (mem && mem.query || '').trim().toLowerCase();
  const raw = (typeof host.manageServices === 'function' ? host.manageServices() : []) || [];
  const matches = svc => !query || [svc.worship, svc.service, svc.date].some(v => String(v || '').toLowerCase().indexOf(query) !== -1);
  return { loaded, departments, isAdmin, query: (mem && mem.query) || '', services: raw.filter(matches) };
}

/* -------- Department leader / Administrator: Needs attention -------- */

export function buildAttentionInfo(host, mem) {
  const loaded = host.dataReady ? host.dataReady() !== false : true;
  const all = (typeof host.attentionItems === 'function' ? host.attentionItems() : []) || [];
  const pageSize = 10;
  const page = Math.max(1, (mem && mem.page) || 1);
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageItems = all.slice((clampedPage - 1) * pageSize, clampedPage * pageSize).map(item => Object.assign({}, item, {
    candidates: (item.kind === 'unfilled' || item.kind === 'replacement' || item.kind === 'request')
      ? (typeof host.attentionCandidates === 'function' ? host.attentionCandidates(item.serviceId, item.duty) : [])
      : [],
    busy: typeof host.attentionBusy === 'function' ? host.attentionBusy(item.id) : false,
    error: typeof host.attentionError === 'function' ? host.attentionError(item.id) : '',
    conflictAdvisory: typeof host.attentionConflictAdvisory === 'function' ? host.attentionConflictAdvisory(item.id) : null,
    expanded: !!(mem && mem.expanded && mem.expanded[item.id])
  }));
  return { loaded, count: all.length, page: clampedPage, totalPages, items: pageItems };
}

/* -------- Department leader / Administrator: Members -------- */

export function buildManageMembersInfo(host, mem) {
  const departments = (typeof host.authorizedDepartments === 'function' ? host.authorizedDepartments() : []) || [];
  const isAdmin = departments.indexOf('All') !== -1;
  const choices = isAdmin ? departments.filter(d => d !== 'All') : departments;
  const department = (mem && mem.department && choices.indexOf(mem.department) !== -1) ? mem.department : (choices[0] || '');
  const roster = department && typeof host.departmentRoster === 'function' ? host.departmentRoster(department) : [];
  const rosterLoaded = department && typeof host.departmentRosterReady === 'function' ? host.departmentRosterReady(department) : true;
  const query = (mem && mem.query) || '';
  const searchResult = department && query.trim().length >= 2 && typeof host.memberSearchResults === 'function'
    ? host.memberSearchResults(department, query.trim())
    : null;
  const invite = department && typeof host.pendingInvite === 'function' ? host.pendingInvite(department) : null;
  return { departments: choices, department, roster, rosterLoaded, query, searchResult, invite };
}

/* -------- Administrator: authorized settings (scoped to the site
   passcode change already exposed elsewhere in the legacy bridge; the full
   Features/Leader-config/Data&Sync panels remain on the legacy bridge for
   now — see S4.md limitations). -------- */

export function buildManageSettingsInfo(host) {
  const account = host.account();
  return { isAdmin: !!(account && account.isAdmin) };
}

/* -------- Presider: My service -------- */

export function buildSongsMyServiceInfo(host, mem) {
  const loaded = host.dataReady ? host.dataReady() !== false : true;
  const services = (typeof host.presiderServices === 'function' ? host.presiderServices() : []) || [];
  const next = services[0] || null;
  const saveState = next && typeof host.songSaveState === 'function' ? host.songSaveState(next.serviceId) : null;
  return { loaded, next, upcoming: services.slice(1), saveState };
}

/* -------- Presider: History -------- */

export function buildSongsHistoryInfo(host, mem) {
  const loaded = typeof host.songHistoryReady === 'function' ? host.songHistoryReady() : true;
  const error = typeof host.songHistoryError === 'function' ? host.songHistoryError() : '';
  const all = (typeof host.songHistory === 'function' ? host.songHistory() : []) || [];
  const query = (mem && mem.query || '').trim().toLowerCase();
  const matches = entry => !query || [entry.worship, entry.service, entry.date].some(v => String(v || '').toLowerCase().indexOf(query) !== -1);
  const filtered = all.filter(matches);
  const pageSize = 10;
  const page = Math.max(1, (mem && mem.page) || 1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);
  return { loaded, error, count: filtered.length, page: clampedPage, totalPages, entries: pageItems, query: (mem && mem.query) || '' };
}

export const SCREEN_IDS = [
  'schedule', 'duties', 'availability', 'reminders',
  'manageSchedule', 'attention', 'manageMembers', 'manageSettings',
  'songsMyService', 'songsHistory',
  'appearance', 'unavailable', 'legacy'
];

export function screenForRoute(route) {
  if (route === '#schedule') return 'schedule';
  if (route === '#duties') return 'duties';
  if (route === '#availability') return 'availability';
  if (route === '#reminders') return 'reminders';
  if (route === '#manage/schedule') return 'manageSchedule';
  if (route === '#manage/attention') return 'attention';
  if (route === '#manage/members') return 'manageMembers';
  if (route === '#manage/settings') return 'manageSettings';
  if (route === '#songs/my-service') return 'songsMyService';
  if (route === '#songs/history') return 'songsHistory';
  if (route === '#appearance') return 'appearance';
  if (route === '#unavailable') return 'unavailable';
  return 'legacy';
}

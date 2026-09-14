(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DepartmentManagementPrototype = factory();
    if (root.document) root.DepartmentManagementPrototype.mount(root.document);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const APPEARANCES = Object.freeze([
    { id: 'classic', name: 'Original', note: 'Familiar blue service records', tone: 'blue' },
    { id: 'prism', name: 'Prism', note: 'Calendar-first, bright workspace', tone: 'violet' },
    { id: 'navy', name: 'Navy & Cream', note: 'Warm, refined service timeline', tone: 'cream' },
    { id: 'aurora', name: 'Aurora', note: 'Spacious, dynamic workspace', tone: 'aurora' }
  ]);

  const NAV_ITEMS = Object.freeze([
    { id: 'schedule', label: 'Schedule' },
    { id: 'my', label: 'My Duties' },
    { id: 'songs', label: 'Presider' },
    { id: 'manage', label: 'Manage' }
  ]);

  const DUTIES = Object.freeze([
    'Greeter',
    'Welcome table',
    'Room setup',
    'Camera operator',
    'Audio support'
  ]);

  const RECURRING_OPTIONS = Object.freeze([
    { id: 'sun-0900', label: 'Sunday, 9:00 AM', short: 'Sun 9:00 AM' },
    { id: 'sun-1130', label: 'Sunday, 11:30 AM', short: 'Sun 11:30 AM' },
    { id: 'wed-1900', label: 'Wednesday, 7:00 PM', short: 'Wed 7:00 PM' }
  ]);

  const BASE_DATA = Object.freeze({
    currentUser: 'Mara Ellison',
    departments: [
      {
        id: 'welcome-team',
        name: 'Welcome Team',
        description: 'Guest arrival, welcome table, and room readiness.',
        leaderIds: ['mara-ellison', 'quinn-reyes'],
        memberIds: ['lena-ortiz', 'caleb-wren', 'noa-pierce', 'sage-hart']
      },
      {
        id: 'media-crew',
        name: 'Media Crew',
        description: 'Camera, audio, and service recording support.',
        leaderIds: ['mara-ellison', 'devon-kim'],
        memberIds: ['jules-marin', 'rory-gale', 'eli-shaw']
      }
    ],
    members: {
      'mara-ellison': {
        id: 'mara-ellison', name: 'Mara Ellison', status: 'active',
        history: [], eligibleDuties: [], schedulable: true, recurring: [], exceptions: [],
        lastChangedBy: 'Roster setup', lastChangedAt: '2026-09-06T16:00:00'
      },
      'quinn-reyes': {
        id: 'quinn-reyes', name: 'Quinn Reyes', status: 'active',
        history: [], eligibleDuties: ['Greeter', 'Welcome table'], schedulable: true,
        recurring: ['sun-0900'], exceptions: [], lastChangedBy: 'Quinn Reyes', lastChangedAt: '2026-09-10T11:15:00'
      },
      'devon-kim': {
        id: 'devon-kim', name: 'Devon Kim', status: 'active',
        history: [], eligibleDuties: ['Camera operator', 'Audio support'], schedulable: true,
        recurring: ['sun-1130', 'wed-1900'], exceptions: [], lastChangedBy: 'Mara Ellison', lastChangedAt: '2026-09-11T09:40:00'
      },
      'lena-ortiz': {
        id: 'lena-ortiz', name: 'Lena Ortiz', status: 'active',
        history: [
          { duty: 'Greeter', service: 'Morning service', date: '2026-08-16', result: 'Completed' },
          { duty: 'Welcome table', service: 'Community gathering', date: '2026-08-30', result: 'Completed' },
          { duty: 'Greeter', service: 'Morning service', date: '2026-09-06', result: 'Completed' }
        ],
        eligibleDuties: ['Greeter', 'Welcome table'], schedulable: true,
        recurring: ['sun-0900', 'sun-1130'], exceptions: [],
        lastChangedBy: 'History seed', lastChangedAt: '2026-09-08T14:05:00'
      },
      'caleb-wren': {
        id: 'caleb-wren', name: 'Caleb Wren', status: 'active',
        history: [
          { duty: 'Room setup', service: 'Morning service', date: '2026-08-23', result: 'Completed' }
        ],
        eligibleDuties: ['Room setup', 'Greeter'], schedulable: true,
        recurring: ['sun-0900'], exceptions: [], lastChangedBy: 'Caleb Wren', lastChangedAt: '2026-09-09T08:20:00'
      },
      'noa-pierce': {
        id: 'noa-pierce', name: 'Noa Pierce', status: 'active',
        history: [
          { duty: 'Welcome table', service: 'Community gathering', date: '2026-08-09', result: 'Completed' }
        ],
        eligibleDuties: ['Welcome table'], schedulable: false,
        recurring: ['sun-1130'], exceptions: [
          { date: '2026-10-04', label: 'Unavailable', note: 'Family commitment' }
        ], lastChangedBy: 'Mara Ellison', lastChangedAt: '2026-09-12T16:18:00'
      },
      'sage-hart': {
        id: 'sage-hart', name: 'Sage Hart', status: 'inactive',
        history: [
          { duty: 'Greeter', service: 'Morning service', date: '2026-07-26', result: 'Completed' }
        ],
        eligibleDuties: ['Greeter'], schedulable: false, recurring: [], exceptions: [],
        lastChangedBy: 'Mara Ellison', lastChangedAt: '2026-09-03T10:30:00'
      },
      'jules-marin': {
        id: 'jules-marin', name: 'Jules Marin', status: 'active',
        history: [
          { duty: 'Camera operator', service: 'Morning service', date: '2026-08-30', result: 'Completed' }
        ],
        eligibleDuties: ['Camera operator'], schedulable: true,
        recurring: ['sun-0900', 'sun-1130'], exceptions: [],
        lastChangedBy: 'Jules Marin', lastChangedAt: '2026-09-07T12:15:00'
      },
      'rory-gale': {
        id: 'rory-gale', name: 'Rory Gale', status: 'inactive',
        history: [
          { duty: 'Audio support', service: 'Evening service', date: '2026-07-19', result: 'Completed' }
        ],
        eligibleDuties: ['Audio support'], schedulable: false, recurring: [], exceptions: [],
        lastChangedBy: 'Mara Ellison', lastChangedAt: '2026-08-28T17:45:00'
      },
      'eli-shaw': {
        id: 'eli-shaw', name: 'Eli Shaw', status: 'active',
        history: [
          { duty: 'Audio support', service: 'Morning service', date: '2026-09-06', result: 'Completed' }
        ],
        eligibleDuties: ['Audio support', 'Camera operator'], schedulable: true,
        recurring: ['sun-1130'], exceptions: [],
        lastChangedBy: 'Eli Shaw', lastChangedAt: '2026-09-08T09:45:00'
      }
    }
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createInitialState() {
    return {
      data: clone(BASE_DATA),
      appearance: 'classic',
      nav: 'manage',
      view: 'departments',
      selectedDepartmentId: '',
      selectedMemberId: '',
      loading: false,
      empty: false,
      pageError: '',
      saveMode: 'success',
      saved: false,
      saveError: '',
      adminOverride: false,
      motionReduced: false,
      notice: null
    };
  }

  function getDepartment(state, id) {
    return state.data.departments.find(department => department.id === (id || state.selectedDepartmentId)) || null;
  }

  function getMember(state, id) {
    return state.data.members[id || state.selectedMemberId] || null;
  }

  function getDepartmentMembers(state, department) {
    if (!department) return [];
    return department.memberIds.map(id => state.data.members[id]).filter(Boolean);
  }

  function splitMembers(members) {
    return {
      active: members.filter(member => member.status === 'active'),
      inactive: members.filter(member => member.status !== 'active')
    };
  }

  function canSchedule(member) {
    return !!member && member.status === 'active' && member.schedulable === true && member.eligibleDuties.length > 0;
  }

  function reduce(input, action) {
    const state = clone(input);
    state.notice = null;
    const type = action && action.type;

    switch (type) {
      case 'SET_APPEARANCE':
        if (APPEARANCES.some(item => item.id === action.id)) state.appearance = action.id;
        return state;
      case 'SET_NAV':
        if (!NAV_ITEMS.some(item => item.id === action.id)) return state;
        state.nav = action.id;
        state.view = action.id === 'manage' ? 'departments' : 'preview';
        state.selectedDepartmentId = '';
        state.selectedMemberId = '';
        state.saved = false;
        state.saveError = '';
        return state;
      case 'OPEN_DEPARTMENT':
        if (!getDepartment(state, action.id)) return state;
        state.nav = 'manage';
        state.view = 'department';
        state.selectedDepartmentId = action.id;
        state.selectedMemberId = '';
        state.saved = false;
        state.saveError = '';
        return state;
      case 'BACK_TO_DEPARTMENTS':
        state.view = 'departments';
        state.selectedDepartmentId = '';
        state.selectedMemberId = '';
        state.saved = false;
        state.saveError = '';
        return state;
      case 'OPEN_MEMBER':
        if (!getMember(state, action.id) || !getDepartment(state)?.memberIds.includes(action.id)) return state;
        state.view = 'member';
        state.selectedMemberId = action.id;
        state.saved = false;
        state.saveError = '';
        return state;
      case 'SET_LOADING':
        state.loading = action.value !== false;
        if (state.loading) { state.empty = false; state.pageError = ''; }
        return state;
      case 'SET_EMPTY':
        state.empty = action.value !== false;
        if (state.empty) { state.loading = false; state.pageError = ''; state.view = 'departments'; }
        return state;
      case 'SET_PAGE_ERROR':
        state.pageError = action.clear ? '' : (action.message || 'The sample departments could not be loaded.');
        state.loading = false;
        state.empty = false;
        return state;
      case 'SET_SAVE_MODE':
        state.saveMode = action.mode === 'error' ? 'error' : 'success';
        state.saveError = '';
        return state;
      case 'TOGGLE_MOTION':
        state.motionReduced = !state.motionReduced;
        return state;
      case 'SET_ELIGIBLE': {
        const member = getMember(state);
        if (!member || !DUTIES.includes(action.duty)) return state;
        const eligible = new Set(member.eligibleDuties);
        if (action.value) eligible.add(action.duty); else eligible.delete(action.duty);
        member.eligibleDuties = DUTIES.filter(duty => eligible.has(duty));
        state.saved = false;
        return state;
      }
      case 'SET_SCHEDULABLE': {
        const member = getMember(state);
        if (!member) return state;
        member.schedulable = action.value === true;
        state.saved = false;
        return state;
      }
      case 'SET_RECURRING': {
        const member = getMember(state);
        if (!member || !RECURRING_OPTIONS.some(item => item.id === action.id)) return state;
        const recurring = new Set(member.recurring);
        if (action.value) recurring.add(action.id); else recurring.delete(action.id);
        member.recurring = RECURRING_OPTIONS.map(item => item.id).filter(id => recurring.has(id));
        state.saved = false;
        return state;
      }
      case 'ADD_EXCEPTION': {
        const member = getMember(state);
        const date = String(action.date || '').trim();
        const label = String(action.label || 'Unavailable').trim() || 'Unavailable';
        if (!member || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return state;
        if (!member.exceptions.some(item => item.date === date)) {
          member.exceptions.push({ date, label, note: String(action.note || '').trim() });
          member.exceptions.sort((left, right) => left.date.localeCompare(right.date));
          state.saved = false;
        }
        return state;
      }
      case 'REMOVE_EXCEPTION': {
        const member = getMember(state);
        if (!member) return state;
        member.exceptions = member.exceptions.filter(item => item.date !== action.date);
        state.saved = false;
        return state;
      }
      case 'TOGGLE_OVERRIDE':
        state.adminOverride = !state.adminOverride;
        return state;
      case 'SET_MEMBER_STATUS': {
        const member = getMember(state, action.id);
        if (!member || !getDepartment(state)?.memberIds.includes(action.id)) return state;
        member.status = action.status === 'inactive' ? 'inactive' : 'active';
        if (member.status === 'inactive') member.schedulable = false;
        state.notice = { kind: 'success', message: member.name + (member.status === 'active' ? ' restored to the active roster.' : ' moved to the inactive roster.') };
        return state;
      }
      case 'ADD_SAMPLE_MEMBER': {
        const department = getDepartment(state);
        if (!department) return state;
        const id = 'sample-' + String(Object.keys(state.data.members).length + 1);
        const member = {
          id, name: 'Jamie Solis', status: 'active', history: [], eligibleDuties: [], schedulable: false,
          recurring: [], exceptions: [], lastChangedBy: state.data.currentUser, lastChangedAt: '2026-09-14T09:00:00'
        };
        state.data.members[id] = member;
        department.memberIds.push(id);
        state.notice = { kind: 'success', message: 'Jamie Solis was added to ' + department.name + ' in this preview.' };
        return state;
      }
      case 'SAVE_MEMBER': {
        const member = getMember(state);
        if (!member) return state;
        if (state.saveMode === 'error') {
          state.saved = false;
          state.saveError = 'The sample save failed. Nothing was changed outside this browser.';
          state.notice = { kind: 'error', message: 'Save failed. Review the error and try again.' };
          return state;
        }
        member.lastChangedBy = state.data.currentUser;
        member.lastChangedAt = '2026-09-14T09:00:00';
        state.saved = true;
        state.saveError = '';
        state.notice = { kind: 'success', message: 'Saved in this prototype. Mara Ellison is recorded as the last editor.' };
        return state;
      }
      case 'RESET':
        return createInitialState();
      default:
        return state;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function initials(name) {
    return String(name || '').split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value + (value.length === 10 ? 'T12:00:00' : ''));
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
  }

  function appearanceById(id) {
    return APPEARANCES.find(item => item.id === id) || APPEARANCES[0];
  }

  function renderStatusTag(label, tone) {
    return '<span class="status-tag status-' + escapeHtml(tone || 'neutral') + '">' + escapeHtml(label) + '</span>';
  }

  function renderMemberChip(member) {
    return '<span class="member-chip"><span class="avatar" aria-hidden="true">' + escapeHtml(initials(member.name)) + '</span><span>' + escapeHtml(member.name) + '</span></span>';
  }

  function renderStateControls(state) {
    return '<section class="state-controls" aria-labelledby="state-controls-title">' +
      '<div><span class="eyebrow" id="state-controls-title">Approval states</span><p>Use these local controls to preview loading, empty, error, and saved paths.</p></div>' +
      '<div class="state-control-buttons">' +
      '<button class="button button-small" type="button" data-action="replay-loading">Replay loading</button>' +
      '<button class="button button-small" type="button" data-action="show-empty">Show empty</button>' +
      '<button class="button button-small" type="button" data-action="show-error">Show error</button>' +
      '<button class="button button-small button-subtle" type="button" data-action="reset-state">Reset</button>' +
      '</div></section>';
  }

  function renderPageHeading(kicker, title, detail, actions) {
    return '<div class="page-heading"><div><span class="eyebrow">' + escapeHtml(kicker) + '</span><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(detail) + '</p></div>' + (actions || '') + '</div>';
  }

  function renderLoading() {
    return '<section class="state-panel loading-panel" role="status" aria-live="polite"><div class="loading-orb" aria-hidden="true"></div><span class="eyebrow">Manage</span><h1>Loading your departments</h1><p>Checking the departments assigned to Mara Ellison. This sample never contacts production.</p><div class="skeleton-stack" aria-hidden="true"><span></span><span></span><span></span></div><button class="button button-primary" type="button" data-action="finish-loading">Show loaded departments</button></section>';
  }

  function renderEmpty() {
    return '<section class="state-panel empty-panel"><div class="state-mark" aria-hidden="true">0</div><span class="eyebrow">Manage / Departments</span><h1>No departments assigned</h1><p>Only departments led by the signed-in coordinator appear here. The empty state never falls back to a congregation-wide roster.</p><button class="button button-primary" type="button" data-action="restore-sample">Restore fictional sample</button></section>';
  }

  function renderError(state) {
    return '<section class="state-panel error-panel" role="alert"><div class="state-mark" aria-hidden="true">!</div><span class="eyebrow">Manage / Departments</span><h1>We could not load this view</h1><p>' + escapeHtml(state.pageError) + '</p><div class="state-actions"><button class="button button-primary" type="button" data-action="retry-load">Retry sample load</button><button class="button button-subtle" type="button" data-action="reset-state">Return to normal sample</button></div></section>';
  }

  function renderPreview(state) {
    const item = NAV_ITEMS.find(nav => nav.id === state.nav) || NAV_ITEMS[0];
    return '<section class="preview-panel"><div class="preview-mark" aria-hidden="true">' + escapeHtml(item.label.slice(0, 1)) + '</div>' +
      '<span class="eyebrow">' + escapeHtml(item.label) + '</span><h1>Top navigation preserved</h1>' +
      '<p>This clickable prototype is focused on department management. The ' + escapeHtml(item.label) + ' destination remains visible so the existing four-appearance navigation can be reviewed in context.</p>' +
      '<div class="preview-grid"><div><strong>Prototype boundary</strong><span>Fictional records only</span></div><div><strong>Runtime behavior</strong><span>No network or persistence</span></div></div>' +
      '<button class="button button-primary" type="button" data-nav="manage">Return to Manage</button></section>';
  }

  function renderDepartmentCard(state, department) {
    const members = getDepartmentMembers(state, department);
    const groups = splitMembers(members);
    const leaders = department.leaderIds.map(id => state.data.members[id]).filter(Boolean);
    return '<article class="department-card card-accent"><div class="department-card-top"><div class="department-code" aria-hidden="true">' + escapeHtml(department.name.split(/\s+/).map(word => word[0]).join('').slice(0, 2)) + '</div><div class="department-card-title"><span class="eyebrow">Department</span><h2>' + escapeHtml(department.name) + '</h2><p>' + escapeHtml(department.description) + '</p></div><span class="status-tag status-scope">Leader view</span></div>' +
      '<div class="leader-line"><span class="field-label">Assigned leaders</span><div class="member-chip-list">' + leaders.map(renderMemberChip).join('') + '</div></div>' +
      '<div class="department-metrics"><div><strong>' + groups.active.length + '</strong><span>active members</span></div><div><strong>' + groups.inactive.length + '</strong><span>inactive history</span></div><div><strong>' + leaders.length + '</strong><span>leaders</span></div></div>' +
      '<div class="card-footer"><span>Changes stay scoped to this department</span><button class="button button-primary" type="button" data-action="open-department" data-id="' + escapeHtml(department.id) + '">Open department</button></div></article>';
  }

  function renderDepartments(state) {
    return '<div class="manage-page">' + renderStateControls(state) + renderPageHeading('Manage / Departments', 'Your departments', 'Mara Ellison sees only the departments she leads. Start with a department to review its leaders and roster.') +
      '<div class="scope-banner"><span class="scope-icon" aria-hidden="true">L</span><div><strong>Leader-scoped workspace</strong><p>This preview intentionally excludes every other department and the full congregation roster.</p></div><span class="status-tag status-ok">2 departments</span></div>' +
      '<div class="department-grid">' + state.data.departments.map(department => renderDepartmentCard(state, department)).join('') + '</div>' +
      '<section class="privacy-note"><span class="eyebrow">Privacy boundary</span><strong>Department membership is never inferred from a global list.</strong><p>Only assigned leaders, active members, inactive history, and change attribution for the selected department are displayed.</p></section></div>';
  }

  function renderRosterRow(state, department, member) {
    const action = member.status === 'active' ? 'Mark inactive' : 'Restore active';
    const next = member.status === 'active' ? 'inactive' : 'active';
    return '<div class="roster-row"><button type="button" class="roster-person" data-action="open-member" data-id="' + escapeHtml(member.id) + '"><span class="avatar avatar-large" aria-hidden="true">' + escapeHtml(initials(member.name)) + '</span><span><strong>' + escapeHtml(member.name) + '</strong><small>' + (member.eligibleDuties.length ? escapeHtml(member.eligibleDuties.join(' / ')) : 'No duties confirmed yet') + '</small></span></button>' +
      '<div class="roster-status">' + renderStatusTag(member.schedulable && member.status === 'active' ? 'Schedulable' : 'Held', member.schedulable && member.status === 'active' ? 'ok' : 'neutral') + '<button class="text-button" type="button" data-action="set-member-status" data-id="' + escapeHtml(member.id) + '" data-status="' + next + '">' + action + '</button></div></div>';
  }

  function renderDepartment(state) {
    const department = getDepartment(state);
    const members = getDepartmentMembers(state, department);
    const groups = splitMembers(members);
    const leaders = department.leaderIds.map(id => state.data.members[id]).filter(Boolean);
    return '<div class="manage-page">' + renderStateControls(state) +
      '<div class="breadcrumb"><button class="text-button" type="button" data-action="back-departments">Manage</button><span aria-hidden="true">/</span><span>' + escapeHtml(department.name) + '</span></div>' +
      renderPageHeading('Department profile', department.name, 'Review leaders, active service members, and inactive history without leaving this department.', '<button class="button button-subtle" type="button" data-action="add-sample-member">Add fictional member</button>') +
      '<section class="profile-band"><div><span class="eyebrow">Department leaders</span><div class="member-chip-list leader-list">' + leaders.map(renderMemberChip).join('') + '</div></div><div class="profile-band-meta"><span class="status-tag status-scope">Scoped edit</span><small>Last roster review Sep 12, 2026</small></div></section>' +
      '<div class="roster-columns"><section class="roster-panel"><div class="section-heading"><div><span class="eyebrow">Current roster</span><h2>Active members</h2></div><span class="count-badge">' + groups.active.length + '</span></div><p class="section-note">Only active, eligible, schedulable members can be suggested for a duty.</p>' + (groups.active.length ? groups.active.map(member => renderRosterRow(state, department, member)).join('') : '<div class="inline-empty">No active members in this department.</div>') + '</section>' +
      '<section class="roster-panel inactive-panel"><div class="section-heading"><div><span class="eyebrow">History retained</span><h2>Inactive members</h2></div><span class="count-badge muted-count">' + groups.inactive.length + '</span></div><p class="section-note">Inactive members remain visible for historical duty context and cannot be scheduled.</p>' + (groups.inactive.length ? groups.inactive.map(member => renderRosterRow(state, department, member)).join('') : '<div class="inline-empty">No inactive members yet.</div>') + '</section></div>' +
      '<section class="journey-callout"><div class="journey-number">03</div><div><span class="eyebrow">Next step</span><h2>Open a member profile</h2><p>Historical assignments seed duty suggestions, then the leader confirms eligibility and availability.</p></div></section></div>';
  }

  function renderHistory(member) {
    if (!member.history.length) return '<div class="inline-empty">No historical assignments yet. Eligibility must be confirmed manually.</div>';
    return '<ul class="history-list">' + member.history.map(entry => '<li><div><strong>' + escapeHtml(entry.duty) + '</strong><span>' + escapeHtml(entry.service) + ' / ' + escapeHtml(formatDate(entry.date)) + '</span></div>' + renderStatusTag('Suggested', 'suggested') + '</li>').join('') + '</ul>';
  }

  function renderEligibility(state, member) {
    return '<section class="detail-card"><div class="section-heading"><div><span class="eyebrow">Duty profile</span><h2>Eligibility and schedulability</h2></div>' + renderStatusTag(canSchedule(member) ? 'Ready to schedule' : 'Needs review', canSchedule(member) ? 'ok' : 'neutral') + '</div><p class="section-note">History suggests duties. The department leader makes the final eligibility decision.</p><fieldset class="field-group"><legend>Eligible duties</legend>' + DUTIES.map(duty => '<label class="check-row"><input type="checkbox" data-field="eligible" data-duty="' + escapeHtml(duty) + '"' + (member.eligibleDuties.includes(duty) ? ' checked' : '') + '><span>' + escapeHtml(duty) + '</span></label>').join('') + '</fieldset><div class="rule"></div><label class="switch-row"><span><strong>Currently schedulable</strong><small>Keep this off when the member should remain in the roster but not appear in assignment suggestions.</small></span><input type="checkbox" role="switch" data-field="schedulable"' + (member.schedulable ? ' checked' : '') + '><span class="switch-visual" aria-hidden="true"></span></label>' + (member.status === 'inactive' ? '<div class="inline-warning">Inactive members cannot be schedulable. Restore the member to change this.</div>' : '') + '</section>';
  }

  function renderAvailability(state, member) {
    const exceptions = member.exceptions || [];
    return '<section class="detail-card"><div class="section-heading"><div><span class="eyebrow">Shared availability</span><h2>When can this member serve?</h2></div><span class="status-tag status-scope">Leader + member</span></div><p class="section-note">Either the member or an assigned department leader may update this shared record. Every save records the editor and time.</p><fieldset class="field-group"><legend>Recurring service times</legend>' + RECURRING_OPTIONS.map(item => '<label class="check-row"><input type="checkbox" data-field="recurring" data-id="' + item.id + '"' + (member.recurring.includes(item.id) ? ' checked' : '') + '><span>' + escapeHtml(item.label) + '</span></label>').join('') + '</fieldset><div class="exception-heading"><div><span class="field-label">Date exceptions</span><small>One-off dates override the recurring choices.</small></div><span class="count-badge">' + exceptions.length + '</span></div>' + (exceptions.length ? '<ul class="exception-list">' + exceptions.map(item => '<li><div><strong>' + escapeHtml(formatDate(item.date)) + '</strong><span>' + escapeHtml(item.label) + (item.note ? ' / ' + escapeHtml(item.note) : '') + '</span></div><button class="text-button" type="button" data-action="remove-exception" data-date="' + escapeHtml(item.date) + '">Remove</button></li>').join('') + '</ul>' : '<div class="inline-empty">No date exceptions yet. Add one when a one-time conflict needs to be recorded.</div>') + '<form class="exception-form" data-action="add-exception"><label><span>Date</span><input type="date" name="date" required></label><label><span>Change</span><select name="label"><option>Unavailable</option><option>Available</option><option>Time change</option></select></label><button class="button button-subtle" type="submit">Add exception</button></form></section>';
  }

  function renderMember(state) {
    const department = getDepartment(state);
    const member = getMember(state);
    const saveBanner = state.saveError ? '<div class="inline-error" role="alert"><strong>Save error</strong><span>' + escapeHtml(state.saveError) + '</span><button class="text-button" type="button" data-action="set-save-mode" data-mode="success">Use success path</button></div>' : '';
    const successBanner = state.saved ? '<div class="inline-success" role="status"><strong>Saved</strong><span>Local preview saved by ' + escapeHtml(member.lastChangedBy) + ' at ' + escapeHtml(formatDateTime(member.lastChangedAt)) + '.</span></div>' : '';
    return '<div class="manage-page member-page">' + renderStateControls(state) +
      '<div class="breadcrumb"><button class="text-button" type="button" data-action="back-department">' + escapeHtml(department.name) + '</button><span aria-hidden="true">/</span><span>' + escapeHtml(member.name) + '</span></div>' +
      '<section class="member-hero"><div class="member-hero-identity"><span class="avatar avatar-hero" aria-hidden="true">' + escapeHtml(initials(member.name)) + '</span><div><span class="eyebrow">Member detail</span><h1>' + escapeHtml(member.name) + '</h1><p>' + escapeHtml(department.name) + ' / history-seeded profile</p></div></div><div class="member-hero-status">' + renderStatusTag(member.status === 'active' ? 'Active roster' : 'Inactive roster', member.status === 'active' ? 'ok' : 'neutral') + '<span>' + (member.schedulable ? 'Currently schedulable' : 'Held from scheduling') + '</span></div></section>' +
      '<div class="journey-progress" aria-label="Department journey progress"><span class="complete">01 Departments</span><span class="complete">02 Roster</span><span class="current">03 Member detail</span><span>04 Schedule candidate</span></div>' +
      saveBanner + successBanner +
      '<div class="member-grid"><section class="detail-card history-card"><div class="section-heading"><div><span class="eyebrow">History seed</span><h2>Historical duty suggestions</h2></div><span class="status-tag status-suggested">' + member.history.length + ' records</span></div><p class="section-note">These past assignments are suggestions only. They never override a leader decision.</p>' + renderHistory(member) + '</section>' +
      renderEligibility(state, member) + renderAvailability(state, member) +
      '<section class="detail-card attribution-card"><div class="section-heading"><div><span class="eyebrow">Change control</span><h2>Attribution and override</h2></div>' + renderStatusTag(state.adminOverride ? 'Override on' : 'Standard path', state.adminOverride ? 'warning' : 'neutral') + '</div><div class="attribution-row"><span class="avatar" aria-hidden="true">' + escapeHtml(initials(member.lastChangedBy)) + '</span><div><strong>Last changed by ' + escapeHtml(member.lastChangedBy) + '</strong><span>' + escapeHtml(formatDateTime(member.lastChangedAt)) + '</span></div></div><div class="override-box"><div><strong>Administrative override</strong><p>Allow this coordinator to schedule an otherwise ineligible member for a documented exception. This preview does not grant roles or change production data.</p></div><button class="button ' + (state.adminOverride ? 'button-warning' : 'button-subtle') + '" type="button" role="switch" aria-pressed="' + String(state.adminOverride) + '" data-action="toggle-override">' + (state.adminOverride ? 'Disable override' : 'Enable override') + '</button></div></section></div>' +
      '<section class="save-panel"><div><span class="eyebrow">Review before saving</span><h2>Scheduling candidate</h2><p>' + (state.adminOverride ? 'Override is enabled for this documented exception.' : canSchedule(member) ? 'Eligible, active, and schedulable. Recurring availability still applies.' : 'This member should not appear in normal assignment suggestions yet.') + '</p></div><div class="save-actions"><div class="save-mode"><span>Save path</span><button type="button" class="text-button ' + (state.saveMode === 'success' ? 'selected' : '') + '" data-action="set-save-mode" data-mode="success" aria-pressed="' + String(state.saveMode === 'success') + '">Success</button><button type="button" class="text-button ' + (state.saveMode === 'error' ? 'selected' : '') + '" data-action="set-save-mode" data-mode="error" aria-pressed="' + String(state.saveMode === 'error') + '">Error</button></div><button class="button button-primary" type="button" data-action="save-member">Save member profile</button></div></section></div>';
  }

  function renderMain(state) {
    if (state.loading) return renderLoading();
    if (state.empty) return renderEmpty();
    if (state.pageError) return renderError(state);
    if (state.nav !== 'manage') return renderPreview(state);
    if (state.view === 'department') return renderDepartment(state);
    if (state.view === 'member') return renderMember(state);
    return renderDepartments(state);
  }

  function announcementText(state) {
    return state.notice ? state.notice.message : '';
  }

  function mount(doc) {
    if (!doc || !doc.querySelector) return null;
    const root = doc.querySelector('#prototype-root');
    const main = doc.querySelector('#prototype-main');
    if (!root || !main || root.dataset.mounted === 'true') return null;
    root.dataset.mounted = 'true';
    let state = createInitialState();
    let loadingTimer;

    function dispatch(action) {
      state = reduce(state, action);
      render();
    }

    function render() {
      root.dataset.appearance = state.appearance;
      root.dataset.motion = state.motionReduced ? 'reduced' : 'full';
      main.innerHTML = renderMain(state);
      doc.querySelectorAll('[data-nav]').forEach(button => {
        const active = button.dataset.nav === state.nav;
        button.classList.toggle('active', active);
        button.setAttribute('aria-current', active ? 'page' : 'false');
      });
      const appearanceButton = doc.querySelector('[data-action="open-appearance"]');
      if (appearanceButton) appearanceButton.setAttribute('aria-label', 'Appearance. Current design: ' + appearanceById(state.appearance).name);
      const motionButton = doc.querySelector('[data-action="toggle-motion"]');
      if (motionButton) {
        motionButton.textContent = state.motionReduced ? 'Motion: reduced' : 'Motion: on';
        motionButton.setAttribute('aria-pressed', String(state.motionReduced));
      }
      const live = doc.querySelector('#prototype-announcement');
      if (live) {
        live.textContent = announcementText(state);
        live.className = state.notice ? 'announcement ' + state.notice.kind : 'announcement';
      }
      const dialog = doc.querySelector('#appearance-dialog');
      if (dialog) dialog.querySelectorAll('[data-appearance]').forEach(button => {
        const selected = button.dataset.appearance === state.appearance;
        button.setAttribute('aria-pressed', String(selected));
      });
    }

    function closeDialog() {
      const dialog = doc.querySelector('#appearance-dialog');
      if (!dialog) return;
      if (typeof dialog.close === 'function') dialog.close(); else dialog.hidden = true;
    }

    function openDialog() {
      const dialog = doc.querySelector('#appearance-dialog');
      if (!dialog) return;
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.hidden = false;
      dialog.querySelector('[data-appearance="' + state.appearance + '"]')?.focus();
    }

    root.addEventListener('click', event => {
      const appearance = event.target.closest('.appearance-tile[data-appearance]');
      if (appearance) {
        dispatch({ type: 'SET_APPEARANCE', id: appearance.dataset.appearance });
        closeDialog();
        return;
      }
      const nav = event.target.closest('[data-nav]');
      if (nav) { dispatch({ type: 'SET_NAV', id: nav.dataset.nav }); return; }
      const button = event.target.closest('[data-action]');
      if (!button || button.closest('#appearance-dialog')) return;
      const action = button.dataset.action;
      if (action === 'open-appearance') { openDialog(); return; }
      if (action === 'toggle-motion') { dispatch({ type: 'TOGGLE_MOTION' }); return; }
      if (action === 'open-department') { dispatch({ type: 'OPEN_DEPARTMENT', id: button.dataset.id }); return; }
      if (action === 'back-departments') { dispatch({ type: 'BACK_TO_DEPARTMENTS' }); return; }
      if (action === 'back-department') { dispatch({ type: 'OPEN_DEPARTMENT', id: state.selectedDepartmentId }); return; }
      if (action === 'open-member') { dispatch({ type: 'OPEN_MEMBER', id: button.dataset.id }); return; }
      if (action === 'set-member-status') { dispatch({ type: 'SET_MEMBER_STATUS', id: button.dataset.id, status: button.dataset.status }); return; }
      if (action === 'add-sample-member') { dispatch({ type: 'ADD_SAMPLE_MEMBER' }); return; }
      if (action === 'replay-loading') {
        dispatch({ type: 'SET_LOADING', value: true });
        clearTimeout(loadingTimer);
        loadingTimer = setTimeout(() => dispatch({ type: 'SET_LOADING', value: false }), 650);
        return;
      }
      if (action === 'finish-loading' || action === 'restore-sample' || action === 'retry-load') {
        dispatch({ type: 'SET_LOADING', value: false });
        dispatch({ type: 'SET_EMPTY', value: false });
        dispatch({ type: 'SET_PAGE_ERROR', clear: true });
        return;
      }
      if (action === 'show-empty') { dispatch({ type: 'SET_EMPTY', value: true }); return; }
      if (action === 'show-error') { dispatch({ type: 'SET_PAGE_ERROR', message: 'The fictional roster service returned an error. Retry to return to the local sample.' }); return; }
      if (action === 'reset-state') { dispatch({ type: 'RESET' }); return; }
      if (action === 'toggle-override') { dispatch({ type: 'TOGGLE_OVERRIDE' }); return; }
      if (action === 'remove-exception') { dispatch({ type: 'REMOVE_EXCEPTION', date: button.dataset.date }); return; }
      if (action === 'set-save-mode') { dispatch({ type: 'SET_SAVE_MODE', mode: button.dataset.mode }); return; }
      if (action === 'save-member') { dispatch({ type: 'SAVE_MEMBER' }); return; }
    });

    root.addEventListener('change', event => {
      const target = event.target;
      if (target.dataset.field === 'eligible') dispatch({ type: 'SET_ELIGIBLE', duty: target.dataset.duty, value: target.checked });
      if (target.dataset.field === 'schedulable') dispatch({ type: 'SET_SCHEDULABLE', value: target.checked });
      if (target.dataset.field === 'recurring') dispatch({ type: 'SET_RECURRING', id: target.dataset.id, value: target.checked });
    });

    root.addEventListener('submit', event => {
      const form = event.target.closest('[data-action="add-exception"]');
      if (!form) return;
      event.preventDefault();
      const date = form.elements.date.value;
      const label = form.elements.label.value;
      dispatch({ type: 'ADD_EXCEPTION', date, label });
      form.reset();
    });

    doc.querySelector('[data-action="close-appearance"]')?.addEventListener('click', closeDialog);
    doc.querySelector('#appearance-dialog')?.addEventListener('click', event => {
      if (event.target === event.currentTarget) closeDialog();
    });
    render();
    return { getState: () => clone(state), dispatch, render };
  }

  return {
    APPEARANCES,
    NAV_ITEMS,
    DUTIES,
    RECURRING_OPTIONS,
    createInitialState,
    reduce,
    getDepartment,
    getMember,
    getDepartmentMembers,
    splitMembers,
    canSchedule,
    appearanceById,
    mount
  };
}));

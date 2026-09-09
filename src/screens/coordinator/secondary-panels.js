(function expose(root) {
  'use strict';

  var app = root.WorshipApp || (root.WorshipApp = {});
  app.screens = app.screens || {};
  app.screens.coordinatorSecondary = { create: create };

  function create(deps) {
    deps = deps || {};
    var getState = typeof deps.getState === 'function' ? deps.getState : function () { return {}; };
    var getUi = typeof deps.getUi === 'function' ? deps.getUi : function () { return {}; };
    var getFirebase = typeof deps.getFirebase === 'function' ? deps.getFirebase : function () { return null; };
    var helpers = deps.currenthelpers || {};
    var core = deps.core || {};
    var schedule = deps.scheduleDomain || {};
    var coordinator = deps.coordinatorDomain || {};
    var categories = core.CATEGORIES || [];
    var serviceLabels = core.SERVICE_LABELS || [];
    var worshipTypes = core.WORSHIP_TYPES || [];
    var features = core.FEATURES || [];
    var fmt = deps.fmt || {};

    function state() { return getState() || {}; }
    function ui() { return getUi() || {}; }
    function esc(value) {
      if (typeof fmt.esc === 'function') return fmt.esc(value);
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function today() { return typeof helpers.today === 'function' ? helpers.today() : (fmt.today ? fmt.today() : new Date().toISOString().slice(0, 10)); }
    function dateText(value) { return typeof helpers.date === 'function' ? helpers.date(value) : (fmt.date ? fmt.date(value) : value); }
    function timeText(value) { return typeof helpers.time === 'function' ? helpers.time(value) : (fmt.time ? fmt.time(value) : value || ''); }
    function serviceId(service) { return typeof helpers.serviceId === 'function' ? helpers.serviceId(service) : (fmt.serviceId ? fmt.serviceId(service) : schedule.serviceId(service)); }
    function feature(id) {
      if (typeof deps.feature === 'function') return deps.feature(id);
      var current = state().settings && state().settings.features || {};
      if (id in current) return !!current[id];
      var definition = features.find(function (item) { return item.id === id; });
      return definition ? definition.def : true;
    }
    function conflictsFor(service) {
      if (typeof helpers.conflictsFor === 'function') return helpers.conflictsFor(service);
      return schedule.conflictsFor(service, categories);
    }
    function activeConflicts(service) {
      if (typeof helpers.activeConflicts === 'function') return helpers.activeConflicts(service);
      return schedule.activeConflicts(service, categories);
    }
    function sameDuties(a, b) {
      if (typeof helpers.sameDuties === 'function') return helpers.sameDuties(a, b);
      return schedule.sameDuties(a, b);
    }
    function upcomingServices() {
      if (typeof helpers.upcomingServices === 'function') return helpers.upcomingServices();
      return schedule.upcomingServices(state().services || [], today());
    }
    function renderCatRows(service, showEmpty, only) {
      if (typeof helpers.renderCatRows === 'function') return helpers.renderCatRows(service, showEmpty, only);
      var html = '';
      categories.forEach(function (category) {
        if (only && category.name !== only) return;
        var rows = (category.duties || []).filter(function (duty) {
          return showEmpty || feature('emptyDuties') || (service.assignments || {})[duty];
        }).map(function (duty) {
          var member = (service.assignments || {})[duty];
          return '<div class="duty-row"><div class="dname">' + esc(duty) + '</div>' +
            (member ? '<span class="pill">' + esc(member) + '</span>' : '<span style="color:var(--muted);font-style:italic;font-size:13px">—</span>') + '</div>';
        });
        if (rows.length) html += '<div class="cat-label"><span class="dot-c" style="background:' + category.color + '"></span>' + esc(category.name) + '</div>' + rows.join('');
      });
      return html;
    }
    function memberSelect(service, duty) {
      var current = (service.assignments || {})[duty] || '';
      var conflicted = feature('conflictWarnings') && current && activeConflicts(service).some(function (item) { return item.name === current; });
      var currentState = state();
      var options = coordinator.eligibleDutyRoster(service, duty, currentState.departments, currentState.members, categories);
      return '<select data-chg="assign" data-svc="' + serviceId(service) + '" data-duty="' + esc(duty) + '"' +
        (conflicted ? ' class="conflict"' : '') + '>' +
        '<option value="">—</option>' +
        options.map(function (member) { return '<option value="' + esc(member) + '"' + (member === current ? ' selected' : '') + '>' + esc(member) + '</option>'; }).join('') +
        '</select>';
    }
    function reqSubmittedAt(request) {
      return new Date(request.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function renderFeatures() {
      var current = state();
      var html = '<p class="hint">Turn features on or off for the whole congregation. Changes apply to everyone instantly.</p>';
      features.forEach(function (item) {
        html += '<div class="card feature-row">' +
          '<div><div class="f-label">' + esc(item.label) + '</div><div class="f-desc">' + esc(item.desc) + '</div></div>' +
          '<label class="switch"><input type="checkbox" data-chg="feature" data-id="' + item.id + '"' +
          ' aria-label="' + esc(item.label) + '"' + (feature(item.id) ? ' checked' : '') + '><span class="track"></span></label>' +
          '</div>';
      });
      html += '<div class="card"><div class="f-label">Change the editor passcode</div>' +
        '<form class="add-row" style="margin-top:12px" data-act="change-pin">' +
        '<input type="password" id="pin-change" aria-label="New editor passcode" placeholder="New passcode" autocomplete="off" required>' +
        '<button class="ghost" type="submit">Change</button></form></div>';
      html += '<div class="card"><div class="f-label">Change the site passcode</div>' +
        '<div class="f-desc">The 4-digit code everyone enters to open the app.</div>' +
        '<form class="add-row" style="margin-top:12px" data-act="change-site-pin">' +
        '<input type="password" id="site-pin-change" aria-label="New site passcode" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="New passcode" autocomplete="off" required>' +
        '<button class="ghost" type="submit">Change</button></form></div>';
      html += '<div class="card"><div class="f-label">Scheduler</div>' +
        '<div class="f-desc">Who receives a notification when a member submits a change request.</div>' +
        '<select data-chg="scheduler-name" style="margin-top:10px">' +
        '<option value="">— None —</option>' +
        (current.members || []).map(function (member) { return '<option value="' + esc(member) + '"' + (member === (current.settings.schedulerName || '') ? ' selected' : '') + '>' + esc(member) + '</option>'; }).join('') +
        '</select></div>';
      return html;
    }

    function renderManagePlanning() {
      var current = state();
      var t = today();
      var stats = typeof helpers.workloadStats === 'function' ? helpers.workloadStats() : schedule.workloadStats(current.services, current.members, t, categories);
      var upcoming = coordinator.upcomingServices(current.services, t, serviceLabels);
      var confHtml = '';
      var planningRows = coordinator.conflictsWithSuggestions(upcoming, {
        categories: categories,
        stats: stats,
        departments: current.departments,
        members: current.members,
        schedule: schedule
      });
      planningRows.forEach(function (row) {
        var service = row.service;
        var conflict = row.conflict;
        confHtml += '<div class="plan-conflict"><div class="plan-when"><b>' + esc(conflict.name) + '</b> — ' +
          esc(dateText(service.date)) + ' · ' + esc(service.service) +
          ' <span class="plan-duties">(' + conflict.duties.map(esc).join(' + ') + ')</span></div>';
        conflict.duties.forEach(function (duty) {
          var suggestion = row.suggestions.find(function (item) { return item.duty === duty; });
          var subs = suggestion ? suggestion.members : [];
          confHtml += '<div class="plan-suggest"><span class="lab">' + esc(duty) + ' →</span> ' +
            (subs.length ? subs.map(function (member) { return '<button class="ghost mini" data-act="plan-assign" data-svc="' + serviceId(service) +
              '" data-duty="' + esc(duty) + '" data-name="' + esc(member) + '">' + esc(member) + '</button>'; }).join(' ') :
              '<span class="plan-duties">no free member in this department</span>') + '</div>';
        });
        confHtml += '</div>';
      });
      var html = '<div class="card"><div class="f-label">Double-duty conflicts — upcoming</div>' +
        '<div class="f-desc">Tap a name to hand that duty to them. Already-acknowledged doubles (marked OK) are not listed.</div>' +
        (confHtml || '<p class="hint" style="margin-top:12px">No unresolved double-bookings. 🎉</p>') + '</div>';
      var horizonDate = new Date();
      horizonDate.setDate(horizonDate.getDate() + 28);
      var horizon = typeof helpers.toISO === 'function' ? helpers.toISO(horizonDate) : horizonDate.getFullYear() + '-' + String(horizonDate.getMonth() + 1).padStart(2, '0') + '-' + String(horizonDate.getDate()).padStart(2, '0');
      var gapHtml = '';
      var gapRows = coordinator.gapRows(current.services, t, horizon, categories, serviceLabels);
      gapRows.forEach(function (row) {
        if (row.missing.length) gapHtml += '<div class="plan-suggest"><span class="lab">' + esc(dateText(row.service.date)) + ' · ' + esc(row.service.service) + '</span> ' +
          '<span class="plan-duties">' + row.missing.length + ' unfilled: ' + row.missing.map(esc).join(', ') + '</span></div>';
      });
      html += '<div class="card"><div class="f-label">Unfilled duties — next 4 weeks</div>' +
        (gapHtml || '<p class="hint" style="margin-top:12px">Every planned service has its usual duties filled.</p>') + '</div>';
      var rows = coordinator.workloadRows(stats, current.members);
      html += '<div class="card"><div class="f-label">Workload — who is carrying what</div>' +
        '<div class="f-desc">Duty counts. Sorted heaviest first (last 8 weeks + upcoming).</div>' +
        '<div class="plan-scroll"><table class="plan-table"><tr>' +
        '<th>Member</th><th>4 wk</th><th>8 wk</th><th>Upcoming</th><th>Year</th><th>Last served</th><th>Next</th></tr>' +
        rows.map(function (row) {
          var summary = row.s;
          var flag = summary.upcoming === 0 ? ' <span class="warn-badge" title="Nothing upcoming">·</span>' : '';
          return '<tr' + (summary.past8 + summary.upcoming === 0 ? ' class="plan-idle"' : '') + '><td>' + esc(row.m) + flag + '</td>' +
            '<td>' + summary.past4 + '</td><td>' + summary.past8 + '</td><td>' + summary.upcoming + '</td><td>' + summary.total + '</td>' +
            '<td>' + (summary.last ? esc(dateText(summary.last)) : '—') + '</td>' +
            '<td>' + (summary.next ? esc(dateText(summary.next)) : '—') + '</td></tr>';
        }).join('') + '</table></div></div>';
      return html;
    }

    function renderManageConflicts(service, expanded) {
      if (!feature('conflictWarnings')) return '';
      var id = serviceId(service);
      var ok = service.conflictOk || {};
      var html = '';
      activeConflicts(service).forEach(function (conflict) {
        html += '<div class="conflict-note"><span class="dot-c" style="background:var(--warn)"></span>' +
          esc(conflict.name) + ' has ' + conflict.duties.length + ' duties this service' +
          (expanded ? ' <button class="linkish" data-act="conflict-ok" data-svc="' + id + '" data-name="' + esc(conflict.name) + '">Mark as OK</button>' : '') +
          '</div>';
      });
      if (expanded) conflictsFor(service).filter(function (conflict) { return sameDuties(ok[conflict.name], conflict.duties); }).forEach(function (conflict) {
        html += '<div class="conflict-note ok">' + esc(conflict.name) + ' has ' + conflict.duties.length + ' duties (marked OK) ' +
          '<button class="linkish" data-act="conflict-unok" data-svc="' + id + '" data-name="' + esc(conflict.name) + '">show warning again</button></div>';
      });
      return html;
    }

    function renderManageRequests() {
      var current = state();
      var requestSets = coordinator.splitRequests(current.requests || []);
      var pending = requestSets.pending;
      var resolved = requestSets.resolved;
      var currentUi = ui();
      var html = '<p class="hint">Members can request a schedule change from My Duties. Approving here does not edit the schedule — ' +
        'open the service in <b>Services</b> to make the actual change.</p>';
      if (!pending.length) html += '<div class="empty">No pending requests.</div>';
      else pending.forEach(function (request) {
        html += '<div class="card">' +
          '<div class="req-head"><span class="req-when">' + esc(request.name) + ' — ' + esc(request.duty) + '</span>' + statusChip(request.status) + '</div>' +
          '<div class="req-note" style="margin-top:2px">' + esc(request.worship) + ' ' + esc(request.service) + ', ' + esc(dateText(request.date)) + '</div>' +
          (request.note ? '<div class="req-note">' + esc(request.note) + '</div>' : '') +
          '<div class="req-meta">Submitted ' + esc(reqSubmittedAt(request)) + '</div>' +
          '<div class="req-actions-row"><button class="primary" data-act="req-approve" data-id="' + esc(request.id) + '">Approve</button>' +
          '<button class="danger-link" data-act="req-decline" data-id="' + esc(request.id) + '">Decline</button>' +
          '<button class="ghost" data-act="req-open-service" data-svc="' + esc(request.svcId) + '">Open service</button></div></div>';
      });
      if (resolved.length) {
        var open = currentUi.expanded['req-resolved'];
        html += '<button class="linkish" data-act="expand" data-id="req-resolved">' +
          (open ? 'Hide resolved requests' : 'Show ' + Math.min(resolved.length, 10) + ' resolved request' + (resolved.length > 1 ? 's' : '')) + '</button>';
        if (open) resolved.slice(0, 10).forEach(function (request) {
          var when = request.resolvedAt ? new Date(request.resolvedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
          html += '<div class="req-item"><div class="req-head"><span class="req-when">' + esc(request.name) + ' — ' + esc(request.duty) + '</span>' + statusChip(request.status) + '</div>' +
            '<div class="req-meta">' + esc(request.worship) + ' ' + esc(request.service) + ', ' + esc(dateText(request.date)) +
            (when ? ' · resolved ' + esc(when) + (request.resolvedBy ? ' by ' + esc(request.resolvedBy) : '') : '') + '</div></div>';
        });
      }
      return html;
    }

    function renderManageServices() {
      var currentUi = ui();
      var html = '<form class="add-row" data-act="add-service">' +
        '<input type="date" id="svc-date" required value="' + today() + '">' +
        '<input type="time" id="svc-time" required value="09:00">' +
        '<select id="svc-label">' + serviceLabels.map(function (label) { return '<option>' + label + '</option>'; }).join('') + '</select>' +
        '<input type="text" id="svc-worship" list="worship-types" placeholder="Worship (e.g. Sabbath Day)" value="Sabbath Day">' +
        '<datalist id="worship-types">' + worshipTypes.map(function (worship) { return '<option>' + esc(worship) + '</option>'; }).join('') + '</datalist>' +
        '<button class="primary" type="submit">Add</button></form>' +
        '<p class="hint">Tap a service to assign people to each duty.</p>';
      var upcoming = upcomingServices();
      if (!upcoming.length) html += '<div class="empty">No upcoming services. Add one above.</div>';
      var lastDate = '';
      upcoming.forEach(function (service) {
        if (service.date !== lastDate) { lastDate = service.date; html += '<div class="date-head"><span class="day">' + esc(dateText(service.date)) + '</span></div>'; }
        var id = serviceId(service);
        var open = currentUi.expanded['m:' + id];
        html += '<div class="card"><button type="button" class="card-head" data-act="expand" data-id="m:' + id + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
          '<span class="svc-title">' + esc(service.worship) + ' <small>· ' + esc(service.service) + '</small></span>' +
          '<span class="time">' + timeText(service.time) + ' ' + (open ? '▲' : '▼') + '</span></button>';
        if (open) {
          html += '<div class="edit-grid"><span class="lab">Date</span><input type="date" value="' + esc(service.date) + '" data-chg="svc-field" data-svc="' + id + '" data-field="date">' +
            '<span class="lab">Time</span><input type="time" value="' + esc(service.time) + '" data-chg="svc-field" data-svc="' + id + '" data-field="time">' +
            '<span class="lab">Worship</span><input type="text" value="' + esc(service.worship) + '" data-chg="svc-field" data-svc="' + id + '" data-field="worship">' +
            '<span class="lab">Choir song</span><input type="text" value="' + esc(service.choirSong || '') + '" placeholder="e.g. #311 I Repent of My Sin" data-chg="svc-field" data-svc="' + id + '" data-field="choirSong"></div>';
          categories.forEach(function (category) {
            html += '<div class="cat-edit-label"><span class="dot-c" style="background:' + category.color + '"></span>' + esc(category.name) + '</div><div class="edit-grid">' +
              category.duties.map(function (duty) { return '<span class="lab">' + esc(duty) + '</span>' + memberSelect(service, duty); }).join('') + '</div>';
          });
          html += renderManageConflicts(service, true) + '<div style="text-align:right;margin-top:12px"><button class="danger-link" data-act="del-service" data-svc="' + id + '">Delete this service</button></div>';
        } else html += renderCatRows(service, false);
        html += '</div>';
      });
      return html;
    }

    function renderManagePeople() {
      var current = state();
      var html = '<form class="add-row" data-act="add-member"><input type="text" id="member-name" required placeholder="New person\'s name (e.g. B. David)"><button class="primary" type="submit">Add</button></form>' +
        '<p class="hint">Type on a name to fix it — the change applies to every duty automatically. Check the departments below to control which duty pickers each person shows up in.</p>';
      (current.members || []).forEach(function (member) {
        var duties = typeof helpers.dutiesFor === 'function' ? helpers.dutiesFor(member).length : 0;
        html += '<div class="list-row" style="flex-wrap:wrap"><input type="text" value="' + esc(member) + '" data-chg="member-name" data-old="' + esc(member) + '" style="flex:1">' +
          '<span class="count">' + duties + ' upcoming</span><button class="danger-link" data-act="del-member" data-name="' + esc(member) + '">Remove</button>' +
          '<div style="flex-basis:100%;display:flex;flex-wrap:wrap;gap:8px;margin-top:2px">' + categories.map(function (category) {
            var checked = ((current.departments || {})[category.name] || []).indexOf(member) !== -1;
            return '<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--muted)"><input type="checkbox" data-chg="member-cat" data-name="' + esc(member) + '" data-cat="' + esc(category.name) + '"' +
              (checked ? ' checked' : '') + '><span class="dot-c" style="background:' + category.color + '"></span>' + esc(category.name) + '</label>';
          }).join('') + '</div></div>';
      });
      return html;
    }

    function renderSheetCard() {
      var firebase = getFirebase();
      if (!firebase) return '';
      var storage = deps.storage || {};
      var res = typeof storage.json === 'function' ? storage.json('wds-sheet-sync-result', null) : null;
      var currentUi = ui();
      var status = 'Not synced yet on this device.';
      if (res && res.t) {
        var when = new Date(res.t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        var detail;
        if (res.added || res.updated) {
          var parts = [];
          if (res.added) parts.push(res.added + ' added');
          if (res.updated) parts.push(res.updated + ' updated');
          detail = parts.join(', ') + ' service' + ((res.added + res.updated) > 1 ? 's' : '');
        } else detail = 'everything matched';
        status = 'Last checked ' + when + ' — ' + esc(detail);
      }
      var sheetUrl = typeof helpers.sheetUrl === 'function' ? helpers.sheetUrl() : '';
      var html = '<div class="card"><div class="f-label">Google Sheet</div><div class="sync-status">' + esc(status) + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="ghost" data-act="sheet-sync"' + (currentUi.syncing ? ' disabled' : '') + '>' +
        (currentUi.syncing ? 'Syncing…' : 'Sync now') + '</button></div><input type="text" data-chg="sheet-url" value="' + esc(sheetUrl) + '" style="width:100%;margin-top:10px" placeholder="Published-CSV link of the schedule sheet">' +
        '<div class="hint" style="margin:6px 2px 0">Published-CSV link of the schedule sheet (File → Share → Publish to web → CSV).</div>' +
        '<div class="hint" style="margin:8px 2px 0">The sheet is the source of truth for the duties it lists. Media Booth, Parking Lot, Offering, choir songs, and extra services added here are kept.</div>';
      var messages = (res && res.warningMsgs) || [];
      if (messages.length) html += '<div class="sync-status" style="margin-top:8px">Skipped from the sheet:</div><ul class="sync-warnings">' + messages.slice(0, 3).map(function (message) { return '<li>' + esc(message) + '</li>'; }).join('') + (messages.length > 3 ? '<li>+' + (res.warnings - 3) + ' more</li>' : '') + '</ul>';
      return html + '</div>';
    }

    function renderManageData() {
      var firebase = getFirebase();
      var sheetUrl = typeof helpers.sheetUrl === 'function' ? helpers.sheetUrl() : '';
      var syncCard = firebase ? '<div class="card"><p><b style="color:var(--ok)">Live sync is on.</b> Every member sees schedule changes instantly, on any device.</p></div>' :
        '<div class="card"><p><b>Right now the schedule lives on this device only.</b> To let the whole congregation see it live, connect a free Firebase database (about 10 minutes, one time):</p>' +
        '<p>1. Go to <b>console.firebase.google.com</b> → Add project.<br>2. Add a Web app, then create a <b>Firestore database</b> (Start in test mode).<br>3. Copy the config it shows you into the file <b>firebase-config.js</b>:</p>' +
        '<code class="cfg">window.FIREBASE_CONFIG = { apiKey: "...", authDomain: "...", projectId: "...", ... };</code>' +
        '<p style="margin-top:10px">4. Put the app folder on any free host (e.g. Netlify Drop) and share the link. This device\'s schedule uploads itself automatically the first time.</p></div>';
      return '<div class="data-actions">' + syncCard + renderSheetCard() +
        '<div class="card"><p>Back up the schedule, or move it between devices by hand.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="ghost" data-act="export">Export backup file</button><label class="ghost" style="display:inline-flex;align-items:center;cursor:pointer">Import backup file<input type="file" accept=".json,application/json" data-chg="import-file" style="display:none"></label></div></div>' +
        '<div class="card"><p>Reload the original schedule from the spreadsheet (May – July 2026). This overwrites all current data' + (firebase ? ' for everyone' : '') + '.</p><button class="danger-link" data-act="reset">Reset to spreadsheet data</button></div>' +
        '<div class="card"><p>One-time cleanup after the sheet\'s Raw Data tab was tidied up — merges leftover name variants into their current spelling everywhere.</p><button class="ghost" data-act="unify-names">Unify member names</button></div>' +
        '</div>';
    }

    function statusChip(status) {
      var label = status.charAt(0).toUpperCase() + status.slice(1);
      return '<span class="status-chip ' + esc(status) + '">' + esc(label) + '</span>';
    }
    function renderSecondaryPanel(panel) {
      if (panel === 'planning') return renderManagePlanning();
      if (panel === 'requests') return renderManageRequests();
      if (panel === 'services') return renderManageServices();
      if (panel === 'people') return renderManagePeople();
      if (panel === 'features') return renderFeatures();
      if (panel === 'data') return renderManageData();
      return '';
    }

    return Object.freeze({ renderFeatures, renderManagePlanning, renderManageConflicts, renderManageRequests, renderManageServices, renderManagePeople, renderSheetCard, renderManageData, renderSecondaryPanel });
  }
})(window);

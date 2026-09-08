(function expose(root) {
  'use strict';
  var app = root.WorshipApp || (root.WorshipApp = {});
  app.screens = app.screens || {};
  app.screens.member = { create: create };

  function create(deps) {
    deps = deps || {};
    var state = function () { return typeof deps.getState === 'function' ? (deps.getState() || {}) : {}; };
    var ui = function () { return typeof deps.getUi === 'function' ? (deps.getUi() || {}) : {}; };
    var fmt = deps.fmt || {};
    var core = deps.core || {};
    var schedule = deps.scheduleDomain || {};
    var member = deps.memberDomain || {};
    var categories = core.CATEGORIES || [];
    var local = {
      month: null,
      homeOpen: {},
      dutyOpen: {},
      department: (ui().deptFilter || 'All'),
      requestKey: null,
      requestNote: '',
      jumpDate: null
    };

    function esc(value) {
      if (fmt.esc) return fmt.esc(value);
      return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
        return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
      });
    }
    function dateText(iso, year) {
      
      var d = new Date(String(iso || '') + 'T12:00:00');
      return isNaN(d.getTime()) ? 'Date not listed' : d.toLocaleDateString(undefined, {
        weekday:'long', month:'long', day:'numeric', year: year === false ? undefined : 'numeric'
      });
    }
    function timeText(value) {
      if (fmt.time) return fmt.time(value);
      if (!value) return 'Time not listed';
      var match = String(value).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
      if (!match) return String(value);
      var hour = Number(match[1]), minute = match[2] || '00', suffix = (match[3] || '').toUpperCase();
      if (suffix === 'AM') hour = hour === 12 ? 0 : hour;
      if (suffix === 'PM') hour = hour === 12 ? 12 : hour + 12;
      return (hour % 12 || 12) + ':' + minute + (suffix || (hour >= 12 ? ' PM' : ' AM'));
    }
    function serviceId(service) {
      return fmt.serviceId ? fmt.serviceId(service) : (schedule.serviceId ? schedule.serviceId(service) : service.date + '_' + String(service.service || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    }
    function timeMinutes(value) {
      var match = String(value || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
      if (!match) return 1440;
      var hour = Number(match[1]), minute = Number(match[2] || 0), suffix = (match[3] || '').toUpperCase();
      if (suffix === 'AM') hour = hour === 12 ? 0 : hour;
      if (suffix === 'PM') hour = hour === 12 ? 12 : hour + 12;
      return hour * 60 + minute;
    }
    function today() { return fmt.today ? fmt.today() : new Date().toISOString().slice(0, 10); }
    function services() {
      return (state().services || []).filter(function (s) { return !s.standalone; }).slice().sort(function (a,b) {
        return String(a.date).localeCompare(String(b.date)) || timeMinutes(a.time || a.time24) - timeMinutes(b.time || b.time24) || String(a.time || '').localeCompare(String(b.time || ''));
      });
    }
    function currentMonth() { return local.month || ((ui().memberMonth || ui().calendarMonth) || today().slice(0,7)); }
    function monthShift(key, amount) {
      var d = new Date(key + '-01T12:00:00');
      d.setMonth(d.getMonth() + amount);
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    }
    function monthTitle(key) {
      return new Date(key + '-01T12:00:00').toLocaleDateString(undefined, { month:'long', year:'numeric' });
    }
    function tone(iso) {
      var d = new Date(iso + 'T12:00:00'), day = d.getDay();
      return day === 6 ? 'date-tone-saturday ws-saturday' : day === 2 ? 'date-tone-tuesday ws-tuesday' : 'date-tone-other ws-other';
    }
    function monthDays(key) {
      var first = new Date(key + '-01T12:00:00'), count = new Date(first.getFullYear(), first.getMonth()+1, 0).getDate(), out = [];
      for (var i=0;i<first.getDay();i++) out.push(null);
      for (var n=1;n<=count;n++) out.push(key + '-' + String(n).padStart(2,'0'));
      while (out.length % 7) out.push(null);
      return out;
    }
    function allAssignments(service) { return service && service.assignments || {}; }
    function dayServices(key) { return services().filter(function (s) { return s.date && s.date.slice(0,7) === key; }); }
    function serviceTitle(service) {
      return (service.worship || service.worshipType || 'Worship') + ' · ' + (service.service || service.serviceLabel || 'Service');
    }
    function sessionTitle(service) { return service.service || service.serviceLabel || 'Service'; }
    function worshipTitle(service) { return service.worship || service.worshipType || 'Worship'; }
    function plural(value, singular) {
      var word = value === 1 ? singular : (singular === 'duty' ? 'duties' : singular + 's');
      return value + ' ' + word;
    }
    function uniqueLabels(day, getter) {
      var values = [];
      (day || []).forEach(function (service) {
        var value = getter(service);
        if (value && values.indexOf(value) === -1) values.push(value);
      });
      return values;
    }
    function serviceStart(service) {
      var raw = String(service && (service.time || service.time24) || '').trim();
      var match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
      if (!service || !service.date || !match) return null;
      var hour = Number(match[1]), minute = Number(match[2] || 0), suffix = (match[3] || '').toUpperCase();
      if (suffix === 'AM') hour = hour === 12 ? 0 : hour;
      if (suffix === 'PM') hour = hour === 12 ? 12 : hour + 12;
      if (hour > 23 || minute > 59) return null;
      var guess = Date.UTC(Number(service.date.slice(0,4)), Number(service.date.slice(5,7))-1, Number(service.date.slice(8,10)), hour, minute);
      if (!isFinite(guess)) return null;
      var formatter = new Intl.DateTimeFormat('en-US', {
        timeZone:'America/Los_Angeles', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
      });
      var values = {};
      formatter.formatToParts(new Date(guess)).forEach(function (part) {
        if (part.type !== 'literal') values[part.type] = Number(part.value);
      });
      var displayed = Date.UTC(values.year, values.month-1, values.day, values.hour, values.minute);
      return new Date(guess - (displayed - guess));
    }
    function servicePastCutoff(service) {
      var start = serviceStart(service);
      return !!(start && Date.now() >= start.getTime() + 1800000);
    }
    function renderCalendar(kind, selectedDates) {
      var key = currentMonth(), days = monthDays(key), selected = selectedDates || {};
      var html = '<section class="ws-calendar" aria-label="' + esc(monthTitle(key)) + ' calendar">' +
        '<div class="ws-toolbar calendar-toolbar"><button type="button" class="ws-icon-button" data-act="member-calendar-prev" aria-label="Previous month">‹</button><h2>' + esc(monthTitle(key)) + '</h2><button type="button" class="ws-icon-button" data-act="member-calendar-next" aria-label="Next month">›</button></div>' +
        '<div class="ws-calendar-weekdays" aria-hidden="true"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div class="ws-calendar-grid">';
      days.forEach(function (iso) {
        if (!iso) { html += '<span class="ws-calendar-day blank" aria-hidden="true"></span>'; return; }
        var has = dayServices(key).some(function (s) { return s.date === iso && (selected[serviceId(s)] || selected[s.date]); });
        html += '<button type="button" class="ws-calendar-day ' + tone(iso) + (has ? ' has-service' : '') + '" data-act="member-calendar-day" data-date="' + iso + '" aria-label="' + esc(dateText(iso)) + '"><span>' + Number(iso.slice(-2)) + '</span>' + (has ? '<i aria-hidden="true"></i>' : '') + '</button>';
      });
      return html + '</div></section>';
    }
    function departmentButtons() {
      var names = [{ name:'All' }].concat(categories);
      return '<div class="ws-departments" role="group" aria-label="Department filter">' + names.map(function (category) {
        var name = category.name || category;
        return '<button type="button" class="' + (local.department === name ? 'active' : '') + '" data-act="member-department" data-department="' + esc(name) + '">' + (category.color ? '<span class="ws-dot" style="background:' + esc(category.color) + '"></span>' : '') + esc(name) + '</button>';
      }).join('') + '</div>';
    }
    function dutyEntries(service, options) {
      options = options || {};
      var assignments = allAssignments(service), entries = [], seen = {};
      categories.forEach(function (category) {
        if (options.only && category.name !== options.only) return;
        (category.duties || []).forEach(function (duty) {
          seen[duty] = true;
          var person = assignments[duty];
          if (!person || (options.personal && person !== options.name) || (options.excludeMe && person === options.name)) return;
          entries.push({ duty: duty, person: person, department: category.name, color: category.color, service: service });
        });
      });
      if (options.only && options.only !== 'Other') return entries;
      Object.keys(assignments).forEach(function (duty) {
        if (seen[duty] || !assignments[duty] || (options.personal && assignments[duty] !== options.name) || (options.excludeMe && assignments[duty] === options.name)) return;
        entries.push({ duty: duty, person: assignments[duty], department: 'Other', service: service });
      });
      return entries;
    }
    function homeRow(entry) {
      return '<div class="ws-duty-row" data-department-row data-duty="' + esc(entry.duty) + '"><span class="ws-duty-name">' + esc(entry.duty) + '</span><span class="ws-duty-person' + (entry.person === ui().me ? ' is-me' : '') + '">' + esc(entry.person) + (entry.person === ui().me ? ' (You)' : '') + '</span></div>';
    }
    function departmentGroups(service, only) {
      var entries = dutyEntries(service, { only: only }), html = '', byDepartment = {};
      entries.forEach(function (entry) { (byDepartment[entry.department] || (byDepartment[entry.department] = [])).push(entry); });
      categories.forEach(function (category) {
        if (!byDepartment[category.name]) return;
        html += '<section class="ws-department-section" data-department-section="' + esc(category.name) + '"><h3><span class="ws-dot" style="background:' + esc(category.color) + '"></span>' + esc(category.name) + '</h3>' + byDepartment[category.name].map(homeRow).join('') + '</section>';
      });
      if (byDepartment.Other) html += '<section class="ws-department-section" data-department-section="Other"><h3>Other</h3>' + byDepartment.Other.map(homeRow).join('') + '</section>';
      return html || '<p class="ws-muted">No assigned duties are listed.</p>';
    }
    function personalActionLinks(service, name) {
      var entries = dutyEntries(service, { personal:true, name:name }), links = [];
      entries.forEach(function (entry) {
        var requestKey = serviceId(service) + ':' + entry.duty;
        var pending = member.findPendingRequest && member.findPendingRequest(state().requests || [], serviceId(service), entry.duty, name);
        if (pending) links.push('<span class="ws-muted">' + esc(entry.duty) + ': Pending</span>');
        else links.push('<button type="button" class="ws-link" data-act="member-request-open" data-svc="' + esc(serviceId(service)) + '" data-duty="' + esc(entry.duty) + '">Request change for ' + esc(entry.duty) + '</button>');
        if (local.requestKey === requestKey) {
          links.push('<div class="ws-request-form"><label for="member-request-note-' + esc(serviceId(service)) + '-' + esc(entry.duty) + '">Reason for change</label><textarea id="member-request-note-' + esc(serviceId(service)) + '-' + esc(entry.duty) + '" data-chg="member-request-note" placeholder="Why do you need a change?">' + esc(local.requestNote) + '</textarea><button type="button" class="ws-button" data-act="member-request-submit" data-svc="' + esc(serviceId(service)) + '" data-duty="' + esc(entry.duty) + '">Submit</button><button type="button" class="ws-link" data-act="member-request-cancel">Cancel</button></div>');
        }
      });
      return links.join('');
    }
    function serviceActions(service, name, includeRequests) {
      var entries = dutyEntries(service, { personal:true, name:name }), html = '';
      if (!entries.length) return '';
      var presider = entries.some(function (entry) { return entry.duty === 'Presider'; });
      if (presider && deps.feature && deps.feature('songPicker') !== false) {
        var summary = member.setlistSummary ? member.setlistSummary(typeof deps.getSetlists === 'function' ? deps.getSetlists() : {}, serviceId(service)) : null;
        html += '<button type="button" class="ws-link" data-act="member-open-presider" data-svc="' + esc(serviceId(service)) + '">' + (summary && summary.confirmed ? 'Review songs' : 'Plan songs') + '</button>';
      }
      if (includeRequests && deps.feature && deps.feature('changeRequests') !== false) html += personalActionLinks(service, name);
      return html ? '<div class="ws-service-action-row"><span>' + esc(timeText(service.time || service.time24)) + ' · ' + esc(serviceTitle(service)) + '</span><div class="ws-service-actions">' + html + '</div></div>' : '';
    }
    function serviceCard(service, open, only, summaryOnly) {
      var id = serviceId(service), title = serviceTitle(service);
      var body = summaryOnly ? '<p class="ws-muted">' + plural(dutyEntries(service).length, 'assigned duty') + '</p>' : '<div class="ws-service-groups">' + (service.choirSong ? '<p class="ws-muted">Choir: ' + esc(typeof service.choirSong === 'string' ? service.choirSong : (service.choirSong.title || service.choirSong.label || 'Assigned')) + '</p>' : '') + departmentGroups(service, only) + '</div>';
      return '<article class="ws-card ws-service-card ' + tone(service.date) + '" data-service-id="' + esc(id) + '"><button type="button" class="ws-service-head" data-act="member-service-toggle" data-service="' + esc(id) + '" aria-expanded="' + (open ? 'true' : 'false') + '"><span><strong>' + esc(title) + '</strong><small>' + esc(timeText(service.time || service.time24)) + '</small></span><span aria-hidden="true">' + (open ? '−' : '+') + '</span></button>' + (open ? '<div class="ws-service-body">' + body + (summaryOnly ? '' : serviceActions(service, ui().me, false)) + '</div>' : '') + '</article>';
    }
    function nextDutyCard() {
      var me = ui().me || '', next = null, nextEntries = [];
      if (me) {
        services().filter(function (service) { return service.date >= today(); }).some(function (service) {
          var entries = dutyEntries(service, { personal:true, name:me });
          if (!entries.length) return false;
          next = service; nextEntries = entries; return true;
        });
      }
      if (!me) return '<section class="ws-card ws-next-duty" data-next-duty><p class="ws-kicker">My next duty</p><p class="ws-muted">Choose your name above to see your next duty.</p></section>';
      if (!next) return '<section class="ws-card ws-next-duty" data-next-duty><p class="ws-kicker">My next duty</p><p class="ws-muted">No upcoming duty is assigned to you.</p></section>';
      return '<section class="ws-card ws-next-duty" data-next-duty><p class="ws-kicker">My next duty</p><h2>' + esc(next.service || next.serviceLabel || 'Service') + '</h2><p>' + esc(dateText(next.date)) + ' · ' + esc(timeText(next.time || next.time24)) + '</p><p>' + esc(nextEntries.map(function (entry) { return entry.duty; }).join(', ')) + '</p>' + serviceActions(next, me, false) + '</section>';
    }
    function homeUpcoming(list) {
      var upcoming = list.filter(function (service) { return service.date >= today(); }), dates = [];
      upcoming.forEach(function (service) { if (dates.indexOf(service.date) === -1) dates.push(service.date); });
      var html = '<section class="ws-schedule-section" data-schedule="upcoming"><div class="ws-section-heading"><div><p class="ws-kicker">Next on the calendar</p><h2>Upcoming schedule</h2></div><span class="ws-muted">' + upcoming.length + ' service' + (upcoming.length === 1 ? '' : 's') + '</span></div>';
      if (!dates.length) return html + '<div class="ws-card ws-empty">No upcoming services in ' + esc(monthTitle(currentMonth())) + '.</div></section>';
      var date = dates[0], day = upcoming.filter(function (service) { return service.date === date; });
      return html + '<section class="ws-date-card ws-upcoming-date ' + tone(date) + '" data-date-group="' + esc(date) + '"><h3 class="ws-date-heading">' + esc(dateText(date)) + '</h3>' + day.map(function (service) { return serviceCard(service, true, local.department === 'All' ? null : local.department, true); }).join('') + '</section></section>';
    }
    function homeWholeMonth(list) {
      var html = '<section class="ws-schedule-section ws-month-schedule" data-schedule="month" data-month-service-list><div class="ws-section-heading"><div><p class="ws-kicker">Selected month</p><h2>Whole month</h2></div><span class="ws-muted">' + esc(monthTitle(currentMonth())) + '</span></div>';
      if (!list.length) return html + '<div class="ws-card ws-empty">No services are listed for this month.</div></section>';
      var byDate = {};
      list.forEach(function (service) { (byDate[service.date] || (byDate[service.date] = [])).push(service); });
      Object.keys(byDate).sort().forEach(function (date) {
        var day = byDate[date], dateCutoff = day.every(servicePastCutoff), dateOpen = local.homeOpen[date] !== undefined ? local.homeOpen[date] : !dateCutoff;
        html += '<section class="ws-date-card ' + tone(date) + '" data-date-group="' + esc(date) + '"><button type="button" class="ws-date-title" data-act="member-date-toggle" data-date="' + esc(date) + '" aria-expanded="' + (dateOpen ? 'true' : 'false') + '"><span>' + esc(dateText(date)) + '</span><span aria-hidden="true">' + (dateOpen ? '−' : '+') + '</span></button>' + (dateOpen ? day.map(function (service) {
          var id = serviceId(service), open = local.homeOpen[id] !== undefined ? local.homeOpen[id] : !servicePastCutoff(service);
          return '<div data-month-service data-service-id="' + esc(id) + '">' + serviceCard(service, open, local.department === 'All' ? null : local.department, false) + '</div>';
        }).join('') : '') + '</section>';
      });
      return html + '</section>';
    }
    function home() {
      var key = currentMonth(), list = dayServices(key), selected = {};
      list.forEach(function (service) { selected[serviceId(service)] = true; });
      var html = '<div class="member-page" data-screen="member"><div class="ws-heading"><p class="ws-kicker">LV Zion</p><h1>Home</h1><p>See the services and the people serving each department.</p></div>' + renderCalendar('home', selected) + departmentButtons() + nextDutyCard() + homeUpcoming(list) + homeWholeMonth(list);
      return html + '</div>';
    }
    function memberTools() {
      var me = ui().me, html = '';
      if (!me) return '';
      var alerts = [];
      try { alerts = deps.storage && typeof deps.storage.json === 'function' ? (deps.storage.json('wds-alerts-' + me, []) || []) : []; } catch (ignore) { alerts = []; }
      if (alerts.length) html += '<section class="ws-card ws-alerts"><div class="ws-toolbar"><h2>Recent updates</h2><button type="button" class="ws-link" data-act="member-clear-alerts">Clear</button></div>' + alerts.slice(0,6).map(function (a) { return '<p><small>' + esc(a.t ? new Date(a.t).toLocaleDateString() : '') + '</small> ' + esc(a.txt || a.text || '') + '</p>'; }).join('') + '</section>';
      var notificationsOn = deps.storage && typeof deps.storage.get === 'function' && deps.storage.get('wds-notify', '0') === '1';
      html += '<div class="ws-actions ws-member-tools">' + (deps.feature && deps.feature('notifications') !== false ? '<button type="button" class="ws-button" data-act="member-notify-' + (notificationsOn ? 'off' : 'on') + '">' + (notificationsOn ? 'Notifications on' : 'Turn on notifications') + '</button>' : '') + (deps.feature && deps.feature('calendarExport') !== false ? '<button type="button" class="ws-button" data-act="member-calendar-subscribe">Add to calendar</button><button type="button" class="ws-button" data-act="member-calendar-copy">Copy calendar link</button>' : '') + '</div>';
      return html;
    }
    function dutyTable(entries, label) {
      return '<div class="ws-table-scroll"><table class="ws-duty-table"><caption class="sr-only">' + esc(label) + '</caption><thead><tr><th scope="col">Time</th><th scope="col">Worship session</th><th scope="col">Duty</th><th scope="col">Person</th></tr></thead><tbody>' + entries.map(function (entry) {
        var service = entry.service;
        return '<tr data-department-row data-duty="' + esc(entry.duty) + '"><td>' + esc(timeText(service.time || service.time24)) + '</td><td>' + esc(sessionTitle(service)) + '</td><td>' + esc(entry.duty) + '</td><td class="' + (entry.person === ui().me ? 'is-me' : '') + '">' + esc(entry.person) + (entry.person === ui().me ? ' (You)' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    }
    function fullTeam(day, me) {
      var entries = [];
      (day || []).forEach(function (service) { entries = entries.concat(dutyEntries(service, { excludeMe:true, name:me })); });
      if (!entries.length) return '<div class="ws-full-team" data-full-team><p class="ws-muted">No other assigned duties are listed for this date.</p></div>';
      return '<div class="ws-full-team" data-full-team><h3>Full team</h3>' + dutyTable(entries, 'Full team for ' + dateText(day[0].date)) + '</div>';
    }
    function myDutyDate(day, me) {
      var date = day[0].date, open = local.dutyOpen[date] === true, entries = [];
      day.forEach(function (service) { entries = entries.concat(dutyEntries(service, { personal:true, name:me })); });
      var labels = uniqueLabels(day, worshipTitle), heading = labels.join(' + ') || 'Worship';
      var html = '<section class="ws-card ws-date-card ws-personal-date ' + tone(date) + '" data-duty-date="' + esc(date) + '" data-date-group="' + esc(date) + '"><div class="ws-duty-date-head"><h2>' + esc(heading) + '</h2><time datetime="' + esc(date) + '">' + esc(dateText(date)) + '</time></div><div class="ws-duty-summary-row"><p>' + plural(day.length, 'service') + ', ' + plural(entries.length, 'duty') + '</p><button type="button" class="ws-link" data-act="member-full-team" data-date="' + esc(date) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' + (open ? 'Hide full team' : 'View full team') + '</button></div>' + dutyTable(entries, 'Your duties for ' + dateText(date)) + '<div class="ws-service-actions-list">' + day.map(function (service) { return serviceActions(service, me, true); }).join('') + '</div>' + (open ? fullTeam(day, me) : '') + '</section>';
      return html;
    }
    function myDuties() {
      var me = ui().me || '', assigned = services().filter(function (service) {
        return !me || dutyEntries(service, { personal:true, name:me }).length;
      });
      var selected = {};
      assigned.forEach(function (service) { selected[serviceId(service)] = true; });
      var html = '<div class="member-page" data-screen="member"><div class="ws-heading"><p class="ws-kicker">Your schedule</p><h1>My Duties</h1><p>One clear view of every service where you are assigned.</p></div>' + renderCalendar('duties', selected) + memberTools();
      if (!me) return html + '<div class="ws-card ws-empty">Choose your name in the header to see your duties.</div></div>';
      if (!assigned.length) return html + '<div class="ws-card ws-empty">You have no assigned duties.</div></div>';
      var byDate = {};
      assigned.forEach(function (service) { (byDate[service.date] || (byDate[service.date] = [])).push(service); });
      Object.keys(byDate).sort().forEach(function (date) { html += myDutyDate(byDate[date], me); });
      html += requests();
      return html + '</div>';
    }
    function requests() {
      var me = ui().me, reqs = member.requestsForMember ? member.requestsForMember(state().requests || [], me) : (state().requests || []).filter(function (request) { return request.name === me; });
      if (!reqs.length) return '';
      return '<section class="ws-card ws-requests"><h2>Your requests</h2>' + reqs.slice(0,6).map(function (request) { return '<div class="ws-request"><strong>' + esc(request.duty || 'Duty') + '</strong><span>' + esc(request.status || 'pending') + '</span>' + (request.note ? '<p>' + esc(request.note) + '</p>' : '') + '</div>'; }).join('') + '</section>';
    }
    function render() { return (ui().tab === 'my' || ui().screen === 'my' || ui().screen === 'duty') ? myDuties() : home(); }
    function refresh() { if (typeof deps.requestRender === 'function') deps.requestRender(); }
    function command(name, value) { var fn = deps.commands && deps.commands[name]; if (typeof fn === 'function') return fn(value); return undefined; }
    function handle(kind, token, element) {
      if (!token) return false;
      if (kind === 'chg' && token === 'member-name') { if (deps.commands && deps.commands.setMember) deps.commands.setMember(element.value); else if (ui()) ui().me = element.value; refresh(); return true; }
      if (kind === 'input' && token === 'member-request-note') { local.requestNote = element.value; return true; }
      if (kind === 'act') {
        if (token === 'member-calendar-prev' || token === 'member-calendar-next') { local.month = monthShift(currentMonth(), token.endsWith('prev') ? -1 : 1); local.jumpDate = null; refresh(); return true; }
        if (token === 'member-calendar-day') { local.month = String(element.dataset.date).slice(0,7); local.homeOpen[element.dataset.date] = true; local.dutyOpen[element.dataset.date] = true; local.jumpDate = element.dataset.date; refresh(); return true; }
        if (token === 'member-department') { local.department = element.dataset.department || 'All'; if (deps.commands && deps.commands.setDepartmentFilter) deps.commands.setDepartmentFilter(local.department); else if (deps.storage && deps.storage.set) deps.storage.set('wds-dept', local.department); refresh(); return true; }
        if (token === 'member-service-toggle') { var id = element.dataset.service; local.homeOpen[id] = !(local.homeOpen[id] === true); refresh(); return true; }
        if (token === 'member-date-toggle') { var date = element.dataset.date; local.homeOpen[date] = !(local.homeOpen[date] === true); refresh(); return true; }
        if (token === 'member-full-team') { var dutyDate = element.dataset.date; local.dutyOpen[dutyDate] = !(local.dutyOpen[dutyDate] === true); refresh(); return true; }
        if (token === 'member-clear-alerts') { command('clearAlerts'); refresh(); return true; }
        if (token === 'member-notify-on') { command('enableNotifications'); refresh(); return true; }
        if (token === 'member-notify-off') { command('disableNotifications'); refresh(); return true; }
        if (token === 'member-calendar-subscribe') { command('subscribeCalendar'); return true; }
        if (token === 'member-calendar-copy') { command('copyCalendarLink'); return true; }
        if (token === 'member-open-presider') { command('openPresider', element.dataset.svc); return true; }
        if (token === 'member-request-open') { local.requestKey = (element.dataset.svc || '') + ':' + (element.dataset.duty || ''); local.requestNote = ''; refresh(); return true; }
        if (token === 'member-request-cancel') { local.requestKey = null; local.requestNote = ''; command('clearMemberRequestDraft'); refresh(); return true; }
        if (token === 'member-request-submit') {
          var svcId = String(element.dataset.svc || ''), duty = String(element.dataset.duty || '');
          if (svcId && duty) command('submitRequest', { svcId: svcId, duty: duty, note: local.requestNote });
          local.requestKey = null; local.requestNote = ''; command('clearMemberRequestDraft'); refresh(); return true;
        }
      }
      return false;
    }
    function afterRender(rootElement) {
      if (!local.jumpDate || !rootElement || !rootElement.querySelector) return;
      var target = rootElement.querySelector('[data-date-group="' + local.jumpDate + '"]');
      if (!target) return;
      var date = local.jumpDate;
      local.jumpDate = null;
      var jump = function () { if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ block:'start', behavior:'auto' }); };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(jump); else jump();
      if (target.setAttribute) target.setAttribute('data-last-jump', date);
    }
    return { render: render, handle: handle, afterRender: afterRender, destroy: function () {} };
  }
})(typeof window !== 'undefined' ? window : globalThis);

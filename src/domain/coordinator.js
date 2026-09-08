'use strict';

/* Pure coordinator selectors. Dates, catalogs, current state, and the legacy
   schedule API are injected so planning never reaches into UI or persistence. */
(function expose(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.window) {
    const app = root.window.WorshipApp || (root.window.WorshipApp = {});
    const domain = app.domain || (app.domain = {});
    domain.coordinator = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCoordinatorDomain() {
  function dutyCategory(duty, categories) {
    const list = Array.isArray(categories) ? categories : [];
    return list.find(category => category.duties.indexOf(duty) !== -1) || list[0] || null;
  }

  function allDutiesOrder(categories) {
    return (Array.isArray(categories) ? categories : [])
      .reduce((out, category) => out.concat(category.duties), []);
  }

  function upcomingServices(services, today, serviceLabels) {
    const labels = Array.isArray(serviceLabels) ? serviceLabels : [];
    return (services || []).filter(service => service.date >= today).sort((a, b) =>
      a.date.localeCompare(b.date) || labels.indexOf(a.service) - labels.indexOf(b.service));
  }

  function shiftISO(today, days) {
    const date = new Date(today + 'T12:00:00');
    date.setDate(date.getDate() + days);
    const pad = value => (value < 10 ? '0' : '') + value;
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function rosterForDuty(service, duty, departments, members, categories) {
    const category = dutyCategory(duty, categories);
    const departmentMap = departments || {};
    const roster = category && departmentMap[category.name] || [];
    return roster.length ? roster : (members || []);
  }

  /* The assignment editor keeps its current value visible even if a roster
     was edited and no longer contains that member. */
  function eligibleDutyRoster(service, duty, departments, members, categories) {
    const options = rosterForDuty(service, duty, departments, members, categories).slice();
    const current = service && service.assignments && service.assignments[duty];
    if (current && options.indexOf(current) === -1) options.unshift(current);
    return options;
  }

  function conflictsWithSuggestions(services, options) {
    const config = options || {};
    const categories = config.categories || [];
    const stats = config.stats || {};
    const departments = config.departments || {};
    const members = config.members || [];
    const schedule = config.schedule;
    if (!schedule || typeof schedule.activeConflicts !== 'function') {
      throw new TypeError('conflictsWithSuggestions requires schedule.activeConflicts');
    }
    if (typeof schedule.suggestSubs !== 'function') {
      throw new TypeError('conflictsWithSuggestions requires schedule.suggestSubs');
    }
    const rows = [];
    (services || []).forEach(service => {
      schedule.activeConflicts(service, categories).forEach(conflict => {
        rows.push({
          service,
          conflict,
          suggestions: conflict.duties.map(duty => ({
            duty,
            members: schedule.suggestSubs(
              service, duty, conflict.name, stats, departments, members, categories
            )
          }))
        });
      });
    });
    return rows;
  }

  function expectedDutyCounts(services) {
    const filled = {};
    const count = {};
    (services || []).forEach(service => {
      const assigned = Object.keys(service.assignments || {}).filter(duty => service.assignments[duty]);
      if (!assigned.length) return;
      const key = (service.worship || '') + '|' + (service.service || '');
      count[key] = (count[key] || 0) + 1;
      const bucket = filled[key] || (filled[key] = {});
      assigned.forEach(duty => { bucket[duty] = (bucket[duty] || 0) + 1; });
    });
    return { filled, count };
  }

  function expectedDuties(service, services, categories) {
    const counts = expectedDutyCounts(services);
    const key = (service.worship || '') + '|' + (service.service || '');
    const filled = counts.filled[key] || {};
    const planned = counts.count[key] || 0;
    return planned ? allDutiesOrder(categories).filter(duty => (filled[duty] || 0) * 2 >= planned) : [];
  }

  function gapRows(services, today, horizon, categories, serviceLabels) {
    const end = horizon || shiftISO(today, 28);
    const expected = expectedDutyCounts(services);
    const order = allDutiesOrder(categories);
    const rows = [];
    upcomingServices(services, today, serviceLabels).filter(service => service.date <= end)
      .forEach(service => {
        const assignments = service.assignments || {};
        if (!Object.keys(assignments).some(duty => assignments[duty])) return;
        const key = (service.worship || '') + '|' + (service.service || '');
        const filled = expected.filled[key] || {};
        const planned = expected.count[key] || 0;
        const duties = planned ? order.filter(duty => (filled[duty] || 0) * 2 >= planned) : [];
        const missing = duties.filter(duty => !assignments[duty]);
        if (missing.length) rows.push({ service, missing });
      });
    return rows;
  }

  function workloadRows(stats, members) {
    const data = stats || {};
    return Object.keys(data)
      .map(member => ({ m: member, s: data[member] }))
      .filter(row => row.s.total > 0 || (members || []).indexOf(row.m) !== -1)
      .sort((a, b) =>
        (b.s.past8 + b.s.upcoming) - (a.s.past8 + a.s.upcoming) || a.m.localeCompare(b.m));
  }

  function splitRequests(requests) {
    const all = (requests || []).slice().sort((a, b) => b.createdAt - a.createdAt);
    return {
      all,
      pending: all.filter(request => request.status === 'pending'),
      resolved: all.filter(request => request.status !== 'pending')
    };
  }

  return {
    upcomingServices,
    orderUpcoming: upcomingServices,
    eligibleDutyRoster,
    eligibleRoster: eligibleDutyRoster,
    conflictsWithSuggestions,
    planningConflicts: conflictsWithSuggestions,
    expectedDutyCounts,
    expectedDuties,
    expectedDutiesFor: expectedDuties,
    gapRows,
    findGaps: gapRows,
    workloadRows,
    orderWorkload: workloadRows,
    splitRequests
  };
});

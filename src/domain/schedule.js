'use strict';

/* Pure schedule rules. Every input that can vary at runtime is supplied by
   the caller, which keeps this module usable in browser-free tests. */
(function expose(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.window) {
    const app = root.window.WorshipApp || (root.window.WorshipApp = {});
    const domain = app.domain || (app.domain = {});
    domain.schedule = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createScheduleDomain() {
  function slugify(value) {
    return String(value == null ? '' : value)
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function serviceId(service) {
    return service.date + '_' + String(service.service || '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function requestId(serviceIdValue, duty, createdAt) {
    return serviceIdValue + '_' + slugify(duty) + '_' + createdAt;
  }

  function dutyCategory(duty, categories) {
    const list = Array.isArray(categories) ? categories : [];
    return list.find(category => category.duties.indexOf(duty) !== -1) || list[0] || null;
  }

  function allDutiesOrder(categories) {
    return (Array.isArray(categories) ? categories : [])
      .reduce((out, category) => out.concat(category.duties), []);
  }

  function sortDuties(duties, categories) {
    const order = allDutiesOrder(categories);
    return (duties || []).slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }

  function sameDuties(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((duty, index) => duty === b[index]);
  }

  function isPrayerDuty(duty, categories) {
    const category = dutyCategory(duty, categories);
    return !!category && category.name === 'Worship' && /prayer/i.test(duty);
  }

  function isUsherDuty(duty, categories) {
    const category = dutyCategory(duty, categories);
    return !!category && (category.name === 'Usher Sisters' || category.name === 'Usher Brothers');
  }

  function hasNonExemptPair(duties, categories) {
    const list = duties || [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const prayerUsherPair =
          (isPrayerDuty(list[i], categories) && isUsherDuty(list[j], categories)) ||
          (isUsherDuty(list[i], categories) && isPrayerDuty(list[j], categories));
        if (!prayerUsherPair) return true;
      }
    }
    return false;
  }

  function conflictsFor(service, categories) {
    const byMember = {};
    const assignments = service && service.assignments || {};
    Object.keys(assignments).forEach(duty => {
      const name = assignments[duty];
      if (!name) return;
      (byMember[name] || (byMember[name] = [])).push(duty);
    });
    return Object.keys(byMember)
      .filter(name => byMember[name].length >= 2 && hasNonExemptPair(byMember[name], categories))
      .map(name => ({ name, duties: sortDuties(byMember[name], categories) }));
  }

  function activeConflicts(service, categories) {
    const ok = service && service.conflictOk || {};
    return conflictsFor(service, categories)
      .filter(conflict => !sameDuties(ok[conflict.name], conflict.duties));
  }

  function sortedServices(services) {
    return (services || []).slice().sort((a, b) =>
      (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  }

  function upcomingServices(services, today) {
    return sortedServices(services).filter(service => service.date >= today);
  }

  function pastServices(services, today) {
    return sortedServices(services).filter(service => service.date < today);
  }

  function dutiesFor(member, services, categories) {
    const out = [];
    (services || []).forEach(service => {
      (categories || []).forEach(category => category.duties.forEach(duty => {
        if ((service.assignments || {})[duty] === member) out.push({ service, duty, cat: category });
      }));
    });
    return out;
  }

  function shiftISO(today, days) {
    const date = new Date(today + 'T12:00:00');
    date.setDate(date.getDate() + days);
    const pad = value => (value < 10 ? '0' : '') + value;
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function workloadStats(services, members, today, categories) {
    const w4 = shiftISO(today, -28);
    const w8 = shiftISO(today, -56);
    const stats = {};
    const ensure = member => stats[member] || (stats[member] = {
      past4: 0, past8: 0, upcoming: 0, total: 0, last: '', next: ''
    });
    (members || []).forEach(ensure);
    (services || []).forEach(service => {
      Object.keys(service.assignments || {}).forEach(duty => {
        const member = service.assignments[duty];
        if (!member) return;
        const result = ensure(member);
        result.total++;
        if (service.date < today) {
          if (service.date >= w8) result.past8++;
          if (service.date >= w4) result.past4++;
          if (service.date > result.last) result.last = service.date;
        } else {
          result.upcoming++;
          if (!result.next || service.date < result.next) result.next = service.date;
        }
      });
    });
    return stats;
  }

  function suggestSubs(service, duty, excludeName, stats, departments, members, categories) {
    const category = dutyCategory(duty, categories);
    const departmentMap = departments || {};
    let roster = category && departmentMap[category.name] || [];
    if (!roster.length) roster = members || [];
    const busy = {};
    Object.keys(service.assignments || {}).forEach(key => {
      if (service.assignments[key]) busy[service.assignments[key]] = true;
    });
    return roster
      .filter(member => member !== excludeName && !busy[member])
      .map(member => ({ member, stats: (stats || {})[member] || { past4: 0, upcoming: 0, last: '' } }))
      .sort((a, b) =>
        (a.stats.upcoming + a.stats.past4) - (b.stats.upcoming + b.stats.past4) ||
        (a.stats.last === b.stats.last ? 0 : (a.stats.last < b.stats.last ? -1 : 1)))
      .slice(0, 3)
      .map(item => item.member);
  }

  function cloneService(service) {
    const copy = Object.assign({}, service);
    copy.assignments = Object.assign({}, service.assignments || {});
    if (service.conflictOk) {
      copy.conflictOk = Object.keys(service.conflictOk).reduce((out, name) => {
        out[name] = Array.isArray(service.conflictOk[name]) ? service.conflictOk[name].slice() : service.conflictOk[name];
        return out;
      }, {});
    }
    return copy;
  }

  function cloneDepartments(departments) {
    return Object.keys(departments || {}).reduce((out, category) => {
      out[category] = (departments[category] || []).slice();
      return out;
    }, {});
  }

  /* Merge only duties represented by the sheet. The returned arrays are new,
     and changed service references are provided for precise persistence. */
  function mergeSheetServices(input) {
    const source = input || {};
    const categories = source.categories || [];
    const nextServices = (source.currentServices || []).map(cloneService);
    const nextDepartments = cloneDepartments(source.departments);
    const byId = {};
    nextServices.forEach(service => { byId[serviceId(service)] = service; });
    const addedServices = [];
    const updatedServices = [];
    let departmentsChanged = false;
    const addToDepartment = (duty, member) => {
      if (!source.departmentsLoaded || !member) return;
      const category = dutyCategory(duty, categories);
      if (!category) return;
      const roster = nextDepartments[category.name] || (nextDepartments[category.name] = []);
      if (roster.indexOf(member) === -1) {
        roster.push(member);
        roster.sort();
        departmentsChanged = true;
      }
    };

    (source.sheetServices || []).forEach(sheetService => {
      const id = serviceId(sheetService);
      const existing = byId[id];
      if (!existing) {
        const fresh = {
          date: sheetService.date,
          time: sheetService.time || '',
          service: sheetService.service,
          worship: sheetService.worship || '',
          choirSong: sheetService.choirSong || '',
          assignments: Object.assign({}, sheetService.assignments || {})
        };
        nextServices.push(fresh);
        byId[id] = fresh;
        Object.keys(fresh.assignments).forEach(duty => addToDepartment(duty, fresh.assignments[duty]));
        addedServices.push(fresh);
        return;
      }

      let changed = false;
      if (sheetService.time && existing.time !== sheetService.time) {
        existing.time = sheetService.time;
        changed = true;
      }
      if (sheetService.worship && existing.worship !== sheetService.worship) {
        existing.worship = sheetService.worship;
        changed = true;
      }
      if (sheetService.choirSong && existing.choirSong !== sheetService.choirSong) {
        existing.choirSong = sheetService.choirSong;
        changed = true;
      }
      Object.keys(sheetService.assignments || {}).forEach(duty => {
        addToDepartment(duty, sheetService.assignments[duty]);
        if (existing.assignments[duty] !== sheetService.assignments[duty]) {
          existing.assignments[duty] = sheetService.assignments[duty];
          changed = true;
        }
      });
      if (changed) updatedServices.push(existing);
    });

    return {
      services: nextServices,
      departments: nextDepartments,
      added: addedServices.length,
      updated: updatedServices.length,
      addedServices,
      updatedServices,
      departmentsChanged
    };
  }

  /* Rewrite member variants without persistence or global state. */
  function applyNameMap(state, map) {
    const source = state || {};
    const nameMap = map || {};
    const canon = name => nameMap[name] || name;
    const members = Array.isArray(source.members) ? source.members.slice() : [];
    const membersMerged = members.filter(member => nameMap[member]).length;
    const nextMembers = membersMerged
      ? Array.from(new Set(members.map(canon))).sort()
      : members;
    const touchedServices = [];
    const nextServices = (source.services || []).map(service => {
      const next = cloneService(service);
      let touched = false;
      Object.keys(next.assignments).forEach(duty => {
        const oldName = next.assignments[duty];
        const newName = canon(oldName);
        if (newName !== oldName) {
          next.assignments[duty] = newName;
          touched = true;
        }
      });
      const conflictOk = next.conflictOk || {};
      const merged = {};
      Object.keys(conflictOk).forEach(name => {
        const newName = canon(name);
        if (newName !== name) touched = true;
        const duties = merged[newName] ? merged[newName].concat(conflictOk[name]) : conflictOk[name];
        const seen = {};
        merged[newName] = Array.isArray(duties) ? duties.filter(duty =>
          seen[duty] ? false : (seen[duty] = true)) : duties;
      });
      if (touched) {
        next.conflictOk = merged;
        touchedServices.push(next);
      }
      return next;
    });
    const nextDepartments = cloneDepartments(source.departments);
    let departmentsChanged = false;
    Object.keys(nextDepartments).forEach(category => {
      const roster = nextDepartments[category];
      const merged = Array.from(new Set(roster.map(canon))).sort();
      if (merged.length !== roster.length || merged.some((member, index) => member !== roster[index])) {
        nextDepartments[category] = merged;
        departmentsChanged = true;
      }
    });
    return {
      state: Object.assign({}, source, {
        members: nextMembers,
        services: nextServices,
        departments: nextDepartments
      }),
      membersChanged: membersMerged > 0,
      membersMerged,
      touchedServices,
      departmentsChanged
    };
  }

  return {
    slugify,
    serviceId,
    requestId,
    dutyCategory,
    allDutiesOrder,
    sortDuties,
    sameDuties,
    conflictsFor,
    activeConflicts,
    sortedServices,
    upcomingServices,
    pastServices,
    dutiesFor,
    workloadStats,
    suggestSubs,
    mergeSheetServices,
    applyNameMap
  };
});

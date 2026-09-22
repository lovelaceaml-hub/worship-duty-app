import {toISO, todayISO, dutyCategory} from './format.js';
// state/departmentProfiles/departmentProfileAssignable are not imported from
// app.js: see core/constants.js's setConstantsStateRef comment for why a real
// import back to app.js would break top-level evaluation order here. app.js
// pushes the live references in once, through this setter.
let state, departmentProfiles, departmentProfileAssignable;
export function setPlanningRefs(stateRef, departmentProfilesRef, departmentProfileAssignableRef) {
  state = stateRef;
  departmentProfiles = departmentProfilesRef;
  departmentProfileAssignable = departmentProfileAssignableRef;
}

/* ================= coordinator planning (workload + subs) ================= */

export function weeksAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return toISO(d);
}

/* Per-member duty counts across the whole schedule: rolling 4/8-week windows,
   upcoming load, year total, last served and next duty dates. */
export function workloadStats() {
  const t = todayISO(), w4 = weeksAgoISO(4), w8 = weeksAgoISO(8);
  const stats = {};
  const ensure = m => stats[m] || (stats[m] = { past4: 0, past8: 0, upcoming: 0, total: 0, last: '', next: '' });
  (state.members || []).forEach(ensure);
  (state.services || []).forEach(svc => {
    Object.keys(svc.assignments || {}).forEach(duty => {
      const m = svc.assignments[duty];
      if (!m) return;
      const s = ensure(m);
      s.total++;
      if (svc.date < t) {
        if (svc.date >= w8) s.past8++;
        if (svc.date >= w4) s.past4++;
        if (svc.date > s.last) s.last = svc.date;
      } else {
        s.upcoming++;
        if (!s.next || svc.date < s.next) s.next = svc.date;
      }
    });
  });
  return stats;
}

/* Best substitutes for a duty in a service: same department, not already
   serving that service, lightest recent+upcoming load first, then longest
   since last served. */
export function suggestSubs(svc, duty, excludeName, stats) {
  const cat = dutyCategory(duty);
  const roster = departmentProfiles(cat.name).filter(profile => departmentProfileAssignable(profile, svc, duty));
  const busy = {};
  Object.keys(svc.assignments || {}).forEach(d => { if (svc.assignments[d]) busy[svc.assignments[d]] = true; });
  return roster
    .filter(profile => profile.memberName !== excludeName && !busy[profile.memberName])
    .map(profile => ({ profile, s: stats[profile.memberName] || { past4: 0, upcoming: 0, last: '' } }))
    .sort((a, b) =>
      (a.s.upcoming + a.s.past4) - (b.s.upcoming + b.s.past4) ||
      (a.s.last === b.s.last ? 0 : (a.s.last < b.s.last ? -1 : 1)))
    .slice(0, 3)
    .map(x => x.profile);
}


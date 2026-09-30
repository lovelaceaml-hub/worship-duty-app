/* Fill: when a leader asks, a member for each empty duty. Only members who
   can take the duty then (canTake: active, schedulable, eligible, available)
   and are not already serving in that service. Whoever has served least goes
   first: duties in the last 8 weeks plus upcoming ones plus what this fill
   has given them; then whoever served longest ago; then by name. `duties` is
   a list, or a function giving each service its own (the duties it usually
   has). Nothing is saved here; the leader sees the proposals first. */
import { canTake } from './availability.js';
import { serviceId, byStart } from './services.js';

export function fill(services, duties, rosterFor, stats) {
  const given = {};
  const load = name => { const s = stats[name] || {}; return (s.past8 || 0) + (s.upcoming || 0) + (given[name] || 0); };
  const last = name => (stats[name] || {}).last || '';
  const proposals = [], unfilled = [];
  services.slice().sort(byStart).forEach(service => {
    const assignments = Object.assign({}, service.assignments);
    (typeof duties === 'function' ? duties(service) : duties).forEach(duty => {
      if (assignments[duty]) return;
      const serving = new Set(Object.values(assignments).filter(Boolean));
      const choices = rosterFor(duty).filter(profile => !serving.has(profile.memberName) && canTake(profile, service, duty));
      if (!choices.length) { unfilled.push({ serviceId: serviceId(service), duty }); return; }
      choices.sort((a, b) => load(a.memberName) - load(b.memberName) ||
        last(a.memberName).localeCompare(last(b.memberName)) || a.memberName.localeCompare(b.memberName));
      const pick = choices[0];
      assignments[duty] = pick.memberName;
      given[pick.memberName] = (given[pick.memberName] || 0) + 1;
      proposals.push({ serviceId: serviceId(service), duty, memberUid: pick.memberUid, memberName: pick.memberName });
    });
  });
  return { proposals, unfilled };
}

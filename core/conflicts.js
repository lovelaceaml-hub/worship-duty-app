import {CATEGORIES, feat} from './constants.js';
import {dutyCategory} from './format.js';

/* ================= double-duty conflicts ================= */

export const ALL_DUTIES_ORDER = CATEGORIES.reduce((out, cat) => out.concat(cat.duties), []);

export function sortDuties(duties) {
  return duties.slice().sort((a, b) => ALL_DUTIES_ORDER.indexOf(a) - ALL_DUTIES_ORDER.indexOf(b));
}
export function sameDuties(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((d, i) => d === b[i]);
}
export function isPrayerDuty(duty) {
  return dutyCategory(duty).name === 'Worship' && /prayer/i.test(duty);
}
export function isUsherDuty(duty) {
  const category = dutyCategory(duty).name;
  return category === 'Usher Sisters' || category === 'Usher Brothers';
}
/* Prayer + usher is an intentional pairing. Other duplicate pairs remain
   warnings: two usher duties, two prayer duties, or either with another role. */
export function hasNonExemptPair(duties) {
  for (let i = 0; i < duties.length; i++) {
    for (let j = i + 1; j < duties.length; j++) {
      const prayerUsherPair =
        (isPrayerDuty(duties[i]) && isUsherDuty(duties[j])) ||
        (isUsherDuty(duties[i]) && isPrayerDuty(duties[j]));
      if (!prayerUsherPair) return true;
    }
  }
  return false;
}
/* Every member appearing in 2+ duties of this service, with their duty list (stable order).
   A single prayer + usher pairing is intentionally omitted from the conflicts. */
export function conflictsFor(svc) {
  const byMember = {};
  const assignments = svc.assignments || {};
  Object.keys(assignments).forEach(duty => {
    const name = assignments[duty];
    if (!name) return;
    (byMember[name] || (byMember[name] = [])).push(duty);
  });
  return Object.keys(byMember)
    .filter(name => byMember[name].length >= 2 && hasNonExemptPair(byMember[name]))
    .map(name => ({ name, duties: sortDuties(byMember[name]) }));
}
/* conflictsFor minus ones already acknowledged (conflictOk) with a matching duty list */
export function activeConflicts(svc) {
  const ok = svc.conflictOk || {};
  return conflictsFor(svc).filter(c => !sameDuties(ok[c.name], c.duties));
}

/* Small inline badge shown next to a name that holds 2+ duties in this service.
   Red = needs review; amber = an editor marked it OK. */
export function conflictBadge(svc, member) {
  if (!feat('conflictWarnings') || !member) return '';
  if (activeConflicts(svc).some(c => c.name === member)) {
    return '<span class="warn-badge" title="Has 2+ duties this service">!</span>';
  }
  const ok = svc.conflictOk || {};
  if (conflictsFor(svc).some(c => c.name === member && sameDuties(ok[c.name], c.duties))) {
    return '<span class="warn-badge ok" title="Double duty marked OK by an editor">!</span>';
  }
  return '';
}


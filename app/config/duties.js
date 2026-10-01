/* Departments and their duties, in display order. permissions.js holds the
   same department-to-duty map for the server; tests/unit/config.test.mjs
   keeps the two identical. */
export const DEPARTMENTS = [
  { name: 'Worship', color: '#4338ca', duties: ['Presider', 'Sermon', 'Prayer of Thanks', 'Closing Prayer'] },
  { name: 'Usher Sisters', color: '#be185d', duties: ['Usher Door', 'Usher Front', 'Usher Back'] },
  { name: 'Usher Brothers', color: '#0369a1', duties: ['Usher #1', 'Usher #2', 'Lobby Security'] },
  { name: 'Lobby', color: '#b45309', duties: ['Lobby Desk #1', 'Lobby Desk #2'] },
  { name: 'Translation', color: '#047857', duties: ['Translation #1', 'Translation #2'] },
  { name: 'Media', color: '#6d28d9', duties: ['Media Booth #1', 'Media Booth #2'] },
  { name: 'Parking Lot', color: '#3f6212', duties: ['Parking #1', 'Parking #2', 'Parking #3', 'Parking #4', 'Parking #5'] },
  { name: 'Offering', color: '#a21caf', duties: ['Offering #1', 'Offering #2', 'Offering #3', 'Offering #4', 'Offering #5', 'Offering #6'] }
];

export const ALL_DUTIES = DEPARTMENTS.flatMap(department => department.duties);

/* Service labels in the order a day runs, and the default start time used
   when a service has no time of its own. */
export const SERVICE_LABELS = ['Early Morning', 'Morning', 'Afternoon', 'Evening', 'Commemoration'];
/* Usual start times since 2026-09-12 (the Feast of Trumpets). Each service in
   the schedule carries its own time; these fill in when one is missing. */
export const DEFAULT_TIMES = { 'Early Morning': '05:00', Morning: '10:00', Afternoon: '14:30', Evening: '19:30' };

export const WORSHIP_TYPES = ['Sabbath Day', 'Third Day', 'Prayer Week', 'Preaching Week', 'Ascension Day', 'Pentecost', 'Heavenly Parent\'s Day'];

/* Names shown for duties whose stored name (the Sheet column, the database
   key) is older. functions/names.js holds the same map for alerts and the
   calendar feed; tests/unit/basics.test.mjs keeps the two identical. */
export const DUTY_NAMES = { Sermon: 'Opening Prayer', 'Prayer of Thanks': 'Thanks Prayer' };

export function dutyName(duty) {
  return DUTY_NAMES[duty] || duty;
}

export function departmentOf(duty) {
  return DEPARTMENTS.find(department => department.duties.includes(duty)) || null;
}

export function departmentNamed(name) {
  return DEPARTMENTS.find(department => department.name === name) || null;
}

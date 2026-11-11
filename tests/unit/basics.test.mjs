/* Names, dates, markup escaping, and the department lists that must match
   between the browser and the server. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { displayName, canonicalName, byTitle, initials, BUILT_IN_NAME_MAP } from '../../app/lib/names.js';
import { clockTime, dayBadge, addMonths, pacificNow, daysSince, daysUntil, relativeDay, longDate, shortDate, monthName } from '../../app/lib/dates.js';
import { html, raw, esc } from '../../app/html.js';
import { DEPARTMENTS, DEFAULT_TIMES, DUTY_DEFAULTS, DUTY_NAMES, dutyName } from '../../app/config/duties.js';
import { FEATURES, featureOn } from '../../app/config/features.js';

const require = createRequire(import.meta.url);

test('names show as title and first name, with a last initial only when two members share it', () => {
  const members = ['S. Monica Castro', 'S. Monica Salinas', 'B. Adam Hill'];
  assert.equal(displayName('S. Monica Castro', members), 'S. Monica C.');
  assert.equal(displayName('B. Adam Hill', members), 'B. Adam');
  assert.equal(displayName('BJason'), 'B. Jason');
  assert.equal(displayName('Bridgette'), 'Bridgette', 'a name with no title is not split');
  assert.equal(displayName('M.Chad'), 'M. Chad');
  assert.equal(canonicalName('B. Anthony L', {}), 'B. Anthony');
  assert.equal(canonicalName('B. Old', { 'B. Old': 'B. New' }), 'B. New');
  assert.equal(initials('S. Monica C.'), 'SM');
});

test('two people who share a title, first name and last initial show their whole last name', () => {
  assert.deepEqual(['B. Adam Hill', 'B. Adam Hart'].map(name => displayName(name, ['B. Adam Hill', 'B. Adam Hart'])), ['B. Adam Hill', 'B. Adam Hart']);
  assert.deepEqual(['S. Monica Castro', 'S. Monica Cruz', 'S. Monica Salinas'].map(name => displayName(name, ['S. Monica Castro', 'S. Monica Cruz', 'S. Monica Salinas'])),
    ['S. Monica Castro', 'S. Monica Cruz', 'S. Monica S.']);
  // Someone who holds a duty but is not on the member list never looks like the member who is.
  assert.equal(displayName('S. Monica Cruz', ['S. Monica Castro']), 'S. Monica Cruz');
  assert.equal(displayName('B. Adam Hart', ['B. Adam Hill', 'S. Leah']), 'B. Adam Hart');
  assert.equal(displayName('S. Monica', ['S. Monica', 'S. Monica Castro']), 'S. Monica', 'no last name to add');
  const members = ['S. Monica Castro', 'S. Monica Salinas'];
  assert.equal(displayName('S. Monica Castro', members), displayName('S. Monica Castro', members), 'the same answer from the kept index');
  assert.equal(displayName('  S.  Monica   Castro ', members), 'S. Monica C.');
});

test('stored names follow the server: app/nameMap, else the built-in spelling, until the name stops changing', () => {
  assert.equal(canonicalName('B. Anthony L', {}), 'B. Anthony');
  assert.equal(canonicalName('B. Gio', { 'B. Giomar': 'B. Giomar R' }), 'B. Giomar R', 'a built-in spelling of a renamed member');
  assert.equal(canonicalName('B. Gio', { 'B. Gio': 'B. Gio Smith' }), 'B. Gio Smith', 'the name map comes before the built-in list');
  assert.equal(canonicalName('B. One', { 'B. One': 'B. Two', 'B. Two': 'B. Three' }), 'B. Three', 'renamed twice');
  assert.equal(canonicalName('B. One', { 'B. One': 'B. Two', 'B. Two': 'B. One' }), 'B. Two', 'a loop stops at the last new name');
  const salazar = { 'S. Monica S': 'S. Monica Salazar' };
  assert.equal(canonicalName('S. Monica S', salazar), 'S. Monica Salazar', 'a rename to a built-in spelling holds');
  assert.equal(canonicalName('S. Monica Salazar', salazar), 'S. Monica Salazar', 'and is not changed back');
  assert.equal(canonicalName('  S.  Leah ', {}), 'S. Leah');
  assert.equal(canonicalName('constructor', {}), 'constructor');
  assert.equal(canonicalName(null, null), '');
});

// The server's canonicalName arrives with the server package's changes.
const server = require('../../functions/names.js');
test('the app and the server give every stored name the same spelling', { skip: !server.canonicalName && 'functions/names.js has no canonicalName yet' }, () => {
  const maps = [
    {},
    { 'S. Monica S': 'S. Monica Salinas' },
    { 'S. Monica S': 'S. Monica Salazar' },
    { 'B. Giomar': 'B. Giomar R', 'M. Chloe': 'M. Chloe Park' },
    { 'B. Gio': 'B. Gio Smith', 'B. One': 'B. Two', 'B. Two': 'B. Three' }
  ];
  const names = Object.keys(BUILT_IN_NAME_MAP).concat(['S. Monica S', 'B. Giomar', 'B. One', 'S. Leah', ' E.  Simon ', 'Bridgette', '']);
  for (const nameMap of maps) {
    for (const name of names) assert.equal(canonicalName(name, nameMap), server.canonicalName(name, nameMap), JSON.stringify([name, nameMap]));
  }
});

test('member lists run Pastor, Elder, Missionary, Deacon, then Brothers and Sisters by name', () => {
  assert.deepEqual(['S. Hannah', 'B. Adam', 'D. Miriam', 'E. Joseph', 'M. Ruth', 'P. Paul'].sort(byTitle),
    ['P. Paul', 'E. Joseph', 'M. Ruth', 'D. Miriam', 'B. Adam', 'S. Hannah']);
});

test('dates and times read the way the app shows them', () => {
  assert.equal(clockTime('09:00'), '9:00 AM');
  assert.equal(clockTime('20:30'), '8:30 PM');
  assert.equal(clockTime('12:05'), '12:05 PM');
  assert.equal(clockTime(''), '');
  assert.equal(dayBadge('2026-09-14', '2026-09-14'), 'Today');
  assert.equal(dayBadge('2026-09-15', '2026-09-14'), 'Tomorrow');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(pacificNow(new Date('2026-09-15T02:29:00Z')).today, '2026-09-14');
  assert.equal(longDate('2026-07-01'), 'Wednesday, July 1');
  assert.equal(shortDate('2026-11-01'), 'Sun, Nov 1');
  assert.equal(monthName('2027-03'), 'March 2027');
  assert.equal(longDate(''), 'Invalid Date', 'a row without a date does not stop the screen');
});

test('the Pacific clock across the daylight saving changes and midnight', () => {
  const wall = text => Date.parse(text + ':00Z');
  // 2026-11-01: 01:59 daylight time, then the clock falls back to 01:00.
  assert.deepEqual(pacificNow(new Date('2026-11-01T08:59:00Z')), { today: '2026-11-01', wall: wall('2026-11-01T01:59') });
  assert.deepEqual(pacificNow(new Date('2026-11-01T09:00:00Z')), { today: '2026-11-01', wall: wall('2026-11-01T01:00') });
  // 2027-03-14: 01:59 standard time, then 03:00 daylight time.
  assert.deepEqual(pacificNow(new Date('2027-03-14T09:59:00Z')), { today: '2027-03-14', wall: wall('2027-03-14T01:59') });
  assert.deepEqual(pacificNow(new Date('2027-03-14T10:00:00Z')), { today: '2027-03-14', wall: wall('2027-03-14T03:00') });
  assert.equal(pacificNow(new Date('2026-07-08T06:59:00Z')).today, '2026-07-07');
  assert.equal(pacificNow(new Date('2026-07-08T07:00:00Z')).today, '2026-07-08');
  assert.equal(pacificNow(new Date('2026-07-08T07:00:59Z')).wall, wall('2026-07-08T00:00'), 'seconds do not count');
});

test('days since and until, as song history and the planner say them', () => {
  const today = '2026-07-07';
  assert.deepEqual([0, 1, 6, 7, 29, 30].map(days => relativeDay(addDaysTo(today, -days), today)),
    ['today', 'yesterday', '6 days ago', '1 week ago', '4 weeks ago', '1 month ago']);
  assert.equal(relativeDay(null, today), 'never');
  assert.equal(relativeDay('2026-07-10', today), 'today', 'a future date is not "ago"');
  assert.equal(daysSince('2026-07-04', today), 3);
  assert.equal(daysUntil('2026-07-10', today), 3);
  assert.equal(clockTime('9:00'), '9:00 AM');
});

function addDaysTo(iso, days) {
  const date = new Date(iso + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test('html`` escapes every value unless it is markup', () => {
  const name = '<img src=x onerror=alert(1)>';
  assert.equal(String(html`<p title="${name}">${name}</p>`), '<p title="' + esc(name) + '">' + esc(name) + '</p>');
  assert.equal(String(html`<p>${html`<b>${'&'}</b>`}${raw('<i></i>')}${[1, 2]}${false}${null}</p>`), '<p><b>&amp;</b><i></i>12</p>');
  assert.equal(esc(`"'`), '&quot;&#39;');
});

test('html`` writes true and false out inside attribute quotes only', () => {
  const on = true, off = false;
  assert.equal(String(html`<b aria-pressed="${on}" aria-expanded="${off}" data-x="${null}">${on}${off}</b>`),
    '<b aria-pressed="true" aria-expanded="false" data-x=""></b>');
  assert.equal(String(html`<p title="a">${off && html`<i></i>`}</p><b aria-pressed="${off}">`), '<p title="a"></p><b aria-pressed="false">');
  assert.equal(String(html`<p>${'"'}${on}</p>`), '<p>&quot;</p>');
});

test('the browser and the server list the same departments and duties', () => {
  const permissions = require('../../permissions.js');
  assert.deepEqual(Object.fromEntries(DEPARTMENTS.map(department => [department.name, department.duties])), permissions.DEPARTMENT_DUTIES);
});

test('the browser and the server have the same default members for duties', () => {
  const permissions = require('../../permissions.js');
  assert.deepEqual(DUTY_DEFAULTS, { ...permissions.DUTY_DEFAULTS });
});

test('the server fills in the same usual service times as the app', () => {
  const { serviceStart, pacificTime } = require('../../functions/time.js');
  for (const [label, time] of Object.entries(DEFAULT_TIMES)) {
    assert.equal(serviceStart({ date: '2026-10-06', service: label }), pacificTime('2026-10-06', time), label);
  }
});

test('the server cleans Sheet names with the same list of old spellings as the app', () => {
  assert.deepEqual(require('../../functions/names.js').BUILT_IN_NAME_MAP, BUILT_IN_NAME_MAP);
});

test('Sermon shows as Opening Prayer and Prayer of Thanks as Thanks Prayer, the same on the server', () => {
  assert.equal(dutyName('Sermon'), 'Opening Prayer');
  assert.equal(dutyName('Prayer of Thanks'), 'Thanks Prayer');
  assert.equal(dutyName('Usher Door'), 'Usher Door');
  assert.deepEqual(require('../../functions/names.js').DUTY_NAMES, DUTY_NAMES);
});

test('the server has the same permissions.js and permissions-data.js as the browser', () => {
  for (const file of ['permissions.js', 'permissions-data.js']) {
    assert.equal(fs.readFileSync(new URL('../../functions/' + file, import.meta.url), 'utf8'),
      fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8'), file);
  }
});

test('the page, the app, the service worker and the local server load one Firebase SDK version', () => {
  const versions = ['index.html', 'app/firebase.js', 'sw.js', 'scripts/serve.mjs'].map(file => {
    const text = fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
    const found = [...new Set([...text.matchAll(/gstatic\.com\/firebasejs\/([0-9.]+)\//g)].map(match => match[1]))];
    assert.equal(found.length, 1, file + ' names one SDK version');
    return found[0];
  });
  assert.deepEqual(versions, versions.map(() => versions[0]), 'every file names the same version');
});

test('feature switches fall back to their default when nothing is saved', () => {
  assert.equal(featureOn({}, 'emptyDuties'), false);
  assert.equal(featureOn({ features: { emptyDuties: true } }, 'emptyDuties'), true);
  assert.equal(featureOn({ features: { siteLock: false } }, 'siteLock'), false);
  assert.ok(FEATURES.every(item => item.label && item.description && !/[—–]/.test(item.description)));
});

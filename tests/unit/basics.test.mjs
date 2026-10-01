/* Names, dates, markup escaping, and the department lists that must match
   between the browser and the server. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { displayName, canonicalName, byTitle, initials, BUILT_IN_NAME_MAP } from '../../app/lib/names.js';
import { clockTime, dayBadge, addMonths, pacificNow } from '../../app/lib/dates.js';
import { html, raw, esc } from '../../app/html.js';
import { DEPARTMENTS, DEFAULT_TIMES, DUTY_NAMES, dutyName } from '../../app/config/duties.js';
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
});

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

test('the server has the same permissions.js as the browser', () => {
  assert.equal(fs.readFileSync(new URL('../../functions/permissions.js', import.meta.url), 'utf8'),
    fs.readFileSync(new URL('../../permissions.js', import.meta.url), 'utf8'));
});

test('feature switches fall back to their default when nothing is saved', () => {
  assert.equal(featureOn({}, 'emptyDuties'), false);
  assert.equal(featureOn({ features: { emptyDuties: true } }, 'emptyDuties'), true);
  assert.equal(featureOn({ features: { siteLock: false } }, 'siteLock'), false);
  assert.ok(FEATURES.every(item => item.label && item.description && !/[—–]/.test(item.description)));
});

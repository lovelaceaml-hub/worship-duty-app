/** Shared Pacific-time next-service Schedule selector (core/schedule.js preferredScheduleService).
 * Rule since 2026-09-17: as soon as a service's start minute arrives, the automatic
 * default advances to the next upcoming service. Nothing stays "current" for a window.
 * The boundary cases below are the ones AGENTS.md requires before any Hosting release.
 * Fixture services only, no member data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readModule = name => { try { return readFileSync(path.join(root, name), 'utf8'); } catch { return ''; } };
const manifest = JSON.parse(readFileSync(path.join(root, 'scripts/check-app-split.manifest.json'), 'utf8'));
const source = manifest.moduleOrder.map(readModule).join('\n');
// indexOf finds 'function pacificWallNow(' whether or not it is preceded by
// 'export ' (that prefix appears once the declaration lands in its own
// module; see docs/PLAN-2026-09-22-APP-JS-SPLIT.md's Build log), so `start`
// always lands exactly on 'function', never on 'export', which matters since
// the extracted snippet below is run outside a module scope. The end
// boundary needs its own tolerance: a literal '\nfunction dutiesFor(' no
// longer matches once 'export ' is inserted between the newline and
// 'function'. pacificWallNow and preferredScheduleService both live in
// core/schedule.js, immediately before dutiesFor (docs/PLAN-2026-09-22-APP-JS-SPLIT.md).
const start = source.indexOf('function pacificWallNow(');
const dutiesForMatch = source.slice(start).match(/\n(?:export\s+)?function dutiesFor\(/);
const end = dutiesForMatch ? start + dutiesForMatch.index : -1;
assert.ok(start !== -1 && end > start, 'shared Schedule selector exists next to its Pacific clock helper');
// Both functions carry an 'export ' prefix in core/schedule.js; the slice runs
// outside a module scope, so strip it (the start offset already skips the first).
const slice = source.slice(start, end).replace(/^export\s+/gm, '');
assert.ok(slice.includes('function preferredScheduleService('), 'selector lives between pacificWallNow and dutiesFor');
const preferred = runInNewContext(slice + '\npreferredScheduleService;', {Intl, Date});
assert.ok(slice.includes('function servicesNotStarted('), 'My Duties filter lives next to the selector');
const notStarted = runInNewContext(slice + '\nservicesNotStarted;', {Intl, Date});

// 2026-09-14 is in Pacific Daylight Time (UTC minus 7).
const pacific = (date, time) => new Date(date + 'T' + time + ':00-07:00');
const earlyAndEvening = [
  {date: '2026-09-14', time: '05:00', service: 'Early Morning'},
  {date: '2026-09-14', time: '19:30', service: 'Evening'},
  {date: '2026-09-15', time: '09:00', service: 'Morning'}
];
const afternoonAndEvening = [
  {date: '2026-09-14', time: '14:30', service: 'Afternoon'},
  {date: '2026-09-14', time: '19:30', service: 'Evening'},
  {date: '2026-09-15', time: '09:00', service: 'Morning'}
];

test('7:29 PM Pacific still shows the 7:30 PM service, not the finished 5:00 AM one', () => {
  const chosen = preferred(earlyAndEvening, pacific('2026-09-14', '19:29'));
  assert.equal(chosen.service, 'Evening');
  assert.equal(chosen.date, '2026-09-14');
});

test('7:30 PM Pacific, the start minute itself, already advances', () => {
  const chosen = preferred(earlyAndEvening, pacific('2026-09-14', '19:30'));
  assert.equal(chosen.date, '2026-09-15');
});

test('7:31 PM Pacific advances to the next upcoming service (tomorrow morning)', () => {
  const chosen = preferred(earlyAndEvening, pacific('2026-09-14', '19:31'));
  assert.equal(chosen.service, 'Morning');
  assert.equal(chosen.date, '2026-09-15');
});

test('2:29 PM Pacific still shows the 2:30 PM afternoon service', () => {
  assert.equal(preferred(afternoonAndEvening, pacific('2026-09-14', '14:29')).service, 'Afternoon');
});

test('2:31 PM Pacific advances from afternoon to the same-day evening service', () => {
  const chosen = preferred(afternoonAndEvening, pacific('2026-09-14', '14:31'));
  assert.equal(chosen.service, 'Evening');
  assert.equal(chosen.date, '2026-09-14');
});

test('no service keeps a "current" window after it starts', () => {
  // The old rule held the evening service for three hours. 9:06 PM must now show tomorrow.
  assert.equal(preferred(earlyAndEvening, pacific('2026-09-14', '21:06')).date, '2026-09-15');
});

test('with no future service, the latest service wins instead of the earliest', () => {
  const chosen = preferred(earlyAndEvening.slice(0, 2), pacific('2026-09-14', '23:31'));
  assert.equal(chosen.service, 'Evening');
});

test('the Pacific clock is used, not the machine or UTC clock', () => {
  // 02:29 UTC on the 15th is 7:29 PM Pacific on the 14th.
  assert.equal(preferred(earlyAndEvening, new Date('2026-09-15T02:29:00Z')).service, 'Evening');
  assert.equal(preferred(earlyAndEvening, new Date('2026-09-15T02:31:00Z')).date, '2026-09-15');
});

test('a service without a time falls back to its label default, and bad rows are ignored', () => {
  const list = [
    {date: 'not-a-date', time: '05:00', service: 'Early Morning'},
    {date: '2026-09-14', service: 'Evening'}
  ];
  assert.equal(preferred(list, pacific('2026-09-14', '19:59')).service, 'Evening');
  assert.equal(preferred([], pacific('2026-09-14', '19:59')), null);
});

// My Duties, the "next duty" cards and reminders read dutiesFor(), whose default list
// is servicesNotStarted(). A duty stops being upcoming at its start minute, not at midnight.
test('9:00 PM Pacific: the finished 5:00 AM and 7:30 PM duties are no longer upcoming', () => {
  const left = notStarted(earlyAndEvening, pacific('2026-09-14', '21:00'));
  assert.deepEqual(left.map(s => s.date + ' ' + s.time), ['2026-09-15 09:00']);
});

test('upcoming duties use the same start-minute boundary as the Schedule selector', () => {
  assert.deepEqual(notStarted(earlyAndEvening, pacific('2026-09-14', '04:59')).length, 3);
  assert.deepEqual(notStarted(earlyAndEvening, pacific('2026-09-14', '05:00')).map(s => s.service), ['Evening', 'Morning']);
  assert.deepEqual(notStarted(earlyAndEvening, pacific('2026-09-14', '19:29')).map(s => s.service), ['Evening', 'Morning']);
  assert.deepEqual(notStarted(earlyAndEvening, pacific('2026-09-14', '19:31')).map(s => s.service), ['Morning']);
});

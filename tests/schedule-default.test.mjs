import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readModule = name => { try { return readFileSync(path.join(root, name), 'utf8'); } catch { return ''; } };
const manifest = JSON.parse(readFileSync(path.join(root, 'scripts/check-app-split.manifest.json'), 'utf8'));
const source = manifest.moduleOrder.map(readModule).join('\n');
// indexOf finds 'function preferredScheduleService(' whether or not it is
// preceded by 'export ' (that prefix appears once the declaration lands in
// its own module; see docs/PLAN-2026-09-22-APP-JS-SPLIT.md's Build log), so
// `start` always lands exactly on 'function', never on 'export', which
// matters since the extracted snippet below is run outside a module scope.
// The end boundary needs its own tolerance: a literal '\nfunction dutiesFor('
// no longer matches once 'export ' is inserted between the newline and
// 'function'.
const start = source.indexOf('function preferredScheduleService(');
const dutiesForMatch = source.slice(start).match(/\n(?:export\s+)?function dutiesFor\(/);
const end = dutiesForMatch ? start + dutiesForMatch.index : -1;
assert.ok(start !== -1 && end > start, 'shared Schedule selector exists');
const preferred = runInNewContext(source.slice(start, end) + '\npreferredScheduleService;', {Intl, Date});
const services = [
  {date: '2026-09-14', time: '05:00', service: 'Early Morning'},
  {date: '2026-09-14', time: '19:30', service: 'Evening'},
  {date: '2026-09-15', time: '09:00', service: 'Morning'}
];

assert.equal(preferred(services, new Date('2026-09-15T02:20:00Z')).service, 'Evening',
  'at 7:20 PM Pacific, the upcoming evening service wins over the completed 5 AM service');
assert.equal(preferred(services, new Date('2026-09-15T04:06:00Z')).service, 'Evening',
  'at 9:06 PM Pacific, evening remains the current service');
assert.equal(preferred(services, new Date('2026-09-15T06:31:00Z')).date, '2026-09-15',
  'after the evening active window, the next future date wins');
assert.equal(preferred(services.slice(0, 2), new Date('2026-09-15T06:31:00Z')).service, 'Evening',
  'with no future schedule, the latest service today wins instead of 5 AM');
console.log('schedule-default: PASS');

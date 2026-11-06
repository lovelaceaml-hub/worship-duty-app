/* Checks on firestore.rules that run without the emulator (npm test). What
   the rules allow is tested on the emulator (tests/rules-emulator, npm run
   test:rules); these keep the rules in step with the code they describe:
   the duty lists, the documents the app writes, the claims sign-in issues
   and the session checks the callables make. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const rules = read('firestore.rules');
const { DEPARTMENT_DUTIES } = require('../../permissions.js');
const { sessionClaims } = require('../../functions/member-auth.js');

/* The text between the brace after `marker` and its closing brace. */
function block(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'missing ' + marker);
  const open = source.indexOf('{', start + marker.length - 1);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error('unclosed ' + marker);
}

/* The quoted names in a rules list, such as keys().hasOnly([...]). */
const quoted = text => Array.from(text.matchAll(/'([^']*)'/g), match => match[1]);
const allowedKeys = body => quoted(body.match(/keys\(\)\.hasOnly\(\[([^\]]*)\]\)/)[1]);

/* The keys of the first object literal in `source` after `marker`. */
function objectKeys(source, marker) {
  const body = block(source, marker);
  const keys = [];
  let depth = 0;
  let entry = '';
  for (const char of body + ',') {
    if ('([{'.includes(char)) depth += 1;
    if (')]}'.includes(char)) depth -= 1;
    if (char === ',' && depth === 0) {
      const key = entry.split(':')[0].trim();
      if (key) keys.push(key);
      entry = '';
    } else entry += char;
  }
  return keys;
}

test('rules deny every path they do not name, and leave only three open', () => {
  assert.match(rules, /^rules_version = '2';/);
  const catchAll = rules.lastIndexOf('match /{document=**}');
  assert.ok(catchAll > rules.lastIndexOf('match /setlists/'), 'the catch-all comes last');
  assert.match(block(rules, 'match /{document=**}'), /^\s*allow read, write: if false;\s*$/);
  // Only the public schedule and the two song collections (the Signal
  // ingest writes them without signing in) are open to everyone.
  const open = [];
  let current = '';
  rules.split('\n').forEach(line => {
    const match = line.match(/^\s*match (\/[^ ]+) \{/);
    if (match) current = match[1];
    const allow = line.match(/allow ([a-z, ]+): if true;/);
    if (allow) open.push(current + ' ' + allow[1]);
  });
  assert.deepEqual(open, ['/schedule/{serviceId} read', '/songStats/{songId} read, write', '/setlists/{setlistId} read, write']);
});

test('each department\'s duties in the rules are the ones in permissions.js', () => {
  const chain = Object.fromEntries(Array.from(block(rules, 'function departmentDuties(').matchAll(/department == (['"])(.+?)\1 \? \[([^\]]*)\]/g),
    match => [match[2], quoted(match[3])]));
  assert.deepEqual(chain, DEPARTMENT_DUTIES);
  const markable = Object.fromEntries(Array.from(block(rules, 'function markable(').matchAll(/led\.hasAny\(\[(['"])(.+?)\1\]\)\s*\?\s*\[([^\]]*)\]/g),
    match => [match[2], Array.from(match[3].matchAll(/a\.get\('([^']+)', ''\)/g), get => get[1])]));
  assert.deepEqual(markable, DEPARTMENT_DUTIES);
});

test('a change request the app sends has exactly the keys the rules allow', () => {
  const sent = objectKeys(read('app/services/requests.js'), 'const request = {');
  const allowed = allowedKeys(block(rules, 'function asksForOwnDuty('));
  assert.deepEqual(sent.slice().sort(), allowed.slice().sort(),
    'app/services/requests.js sendRequest and firestore.rules asksForOwnDuty must list the same keys; change both together');
});

test('a feedback note the app sends has exactly the keys the rules allow', () => {
  const sent = objectKeys(read('app/services/feedback.js'), 'const entry = {');
  const allowed = allowedKeys(block(rules, 'match /feedback/{feedbackId}'));
  assert.deepEqual(sent.slice().sort(), allowed.slice().sort(),
    'app/services/feedback.js sendFeedback and the feedback rule must list the same keys; change both together');
});

test('the usage count has a counter for every event the app counts', () => {
  const counters = quoted(block(rules, 'function countsOne(').match(/changed\.hasOnly\(\[([^\]]*)\]\)/)[1]);
  const tabs = quoted(read('app/ui/tabs.js').match(/\[\s*'schedule'[^\]]*\]/)[0]);
  const events = new Set(tabs.map(tab => 'tab_' + tab));
  for (const file of fs.readdirSync(path.join(root, 'app'), { recursive: true }).filter(name => name.endsWith('.js'))) {
    for (const match of read(path.join('app', file)).matchAll(/countOnce\('([^']+)'\)/g)) events.add(match[1]);
  }
  for (const event of events) assert.ok(counters.includes(event), event + ' is counted by the app but not allowed in pulse/{day}');
});

test('sign-in claims carry what the rules read', () => {
  const member = sessionClaims({ id: 'S. Leah', name: 'S. Leah', roles: [], departments: [], mustChangePin: false, roleVersion: 3 });
  assert.equal(member.memberId, 'S. Leah');
  assert.equal(member.memberName, 'S. Leah');
  assert.equal(member.mustChangePin, false);
  assert.equal(member.roleVersion, 3);
  // An account without a role version signs in at 1, which is how the rules
  // read such an account.
  assert.equal(sessionClaims({ id: 'B. Levi', name: 'B. Levi', mustChangePin: false }).roleVersion, 1);
  assert.match(rules, /acct\.get\('roleVersion', 1\) == request\.auth\.token\.get\('roleVersion', null\)/);
  assert.equal(sessionClaims({ id: 'B. Silas', name: 'B. Silas', mustChangePin: true }).mustChangePin, true);
});

test('the callables check the same session facts as the rules', () => {
  const server = fs.readdirSync(path.join(root, 'functions'))
    .filter(file => file.endsWith('.js'))
    .map(file => read(path.join('functions', file)))
    .join('\n');
  // The role version on the token is the account's (a missing one is 1, as in
  // the rules), the account is in use, and the session uid is the account's
  // authUid or member:<memberId>.
  assert.match(server, /const roleVersion = account\.roleVersion === undefined \? 1 : account\.roleVersion;/);
  assert.match(server, /token\.roleVersion\s*[!=]==\s*roleVersion/);
  assert.match(server, /account\.active === false/);
  assert.match(server, /authUid \|\| `member:\$\{/);
  assert.match(rules, /acct\.get\('active', true\) != false/);
  assert.match(rules, /'member:' \+ request\.auth\.token\.memberId/);
});

test('rules and their tests contain no forbidden dash characters', () => {
  const files = ['firestore.rules', 'tests/rules/firestore-rules.test.mjs']
    .concat(fs.readdirSync(path.join(root, 'tests/rules-emulator')).map(file => 'tests/rules-emulator/' + file));
  for (const file of files) assert.doesNotMatch(read(file), /[\u2013\u2014]/u, file);
});

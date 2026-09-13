'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const sourcePath = path.join(__dirname, '..', 'index.js');
const source = fs.readFileSync(sourcePath, 'utf8');

test('exports the member PIN callables through the v2 callable adapter', () => {
  assert.match(source, /createMemberAuthCallables/);
  assert.match(source, /exports\.verifyMemberPin\s*=/);
  assert.match(source, /exports\.changeMemberPin\s*=/);
  assert.match(source, /exports\.resetMemberPin\s*=/);
  assert.match(source, /onCall\(\{ region: REGION \}/);
});

test('keeps member PIN material server-only', () => {
  assert.match(source, /collection\('accounts'\)/);
  assert.match(source, /hashPin\(/);
  assert.doesNotMatch(source, /logger\.(info|warn|error)\([^\n]*\bpin\b/i);
  assert.doesNotMatch(source, /console\.(log|warn|error)\([^\n]*\bpin\b/i);
});

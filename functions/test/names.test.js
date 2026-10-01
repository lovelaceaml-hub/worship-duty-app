'use strict';

/* One way to compare member names on the server: app/nameMap first, then the
   built-in old spellings, repeated until the name stops changing. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { canonicalName, cleanName, usableMemberName } = require('../names.js');

test('a name reaches its current spelling through both maps, in any number of steps', () => {
  assert.equal(canonicalName('  S.  Leah '), 'S. Leah');
  assert.equal(canonicalName('B. Gio'), 'B. Giomar', 'built-in spellings apply without a name map');
  assert.equal(canonicalName('D. Chloe', { 'M. Chloe': 'M. Chloe K' }), 'M. Chloe K', 'a renamed member is found under an older spelling');
  assert.equal(canonicalName('Bridgette', { Bridgette: 'S. Bridgette' }), 'S. Bridgette');
  assert.equal(canonicalName('D. Chloe', { 'D. Chloe': 'S. Chloe' }), 'S. Chloe', 'the name map wins over the built-in list');
  assert.equal(canonicalName('M. Chloe', { 'M. Chloe': 'D. Chloe' }), 'D. Chloe', 'a loop stops at the last new name');
  assert.equal(canonicalName(''), '');
  assert.equal(canonicalName(null), '');
});

test('Sheet names are cleaned and then put in their current spelling', () => {
  assert.equal(cleanName('s Leah\n'), 'S. Leah');
  assert.equal(cleanName('b Gio'), 'B. Giomar');
  assert.equal(cleanName('Bridgette', { Bridgette: 'S. Bridgette' }), 'S. Bridgette');
});

test('a name with a slash cannot be a sign-in name', () => {
  assert.equal(usableMemberName('S. Leah'), true);
  assert.equal(usableMemberName('S. Leah/S. Ruth'), false);
  assert.equal(usableMemberName(''), false);
});

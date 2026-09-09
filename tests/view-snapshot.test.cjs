'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('function viewControlKey(');
const end = source.indexOf('\nfunction renderPrimaryScreen', start);
assert.ok(start >= 0 && end > start);
function harness() {
  const document = { activeElement: null };
  const window = { scrollY: 240, scrollTo(value) { this.restored = value.top; } };
  const context = { document, window };
  vm.runInNewContext(source.slice(start, end) + '\nthis.capture = captureViewSnapshot; this.restore = restoreViewSnapshot;', context);
  function control({ id = '', value = '', type = 'select-one', tagName = 'SELECT', checked = false, dataset = {} } = {}) {
    return { id, name: '', dataset, value, type, tagName, checked, selectionStart: 2, selectionEnd: 4,
      focus() { document.activeElement = this; }, setSelectionRange(start, end) { this.range = [start, end]; } };
  }
  const view = controls => ({ querySelectorAll: () => controls });
  return { ...context, control, view };
}
test('inactive assignment choices and checkboxes show new state after a background render', () => {
  const h = harness();
  const saved = h.capture(h.view([h.control({ id: 'assignment', value: 'Old' }), h.control({ id: 'feature', tagName: 'INPUT', type: 'checkbox', checked: false })]));
  const assignment = h.control({ id: 'assignment', value: 'New' });
  const feature = h.control({ id: 'feature', tagName: 'INPUT', type: 'checkbox', checked: true });
  h.restore(h.view([assignment, feature]), saved);
  assert.equal(assignment.value, 'New');
  assert.equal(feature.checked, true);
  assert.equal(h.window.restored, 240);
});
test('focused text drafts preserve their content, selection and scroll', () => {
  const h = harness();
  const old = h.control({ id: 'note', value: 'Unsaved fixture note', tagName: 'TEXTAREA', type: 'textarea' });
  h.document.activeElement = old;
  const saved = h.capture(h.view([old]));
  const current = h.control({ id: 'note', value: 'Remote note', tagName: 'TEXTAREA', type: 'textarea' });
  h.restore(h.view([current]), saved);
  assert.equal(current.value, 'Unsaved fixture note');
  assert.deepEqual(current.range, [2, 4]);
  assert.equal(h.document.activeElement, current);
  assert.equal(h.window.restored, 240);
});
test('a focused committed selection keeps new server value and stable service identity', () => {
  const h = harness();
  const data = { chg: 'manage-assignment', service: 'fictional-service', duty: 'Presider' };
  const old = h.control({ value: 'Old', dataset: data });
  h.document.activeElement = old;
  const saved = h.capture(h.view([old]));
  const unrelated = h.control({ value: 'Other', dataset: { ...data, service: 'another-service' } });
  const current = h.control({ value: 'New', dataset: data });
  h.restore(h.view([unrelated, current]), saved);
  assert.equal(current.value, 'New');
  assert.equal(unrelated.value, 'Other');
  assert.equal(h.document.activeElement, current);
});


test('legacy data identities keep focus on the exact feature, person and service', () => {
  for (const pair of [
    [{ chg: 'feature', id: 'siteLock' }, { chg: 'feature', id: 'editorLock' }],
    [{ chg: 'member-cat', name: 'Fictional One', cat: 'Worship' }, { chg: 'member-cat', name: 'Fictional Two', cat: 'Worship' }],
    [{ chg: 'assign', svc: 'service-one', duty: 'Presider' }, { chg: 'assign', svc: 'service-two', duty: 'Presider' }]
  ]) {
    const h = harness();
    const old = pair.map(dataset => h.control({ dataset }));
    h.document.activeElement = old[1];
    const saved = h.capture(h.view(old));
    const next = pair.map(dataset => h.control({ dataset }));
    h.restore(h.view(next), saved);
    assert.equal(h.document.activeElement, next[1]);
  }
});

test('ambiguous and anonymous controls never redirect focus to the first match', () => {
  for (const dataset of [{ chg: 'feature', id: 'duplicate' }, {}]) {
    const h = harness();
    const old = h.control({ dataset });
    h.document.activeElement = old;
    const saved = h.capture(h.view([old]));
    h.restore(h.view([h.control({ dataset }), h.control({ dataset })]), saved);
    assert.equal(h.document.activeElement, old);
    assert.equal(h.window.restored, 240);
  }
});

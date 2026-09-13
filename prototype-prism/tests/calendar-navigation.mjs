import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const prismSource = await fs.readFile(path.join(here, '..', 'prism.js'), 'utf8');

const serviceId = svc => svc.date + '_' + svc.service.toLowerCase();
const clone = value => JSON.parse(JSON.stringify(value));

const fixture = [
  { date: '2026-07-04', service: 'Morning', time: '09:00', worship: 'Sabbath Day', assignments: {} },
  { date: '2026-07-04', service: 'Afternoon', time: '15:00', worship: 'Sabbath Day', assignments: {} },
  { date: '2026-07-04', service: 'Evening', time: '20:00', worship: 'Sabbath Day', assignments: {} },
  { date: '2026-07-11', service: 'Evening', time: '20:00', worship: 'Sabbath Day', assignments: {} }
];

function createRuntime({ now = '2026-07-04T10:00:00', today = '2026-07-04', visible } = {}) {
  const nowMs = new Date(now).getTime();
  const listeners = [];
  const focused = { date: null };
  const state = { services: clone(fixture) };
  const ui = { me: 'B. Anthony L', deptFilter: 'All', showPast: false };
  const visibleIds = visible || new Set(state.services.map(serviceId));

  const makeElement = ({ date = '', act = '', tab = '' } = {}) => {
    const element = {
      dataset: { date, act, tab },
      focus() { focused.date = this.dataset.date || null; },
      closest(selector) {
        if (date && selector.includes('[data-prism="date"]')) return this;
        if (act && selector.includes('[data-act="' + act + '"]')) return this;
        return null;
      }
    };
    return element;
  };

  const document = {
    addEventListener(type, listener, options) {
      listeners.push({ type, listener, capture: !!options });
    },
    querySelector(selector) {
      const match = selector.match(/data-date="([^"]+)"/);
      return match ? makeElement({ date: match[1] }) : null;
    },
    getElementById() { return { innerHTML: '' }; }
  };

  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [nowMs])); }
    static now() { return nowMs; }
  }

  const context = {
    Date: TestDate,
    document,
    window: {},
    console,
    setTimeout,
    clearTimeout
  };
  context.window.__today = today;
  context.window.__visible = visibleIds;
  context.window.__A = {};
  context.window.__ui = ui;
  context.window.__state = state;
  context.window.__renderCount = 0;
  context.window.__markup = '';
  context.window.__focused = focused;

  const prelude = `
    const A = window.__A;
    const aui = { month: '2026-07', day: '', service: '', mode: 'day', query: '' };
    const ui = window.__ui;
    const state = window.__state;
    const CATEGORIES = [];
    function todayISO() { return window.__today; }
    function toISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function allInMonth() {
      return state.services.filter(s => s.date.startsWith(aui.month) && (s.date >= todayISO() || ui.showPast)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    }
    function svcId(s) { return s.date + '_' + s.service.toLowerCase(); }
    function matches(s) { return window.__visible.has(svcId(s)); }
    function dutiesFor() { return []; }
    function feat() { return false; }
    function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function ai() { return ''; }
    function monthTitle(month) { return month; }
    function shortDay(date) { return date; }
    function fmtTime(time) { return time; }
    function fmtDate(date) { return date; }
    function departmentPicker() { return ''; }
    function renderTeam() { return ''; }
    function renderCatRows() { return ''; }
    let decorate = () => {};
    function render() { window.__renderCount++; window.__markup = renderSchedule(); }
    window.__aui = aui;
  `;
  vm.runInNewContext(prelude + '\n' + prismSource, context, { filename: 'prism.js' });

  const dispatch = (type, target, extra = {}) => {
    const event = Object.assign({
      target,
      key: '',
      preventDefault() { this.defaultPrevented = true; }
    }, extra);
    listeners.filter(item => item.type === type && item.capture).forEach(item => item.listener(event));
    listeners.filter(item => item.type === type && !item.capture).forEach(item => item.listener(event));
    return event;
  };

  return {
    context,
    aui: context.window.__aui,
    ui,
    renderSchedule: () => {
      const markup = context.renderSchedule();
      context.window.__markup = markup;
      return markup;
    },
    dispatch,
    dateButton: date => makeElement({ date }),
    scheduleButton: () => makeElement({ act: 'tab', tab: 'schedule' }),
    homeButton: () => makeElement({ act: 'home' }),
    snapshot: () => ({ ...context.window.__aui }),
    markup: () => context.window.__markup,
    focused: () => focused.date,
    renders: () => context.window.__renderCount
  };
}

test('initial calendar selection advances to the next service still ahead', () => {
  const runtime = createRuntime({ now: '2026-07-04T16:00:00' });
  runtime.renderSchedule();

  assert.equal(runtime.snapshot().day, '2026-07-04');
  assert.equal(runtime.snapshot().service, '2026-07-04_evening');
});

test('initial selection moves to the next service day after the final service', () => {
  const runtime = createRuntime({ now: '2026-07-04T21:00:00' });
  runtime.renderSchedule();

  assert.equal(runtime.snapshot().day, '2026-07-11');
  assert.equal(runtime.snapshot().service, '2026-07-11_evening');
});

test('clicking an empty date keeps that date active and leaves the inspector empty', () => {
  const runtime = createRuntime();
  runtime.renderSchedule();
  runtime.dispatch('click', runtime.dateButton('2026-07-02'));

  assert.equal(runtime.snapshot().day, '2026-07-02');
  assert.equal(runtime.snapshot().service, '');
  assert.match(runtime.markup(), /class="month-cell date-tile selected" data-prism="date" data-date="2026-07-02"/);
  assert.match(runtime.markup(), /aria-pressed="true"/);
  assert.match(runtime.markup(), /No services in this view/);
  assert.equal(runtime.focused(), '2026-07-02');
});

test('moving forward into an empty month clears the stale service selection', () => {
  const runtime = createRuntime();
  runtime.aui.day = '2026-07-04';
  runtime.aui.service = '2026-07-04_morning';
  runtime.aui.month = '2026-08';
  runtime.renderSchedule();

  assert.equal(runtime.snapshot().day, '2026-08-01');
  assert.equal(runtime.snapshot().service, '');
  assert.match(runtime.markup(), /No services in this view/);
});

test('the active service is replaced when filters hide it', () => {
  const visible = new Set(['2026-07-04_morning', '2026-07-11_evening']);
  const runtime = createRuntime({ visible });
  runtime.aui.day = '2026-07-04';
  runtime.aui.service = '2026-07-04_afternoon';
  runtime.renderSchedule();

  assert.equal(runtime.snapshot().service, '2026-07-04_morning');
  assert.match(runtime.markup(), /data-id="2026-07-04_morning" aria-pressed="true" class="selected"/);
});

test('returning to Schedule resets the calendar to today', () => {
  const runtime = createRuntime({ now: '2026-07-04T16:00:00' });
  runtime.aui.day = '2026-07-25';
  runtime.aui.service = '2026-07-25_morning';
  runtime.ui.tab = 'my';
  runtime.dispatch('click', runtime.scheduleButton());

  assert.equal(runtime.snapshot().month, '2026-07');
  assert.equal(runtime.snapshot().day, '2026-07-04');
  assert.equal(runtime.snapshot().service, '');
  runtime.ui.tab = 'schedule';
  runtime.renderSchedule();
  assert.equal(runtime.snapshot().day, '2026-07-04');
  assert.equal(runtime.snapshot().service, '2026-07-04_evening');
});

test('returning through the home action also resets today', () => {
  const runtime = createRuntime();
  runtime.aui.day = '2026-07-25';
  runtime.ui.tab = 'manage';
  runtime.dispatch('click', runtime.homeButton());

  assert.equal(runtime.snapshot().day, '2026-07-04');
  assert.equal(runtime.snapshot().month, '2026-07');
});

test('keyboard navigation crosses an empty month and follows focus', () => {
  const runtime = createRuntime();
  runtime.aui.day = '2026-07-31';
  runtime.aui.service = '2026-07-04_morning';
  const event = runtime.dispatch('keydown', runtime.dateButton('2026-07-31'), { key: 'ArrowRight' });

  assert.equal(event.defaultPrevented, true);
  assert.equal(runtime.snapshot().month, '2026-08');
  assert.equal(runtime.snapshot().day, '2026-08-01');
  assert.equal(runtime.snapshot().service, '');
  assert.equal(runtime.focused(), '2026-08-01');
});

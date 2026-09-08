'use strict';

/* Buildless, dependency-free application constants. This file is loaded as a
   plain script before app.js and can also be required by Node harnesses. */
(function expose(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.window) {
    const target = root.window.WorshipApp || (root.window.WorshipApp = {});
    target.core = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCore() {
  const CATEGORIES = [
    { name: 'Worship',        color: '#4338ca', duties: ['Presider', 'Sermon', 'Prayer of Thanks', 'Closing Prayer'] },
    { name: 'Usher Sisters',  color: '#be185d', duties: ['Usher Door', 'Usher Front', 'Usher Back'] },
    { name: 'Usher Brothers', color: '#0369a1', duties: ['Usher #1', 'Usher #2', 'Lobby Security'] },
    { name: 'Lobby',          color: '#b45309', duties: ['Lobby Desk #1', 'Lobby Desk #2'] },
    { name: 'Translation',    color: '#047857', duties: ['Translation #1', 'Translation #2'] },
    { name: 'Media',          color: '#6d28d9', duties: ['Media Booth #1', 'Media Booth #2'] },
    { name: 'Parking Lot',    color: '#3f6212', duties: ['Parking #1', 'Parking #2', 'Parking #3', 'Parking #4', 'Parking #5'] },
    { name: 'Offering',       color: '#a21caf', duties: ['Offering #1', 'Offering #2', 'Offering #3', 'Offering #4', 'Offering #5', 'Offering #6'] }
  ];
  const SERVICE_LABELS = ['Morning', 'Afternoon', 'Evening', 'Early Morning', 'Commemoration'];
  const WORSHIP_TYPES = ['Sabbath Day', 'Third Day', 'Prayer Week', 'Ascension Day', 'Pentecost', "Heavenly Parent's Day"];

  const DATA_KEY = 'wds-data-v2';
  const FEATURES = [
    { id: 'siteLock',       label: 'Site passcode',             desc: 'Everyone must enter the 4-digit passcode before the app opens on a new device.', def: true },
    { id: 'editorLock',     label: 'Editor passcode',           desc: 'Require the passcode before anyone can open Manage and edit the schedule.', def: true },
    { id: 'notifications',  label: 'New-duty alerts',           desc: 'Members are alerted when a duty is added for them.', def: true },
    { id: 'reminders',      label: 'Day-before reminders',      desc: 'Members are reminded within 24 hours of each duty.', def: true },
    { id: 'calendarExport', label: 'Add-to-calendar button',    desc: 'Members can download their duties to their phone calendar with built-in reminders.', def: true },
    { id: 'whoElse',        label: '"Who else is serving?"',    desc: 'My Duties can expand the full lineup for each service.', def: true },
    { id: 'choirSong',      label: 'Choir song on services',    desc: 'Show the choir song line on each service card.', def: true },
    { id: 'songPicker',     label: 'Presider song picker',      desc: 'Presiders get a Presider tab and buttons in My Duties to plan the songs for their service.', def: true },
    { id: 'pastServices',   label: 'Past services',             desc: 'Allow browsing services that already happened.', def: true },
    { id: 'emptyDuties',    label: 'Show unassigned duties',    desc: 'The schedule shows every duty slot, even ones without a name yet.', def: false },
    { id: 'conflictWarnings', label: 'Double-duty warnings',    desc: 'Show a notice when one person has two duties in the same service.', def: true },
    { id: 'sheetSync',      label: 'Google Sheet sync',         desc: 'Pull schedule updates from the published Google Sheet automatically.', def: true },
    { id: 'changeRequests', label: 'Change requests',           desc: 'Members can request schedule changes from My Duties; the scheduler is notified.', def: true }
  ];

  return {
    CATEGORIES: Object.freeze(CATEGORIES.map(category => Object.freeze({
      name: category.name,
      color: category.color,
      duties: Object.freeze(category.duties.slice())
    }))),
    SERVICE_LABELS: Object.freeze(SERVICE_LABELS.slice()),
    WORSHIP_TYPES: Object.freeze(WORSHIP_TYPES.slice()),
    DATA_KEY,
    FEATURES: Object.freeze(FEATURES.map(feature => Object.freeze(Object.assign({}, feature))))
  };
});

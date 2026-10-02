'use strict';

const { startClock } = require('./time');

function safeText(value, maximum) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Build the schedule-only projection LV Zion may display publicly. It omits
 * every app setting, member list, request, token, and service metadata beyond
 * what the established Firebase Schedule tab already renders.
 */
function publicScheduleService(service) {
  const date = safeText(service?.date, 10);
  if (!validDate(date)) return null;
  // A time that cannot be read shows as the label's usual time, as in the app.
  const time = startClock(service);

  const assignments = {};
  for (const [duty, member] of Object.entries(service?.assignments || {})) {
    const safeDuty = safeText(duty, 80);
    const safeMember = safeText(member, 120);
    if (safeDuty && safeMember) assignments[safeDuty] = safeMember;
  }

  return {
    date,
    time,
    worship: safeText(service?.worship, 100),
    service: safeText(service?.service, 100),
    assignments,
  };
}

module.exports = { publicScheduleService };

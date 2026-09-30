'use strict';

/* The regular services for a planning year: every Saturday (Sabbath Day:
   Morning, Afternoon, Evening) and every Tuesday (Third Day: Evening) from
   December 1 of `year` through December 31 of the next year. Feast days are
   added by hand; the app reminds administrators to do so. */

const { timeFor } = require('./entry-grid.js');

const SATURDAY = 6, TUESDAY = 2;
const PATTERN = {
  [SATURDAY]: [['Morning', 'Sabbath Day'], ['Afternoon', 'Sabbath Day'], ['Evening', 'Sabbath Day']],
  [TUESDAY]: [['Evening', 'Third Day']]
};

function serviceId(date, label) {
  return date + '_' + String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function serviceYear(year) {
  const services = [];
  const day = new Date(Date.UTC(year, 11, 1));
  const end = Date.UTC(year + 1, 11, 31);
  for (; day.getTime() <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    (PATTERN[day.getUTCDay()] || []).forEach(([service, worship]) => {
      services.push({ id: serviceId(date, service), date, service, worship, time: timeFor(service, date), choirSong: '', assignments: {} });
    });
  }
  return services;
}

module.exports = { serviceYear, serviceId };

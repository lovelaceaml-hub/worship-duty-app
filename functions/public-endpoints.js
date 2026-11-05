'use strict';

/* The two public endpoints: a member's calendar feed (/ics/<name>, served
   through a Hosting rewrite; subscribe once in Apple or Google Calendar and
   duty changes flow in as calendars re-fetch every few hours) and the
   read-only schedule projection LV Zion's public site fetches. The schedule
   is world-readable in the rules already, so neither shows anything new.
   Each instance keeps what it read for a minute, so repeated or varied
   addresses do not each read the whole schedule, and a name that is no
   member's is refused before any schedule read. */
const icsLib = require('./ics-lib.js');
const { publicScheduleService } = require('./public-schedule.js');
const { pacificDate, DAY_MS } = require('./time.js');
const { canonicalName } = require('./names.js');
const appDocs = require('./app-docs.js');

const CACHE_MS = 60 * 1000;

function createPublicEndpoints({ db, now = () => Date.now() }) {
  const cache = new Map();
  async function cached(key, load) {
    const at = now();
    const hit = cache.get(key);
    if (hit && at >= hit.at && at - hit.at < CACHE_MS) return hit.value;
    const value = await load();
    cache.set(key, { at, value });
    return value;
  }

  const people = () => cached('people', async () => {
    const nameMap = await appDocs.loadNameMap(db);
    return { nameMap, members: new Set(await appDocs.loadMemberNames(db, nameMap)) };
  });
  const recentServices = () => cached('recent', async () => {
    const since = new Date(now() - 30 * DAY_MS).toISOString().slice(0, 10);
    return (await db.collection('schedule').where('date', '>=', since).get()).docs.map(document => document.data() || {});
  });

  async function ics(req, res) {
    let member;
    try {
      member = decodeURIComponent(String(req.path || '').replace(/^\/(ics\/)?/, '')).replace(/[\r\n]/g, '').trim();
    } catch (_error) {
      res.status(400).type('text/plain').send('That calendar address is not valid. Copy it again from the app.');
      return;
    }
    if (!member) {
      res.status(400).type('text/plain').send('Usage: /ics/<member name>, e.g. /ics/B.%20Anthony');
      return;
    }
    const { nameMap, members } = await people();
    const name = canonicalName(member, nameMap);
    if (!members.has(name)) {
      res.status(404).type('text/plain').send('No member has that name. Copy the calendar address again from the app.');
      return;
    }
    const body = icsLib.buildIcsForMember(await recentServices(), name, nameMap);
    res.set('Cache-Control', 'public, max-age=300');
    res.type('text/calendar; charset=utf-8').send(body);
  }

  async function publicSchedule(_req, res) {
    const today = pacificDate(new Date(now()));
    const services = await cached('public:' + today, async () => {
      const snapshot = await db.collection('schedule').where('date', '>=', today).orderBy('date').limit(260).get();
      return snapshot.docs.map(document => publicScheduleService(document.data())).filter(Boolean);
    });
    res.set('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.set('X-Content-Type-Options', 'nosniff');
    res.json({ version: 1, generatedAt: new Date(now()).toISOString(), services });
  }

  return Object.freeze({ ics, publicSchedule });
}

module.exports = { createPublicEndpoints };

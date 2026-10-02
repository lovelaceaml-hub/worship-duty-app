/* The song recorder counts a confirmed list as sung three hours after its
   service starts: a list for a scheduled service, a list planned for a date
   with no scheduled service ("Plan another date"), and a list changed after
   it was confirmed. A list whose service was deleted or moved is not
   counted, nor is one never confirmed. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createWorkflowHandlers } = require('../workflows.js');
const { memoryDb } = require('./memory-db.js');

// Saturday 2026-10-03, 2:00 PM Pacific: the 10:00 morning service started four hours ago.
const NOW = Date.parse('2026-10-03T21:00:00Z');
const list = (id, extra = {}) => Object.assign({
  id, date: id.slice(0, 10), serviceLabel: 'Morning', songs: ['001', '002'], status: 'planned', confirmedAt: 100, updatedAt: 100
}, extra);

test('confirmed lists are counted after their service, also without a scheduled service or after a later change', async () => {
  const db = memoryDb({
    'schedule/2026-10-03_morning': { date: '2026-10-03', service: 'Morning', time: '10:00', assignments: {} },
    'setlists/2026-10-03_morning': list('2026-10-03_morning'),
    'setlists/2026-10-03_early-morning': list('2026-10-03_early-morning', { serviceLabel: 'Early Morning', noService: true, songs: ['003'] }),
    'setlists/2026-10-03_afternoon': list('2026-10-03_afternoon', { serviceLabel: 'Afternoon', songs: ['004'] }),
    'setlists/2026-10-03_evening': list('2026-10-03_evening', { serviceLabel: 'Evening', noService: true, songs: ['005'] }),
    'setlists/2026-10-03_moved': list('2026-10-03_moved', { serviceLabel: 'Moved', songs: ['006'] }),
    'setlists/2026-10-03_draft': list('2026-10-03_draft', { serviceLabel: 'Draft', noService: true, songs: ['007'], confirmedAt: 0 })
  });
  db.store.set('schedule/2026-10-03_afternoon', { date: '2026-10-03', service: 'Afternoon', time: '14:30', assignments: {} });
  db.store.set('setlists/2026-10-03_morning', list('2026-10-03_morning', { updatedAt: 200 })); // changed after confirming
  const { recordSongHistory } = createWorkflowHandlers({ db, now: () => NOW, logger: { info() {}, warn() {}, error() {} } });

  await recordSongHistory();
  const status = id => db.store.get('setlists/' + id).status;
  assert.equal(status('2026-10-03_morning'), 'sung', 'changed after it was confirmed, still counted');
  assert.equal(status('2026-10-03_early-morning'), 'sung', 'planned for a date with no scheduled service, at its label\'s usual time');
  assert.equal(status('2026-10-03_afternoon'), 'planned', 'its service started only 30 minutes ago');
  assert.equal(status('2026-10-03_evening'), 'planned', 'its own date and label: the evening has not come');
  assert.equal(status('2026-10-03_moved'), 'planned', 'its service was moved or deleted');
  assert.equal(status('2026-10-03_draft'), 'planned', 'never confirmed');
  assert.equal(db.store.get('songStats/003').timesSung, 1);
  assert.equal(db.store.get('songStats/001').timesSung, 1);
  assert.equal(db.store.get('songStats/006'), undefined);
});

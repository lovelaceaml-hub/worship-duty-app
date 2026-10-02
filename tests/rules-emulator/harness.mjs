/* The Firestore rules on the Firestore emulator, as the app uses them. Run
   with `npm run test:rules` (needs Java; see package.json). Every member is
   made up (the names of tests/fake/fixture.js). Sign-in claims come from the
   server's own sessionClaims(), and every member has an account document
   shaped like the ones the server writes (functions/index.js
   memberRoleRecord and updateRoleConfiguration), because the rules read it. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, writeBatch } from 'firebase/firestore';

const require = createRequire(import.meta.url);
const { sessionClaims } = require('../../functions/member-auth.js');
const { DEPARTMENT_DUTIES } = require('../../permissions.js');

export const rules = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const DEPARTMENTS = Object.keys(DEPARTMENT_DUTIES);

/* A service on a Saturday morning. B. Caleb presides and also has Media
   Booth #1 (a double duty); B. Levi has Closing Prayer and Usher #1 (an
   allowed pair); Usher Back and Thanks Prayer are empty. */
export const SVC = '2026-10-10_morning';
/* A Tuesday evening: few Worship duties filled, and S. Naomi has two Usher
   Sisters duties. */
export const EVENING = '2026-10-06_evening';
/* A Tuesday evening whose presider is stored under an older spelling that
   app/nameMap maps to B. Caleb. */
export const OLD_SPELLING = '2026-10-13_evening';

const account = (name, fields = {}) => Object.assign({
  id: name, memberId: name, name, memberName: name,
  role: 'member', roles: [], departments: [], globalLeaderManager: false,
  mustChangePin: false, active: true, roleVersion: 1, pinHash: 'made-up-hash'
}, fields);

/* Account documents by member id (the member's name, as on the server). */
const ACCOUNTS = {
  'B. Adam': account('B. Adam', { role: 'admin', roles: ['admin'], departments: DEPARTMENTS, roleVersion: 3 }),
  'E. Joseph': account('E. Joseph', { role: 'departmentLeader', roles: ['departmentLeader'], departments: ['Worship', 'Media'], roleVersion: 2 }),
  'S. Grace': account('S. Grace', { role: 'departmentLeader', roles: ['departmentLeader'], departments: ['Usher Sisters'] }),
  'B. Daniel': account('B. Daniel', { role: 'departmentLeader', roles: ['departmentLeader'], departments: ['Usher Brothers'] }),
  'M. Ruth': account('M. Ruth', { role: 'songEditor', roles: ['songEditor'] }),
  // Leads every department without being an administrator: the costliest
  // double-duty mark the rules evaluate.
  'S. Lydia': account('S. Lydia', { role: 'departmentLeader', roles: ['departmentLeader'], departments: DEPARTMENTS }),
  // An older account with a single role and no roles list; the callables
  // read it as a Worship leader (functions/index.js roleNames).
  'S. Hannah': account('S. Hannah', { role: 'departmentLeader', roles: undefined, departments: ['Worship'] }),
  'B. Caleb': account('B. Caleb'),
  'S. Leah': account('S. Leah', { departments: ['Usher Sisters'] }),
  'B. Levi': account('B. Levi', { departments: ['Usher Brothers', 'Worship'] }),
  'S. Joanna': account('S. Joanna'),
  // A leader whose role was removed: the account says member, but an older
  // sign-in refilled the leader role into the token (FR-7).
  'S. Naomi': account('S. Naomi', { roleVersion: 4, departments: ['Usher Sisters'] }),
  // Renamed, so this account is no longer used.
  'B. Micah': account('B. Micah', { active: false }),
  // A leader reset this PIN after the member signed in.
  'S. Esther': account('S. Esther', { mustChangePin: true }),
  // Signed in with a new PIN still to choose.
  'B. Silas': account('B. Silas', { mustChangePin: true }),
  // Roles changed since this member signed in.
  'B. Isaac': account('B. Isaac', { roleVersion: 2 }),
  // An account tied to an explicit Firebase Auth uid.
  'D. Miriam': account('D. Miriam', { authUid: 'auth-miriam' })
};
Object.values(ACCOUNTS).forEach(record => { if (record.roles === undefined) delete record.roles; });

export const uidOf = name => (ACCOUNTS[name] && ACCOUNTS[name].authUid) || 'member:' + name;

/* The token a member gets at sign-in, with optional changes for sessions that
   went stale or were refilled by an older server. */
const SESSIONS = {
  'S. Naomi': { roles: ['departmentLeader'], departments: ['Usher Sisters'], leader: true, privileged: true },
  'S. Esther': { mustChangePin: false },
  'B. Isaac': { roleVersion: 1 }
};

function claimsFor(name, changes = {}) {
  return Object.assign(sessionClaims(Object.assign({}, ACCOUNTS[name])), SESSIONS[name] || {}, changes);
}

const assignments = {
  [SVC]: {
    Presider: 'B. Caleb', Sermon: 'B. Samuel', 'Closing Prayer': 'B. Levi',
    'Usher Door': 'S. Leah', 'Usher Front': 'S. Naomi', 'Usher Back': '',
    'Usher #1': 'B. Levi', 'Usher #2': 'B. Isaac', 'Lobby Security': 'B. Daniel',
    'Media Booth #1': 'B. Caleb', 'Media Booth #2': 'B. Titus',
    'Translation #1': 'S. Priscilla', 'Parking #1': 'B. Jonah', 'Offering #1': 'S. Dorcas'
  },
  [EVENING]: {
    Presider: 'E. Joseph', Sermon: 'B. Samuel',
    'Usher Door': 'S. Naomi', 'Usher Front': 'S. Naomi', 'Usher #1': 'B. Daniel',
    'Media Booth #1': 'B. Titus', 'Translation #1': 'S. Leah'
  },
  [OLD_SPELLING]: { Presider: 'B Caleb', Sermon: 'B. Samuel' }
};

export const SERVICES = {
  [SVC]: { date: '2026-10-10', time: '09:00', service: 'Morning', worship: 'Sabbath Day', choirSong: '#311 I Repent of My Sin', assignments: assignments[SVC], conflictOk: {} },
  [EVENING]: { date: '2026-10-06', time: '20:00', service: 'Evening', worship: 'Third Day', choirSong: '', assignments: assignments[EVENING],
    conflictOk: { 'B. Titus': ['Media Booth #1', 'Translation #1'] } },
  [OLD_SPELLING]: { date: '2026-10-13', time: '20:00', service: 'Evening', worship: 'Third Day', choirSong: '', assignments: assignments[OLD_SPELLING] }
};

/* A change request as app/services/requests.js sendRequest() writes it. */
export function changeRequest(name, duty, fields = {}) {
  const service = SERVICES[fields.svcId || SVC] || { date: '2026-12-31', service: 'Morning', worship: 'Sabbath Day' };
  const createdAt = fields.createdAt || 1790000000000;
  const svcId = fields.svcId || SVC;
  const department = DEPARTMENTS.find(item => DEPARTMENT_DUTIES[item].includes(duty)) || '';
  return Object.assign({
    id: svcId + '_' + duty.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '_' + createdAt,
    name, memberId: name, requesterUid: uidOf(name), svcId,
    date: service.date, service: service.service, worship: service.worship,
    duty, department, note: 'I am away that weekend.', status: 'pending', createdAt
  }, fields);
}

const STORED_REQUESTS = {
  'req-leah': changeRequest('S. Leah', 'Usher Door', { id: 'req-leah' }),
  'req-levi': changeRequest('B. Levi', 'Usher #1', { id: 'req-levi' }),
  'req-naomi-old': changeRequest('S. Naomi', 'Usher Front', { id: 'req-naomi-old', status: 'approved' }),
  'req-joseph': changeRequest('E. Joseph', 'Presider', { id: 'req-joseph', svcId: EVENING })
};

/* Everything the tests start from, written with the rules off. */
function seedDocuments() {
  const docs = {};
  Object.entries(ACCOUNTS).forEach(([id, record]) => { docs['accounts/' + id] = record; });
  Object.entries(SERVICES).forEach(([id, record]) => { docs['schedule/' + id] = record; });
  Object.entries(STORED_REQUESTS).forEach(([id, record]) => { docs['requests/' + id] = record; });
  Object.assign(docs, {
    'app/settings': { sitePinHash: 'made-up-site-hash', schedulerName: 'E. Joseph', dutyDefaults: { Sermon: 'B. Samuel' } },
    'app/members': { list: Object.keys(ACCOUNTS).concat('B. Samuel', 'B. Titus', 'S. Priscilla') },
    'app/departments': { map: { 'Usher Sisters': ['S. Leah', 'S. Naomi', 'S. Grace'], Worship: ['B. Caleb', 'E. Joseph'] } },
    'app/leaderConfig': { departmentLeaders: { Worship: ['E. Joseph'], Media: ['E. Joseph'], 'Usher Sisters': ['S. Grace'] }, songEditors: ['M. Ruth'] },
    'app/nameMap': { map: { 'B Caleb': 'B. Caleb' } },
    'app/config': { public: true },
    'app/settings/history/x': { pinHash: 'made-up-hash' },
    ['departments/Usher Sisters/members/' + uidOf('S. Leah')]: { memberUid: uidOf('S. Leah'), memberName: 'S. Leah', departmentId: 'Usher Sisters', status: 'active', availability: { recurring: {}, exceptions: {} } },
    ['departments/Usher Brothers/members/' + uidOf('B. Levi')]: { memberUid: uidOf('B. Levi'), memberName: 'B. Levi', departmentId: 'Usher Brothers', status: 'active' },
    'departments/Usher Sisters': { name: 'Usher Sisters' },
    'tokens/token-leah': { name: 'S. Leah', updatedAt: 1 },
    'tokens/token-levi': { name: 'B. Levi', updatedAt: 1 },
    'feedback/fb-1': { uid: uidOf('S. Leah'), name: 'S. Leah', kind: 'bug', message: 'The calendar is blank.', screen: 'my', appearance: 'original', createdAt: 1, status: 'new' },
    'pulse/2026-10-01': { date: '2026-10-01', opens: 3, tab_my: 1 },
    ['setlists/' + SVC]: { id: SVC, date: '2026-10-10', presider: 'B. Caleb', songs: [], status: 'draft' },
    'songStats/song-311': { title: 'I Repent of My Sin', count: 4 },
    'departmentSchedules/old': { department: 'Usher Sisters', assignments: {} },
    'departmentAssignments/old': { departmentId: 'Usher Sisters', memberUid: uidOf('S. Leah') },
    'memberships/old': { department: 'Usher Sisters', memberUid: uidOf('S. Leah'), status: 'active' },
    'app/members/history/old': { department: 'Usher Sisters' },
    'conflicts/old': { department: 'Worship', departments: ['Worship'], requesterUid: uidOf('B. Caleb'), status: 'open' },
    'notifications/old': { department: 'Usher Sisters', requesterUid: uidOf('S. Leah') },
    'alerts/old': { department: 'Usher Sisters', requesterUid: uidOf('S. Leah') },
    'audit/old': { action: 'seed', department: 'Usher Sisters' },
    'sent/old': { t: 1 },
    'departmentInvitations/old': { department: 'Usher Sisters', tokenHash: 'made-up' }
  });
  return docs;
}

/* One emulator environment per test file, reset before each test.
   `rulesText` replaces firestore.rules (the budget test pads it). */
export async function startRules(rulesText = rules) {
  const env = await initializeTestEnvironment({ projectId: 'demo-wds', firestore: { rules: rulesText } });
  const contexts = new Map();
  const harness = {
    env,
    /* A Firestore client signed in as `name`, or 'nobody' (not signed in),
       or 'stranger' (a Firebase user with no member claims). `changes`
       alters the sign-in claims. */
    as(name, changes) {
      const key = name + JSON.stringify(changes || {});
      if (!contexts.has(key)) {
        const context = name === 'nobody' ? env.unauthenticatedContext()
          : name === 'stranger' ? env.authenticatedContext('stranger-uid', { email: 'someone@example.com' })
            : env.authenticatedContext(uidOf(name), claimsFor(name, changes));
        contexts.set(key, context.firestore());
      }
      return contexts.get(key);
    },
    async reset(extra = {}, without = []) {
      await env.clearFirestore();
      const docs = Object.assign(seedDocuments(), extra);
      without.forEach(path => { delete docs[path]; });
      await env.withSecurityRulesDisabled(async context => {
        const db = context.firestore();
        const batch = writeBatch(db);
        Object.entries(docs).forEach(([path, data]) => batch.set(doc(db, path), data));
        await batch.commit();
      });
    },
    /* Read a document with the rules off. */
    async stored(path) {
      let data;
      await env.withSecurityRulesDisabled(async context => {
        const snapshot = await getDoc(doc(context.firestore(), path));
        data = snapshot.exists() ? snapshot.data() : undefined;
      });
      return data;
    },
    cleanup: () => env.cleanup()
  };
  return harness;
}

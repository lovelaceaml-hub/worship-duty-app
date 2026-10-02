/* TEST ONLY. Stand-in for the app's Cloud Functions, working on the fake
   Firestore data. Each handler makes the real one's checks that the screens
   depend on, in the same order, and refuses the same way: an HttpsError code
   with details.reason (see app/lib/reasons.js). The real checks live in
   functions/ and its own tests.
   Tests can set window.__fakeFail = { callableName: 'unavailable' } (a code,
   a refusal { code, reason, message }, or a function of the payload giving
   either) to make a call fail, and
   window.__fakeDelay = { callableName: ms } to slow one down. */
import { doc, getDoc, getDocs, collection, setDoc, updateDoc } from './firebase-firestore.js';

const accounts = window.__fakeAccounts = window.__fakeAccounts || structuredClone((window.__fixture || {}).accounts || {});
const invites = {};
const calls = window.__fakeCalls = [];
const permissions = () => window.WorshipDutyPermissions;

/* The reason the server gives a refusal that names none, by its code
   (functions/refusals.js). */
const DEFAULT_REASONS = { 'invalid-argument': 'invalid-input', unauthenticated: 'sign-in-required', 'permission-denied': 'not-allowed',
  'not-found': 'not-found', 'already-exists': 'exists', 'failed-precondition': 'not-possible', aborted: 'changed', 'resource-exhausted': 'locked' };

function fail(code, message = code, reason = '', extra = {}) {
  throw Object.assign(new Error(message), { code: 'functions/' + code, details: Object.assign({ reason: reason || DEFAULT_REASONS[code] || 'server-error' }, extra) });
}
const me = () => decodeURIComponent((sessionStorage.getItem('fake-auth-member') || ''));
const profileRef = (department, uid) => doc(null, 'departments', department, 'members', uid);
const clone = value => structuredClone(value);

/* ---- who may do what, from the signed-in member's claims ---- */

const claims = () => (accounts[me()] || {}).claims || {};
const isAdmin = () => claims().admin === true || (claims().roles || []).includes('admin');
function mustLead(department) {
  if (!isAdmin() && !(claims().departments || []).includes(department)) fail('permission-denied', 'You do not lead ' + department + '.', 'cross-department');
}

async function profile(department, uid) {
  const snapshot = await getDoc(profileRef(department, uid));
  if (!snapshot.exists()) fail('not-found', 'That member is not in this department.', 'profile-missing');
  return snapshot.data();
}

/* As functions/revision.js: no expected revision (or null), no check. */
function assertFresh(before, expectedRevision, expectedUpdatedAt) {
  if (expectedRevision == null) return;
  const current = Number.isSafeInteger(before.revision) ? before.revision : 0;
  if (expectedRevision !== current || (expectedUpdatedAt != null && expectedUpdatedAt !== before.updatedAt)) {
    fail('aborted', 'This record changed since you loaded it. Reload to see the newer version.', 'changed');
  }
}

async function saveProfile(department, uid, next) {
  next.updatedAt = Date.now();
  next.updatedBy = me();
  next.revision = (Number(next.revision) || 0) + 1;
  await setDoc(profileRef(department, uid), next);
  return next;
}

function slug(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

/* As the server: a date's own entry, then its whole-day entry, then the
   weekly pattern; a time not set counts as available. */
function availableAt(profileData, date, key) {
  const availability = profileData.availability || {};
  const exception = (availability.exceptions || {})[date];
  if (exception && exception[key]) return exception[key];
  if (exception && exception['*']) return exception['*'];
  return (availability.recurring || {})[key] || 'available';
}

/* Whether a service has started, by the Pacific clock (the page's clock). */
const USUAL_TIMES = { 'Early Morning': '05:00', Morning: '10:00', Afternoon: '14:30', Evening: '19:30' };
function hasStarted(service) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const time = /^\d{2}:\d{2}$/.test(service.time || '') ? service.time : (USUAL_TIMES[service.service] || '12:00');
  return service.date + 'T' + time <= parts.year + '-' + parts.month + '-' + parts.day + 'T' + parts.hour + ':' + parts.minute;
}

/* Why `person` may not take `duty` at `service`, in the order of
   department-auth.js authorizeAssignment, then the pair rule. */
function refusal(person, service, duty, assignments) {
  if (!person) return 'no-profile';
  if (person.status !== 'active') return 'target-inactive';
  if (!(person.eligibleDuties || []).some(item => String(item).toLowerCase() === String(duty).toLowerCase())) return 'target-ineligible';
  if (person.schedulable !== true) return 'target-not-schedulable';
  if (availableAt(person, service.date, slug(service.service)) !== 'available') return 'target-unavailable';
  if (assignments && permissions().blockingDuties(assignments, person.memberName, duty).length) return 'already-serving';
  return '';
}

/* The duties `person` holds that cannot be paired with `duty`. */
const blocking = (assignments, person, duty) => permissions().blockingDuties(assignments, person.memberName, duty);

/* A member's flags after an availability change, as functions/replacements.js
   makes them: their upcoming duties in the department on a time now
   unavailable are flagged, and their own flags on times available again go.
   Returns { marked, cleared } with each duty's service, date and label. */
async function flagDuties(profileData, departmentId, memberUid) {
  const marked = [], cleared = [];
  const own = permissions().DEPARTMENT_DUTIES[departmentId] || [];
  for (const item of (await getDocs(collection(null, 'schedule'))).docs) {
    const service = item.data();
    if (hasStarted(service)) continue;
    let changed = false;
    Object.entries(service.assignments || {}).forEach(([duty, name]) => {
      if (!own.includes(duty) || name !== profileData.memberName) return;
      const where = { serviceId: item.id, duty, date: service.date, service: service.service };
      const marker = (service.needsReplacement || {})[duty];
      const mine = !!marker && marker.memberName === name;
      const status = availableAt(profileData, service.date, slug(service.service));
      if (status === 'unavailable' && !mine) {
        service.needsReplacement = Object.assign({}, service.needsReplacement, { [duty]: { memberName: name, memberUid, departmentId, reason: 'unavailable', since: Date.now() } });
        marked.push(where);
        changed = true;
      } else if (status === 'available' && mine && marker.reason === 'unavailable') {
        service.needsReplacement = Object.assign({}, service.needsReplacement);
        delete service.needsReplacement[duty];
        cleared.push(where);
        changed = true;
      }
    });
    if (changed) await setDoc(doc(null, 'schedule', item.id), service);
  }
  return { marked, cleared };
}

async function serviceFor(id) {
  const snapshot = await getDoc(doc(null, 'schedule', id));
  return snapshot.exists() ? snapshot.data() : null;
}

const handlers = {
  async verifyMemberPin(data) {
    const account = accounts[data.selectedMemberId];
    if (!account || String(account.pin) !== String(data.pin)) fail('permission-denied');
    return { token: 'fake-token:' + encodeURIComponent(data.selectedMemberId) };
  },
  async changeMemberPin(data) {
    const account = accounts[data.memberId];
    if (!account) fail('permission-denied');
    if (['0000', '2217'].includes(String(data.newPin))) fail('invalid-argument', 'Choose a PIN other than 0000 or 2217.', 'pin-too-common');
    account.pin = data.newPin;
    account.claims.mustChangePin = false;
    return { ok: true };
  },
  /* The PIN becomes 0000 until the member chooses a new one. Only an
     administrator resets the PIN of someone with a role. */
  async resetMemberPin(data) {
    if (!accounts[data.memberId]) fail('not-found', 'That member has no account.');
    const config = (await getDoc(doc(null, 'app', 'leaderConfig'))).data() || {};
    const name = data.memberId, rules = permissions();
    const privileged = rules.isAdmin(name, config) || rules.canManageLeaders(name, config) || rules.departmentsForLeader(name, config).length || rules.canEditSongs(name, {}, config);
    if (!isAdmin() && privileged) fail('permission-denied', 'Only an administrator can reset that PIN.', 'privileged-target');
    Object.assign(accounts[data.memberId], { pin: '0000' });
    accounts[data.memberId].claims.mustChangePin = true;
    return { ok: true };
  },
  async listDepartmentRoster(data) {
    mustLead(data.departmentId);
    const snapshot = await getDocs(collection(null, 'departments', data.departmentId, 'members'));
    return { ok: true, departmentId: data.departmentId, members: snapshot.docs.map(item => item.data()) };
  },
  async updateDepartmentProfile(data) {
    mustLead(data.departmentId);
    const before = await profile(data.departmentId, data.memberUid);
    assertFresh(before, data.expectedRevision, data.expectedUpdatedAt);
    const patch = clone(data.patch || {});
    const unknown = Object.keys(patch).find(field => !['status', 'eligibleDuties', 'schedulable', 'availability'].includes(field));
    if (unknown) fail('invalid-argument', 'Profile field is not allowed: ' + unknown + '.', 'field-not-allowed');
    const next = await saveProfile(data.departmentId, data.memberUid, Object.assign({}, before, patch));
    const replacements = patch.availability ? await flagDuties(next, data.departmentId, data.memberUid) : { marked: [], cleared: [] };
    return { ok: true, departmentId: data.departmentId, memberUid: data.memberUid, profile: next, replacements };
  },
  async createDepartmentProfile(data) {
    mustLead(data.departmentId);
    if ((await getDoc(profileRef(data.departmentId, data.memberUid))).exists()) fail('already-exists', 'That member is already in this department.', 'profile-exists');
    const next = Object.assign({ uid: data.memberUid, department: data.departmentId, role: 'member', createdAt: Date.now() }, clone(data), { revision: 0 });
    return { ok: true, departmentId: data.departmentId, memberUid: data.memberUid, profile: await saveProfile(data.departmentId, data.memberUid, next) };
  },
  async assignDepartmentDuty(data) {
    mustLead(data.departmentId);
    const service = await serviceFor(data.serviceId);
    if (!service) fail('not-found', 'That service was moved or deleted.', 'service-missing');
    if (hasStarted(service)) fail('failed-precondition', 'That service has already started.', 'service-started');
    const person = (await getDoc(profileRef(data.departmentId, data.memberUid))).data() || null;
    const why = refusal(person, service, data.duty, service.assignments || {});
    if (why) fail(why === 'no-profile' ? 'not-found' : 'failed-precondition', 'That change is not allowed.', why === 'no-profile' ? 'profile-missing' : why,
      why === 'already-serving' ? { duties: blocking(service.assignments || {}, person, data.duty) } : {});
    await updateDoc(doc(null, 'schedule', data.serviceId), { assignments: Object.assign({}, service.assignments, { [data.duty]: person.memberName }) });
    return { ok: true, override: false };
  },
  async overrideDepartmentAssignment(data) {
    if (!isAdmin()) fail('permission-denied', 'Only an administrator can override.', 'administrator-required');
    if (!data.override || !data.overrideReason) fail('failed-precondition', 'An override needs a reason.', 'explicit-override-required');
    const service = await serviceFor(data.serviceId);
    if (!service) fail('not-found', 'That service was moved or deleted.', 'service-missing');
    await updateDoc(doc(null, 'schedule', data.serviceId), { assignments: Object.assign({}, service.assignments, { [data.duty]: data.memberName }) });
    return { ok: true, override: true, profileMutated: false };
  },
  async unassignDepartmentDuty(data) {
    mustLead(data.departmentId);
    const service = await serviceFor(data.serviceId);
    if (!service) fail('not-found', 'That service was moved or deleted.', 'service-missing');
    if (hasStarted(service)) fail('failed-precondition', 'That service has already started.', 'service-started');
    const assignments = Object.assign({}, service.assignments);
    delete assignments[data.duty];
    await updateDoc(doc(null, 'schedule', data.serviceId), { assignments });
    return { ok: true };
  },
  async updateRoleConfiguration(data) {
    const config = clone((await getDoc(doc(null, 'app', 'leaderConfig'))).data() || {});
    const list = data.roleType === 'songEditor' ? (config.songEditors = config.songEditors || [])
      : ((config.departmentLeaders = config.departmentLeaders || {})[data.department] = config.departmentLeaders[data.department] || []);
    const next = data.enabled ? Array.from(new Set(list.concat(data.memberName))).sort() : list.filter(name => name !== data.memberName);
    if (data.roleType === 'songEditor') config.songEditors = next; else config.departmentLeaders[data.department] = next;
    await setDoc(doc(null, 'app', 'leaderConfig'), config);
    return { ok: true, config };
  },
  async searchDepartmentCandidates(data) {
    const query = String(data.query).toLowerCase();
    // Like the server: accounts, plus members on the list who have never signed in.
    const listed = ((await getDoc(doc(null, 'app', 'members'))).data() || {}).list || [];
    const members = Array.from(new Set(Object.keys(accounts).concat(listed))).filter(name => name.toLowerCase().includes(query)).sort()
      .map(name => ({ memberUid: 'member:' + name, memberName: name }));
    const page = data.page || 1;
    return { ok: true, departmentId: data.departmentId, members: members.slice((page - 1) * 10, page * 10), page, total: members.length };
  },
  async createDepartmentInvitation(data) {
    mustLead(data.departmentId);
    // The real function's token: 32 random bytes as base64url, 43 characters.
    const token = Array.from(crypto.getRandomValues(new Uint8Array(43)), byte => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[byte % 64]).join('');
    const expiresAt = Date.now() + 7 * 24 * 3600 * 1000;
    invites[token] = { departmentId: data.departmentId, status: 'active', expiresAt };
    window.__fakeInvites = invites;
    return { ok: true, token, departmentId: data.departmentId, expiresAt };
  },
  async revokeDepartmentInvitation(data) {
    if (!invites[data.token]) fail('not-found');
    invites[data.token].status = 'revoked';
    return { ok: true, revoked: true };
  },
  async acceptDepartmentInvitation(data) {
    const invite = invites[data.token] || (window.__fixture.invites || {})[data.token];
    if (!invite || invite.status !== 'active' || invite.expiresAt <= Date.now()) fail('failed-precondition', 'The invitation is invalid or expired.', 'invite-invalid');
    const name = me(), uid = 'member:' + name;
    const existing = await getDoc(profileRef(invite.departmentId, uid));
    // Someone already in the department keeps the link unused; an inactive member is told so.
    if (existing.exists()) return { ok: true, departmentId: invite.departmentId, memberUid: uid, alreadyMember: true, inactive: existing.data().status === 'inactive' };
    if (!existing.exists()) {
      await saveProfile(invite.departmentId, uid, { uid, memberUid: uid, department: invite.departmentId, departmentId: invite.departmentId, memberName: name,
        role: 'member', status: 'active', eligibleDuties: [], schedulable: false, availability: { recurring: {}, exceptions: {} }, createdAt: Date.now(), revision: 0 });
    }
    invite.status = 'accepted';
    return { ok: true, departmentId: invite.departmentId, memberUid: uid, alreadyMember: false };
  },
  /* The member's own availability, every department at once; their duties in
     those departments that have not started and fall on a time now marked
     unavailable are flagged for their leader (see flagDuties). */
  async saveMemberAvailability(data) {
    const out = [], marked = [], cleared = [];
    const befores = [];
    for (const entry of data.departments) {
      const before = await profile(entry.departmentId, data.memberUid);
      assertFresh(before, entry.expectedRevision, entry.expectedUpdatedAt);
      befores.push(before);
    }
    for (const [index, entry] of data.departments.entries()) {
      const next = await saveProfile(entry.departmentId, data.memberUid, Object.assign({}, befores[index], { availability: clone(entry.availability) }));
      out.push({ departmentId: entry.departmentId, profile: next });
      const flags = await flagDuties(next, entry.departmentId, data.memberUid);
      marked.push(...flags.marked);
      cleared.push(...flags.cleared);
    }
    return { ok: true, departments: out, replacements: { marked, cleared } };
  },
  /* A request's answer, or a flagged duty's: give the duty to someone, leave
     it open, keep the member on it ('keep'), or decline the request. A
     declined request needs no service, so a moved or deleted one can be
     closed. */
  async resolveDutyAttention(data) {
    mustLead(data.departmentId);
    const ref = doc(null, 'schedule', data.serviceId);
    const service = await serviceFor(data.serviceId);
    let request = null;
    if (data.requestId) {
      const snapshot = await getDoc(doc(null, 'requests', data.requestId));
      if (!snapshot.exists()) fail('not-found', 'The request was not found.', 'request-missing');
      request = snapshot.data();
      if (request.status !== 'pending') fail('failed-precondition', 'That request was already answered or withdrawn.', 'request-closed', { status: request.status });
    }
    const answer = async status => {
      if (data.requestId) await setDoc(doc(null, 'requests', data.requestId), { status, resolvedAt: Date.now(), resolvedByName: me() }, { merge: true });
    };
    if (data.decision === 'declined') {
      await answer('declined');
      return { ok: true, requestStatus: 'declined' };
    }
    if (!service) fail('not-found', 'That service was moved or deleted.', 'service-missing');
    if (hasStarted(service)) fail('failed-precondition', 'That service has already started.', 'service-started');
    const assignments = Object.assign({}, service.assignments);
    const needsReplacement = Object.assign({}, service.needsReplacement);
    const holder = assignments[data.duty] || '';
    // As the server, names are compared in their current spelling (app/nameMap;
    // the made-up names need no built-in spellings).
    const nameMap = ((await getDoc(doc(null, 'app', 'nameMap'))).data() || {}).map || {};
    const current = name => {
      let value = String(name || '').replace(/\s+/g, ' ').trim();
      for (const seen = new Set(); nameMap[value] && !seen.has(value);) { seen.add(value); value = nameMap[value]; }
      return value;
    };
    const differs = (name, other) => current(name) !== current(other);
    if (data.decision === 'keep') {
      // As the server: the flag names who is kept; once it is gone, the name
      // the leader saw (expectedMemberName), and with neither nothing is checked.
      const marker = needsReplacement[data.duty];
      const expected = marker ? marker.memberName : data.expectedMemberName;
      if (expected != null && differs(holder, expected)) fail('failed-precondition', 'That member is no longer on that duty.', 'not-holder', { memberName: holder });
      delete needsReplacement[data.duty];
      await setDoc(ref, Object.assign({}, service, { needsReplacement }));
      return { ok: true, kept: true };
    }
    if (data.expectedMemberName != null && differs(holder, data.expectedMemberName)) {
      fail('aborted', 'This record changed since you loaded it. Reload to see the newer version.', 'changed', { memberName: holder });
    }
    if (request && (!holder || differs(holder, request.name))) fail('failed-precondition', 'That member is no longer on that duty.', 'not-holder', { memberName: holder });
    if (data.replacementMemberUid) {
      const person = (await getDoc(profileRef(data.departmentId, data.replacementMemberUid))).data() || null;
      const why = refusal(person, service, data.duty, assignments);
      if (why) fail(why === 'no-profile' ? 'not-found' : 'failed-precondition', 'That change is not allowed.', why === 'no-profile' ? 'profile-missing' : why,
        why === 'already-serving' ? { duties: blocking(assignments, person, data.duty) } : {});
      assignments[data.duty] = person.memberName;
    } else assignments[data.duty] = '';
    delete needsReplacement[data.duty];
    await setDoc(ref, Object.assign({}, service, { assignments, needsReplacement }));
    await answer('approved');
    return { ok: true, requestStatus: data.requestId ? 'approved' : null };
  },
  async syncSheetNow() { return { ok: true, added: 0, updated: 0, newMembers: 0, waiting: 0, failed: 0, warnings: [] }; },
  /* Manage, Worship: the default for Opening Prayer (the real one also checks
     that the member takes the duty). */
  async setDutyDefault(data) {
    mustLead('Worship');
    const settings = (await getDoc(doc(null, 'app', 'settings'))).data() || {};
    await setDoc(doc(null, 'app', 'settings'), Object.assign({}, settings, { dutyDefaults: Object.assign({}, settings.dutyDefaults, { [data.duty]: data.memberName }) }));
    return { ok: true, duty: data.duty, memberName: data.memberName };
  },
  /* The month planner's save, with the real function's checks. */
  async saveDepartmentAssignments(data) {
    mustLead(data.departmentId);
    const planBatch = 'plan-' + Date.now();
    const services = {}, saved = [], skipped = [];
    for (const change of data.changes) {
      const where = { serviceId: change.serviceId, duty: change.duty };
      if (!(change.serviceId in services)) services[change.serviceId] = await serviceFor(change.serviceId);
      const service = services[change.serviceId];
      if (!service) { skipped.push(Object.assign({ reason: 'no-service' }, where)); continue; }
      if (hasStarted(service)) { skipped.push(Object.assign({ reason: 'service-started' }, where)); continue; }
      const assignments = service.assignments = Object.assign({}, service.assignments);
      const current = assignments[change.duty] || '';
      if (change.expectedMemberName != null && change.expectedMemberName !== current) { skipped.push(Object.assign({ reason: 'changed', memberName: current }, where)); continue; }
      let name = '';
      if (change.memberUid) {
        const snapshot = await getDoc(profileRef(data.departmentId, change.memberUid));
        const person = snapshot.exists() ? snapshot.data() : null;
        const reason = refusal(person, service, change.duty, assignments);
        if (reason) { skipped.push(Object.assign({ reason }, where, reason === 'already-serving' ? { duties: blocking(assignments, person, change.duty) } : {})); continue; }
        name = person.memberName;
      }
      if (name === current) continue;
      assignments[change.duty] = name;
      service.planBatch = planBatch;
      saved.push(Object.assign({ memberName: name, previous: current, date: service.date, service: service.service }, where));
    }
    for (const [id, service] of Object.entries(services)) {
      if (service && service.planBatch === planBatch) await setDoc(doc(null, 'schedule', id), service);
    }
    return { ok: true, departmentId: data.departmentId, planBatch, saved, skipped };
  },
  async checkSheet() {
    const settings = (await getDoc(doc(null, 'app', 'settings'))).data() || {};
    if (!settings.sheetId) fail('failed-precondition', 'Paste the Sheet\'s link first.', 'sheet-not-set');
    return { ok: true, account: 'server@example.test', tabs: ['2026 Entry'], services: 40, notInApp: 0, notInSheet: 2,
      differences: [{ service: '2026-07-11_morning', duty: 'Usher Door', sheet: 'S. Grace', app: 'S. Leah' }], differenceCount: 1, warnings: [] };
  },
  /* Every Saturday (three services) and Tuesday (evening) from December 1
     of the year through the next December, as the real function adds them. */
  async addServiceYear(data) {
    const pattern = { 6: [['Morning', '10:00'], ['Afternoon', '14:30'], ['Evening', '19:30']], 2: [['Evening', '19:30']] };
    const day = new Date(Date.UTC(data.year, 11, 1));
    let added = 0;
    for (; day <= new Date(Date.UTC(data.year + 1, 11, 31)); day.setUTCDate(day.getUTCDate() + 1)) {
      const date = day.toISOString().slice(0, 10);
      for (const [label, time] of pattern[day.getUTCDay()] || []) {
        const id = date + '_' + slug(label);
        if ((await getDoc(doc(null, 'schedule', id))).exists()) continue;
        await setDoc(doc(null, 'schedule', id), { date, time, service: label, worship: day.getUTCDay() === 6 ? 'Sabbath Day' : 'Third Day', choirSong: '', assignments: {} });
        added++;
      }
    }
    await setDoc(doc(null, 'app', 'settings'), { feastNotice: { year: data.year + 1 } }, { merge: true });
    return { ok: true, added, sheetRows: 0, from: data.year + '-12-01', to: (data.year + 1) + '-12-31' };
  }
};

export const getFunctions = () => ({ fake: true });
export function httpsCallable(_functions, name) {
  return async payload => {
    calls.push({ name, payload: clone(payload) });
    const delay = (window.__fakeDelay || {})[name];
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    const failure = (window.__fakeFail || {})[name];
    const told = typeof failure === 'function' ? failure(payload) : failure;
    // A refusal ({ code, reason, message }), or a code alone as when the call never reaches the server.
    if (told && typeof told === 'object') fail(told.code, told.message || told.code, told.reason || '');
    if (told) throw Object.assign(new Error('The fake ' + name + ' was told to fail.'), { code: 'functions/' + told });
    if (!handlers[name]) fail('not-found', 'No fake for ' + name);
    return { data: await handlers[name](payload) };
  };
}

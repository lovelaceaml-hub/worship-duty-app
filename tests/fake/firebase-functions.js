/* TEST ONLY. Stand-in for the app's Cloud Functions, working on the fake
   Firestore data. Each handler does what the real one does for the screens;
   the real server's checks live in functions/ and its own tests. */
import { doc, getDoc, getDocs, collection, setDoc, updateDoc } from './firebase-firestore.js';

const accounts = window.__fakeAccounts = window.__fakeAccounts || structuredClone((window.__fixture || {}).accounts || {});
const invites = {};
const calls = window.__fakeCalls = [];

function fail(code, message = code) { throw Object.assign(new Error(message), { code: 'functions/' + code }); }
const me = () => decodeURIComponent((sessionStorage.getItem('fake-auth-member') || ''));
const profileRef = (department, uid) => doc(null, 'departments', department, 'members', uid);
const clone = value => structuredClone(value);

async function profile(department, uid) {
  const snapshot = await getDoc(profileRef(department, uid));
  if (!snapshot.exists()) fail('not-found', 'The department member profile was not found.');
  return snapshot.data();
}

async function saveProfile(department, uid, next) {
  next.updatedAt = Date.now();
  next.updatedBy = me();
  next.revision = (Number(next.revision) || 0) + 1;
  await setDoc(profileRef(department, uid), next);
  return next;
}

function slug(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

function availableAt(profileData, date, key) {
  const availability = profileData.availability || {};
  const exception = (availability.exceptions || {})[date];
  if (exception && exception[key]) return exception[key];
  if (exception && exception['*']) return exception['*'];
  return (availability.recurring || {})[key] || 'unknown';
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
    account.pin = data.newPin;
    account.claims.mustChangePin = false;
    return { ok: true };
  },
  async resetMemberPin(data) {
    if (!accounts[data.memberId]) fail('not-found', 'That member has no account.');
    accounts[data.memberId].claims.mustChangePin = true;
    return { ok: true };
  },
  async listDepartmentRoster(data) {
    const snapshot = await getDocs(collection(null, 'departments', data.departmentId, 'members'));
    return { ok: true, departmentId: data.departmentId, members: snapshot.docs.map(item => item.data()) };
  },
  async updateDepartmentProfile(data) {
    const next = Object.assign(await profile(data.departmentId, data.memberUid), clone(data.patch));
    return { ok: true, departmentId: data.departmentId, memberUid: data.memberUid, profile: await saveProfile(data.departmentId, data.memberUid, next) };
  },
  async updateMemberAvailability(data) { return handlers.updateDepartmentProfile(data); },
  async createDepartmentProfile(data) {
    const next = Object.assign({ uid: data.memberUid, department: data.departmentId, role: 'member' }, clone(data));
    return { ok: true, departmentId: data.departmentId, memberUid: data.memberUid, profile: await saveProfile(data.departmentId, data.memberUid, next) };
  },
  async assignDepartmentDuty(data) {
    await updateDoc(doc(null, 'schedule', data.serviceId), { ['assignments']: Object.assign({}, (await getDoc(doc(null, 'schedule', data.serviceId))).data().assignments, { [data.duty]: data.memberName }) });
    return { ok: true, override: false };
  },
  async overrideDepartmentAssignment(data) {
    await handlers.assignDepartmentDuty(data);
    return { ok: true, override: true, profileMutated: false };
  },
  async unassignDepartmentDuty(data) {
    const service = (await getDoc(doc(null, 'schedule', data.serviceId))).data();
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
    const members = Object.keys(accounts).filter(name => name.toLowerCase().includes(query)).sort()
      .map(name => ({ memberUid: 'member:' + name, memberName: name }));
    const page = data.page || 1;
    return { ok: true, departmentId: data.departmentId, members: members.slice((page - 1) * 10, page * 10), page, total: members.length };
  },
  async createDepartmentInvitation(data) {
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
    if (!invite || invite.status !== 'active' || invite.expiresAt <= Date.now()) fail('failed-precondition', 'The invitation is invalid or expired.');
    const name = me(), uid = 'member:' + name;
    const existing = await getDoc(profileRef(invite.departmentId, uid));
    if (!existing.exists()) {
      await saveProfile(invite.departmentId, uid, { uid, memberUid: uid, department: invite.departmentId, departmentId: invite.departmentId, memberName: name,
        role: 'member', status: 'active', eligibleDuties: [], schedulable: false, availability: { recurring: {}, exceptions: {} } });
    }
    invite.status = 'accepted';
    return { ok: true, departmentId: invite.departmentId, memberUid: uid, alreadyMember: existing.exists() };
  },
  async saveMemberAvailability(data) {
    const out = [], marked = [];
    for (const entry of data.departments) {
      const next = Object.assign(await profile(entry.departmentId, data.memberUid), { availability: clone(entry.availability) });
      out.push({ departmentId: entry.departmentId, profile: await saveProfile(entry.departmentId, data.memberUid, next) });
      const schedule = await getDocs(collection(null, 'schedule'));
      for (const item of schedule.docs) {
        const service = item.data();
        Object.entries(service.assignments || {}).forEach(([duty, name]) => {
          if (name !== next.memberName || availableAt(next, service.date, slug(service.service)) !== 'unavailable') return;
          marked.push({ serviceId: item.id, duty });
          service.needsReplacement = Object.assign({}, service.needsReplacement, { [duty]: { memberName: name, memberUid: data.memberUid, departmentId: entry.departmentId, reason: 'unavailable', since: Date.now() } });
        });
        if (service.needsReplacement) await setDoc(doc(null, 'schedule', item.id), service);
      }
    }
    return { ok: true, departments: out, replacements: { marked, cleared: [] } };
  },
  async resolveDutyAttention(data) {
    const ref = doc(null, 'schedule', data.serviceId);
    const service = (await getDoc(ref)).data();
    if (data.decision !== 'declined') {
      const assignments = Object.assign({}, service.assignments);
      if (data.replacementMemberUid) assignments[data.duty] = (await profile(data.departmentId, data.replacementMemberUid)).memberName;
      else assignments[data.duty] = '';
      const needsReplacement = Object.assign({}, service.needsReplacement);
      delete needsReplacement[data.duty];
      await setDoc(ref, Object.assign({}, service, { assignments, needsReplacement }));
    }
    if (data.requestId) {
      await setDoc(doc(null, 'requests', data.requestId), { status: data.decision, resolvedAt: Date.now(), resolvedByName: me() }, { merge: true });
    }
    return { ok: true, requestStatus: data.decision || null };
  },
  async syncSheetNow() { return { ok: true, added: 0, updated: 0, newMembers: 0, warnings: [] }; }
};

export const getFunctions = () => ({ fake: true });
export function httpsCallable(_functions, name) {
  return async payload => {
    calls.push({ name, payload: clone(payload) });
    if (!handlers[name]) fail('not-found', 'No fake for ' + name);
    return { data: await handlers[name](payload) };
  };
}

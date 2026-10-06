'use strict';

/* The Cloud Functions of the LV Zion worship duty app. This file wires them
   up; each area lives in its own module:
   - accounts.js: sign-in, PINs and Manage, Leaders;
   - department-handlers.js, workflows.js, membership.js: departments,
     assignments, availability, change requests and adding members;
   - notify.js and schedule-projection.js: what follows a schedule write,
     every alert and the day-before reminders;
   - sheet-io.js: the Google Sheet, both ways, and the planning year;
   - public-endpoints.js: the calendar feed and the public schedule.
   Every callable goes through callable() below, which checks who is calling
   and turns any error into one the app can show: an HttpsError whose
   details.reason is a short stable code (refusals.js). The export names are
   what scripts/deploy-functions.mjs deploys; they never change. */

const { onDocumentWritten, onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getMessaging } = require('firebase-admin/messaging');
const { TIME_ZONE: TZ, pacificDate } = require('./time');
const permissions = require('./permissions');
const { createDepartmentHandlers } = require('./department-handlers');
const { createWorkflowHandlers } = require('./workflows');
const { createMembershipHandlers } = require('./membership');
const { createSheets, accountEmail } = require('./sheets');
const { canonicalName } = require('./names');
const { addServingMembers } = require('./serving-members');
const { setDutyDefault } = require('./duty-defaults');
const { renameMember: renameMemberEverywhere } = require('./rename-member');
const appDocs = require('./app-docs');
const { MESSAGES, refusal, detailsFor } = require('./refusals');
const { createAccounts } = require('./accounts');
const { createNotifier } = require('./notify');
const { reconcileScheduleAssignmentProjection } = require('./schedule-projection');
const { createPublicEndpoints } = require('./public-endpoints');
const { createSheetIo } = require('./sheet-io');

initializeApp();
const db = getFirestore();
const REGION = 'us-central1';
const departmentHandlers = createDepartmentHandlers({ db, now: () => Date.now() });
const workflowHandlers = createWorkflowHandlers({ db, now: () => Date.now(), logger });
const membershipHandlers = createMembershipHandlers({ db, now: () => Date.now() });
const accounts = createAccounts({ db, auth: getAuth(), logger });
const notifier = createNotifier({ db, messaging: getMessaging(), logger });
const sheetIo = createSheetIo({ db, logger, notifier, createSheets, accountEmail });
const publicEndpoints = createPublicEndpoints({ db });
const loadSettings = () => appDocs.loadSettings(db);
const switchOn = appDocs.switchOn;
const runtimePermissionConfig = () => appDocs.runtimePermissionConfig(db);

/* ---- who is calling ---- */

/* The signed-in member's account, checked against their sign-in token: the
   same uid, a current role version (a role change or a PIN reset ends older
   sessions) and still in use. */
async function readCurrentAccount(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'A verified member session is required.', { reason: 'sign-in-required' });
  const token = request.auth.token || {};
  const memberId = String(token.memberId || '').trim();
  if (!memberId) throw new HttpsError('permission-denied', 'The signed-in member account is missing.', { reason: 'session-ended' });
  const snapshot = await db.collection('accounts').doc(memberId).get();
  if (!snapshot.exists) throw new HttpsError('permission-denied', 'The signed-in member account is missing.', { reason: 'session-ended' });
  const account = Object.assign({ id: snapshot.id }, snapshot.data() || {});
  const expectedUid = String(account.authUid || `member:${memberId}`);
  if (expectedUid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'The signed-in member account is invalid.', { reason: 'session-ended' });
  }
  // An account written before role versions existed counts as version 1,
  // as sign-in and the database rules count it.
  const roleVersion = account.roleVersion === undefined ? 1 : account.roleVersion;
  if (!Number.isSafeInteger(token.roleVersion)
      || !Number.isSafeInteger(roleVersion)
      || token.roleVersion !== roleVersion) {
    throw new HttpsError('permission-denied', 'The member role has changed. Sign in again.', { reason: 'session-ended' });
  }
  if (account.active === false) {
    throw new HttpsError('permission-denied', 'The member account is inactive.', { reason: 'account-inactive' });
  }
  return { memberId, account };
}

function roleNames(account) {
  const roles = Array.isArray(account.roles)
    ? account.roles.filter(role => typeof role === 'string' && role.trim())
    : [];
  if (!roles.length && typeof account.role === 'string' && account.role.trim()) roles.push(account.role);
  if (!roles.length) roles.push('member');
  return Array.from(new Set(roles));
}

/* The caller's rights as their account holds them now, in the shape of a
   sign-in token, so handlers never act on a token's older claims. */
function currentTokenForAccount(requestToken, account, memberId) {
  const roles = roleNames(account);
  const normalizedRoles = new Set(roles.map(role => String(role).trim().toLocaleLowerCase().replace(/[^a-z0-9]/g, '')));
  const departments = Array.isArray(account.departments)
    ? account.departments.filter(value => typeof value === 'string' && value.trim())
    : [];
  return Object.assign({}, requestToken, {
    memberId: account.memberId || memberId,
    memberName: account.memberName || account.name || memberId,
    role: account.role || roles[0],
    roles,
    departments,
    departmentIds: Array.isArray(account.departmentIds) ? account.departmentIds : departments,
    departmentLeaders: account.departmentLeaders && typeof account.departmentLeaders === 'object'
      ? account.departmentLeaders
      : {},
    permissions: Array.isArray(account.permissions) ? account.permissions : [],
    admin: account.admin === true || normalizedRoles.has('admin') || normalizedRoles.has('administrator'),
    globalLeaderManager: account.globalLeaderManager === true || normalizedRoles.has('globalleadermanager'),
    departmentLeader: account.departmentLeader === true || normalizedRoles.has('departmentleader') || normalizedRoles.has('leader'),
    songEditor: account.songEditor === true || normalizedRoles.has('songeditor'),
    mustChangePin: account.mustChangePin === true,
    roleVersion: account.roleVersion === undefined ? 1 : account.roleVersion
  });
}

/* A current member who has chosen their own PIN, as handlers see them. */
async function callableActor(request) {
  const current = await readCurrentAccount(request);
  const token = currentTokenForAccount(request.auth.token || {}, current.account, current.memberId);
  if (token.mustChangePin === true) {
    throw new HttpsError('failed-precondition', 'Change your PIN before using privileged actions.', { reason: 'pin-change-required' });
  }
  return Object.assign({
    uid: request.auth.uid,
    token,
    currentAccount: current.account
  }, token);
}

/* ---- one way in for every callable ---- */

const ERROR_CODES = new Set([
  'cancelled', 'invalid-argument', 'deadline-exceeded', 'not-found',
  'already-exists', 'permission-denied', 'resource-exhausted',
  'failed-precondition', 'aborted', 'out-of-range', 'unauthenticated',
  'unavailable', 'data-loss'
]);
// Firestore's own errors carry gRPC numbers: a transaction that kept
// meeting other writes (10), or a timeout or outage (4, 14).
const GRPC_CODES = Object.freeze({ 4: 'deadline-exceeded', 10: 'aborted', 14: 'unavailable' });

/* Any error as one the app can show. One the handlers did not expect is
   logged and reported in general words, never with its own text. */
function asHttpsError(error, unavailable) {
  if (error && ERROR_CODES.has(error.code)) {
    return new HttpsError(error.code, String(error.message || unavailable), detailsFor(error, error.code));
  }
  const code = (error && GRPC_CODES[error.code]) || 'internal';
  logger.error('Callable failed', { code, error: String(error && error.message || error) });
  return code === 'aborted'
    ? new HttpsError('aborted', MESSAGES.changed, { reason: 'changed' })
    : new HttpsError(code, unavailable, { reason: 'server-error' });
}

/* A callable. `access` says who may call it: 'anyone' (signing in),
   'session' (a current session, also one that must still choose its PIN),
   'member' (a current member with their own PIN) or 'admin' (an
   administrator). Handlers get the verified caller as request.auth. */
function callable(access, handler, { unavailable = 'The server could not finish that. Try again.', refused } = {}) {
  return onCall({ region: REGION }, async request => {
    try {
      if (access === 'anyone') return await handler(request);
      if (access === 'session') {
        await readCurrentAccount(request);
        return await handler(request);
      }
      const actor = await callableActor(request);
      if (access === 'admin' && !permissions.isAdmin(actor, await runtimePermissionConfig())) {
        throw refusal('permission-denied', 'administrator-required', refused);
      }
      // An administrator, or the leader of any department.
      if (access === 'leader' && !permissions.departmentsForLeader(actor, await runtimePermissionConfig()).length) {
        throw refusal('permission-denied', 'not-allowed', refused);
      }
      return await handler({ ...request, auth: actor });
    } catch (error) {
      throw asHttpsError(error, unavailable);
    }
  });
}

/* ---- sign-in, PINs and leaders (accounts.js) ---- */

const SIGN_IN = { unavailable: 'The member authentication service is unavailable.' };
exports.verifyMemberPin = callable('anyone', accounts.verifyMemberPin, SIGN_IN);
// Choosing one's own PIN needs a current session, not a changed PIN: this
// is how a new or reset PIN is replaced.
exports.changeMemberPin = callable('session', accounts.changeMemberPin, SIGN_IN);
exports.resetMemberPin = callable('member', accounts.resetMemberPin, SIGN_IN);
exports.updateRoleConfiguration = callable('member', accounts.updateRoleConfiguration);

/* ---- departments, assignments, availability and requests ---- */

const DEPARTMENT = { unavailable: 'The department authorization service is unavailable.' };
exports.updateDepartmentProfile = callable('member', departmentHandlers.updateDepartmentProfile, DEPARTMENT);
exports.listDepartmentRoster = callable('member', departmentHandlers.listDepartmentRoster, DEPARTMENT);
exports.updateMemberAvailability = callable('member', departmentHandlers.updateMemberAvailability, DEPARTMENT);
exports.createDepartmentProfile = callable('member', departmentHandlers.createDepartmentProfile, DEPARTMENT);
exports.assignDepartmentDuty = callable('member', departmentHandlers.assignDepartmentDuty, DEPARTMENT);
exports.unassignDepartmentDuty = callable('member', departmentHandlers.unassignDepartmentDuty, DEPARTMENT);
exports.overrideDepartmentAssignment = callable('member', departmentHandlers.overrideDepartmentAssignment, DEPARTMENT);
exports.saveMemberAvailability = callable('member', workflowHandlers.saveMemberAvailability, DEPARTMENT);
exports.resolveDutyAttention = callable('member', workflowHandlers.resolveDutyAttention, DEPARTMENT);

/* The month planner's save. Members hear about their new duties in one
   notification each, however many services the save touched. */
exports.saveDepartmentAssignments = callable('member', async request => {
  const result = await departmentHandlers.saveDepartmentAssignments(request);
  try {
    await notifier.alertPlanned(result.saved);
  } catch (error) {
    logger.error('Planner alerts failed', { error: String(error && error.message || error) });
  }
  return result;
}, DEPARTMENT);

/* Adding members by name search or invite link. callable() only
   establishes the verified, active, current-role, no-forced-PIN caller; each
   handler checks rights on top. Search, create and revoke need a leader of
   the department; accept does not, because any signed-in member may use an
   invite link they were sent. */
exports.searchDepartmentCandidates = callable('member', membershipHandlers.searchDepartmentCandidates, DEPARTMENT);
exports.createDepartmentInvitation = callable('member', membershipHandlers.createDepartmentInvitation, DEPARTMENT);
exports.revokeDepartmentInvitation = callable('member', membershipHandlers.revokeDepartmentInvitation, DEPARTMENT);
exports.acceptDepartmentInvitation = callable('member', membershipHandlers.acceptDepartmentInvitation, DEPARTMENT);

/* Manage, Worship: the default for Opening Prayer. The Worship leaders and
   administrators (duty-defaults.js). */
exports.setDutyDefault = callable('member', async request => {
  const result = await setDutyDefault({ db, actor: request.auth, config: await runtimePermissionConfig(), data: request.data || {} });
  logger.info('setDutyDefault', { duty: result.duty, set: !!result.memberName });
  return result;
});

/* ---- after every schedule write: the assignment records, the Sheet's
   grid, new-duty alerts (switch: notifications) and deleted services. Each
   runs on its own, so one that fails does not stop the others. ---- */
exports.onScheduleWrite = onDocumentWritten(
  { document: 'schedule/{id}', region: REGION },
  async (event) => {
    const existed = !!(event.data && event.data.before && event.data.before.exists);
    const before = existed ? event.data.before.data() || {} : {};
    const afterSnapshot = event.data && event.data.after;
    const after = afterSnapshot && afterSnapshot.exists ? afterSnapshot.data() || {} : null;
    const steps = [
      ['projection', () => reconcileScheduleAssignmentProjection({ db, logger }, event.params.id, before, after || { ...before, assignments: {} })],
      ['sheet', () => sheetIo.writeBack(event.params.id, before, after, existed)],
      ['alerts', () => notifier.alertScheduleWrite(before, after, existed)],
      ['deletions', () => sheetIo.noteDeletion(event.params.id, before, after, existed)]
    ];
    for (const [step, run] of steps) {
      try {
        await run();
      } catch (error) {
        logger.error('onScheduleWrite: ' + step + ' failed', { service: event.params.id, error: String(error && error.message || error) });
      }
    }
  });

/* ---- reminders and change-request alerts (notify.js) ---- */

/* The day before a duty (switch: reminders). */
exports.dutyReminders = onSchedule(
  { schedule: 'every 60 minutes', timeZone: TZ, region: REGION },
  async () => {
    await notifier.sendReminders();
  });

/* A change request sent: that department's leaders and the scheduler
   (Manage, Features) hear, never the member who asked. */
exports.onRequestCreated = onDocumentCreated(
  { document: 'requests/{id}', region: REGION },
  async event => {
    const request = event.data && event.data.exists ? event.data.data() || {} : null;
    if (request) await notifier.alertRequestCreated(event.params.id, request);
  });

/* A change request answered: the member hears. */
exports.onRequestResolved = onDocumentUpdated(
  { document: 'requests/{id}', region: REGION },
  async event => {
    const before = event.data && event.data.before;
    const after = event.data && event.data.after;
    if (!before || !before.exists || !after || !after.exists) return;
    await notifier.alertRequestResolved(event.params.id, before.data() || {}, after.data() || {});
  });

/* Feedback marked done: the member who sent it hears. */
exports.onFeedbackDone = onDocumentUpdated(
  { document: 'feedback/{id}', region: REGION },
  async event => {
    const before = event.data && event.data.before;
    const after = event.data && event.data.after;
    if (!before || !before.exists || !after || !after.exists) return;
    await notifier.alertFeedbackDone(event.params.id, before.data() || {}, after.data() || {});
  });

/* ---- the public calendar feed and schedule (public-endpoints.js). Few
   instances: neither needs more, and they are open to anyone. ---- */
exports.ics = onRequest({ region: REGION, maxInstances: 5 }, publicEndpoints.ics);
exports.publicSchedule = onRequest({ region: REGION, maxInstances: 5 }, publicEndpoints.publicSchedule);

/* ---- the Google Sheet (sheet-io.js) ---- */

/* Every 10 minutes the Sheet is read, and merged into the schedule when it
   changed (sheet-io.js). The Google Sheet import switch in Manage, Features
   turns it off. */
exports.scheduledSheetSync = onSchedule(
  { schedule: 'every 10 minutes', timeZone: TZ, region: REGION },
  async () => {
    if (!switchOn(await loadSettings(), 'sheetSync')) return;
    try {
      await sheetIo.importSheet();
    } catch (error) {
      logger.error('scheduledSheetSync: import failed', { error: String(error && error.message || error) });
    }
  });

/* Manage, Import now: imports even when the Sheet looks unchanged.
   Administrators and department leaders. */
exports.syncSheetNow = callable('leader', async () => Object.assign({ ok: true }, await sheetIo.importSheet({ force: true })),
  { refused: 'Only a leader or an administrator can import the sheet.' });

/* Manage, Data, Check the Sheet: compares the Sheet with the app, changing
   nothing. Administrators and department leaders. */
exports.checkSheet = callable('leader', () => sheetIo.checkSheet(), { refused: 'Only a leader or an administrator can check the Sheet.' });

/* Manage, Data: a planning year of regular services. Administrators only. */
exports.addServiceYear = callable('admin', async request => {
  const year = Number(request.data && request.data.year);
  if (!Number.isInteger(year) || year < 2026 || year > 2100) throw refusal('invalid-argument', 'invalid-input', 'Choose a year.');
  return Object.assign({ ok: true }, await sheetIo.addServiceYear(year));
}, { refused: 'Only an administrator can add a year of services.' });

/* Every November 1: December through the next December. A run that fails
   is tried again (it only adds what is missing). */
exports.yearlyServices = onSchedule(
  { schedule: '0 6 1 11 *', timeZone: TZ, region: REGION, retryCount: 3 },
  async () => {
    logger.info('yearlyServices: done', await sheetIo.addServiceYear(Number(pacificDate().slice(0, 4))));
  });

/* ---- members and song lists ---- */

/* Every night: everyone who has served in a department's duties gets a
   profile there (inactive when they have not served there in 35 days), so
   the planner can offer them. Profiles that already exist are left alone. */
exports.servingMembers = onSchedule(
  { schedule: '30 3 * * *', timeZone: TZ, region: REGION },
  async () => {
    try {
      const nameMap = await appDocs.loadNameMap(db);
      const result = await addServingMembers(db, { today: pacificDate(), canonicalName: name => canonicalName(name, nameMap), logger });
      logger.info('servingMembers: done', { added: result.added.length, widened: result.widened.length, unmatched: result.unmatched });
    } catch (error) {
      logger.error('servingMembers: failed', { error: String(error && error.message || error) });
    }
  });

/* Manage, Data, Fix a member's name. Administrators only. */
exports.renameMember = callable('admin', async request => {
  const data = request.data || {};
  try {
    const result = await renameMemberEverywhere(db, { from: data.from, to: data.to, auth: getAuth(), newAccount: name => accounts.newAccount(name) });
    logger.info('renameMember', result);
    return Object.assign({ ok: true }, result);
  } catch (error) {
    if (error && ['invalid-argument', 'not-found'].includes(error.code)) {
      throw refusal(error.code, error.code === 'not-found' ? 'not-on-list' : 'invalid-input', error.message);
    }
    // Every step can run again, so the same fix finishes the job.
    logger.error('renameMember failed', { error: String(error && error.message || error) });
    throw refusal('aborted', 'rename-incomplete');
  }
}, { refused: 'Only an administrator can fix a name.' });

/* Every 30 minutes, record confirmed song lists as sung once their service
   ended (three hours after it started). A second run finds them sung and
   does nothing. */
exports.songHistoryRecorder = onSchedule(
  { schedule: 'every 30 minutes', timeZone: TZ, region: REGION },
  async () => {
    await workflowHandlers.recordSongHistory();
  }
);

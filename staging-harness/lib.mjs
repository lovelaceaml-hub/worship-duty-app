'use strict';

/*
 * Shared helpers for the one-time staging harness (docs/PLAN-COMPACT-STAGING.md
 * section 2). Talks only to local Firebase emulators. Every function here
 * either wraps the Admin SDK (already pointed at the emulators through
 * FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST) or makes a plain
 * HTTP call to an emulator REST endpoint. Nothing here can reach production:
 * the project id is always the demo- prefixed id, which Firebase guarantees
 * has no real backend.
 */

import admin from 'firebase-admin';

export const PROJECT_ID = 'demo-lv-zion-duties';
export const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
export const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';

if (!process.env.FIRESTORE_EMULATOR_HOST) process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
if (!process.env.GCLOUD_PROJECT) process.env.GCLOUD_PROJECT = PROJECT_ID;

let app;
export function getApp() {
  if (!app) {
    app = admin.initializeApp({ projectId: PROJECT_ID });
  }
  return app;
}

export function db() {
  return admin.firestore(getApp());
}

export function auth() {
  return admin.auth(getApp());
}

/* ---- Pacific-time date helpers (byte-for-byte the same logic as
   functions/index.js dateInTimeZone / laStartMs, duplicated because the
   harness must not require production files by path trickery). ---- */
const TZ = 'America/Los_Angeles';

export function dateInTimeZone(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function paDateOffset(days) {
  return dateInTimeZone(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
}

/* ---- Recorder date-floor fixtures (absolute, never relative to the run
   date) matching functions/compact-workflows.js SONG_HISTORY_FLOOR_DATE.
   RECORDER_NOW is the clock the recorder checks run against, so both
   fixtures are always well past their 3-hour window and the ONLY difference
   between them is which side of the floor their service date falls on. ---- */
export const SONG_HISTORY_FLOOR_DATE = '2026-09-17';
export const BELOW_FLOOR_SERVICE_ID = '2026-09-16_evening-below-floor';
export const AT_FLOOR_SERVICE_ID = '2026-09-17_morning-at-floor';
export const PRE_FLOOR_PAST_SERVICE_ID = '2026-09-15_evening-past';
export const PRE_FLOOR_PAST2_SERVICE_ID = '2026-09-16_morning-past2';
export const UNCONFIRMED_SERVICE_ID = '2026-09-18_evening-unconfirmed';
export const RECORDER_NOW = Date.parse('2026-09-19T12:00:00-07:00');

/* Department profile documents and departmentAssignments records are keyed
   by the member's Firebase Auth uid (what functions/index.js calls
   `account.authUid`, defaulting to `member:${memberId}`), never by the
   display name. This mirrors that convention everywhere in the harness. */
export function authUidFor(memberId) {
  return `member:${memberId}`;
}

/* ---- token construction, mirrors functions/index.js currentTokenForAccount ---- */
function roleNames(account) {
  const roles = Array.isArray(account.roles)
    ? account.roles.filter(role => typeof role === 'string' && role.trim())
    : [];
  if (!roles.length && typeof account.role === 'string' && account.role.trim()) roles.push(account.role);
  if (!roles.length) roles.push('member');
  return Array.from(new Set(roles));
}

export function currentTokenForAccount(requestToken, account, memberId) {
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
    roleVersion: account.roleVersion
  });
}

/* Reads the seeded accounts/{memberId} doc and builds a request.auth object
   exactly shaped the way functions/index.js's callableActor builds one, so
   every handler under test sees the same actor shape production code
   produces. Rereading on every call (rather than caching) mirrors the
   production "recheck inside the transaction" contract. */
export async function actorFor(memberId) {
  const snapshot = await db().collection('accounts').doc(memberId).get();
  if (!snapshot.exists) throw new Error(`No seeded account for ${memberId}`);
  const account = Object.assign({ id: snapshot.id }, snapshot.data());
  const uid = String(account.authUid || `member:${memberId}`);
  const token = currentTokenForAccount({}, account, memberId);
  return { uid, token, currentAccount: account };
}

export async function requestFor(memberId, data) {
  const auth = await actorFor(memberId);
  return { auth, data };
}

/* ---- Auth emulator: create a fictional user + custom claims, and mint a
   real ID token for the firestore.rules REST checks. ---- */
export async function ensureAuthUser(uid, claims) {
  try {
    await auth().getUser(uid);
  } catch (_error) {
    await auth().createUser({ uid });
  }
  await auth().setCustomUserClaims(uid, claims);
}

export async function mintIdToken(uid) {
  const customToken = await auth().createCustomToken(uid);
  const resp = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    }
  );
  const json = await resp.json();
  if (!json.idToken) throw new Error(`mintIdToken failed for ${uid}: ${JSON.stringify(json)}`);
  return json.idToken;
}

/* ---- Firestore emulator REST helpers, used only for the firestore.rules
   checks (test 11), which must go through the rules engine rather than the
   Admin SDK (the Admin SDK bypasses rules entirely). ---- */
function restBase() {
  return `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
}

export async function restGet(path, idToken) {
  const resp = await fetch(`${restBase()}/${path}`, {
    headers: idToken ? { Authorization: `Bearer ${idToken}` } : {}
  });
  const json = await resp.json().catch(() => ({}));
  return { status: resp.status, ok: resp.ok, body: json };
}

function encodeFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  if (typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeFirestoreValue(v)])) } };
  }
  throw new Error(`Cannot encode value of type ${typeof value}`);
}

/* PATCH with an explicit updateMask naming every field in `fields` (the
   default): any field not in the mask keeps its stored value, and only the
   fields IN the mask are compared old vs new for diff().affectedKeys().
   With { fullReplace: true } the updateMask query param is omitted, which
   Firestore's REST API documents as a full overwrite of the document -
   fields not present in `fields` are deleted, exactly like the client SDK's
   setDoc(ref, wholeObject). Used to faithfully test full-document writes. */
export async function restPatch(path, fields, idToken, options = {}) {
  const query = options.fullReplace
    ? ''
    : `?${Object.keys(fields).map(key => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join('&')}`;
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encodeFirestoreValue(v)])) };
  const resp = await fetch(`${restBase()}/${path}${query}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
    },
    body: JSON.stringify(body)
  });
  const json = await resp.json().catch(() => ({}));
  return { status: resp.status, ok: resp.ok, body: json };
}

/* ---- tiny pass/fail collector ---- */
export function createReport() {
  const rows = [];
  return {
    rows,
    pass(name, detail) { rows.push({ name, pass: true, detail: detail || '' }); console.log(`PASS  ${name}${detail ? ' - ' + detail : ''}`); },
    fail(name, detail) { rows.push({ name, pass: false, detail: detail || '' }); console.log(`FAIL  ${name}${detail ? ' - ' + detail : ''}`); },
    async check(name, fn) {
      try {
        const detail = await fn();
        this.pass(name, detail);
      } catch (error) {
        this.fail(name, error && error.message ? error.message : String(error));
      }
    },
    summary() {
      const passed = rows.filter(r => r.pass).length;
      return { passed, failed: rows.length - passed, total: rows.length };
    }
  };
}

export function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

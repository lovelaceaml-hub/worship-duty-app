import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const rulesPath = path.join(projectRoot, 'firestore.rules');
const rules = fs.readFileSync(rulesPath, 'utf8');

function matchBody(marker) {
  const matchMarker = `match ${marker}`;
  const start = rules.indexOf(matchMarker);
  assert.notEqual(start, -1, `missing rules match ${marker}`);
  const openingBrace = rules.indexOf('{', start + matchMarker.length);
  assert.notEqual(openingBrace, -1, `missing opening brace for ${marker}`);

  let depth = 0;
  for (let index = openingBrace; index < rules.length; index += 1) {
    if (rules[index] === '{') depth += 1;
    if (rules[index] === '}') depth -= 1;
    if (depth === 0) return rules.slice(openingBrace + 1, index);
  }

  throw new Error(`unclosed rules match ${marker}`);
}

function functionBody(name) {
  const marker = `function ${name}(`;
  const start = rules.indexOf(marker);
  assert.notEqual(start, -1, `missing rules function ${name}`);
  const openingBrace = rules.indexOf('{', start + marker.length);
  assert.notEqual(openingBrace, -1, `missing opening brace for ${name}`);

  let depth = 0;
  for (let index = openingBrace; index < rules.length; index += 1) {
    if (rules[index] === '{') depth += 1;
    if (rules[index] === '}') depth -= 1;
    if (depth === 0) return rules.slice(openingBrace + 1, index);
  }

  throw new Error(`unclosed rules function ${name}`);
}

test('rules declare the authenticated claims contract and deny unknown paths', () => {
  assert.match(rules, /rules_version\s*=\s*'2'/);
  assert.match(rules, /request\.auth\.token\.roles is list/);
  assert.match(rules, /request\.auth\.token\.departments is list/);
  assert.match(rules, /request\.auth\.token\.memberName is string/);
  assert.match(rules, /function isAdmin\(\)/);
  assert.match(rules, /function isGlobalLeaderManager\(\)/);
  assert.match(rules, /function managesDepartment\(department\)/);
  assert.match(rules, /function canAcknowledgeScheduleConflict\(\)/);
  assert.match(rules, /match \/\{document=\*\*\}/);
  assert.match(rules, /allow read, write: if false;/);
});

test('department management requires explicit leader authority and scoped membership', () => {
  const authority = functionBody('hasDepartmentLeaderAuthority');
  const manages = functionBody('managesDepartment');

  assert.match(authority, /hasRole\('departmentLeader'\)/);
  assert.match(authority, /department\.manage/);
  assert.match(manages, /hasDepartmentLeaderAuthority\(\)/);
  assert.match(manages, /hasDepartmentMembership\(department\)/);
  assert.doesNotMatch(manages, /department in request\.auth\.token\.departments/);
  assert.doesNotMatch(manages, /claimListHas\('departmentIds', department\)/);
});

test('conflict updates isolate department acknowledgements and reserve resolution for admins', () => {
  const translationAck = functionBody('changesTranslationConflictEntries');
  const worshipAck = functionBody('changesWorshipConflictEntries');
  const acknowledgement = functionBody('conflictAcknowledgementOnly');
  const conflicts = matchBody('/conflicts/{conflictId}');

  assert.match(translationAck, /Translation #1/);
  assert.doesNotMatch(translationAck, /Presider/);
  assert.match(worshipAck, /Presider/);
  assert.doesNotMatch(worshipAck, /Translation #1/);
  assert.match(acknowledgement, /affectedKeys\(\)\.hasOnly/);
  assert.doesNotMatch(acknowledgement, /status|resolvedAt|resolution/);
  assert.match(conflicts, /conflictAcknowledgementOnly\(\)/);
  assert.doesNotMatch(conflicts, /isConflictParticipant\(resource\.data\)[\s\S]*'status'/);
});

test('schedule keeps public reads but separates structural and scoped writes', () => {
  const schedule = matchBody('/schedule/{scheduleId}');
  assert.match(schedule, /allow read: if true;/);
  assert.match(schedule, /allow create, delete: if isAdmin\(\);/);
  assert.match(schedule, /changesWorshipAssignments\(\)/);
  assert.match(schedule, /changesTranslationAssignments\(\)/);
  assert.match(schedule, /changesMediaAssignments\(\)/);
  assert.match(schedule, /changesOnlyServiceSongs\(\)/);
  assert.match(schedule, /canAcknowledgeScheduleConflict\(\)/);
  assert.doesNotMatch(schedule, /allow\s+read,\s*write:\s*if\s+true/);
});

test('protected documents deny direct reads and writes', () => {
  for (const marker of [
    '/app/settings',
    '/app/songSettings',
    '/app/accounts/{accountUid}',
    '/accounts/{accountUid}'
  ]) {
    const body = matchBody(marker);
    assert.match(body, /allow read, write: if false;/, `protected ${marker} is not closed`);
  }

  assert.match(matchBody('/tokens/{tokenId}'), /allow read: if false;/);
  assert.match(matchBody('/audit/{auditId}'), /allow create: if false;/);
  assert.match(matchBody('/audit/{auditId}'), /allow update, delete: if false;/);
  assert.match(matchBody('/sent/{markerId}'), /allow read, write: if false;/);
});

test('membership, request, conflict, notification, and token rules are scoped', () => {
  const membership = matchBody('/memberships/{membershipId}');
  assert.match(membership, /managesDepartment\(request\.resource\.data\.department\)/);
  assert.match(membership, /request\.resource\.data\.status in \['active', 'archived'\]/);
  assert.match(membership, /allow delete: if isAdmin\(\);/);

  const requests = matchBody('/requests/{requestId}');
  assert.match(requests, /allow create: if isMember\(\)/);
  assert.match(requests, /isRequestOwner\(request\.resource\.data\)/);
  assert.match(requests, /request\.resource\.data\.keys\(\)\.hasAny\(\['status'\]\)/);
  assert.match(requests, /request\.resource\.data\.status == 'pending'/);
  assert.match(requests, /isRequestDepartmentLeader\(resource\.data\)/);
  assert.match(requests, /requestResolutionOnly\(\)/);

  const conflicts = matchBody('/conflicts/{conflictId}');
  assert.match(conflicts, /allow create: if false;/);
  assert.match(conflicts, /isConflictParticipant\(resource\.data\)/);

  const notifications = matchBody('/notifications/{notificationId}');
  assert.match(notifications, /isNotificationRecipient\(resource\.data\)/);
  assert.match(notifications, /allow write: if false;/);

  const tokens = matchBody('/tokens/{tokenId}');
  assert.match(tokens, /allow read: if false;/);
  assert.match(tokens, /isTokenOwner\(request\.resource\.data\)/);
});

test('song ingestion and public pulse paths remain explicit exceptions', () => {
  assert.match(matchBody('/songStats/{songId}'), /allow read, write: if true;/);
  assert.match(matchBody('/setlists/{setlistId}'), /allow read, write: if true;/);
  assert.match(matchBody('/pulse/{day}'), /allow read: if true;/);
  assert.match(matchBody('/pulse/{day}'), /allow write: if signedIn\(\);/);
});

test('legacy staged paths keep an explicit boundary', () => {
  assert.match(rules, /function isCoordinator\(\)/);
  assert.match(rules, /function scheduleStructuralChange\(\)/);
  assert.match(rules, /function scheduleAssignmentChange\(\)/);
  assert.match(rules, /function canEditAssignments\(before, after\)/);
  assert.match(rules, /function requestIsOwned\(data\)/);
  assert.match(rules, /function tokenBelongsToCaller\(data\)/);
  assert.match(rules, /function secretFieldsAbsent\(data\)/);
  for (const field of ['pinHash', 'sitePinHash', 'editorPinHash', 'passwordHash', 'hash']) {
    assert.match(rules, new RegExp(`'${field}'`));
  }
  assert.match(rules, /match \/departmentSchedules\/\{scheduleId\}/);
  assert.match(rules, /match \/departmentAssignments\/\{assignmentId\}/);
  assert.match(matchBody('/app/{appDocument}'), /appDocument != 'settings'/);
  assert.match(matchBody('/app/{appDocument}'), /appDocument != 'songSettings'/);
});

test('contract files contain no forbidden dash characters', () => {
  assert.doesNotMatch(rules, /[\u2013\u2014]/u);
  assert.doesNotMatch(fs.readFileSync(new URL(import.meta.url), 'utf8'), /[\u2013\u2014]/u);
});

let emulatorDependencies;
let emulatorDependencyError;
try {
  const [rulesUnitTesting, firestore] = await Promise.all([
    import('@firebase/rules-unit-testing'),
    import('firebase/firestore')
  ]);
  emulatorDependencies = { firestore, rulesUnitTesting };
} catch (error) {
  emulatorDependencyError = error;
}

const emulatorRequested = process.env.RUN_FIRESTORE_RULES_EMULATOR === '1';
if (!emulatorRequested) {
  console.log(
    'EMULATOR_NOT_RUN: set RUN_FIRESTORE_RULES_EMULATOR=1 with Java, Firebase Emulator Suite, and @firebase/rules-unit-testing installed.'
  );
} else if (!emulatorDependencies) {
  const reason = emulatorDependencyError?.code || emulatorDependencyError?.message || 'dependencies unavailable';
  console.log(`EMULATOR_NOT_RUN: ${reason}`);
}

test(
  'Firestore emulator authorization matrix',
  {
    skip: !emulatorRequested
      ? 'set RUN_FIRESTORE_RULES_EMULATOR=1 to run the emulator matrix'
      : !emulatorDependencies
        ? 'Firebase emulator test dependencies are unavailable'
        : false
  },
  async () => {
    const {
      assertFails,
      assertSucceeds,
      initializeTestEnvironment
    } = emulatorDependencies.rulesUnitTesting;
    const {
      deleteDoc,
      doc,
      getDoc,
      setDoc,
      updateDoc
    } = emulatorDependencies.firestore;

    const environment = await initializeTestEnvironment({
      projectId: 'worship-duty-auth-l3-contract',
      firestore: { rules }
    });

    try {
      const admin = environment.authenticatedContext('admin-uid', {
        roles: ['admin'],
        departments: [],
        memberName: 'B Anthony'
      });
      const translationLeader = environment.authenticatedContext('translation-uid', {
        roles: ['departmentLeader'],
        departments: ['Translation'],
        memberName: 'S Paola'
      });
      const departmentListOnly = environment.authenticatedContext('department-list-only-uid', {
        roles: ['member'],
        departments: ['Translation'],
        memberName: 'A List Only'
      });
      const departmentPermission = environment.authenticatedContext('department-permission-uid', {
        roles: ['member'],
        permissions: ['department.manage'],
        departments: ['Translation'],
        memberName: 'P Permission'
      });
      const mediaLeader = environment.authenticatedContext('media-uid', {
        roles: ['departmentLeader'],
        departments: ['Media'],
        memberName: 'D Aaron'
      });
      const globalManager = environment.authenticatedContext('global-manager-uid', {
        roles: ['globalLeaderManager'],
        departments: [],
        memberName: 'E Simon'
      });
      const songEditor = environment.authenticatedContext('song-editor-uid', {
        roles: ['songEditor'],
        departments: [],
        memberName: 'D Danielle'
      });
      const member = environment.authenticatedContext('member-uid', {
        roles: ['member'],
        departments: [],
        memberName: 'M Chloe'
      });
      const unauthenticated = environment.unauthenticatedContext();

      const serviceData = {
        date: '2026-09-20',
        time: '09:00 AM',
        service: 'Sunday Worship',
        worship: 'Sunday',
        assignments: {
          Presider: 'B Anthony',
          'Translation #1': 'M Chloe',
          'Media Booth #1': 'D Aaron'
        },
        choirSong: 'Old Song'
      };

      await environment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'schedule', 'service-1'), serviceData);
        await setDoc(doc(db, 'app', 'config'), { public: true });
        await setDoc(doc(db, 'app', 'settings'), { pinHash: 'test-hash-placeholder' });
        await setDoc(doc(db, 'audit', 'audit-1'), {
          action: 'seed',
          department: 'Translation'
        });
        await setDoc(doc(db, 'conflicts', 'conflict-1'), {
          department: 'Translation',
          departments: ['Translation'],
          requesterUid: 'member-uid',
          status: 'open'
        });
        await setDoc(doc(db, 'notifications', 'notification-1'), {
          department: 'Translation',
          requesterUid: 'member-uid'
        });
      });

      const publicSchedule = doc(unauthenticated.firestore(), 'schedule', 'service-1');
      await assertSucceeds(getDoc(publicSchedule));
      await assertFails(setDoc(doc(unauthenticated.firestore(), 'schedule', 'service-2'), serviceData));

      const leaderSchedule = doc(translationLeader.firestore(), 'schedule', 'service-1');
      await assertSucceeds(updateDoc(leaderSchedule, {
        assignments: {
          ...serviceData.assignments,
          'Translation #1': 'S Paola'
        }
      }));
      await assertFails(updateDoc(leaderSchedule, {
        assignments: {
          ...serviceData.assignments,
          Presider: 'S Paola'
        }
      }));
      await assertFails(updateDoc(doc(departmentListOnly.firestore(), 'schedule', 'service-1'), {
        assignments: {
          ...serviceData.assignments,
          'Translation #1': 'A List Only'
        }
      }));
      await assertSucceeds(updateDoc(doc(departmentPermission.firestore(), 'schedule', 'service-1'), {
        assignments: {
          ...serviceData.assignments,
          'Translation #2': 'P Permission'
        }
      }));
      await assertFails(updateDoc(doc(mediaLeader.firestore(), 'schedule', 'service-1'), {
        assignments: {
          ...serviceData.assignments,
          'Translation #1': 'D Aaron'
        }
      }));
      await assertSucceeds(updateDoc(doc(songEditor.firestore(), 'schedule', 'service-1'), {
        choirSong: 'New Song'
      }));
      await assertFails(updateDoc(doc(member.firestore(), 'schedule', 'service-1'), {
        choirSong: 'Member Song'
      }));
      await assertFails(updateDoc(leaderSchedule, {
        conflictOk: { 'S Paola': ['Presider'] }
      }));
      await assertSucceeds(updateDoc(doc(admin.firestore(), 'schedule', 'service-1'), {
        conflictOk: { 'B Anthony': ['Presider'] }
      }));
      await assertSucceeds(updateDoc(leaderSchedule, {
        conflictOk: {
          'B Anthony': ['Presider'],
          'S Paola': ['Translation #1']
        }
      }));
      await assertFails(updateDoc(leaderSchedule, {
        conflictOk: {
          'B Anthony': ['Presider', 'Translation #1'],
          'S Paola': ['Translation #1']
        }
      }));
      await assertFails(updateDoc(leaderSchedule, {
        conflictOk: {
          'B Anthony': ['Presider'],
          'S Paola': ['Translation #1'],
          'Unknown Member': ['Translation #1']
        }
      }));
      await assertSucceeds(updateDoc(doc(admin.firestore(), 'schedule', 'service-1'), { service: 'Updated Worship' }));

      await assertSucceeds(getDoc(doc(unauthenticated.firestore(), 'app', 'config')));
      await assertSucceeds(setDoc(doc(globalManager.firestore(), 'app', 'leaderConfig'), {
        Translation: ['S Paola']
      }, { merge: true }));
      await assertFails(setDoc(doc(member.firestore(), 'app', 'config'), { public: false }, { merge: true }));
      await assertFails(getDoc(doc(member.firestore(), 'app', 'settings')));
      await assertFails(getDoc(doc(admin.firestore(), 'app', 'settings')));
      await assertFails(getDoc(doc(member.firestore(), 'accounts', 'member-uid')));

      const membership = doc(translationLeader.firestore(), 'memberships', 'membership-1');
      await assertSucceeds(setDoc(membership, {
        department: 'Translation',
        memberUid: 'member-2',
        status: 'active'
      }));
      await assertSucceeds(updateDoc(membership, { status: 'archived' }));
      await assertFails(deleteDoc(membership));
      await assertFails(setDoc(doc(mediaLeader.firestore(), 'memberships', 'membership-2'), {
        department: 'Translation',
        memberUid: 'member-3',
        status: 'active'
      }));

      const token = doc(member.firestore(), 'tokens', 'token-1');
      await assertSucceeds(setDoc(token, { uid: 'member-uid', name: 'M Chloe', updatedAt: 1 }));
      await assertSucceeds(updateDoc(token, { updatedAt: 2 }));
      await assertFails(getDoc(token));
      await assertFails(deleteDoc(doc(mediaLeader.firestore(), 'tokens', 'token-1')));
      await assertSucceeds(deleteDoc(token));

      const request = doc(member.firestore(), 'requests', 'request-1');
      await assertSucceeds(setDoc(request, {
        department: 'Translation',
        duty: 'Translation #1',
        name: 'M Chloe',
        requesterUid: 'member-uid',
        status: 'pending',
        note: 'Please help'
      }));
      await assertSucceeds(getDoc(request));
      await assertFails(setDoc(doc(member.firestore(), 'requests', 'request-without-status'), {
        department: 'Translation',
        duty: 'Translation #1',
        name: 'M Chloe',
        requesterUid: 'member-uid'
      }));
      await assertFails(setDoc(doc(member.firestore(), 'requests', 'request-pre-resolved'), {
        department: 'Translation',
        duty: 'Translation #1',
        name: 'M Chloe',
        requesterUid: 'member-uid',
        status: 'approved'
      }));
      await assertSucceeds(getDoc(doc(translationLeader.firestore(), 'requests', 'request-1')));
      await assertFails(getDoc(doc(mediaLeader.firestore(), 'requests', 'request-1')));
      await assertSucceeds(updateDoc(doc(translationLeader.firestore(), 'requests', 'request-1'), {
        status: 'approved',
        resolvedAt: 3,
        resolvedByUid: 'translation-uid'
      }));

      await assertSucceeds(getDoc(doc(translationLeader.firestore(), 'conflicts', 'conflict-1')));
      await assertFails(getDoc(doc(mediaLeader.firestore(), 'conflicts', 'conflict-1')));
      await assertSucceeds(updateDoc(doc(translationLeader.firestore(), 'conflicts', 'conflict-1'), {
        acknowledgedByUid: 'translation-uid',
        acknowledgedAt: 4
      }));
      await assertFails(updateDoc(doc(translationLeader.firestore(), 'conflicts', 'conflict-1'), {
        status: 'resolved'
      }));
      await assertFails(updateDoc(doc(translationLeader.firestore(), 'conflicts', 'conflict-1'), {
        resolvedAt: 5
      }));
      await assertFails(updateDoc(doc(translationLeader.firestore(), 'conflicts', 'conflict-1'), {
        resolution: 'handled'
      }));
      await assertSucceeds(updateDoc(doc(admin.firestore(), 'conflicts', 'conflict-1'), {
        status: 'resolved',
        resolvedAt: 6
      }));
      await assertFails(setDoc(doc(member.firestore(), 'audit', 'forged'), { action: 'forged' }));
      await assertSucceeds(getDoc(doc(globalManager.firestore(), 'audit', 'audit-1')));
      await assertFails(getDoc(doc(member.firestore(), 'audit', 'audit-1')));
      await assertSucceeds(getDoc(doc(translationLeader.firestore(), 'notifications', 'notification-1')));
      await assertFails(getDoc(doc(mediaLeader.firestore(), 'notifications', 'notification-1')));
      await assertFails(setDoc(doc(member.firestore(), 'notifications', 'forged'), { uid: 'member-uid' }));

      await assertSucceeds(setDoc(doc(unauthenticated.firestore(), 'songStats', 'song-1'), { title: 'Signal Song' }));
      await assertSucceeds(setDoc(doc(unauthenticated.firestore(), 'setlists', 'setlist-1'), { songs: [] }));
      await assertFails(setDoc(doc(unauthenticated.firestore(), 'sent', 'forged'), { t: 5 }));
      await assertSucceeds(deleteDoc(doc(admin.firestore(), 'schedule', 'service-1')));
    } finally {
      await environment.cleanup();
    }
  }
);

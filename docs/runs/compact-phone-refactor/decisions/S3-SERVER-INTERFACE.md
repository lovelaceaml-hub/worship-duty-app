# Server workflow interface ruling (Section 3, remaining areas)

Status: Fable 5.1 architect ruling, 2026-09-17. Binding for Section 3 and for the Section 4 information builders that consume these handlers. Read-only advice: Fable wrote no runtime code. The Section 3 writer implements this exactly; a conflict with the plan, the membership ruling, or `shared/save-state.js` goes back to the controller, not around this file.

Already settled, not relitigated here: the membership interface (`S3-MEMBERSHIP-INTERFACE.md`); the save-state contract (Saved only after the promise resolves; `aborted` or `failed-precondition`, or a payload carrying a newer `revision`, means Stale with the draft kept; anything else means Failed with Retry); the existing primitives `assignDepartmentDuty`, `overrideDepartmentAssignment`, `unassignDepartmentDuty`, `updateDepartmentProfile`; the `requests` collection and its `pending | approved | declined` status with the `onRequestCreated` and `onRequestResolved` notification triggers; the Presider song model in `setlists` and `songStats` and the pure helpers in `song-lib.js`.

## 0. Modules, wrapper, and shared conventions

| Path | Purpose |
| --- | --- |
| `functions/revision.js` | Pure. `currentRevision(doc)`, `assertFresh(...)`, `nextRevision(doc)`. No database, no imports beyond Node. |
| `functions/song-history.js` | Pure. Server copies of `recompute`, `applySung`, `removeHistoryEntry` semantics plus `applyCorrection`. Entry shapes identical to `song-lib.js`. |
| `functions/compact-workflows.js` | Factory `createCompactWorkflowHandlers({ db, now, permissionConfig, logger })`. Handlers: `saveMemberAvailability`, `resolveDutyAttention`, `saveSongService`, `correctSongHistory`; job body `recordSongHistory()`. No database calls at import time. |
| `functions/department-handlers.js` | Extended in place: the three assignment primitives and `updateProfile` adopt the revision contract (section 3). |
| `functions/department-auth.js` | `revision` added to `PROFILE_METADATA_FIELDS` and `PROFILE_ALLOWED_FIELDS`. Nothing else changes. |
| `functions/index.js` | Exports the four callables through `exposeDepartmentCallable`; adds `songHistoryRecorder` with `onSchedule`; extends `onScheduleWrite` per section 1.4; wrapper passes `error.details` (below). |
| `firestore.rules` | Key allowlists gain `revision` (profiles, assignments). No new client write paths. Section 3 owns this file. |

`functions/song-lib.js` does not exist and `../song-lib.js` must not be required from `functions/` (deploy packages only the functions directory). `song-lib.js` at the root stays untouched; the Signal ingest keeps its behavior.

Conventions carried from `department-handlers.js`, mandatory in the new module: `requestActor(request)` for the verified actor; `inputData(request)`; an explicit allowed-fields `Set` per handler with `invalid-argument` on the first unknown field; `errorWithCode(code, message, details)` where the new optional third argument sets `error.details` (a plain object or nothing); every transaction reads all documents before its first write; profiles at `profileRef(db, departmentId, memberUid)`; assignment slot documents at `departmentAssignments/{assignmentIdFor(assignment)}`; `schedule/{serviceId}.assignments` keyed by duty name. `exposeDepartmentCallable` changes in one place: `throw new HttpsError(code, message, plainObject(error.details) ? error.details : undefined)`. The `AUTH_ERROR_CODES` set is unchanged.

Every accepted write in this ruling returns `{ ok: true, revision, ...handler fields }` where `revision` is the new counter of the primary document. Every stale write rejects with code `aborted` and `details: { revision, ...witness }` (section 3). `failed-precondition` keeps its existing meaning (a business rule failed against current data) and `permission-denied` keeps its existing meaning; both are unchanged.

Composite indexes: none. Every query below is a single equality filter, a pair of equality filters on one collection, or a single-field range, all served by Firestore's automatic single-field indexes. The repository has no `firestore.indexes.json` and `firebase.json` declares none; the writer must not introduce one. Queries with an inequality plus a filter on another field are forbidden in this section; filter the remainder in memory (congregation scale).

## 1. Authorized multi-department availability

### 1.1 Decision

One callable, `saveMemberAvailability`, writes one member's availability across one or more of their department profiles in a single transaction. The "all departments by default, selected-department exceptions" rule is a client information-builder rule: the client composes an explicit per-department list and the server applies exactly what it is given. The server does not discover a member's departments (that would need a collection-group index); the client already reads the member's own profiles and the public `app/departments` map.

`updateMemberAvailability` (single profile, `availabilityOnly`) stays exported and unchanged apart from section 3. The compact client uses `saveMemberAvailability` for every availability save so the Needs-replacement fan-out always runs.

### 1.2 Input and output

| Field | Type | Rule |
| --- | --- | --- |
| `memberUid` | string | Required. Target member. |
| `departments` | array, 1 to 20 | Required. Each item `{ departmentId, availability, expectedRevision?, expectedUpdatedAt? }`. Duplicate `departmentId` is `invalid-argument`. |
| `departments[].availability` | object | Full availability for that department, normalized by `authz.normalizeProfilePatch({ availability })`. A full replacement, not a partial merge, matching the existing profile write. |
| `departments[].expectedRevision` | integer or absent | Section 3 witness. |
| `departments[].expectedUpdatedAt` | integer or absent | Section 3 witness. |

Allowed top-level fields: exactly `memberUid`, `departments`. No `uid`, `department`, or `patch` aliases in this handler.

Output: `{ ok: true, revision, departments: [{ departmentId, revision, profile }], replacements: { marked: [{ serviceId, duty }], cleared: [{ serviceId, duty }] } }`. Top-level `revision` is the highest per-department revision written (the save controller needs one number; the builder keeps the per-department ones for the next save).

### 1.3 Authorization

Inside the transaction, for every listed department: read the profile (missing profile is `not-found` for the whole call), build `next = profileWithPatch(current, { availability }, actor, at)`, and run `authz.authorizeProfileUpdate(actor, current, candidate)` with the same attribution-stripping the existing `updateProfile` does. `rejectDecision` applies. That existing function already encodes the boundary: a member may change only availability on their own profile; a leader must manage that department (`managesDepartment`); an administrator is unrestricted. A leader who includes a department they do not manage gets `permission-denied` for the whole call; the call is all-or-nothing across departments. No new authorization helper is written.

### 1.4 Needs replacement fan-out

Definition: a duty slot needs replacement when the member projected in `schedule/{serviceId}.assignments[duty]` is unavailable for that service under their current profile. The marker lives on the schedule document, which every role already reads:

```
schedule/{serviceId}.needsReplacement[duty] = {
  memberName: string,      // the name in assignments[duty] at marking time
  memberUid: string,       // profile identity, server-written
  departmentId: string,
  reason: 'unavailable',
  since: number,           // ms epoch
  markedByUid: string
}
```

`assignments[duty]` is not changed and the `departmentAssignments` slot document is not deleted. Nothing is removed; the plan forbids it.

In the same transaction as the profile writes, for each listed department: `transaction.get(db.collection('departmentAssignments').where('departmentId', '==', departmentId).where('memberUid', '==', memberUid))` (two equalities, no composite index), keep records whose `serviceDate >= today` in Pacific time (`dateInTimeZone`), read each distinct `schedule/{serviceId}` (all reads before writes), then for each record where `assignments[duty]` still equals the record's `memberName`:

- `authz.effectiveAvailability(nextProfile, serviceDate, serviceTime) === 'unavailable'` and no marker exists: write the marker with `merge: true` on the `needsReplacement` map.
- Effective availability is `available` and a marker exists with `reason: 'unavailable'` and the same `memberUid`: delete that one map key (`FieldValue.delete()`). The reason ceased; no assignment changes.
- Otherwise leave the map alone. `unknown` never marks and never clears.

Self-healing rule, applied by every reader and by `onScheduleWrite`: a marker is live only while `assignments[duty]` still equals `needsReplacement[duty].memberName`. `reconcileScheduleAssignmentProjection` gains one step: for each changed duty, if a marker exists and the new name differs from the marker's `memberName`, remove that key. This covers the legacy direct-write and Sheet-sync paths without a second write path for markers.

`publicScheduleService` is an allowlist and already omits unknown fields; the writer confirms `needsReplacement` and `assignmentRevisions` (section 3) never reach the public projection or the `.ics` feed. Client write rules on `schedule` use `affectedKeys` allowlists that do not include these fields, so clients cannot forge or clear markers; Admin SDK writes bypass rules as today.

## 2. Atomic request and assignment resolution

### 2.1 What "the request" is

No new collection. Needs attention is a derived view over existing documents, computed by the shared client builder (`actionableCountsForViewer` and its item list must use one rule set) and mirrored server-side only where a handler needs the same predicate:

| Category | Source | Live when |
| --- | --- | --- |
| `requests` | `requests/{id}` | `status === 'pending'` and the requester still holds `assignments[duty]` (existing `requestIsActionable`). |
| `replacements` | `schedule.needsReplacement[duty]` | Marker present and `assignments[duty] === marker.memberName`; service date today or later. |
| `unfilled` | `schedule.assignments` | Service date today or later, duty belongs to a department the viewer manages, and `assignments[duty]` is empty or missing. |
| `conflicts` | `schedule.assignments` and `conflictOk` | Existing `activeConflicts`. |

Completed requests stay in `requests` as searchable history; nothing is deleted. `conflicts/{id}` documents are not introduced by this section (no server writer exists today and none is added).

### 2.2 Decision: one new handler, existing primitives kept

Calling `unassignDepartmentDuty` then `assignDepartmentDuty` back to back is not atomic and neither clears a marker or resolves a request, so a new handler `resolveDutyAttention` performs the whole resolution in one `db.runTransaction`. The existing three primitives stay as they are (plus section 3) for callers that only assign.

Input (allowed fields exactly these):

| Field | Type | Rule |
| --- | --- | --- |
| `departmentId` | string | Required. Must equal `authz.departmentForDuty(duty)` or `failed-precondition` (`duty-department-mismatch`). |
| `serviceId` | string | Required. `schedule/{serviceId}` must exist or `not-found`. |
| `duty` | string | Required. |
| `requestId` | string or absent | When present, `requests/{requestId}` must exist, be `pending`, and match `serviceId` and `duty` (`failed-precondition` otherwise). |
| `decision` | `'approved'` or `'declined'` | Required when `requestId` is present; forbidden otherwise (`invalid-argument`). |
| `replacementMemberUid` | string or null | `null` (or absent) means leave the duty open. Forbidden with `decision: 'declined'`. |
| `acknowledgeConflict` | boolean, default false | See 2.4. |
| `expectedRevision` | integer or absent | Section 3 witness for the slot. |
| `expectedMemberName` | string or absent | Section 3 witness: the name the client saw in `assignments[duty]` (`''` for empty). |

Authorization: `authz.isAdministrator(actor) || authz.managesDepartment(actor, departmentId)`, else `permission-denied`. When a request is present, its department (`request.department` or `request.departmentId`) must equal `departmentId`.

Transaction, reads first: schedule; request (if any); current slot document `departmentAssignments/{assignmentIdFor({ departmentId, serviceId, serviceDate, serviceTime, duty })}` using `assignmentForSchedule` to derive `serviceDate` and `serviceTime`; replacement profile (if any). Then:

1. `assertFresh` on the slot (section 3). Stale means nothing is written and the request stays `pending`.
2. `decision: 'declined'`: write request `{ status: 'declined', resolvedAt, resolvedByUid, resolvedBy: actor.uid, resolvedByName }`. No slot change. Markers untouched.
3. Replacement given: `authz.authorizeAssignment(actor, verifiedAssignment, profile)` and `rejectDecision`, exactly as `assignDepartmentDuty` (eligibility, availability, active, schedulable remain enforced). Conflict check per 2.4. Write the new slot record with `assignmentRecord(...)` and `authorization: 'needs-attention-resolution'`, `override: false`; set `assignments[duty]` to the new name; remove `needsReplacement[duty]` if present; bump `assignmentRevisions[duty]`; if a request is present set it `approved` with the fields in step 2 plus `assignmentId`.
4. No replacement and `decision` is `approved` or there is no request: set `assignments[duty] = ''`, delete the slot document, remove `needsReplacement[duty]`, bump `assignmentRevisions[duty]`, and resolve the request as `approved` if present. The duty now appears under `unfilled` by derivation. No administrator help request is created, no notification document is written; the existing `onRequestResolved` trigger notifies the requester as it does today.

Output: `{ ok: true, revision, serviceId, duty, memberName, assignment | null, requestId | null, requestStatus | null }`.

Administrator override of eligibility is not part of this handler; it remains `overrideDepartmentAssignment`.

### 2.3 Needs replacement without a request

The same handler resolves a `replacements` item: no `requestId`, a `replacementMemberUid` or `null`. Step 3 or 4 applies. This is the only server path that clears a marker on purpose; section 1.4 clears them by consequence.

### 2.4 Conflicts

The plan makes another duty in the same service advisory. The existing `assignDepartmentDuty` rejects it as `failed-precondition`; that primitive is unchanged. In `resolveDutyAttention`: compute `conflictDuties` = duties in `assignments` other than `duty` whose name equals the replacement's `memberName`. If non-empty and `acknowledgeConflict !== true`, reject with `failed-precondition`, message "The member already serves in this service.", `details: { reason: 'conflict', duties: conflictDuties }`. If acknowledged, proceed and merge `conflictOk[memberName]` with the union of existing entries, `conflictDuties`, and `duty` (the existing acknowledgement convention), so the item does not reappear under `conflicts`. The client shows the advisory from local data before the first save; the server rejection is the backstop.

## 3. Version-aware saves

### 3.1 One helper, three shapes

`functions/revision.js` is shared by every write path in this ruling and by the existing primitives. A revision alone cannot see writes that bypass the callables (legacy direct schedule writes, Sheet sync, Signal setlist writes), so the check pairs the counter with a witness value the client already displays.

```
currentRevision(doc)                 -> Number.isSafeInteger(doc.revision) ? doc.revision : 0
nextRevision(doc)                    -> currentRevision(doc) + 1
assertFresh({ expectedRevision, expectedWitness, currentRevision, currentWitness, details })
```

`assertFresh` is a no-op when `expectedRevision` is `undefined` (older callers keep working; missing `revision` on stored documents reads as 0, so no reseeding). When present it must be a non-negative safe integer (`invalid-argument` otherwise). If `expectedRevision !== currentRevision` or (`expectedWitness !== undefined` and `expectedWitness !== currentWitness`), throw `errorWithCode('aborted', 'This record changed since you loaded it. Reload to see the newer version.', details)`.

| Shape | Counter lives at | Witness | `details` on stale |
| --- | --- | --- | --- |
| Department profile | `departments/{d}/members/{uid}.revision` | `updatedAt` | `{ revision, updatedAt, updatedBy }` |
| Assignment slot | `schedule/{serviceId}.assignmentRevisions[duty]` (integer map, monotonic, never deleted, survives unassign and reassign) | `assignments[duty]` name, `''` when empty | `{ revision, memberName, assignedBy }` (`assignedBy` from the slot document when it exists) |
| Song service list | `setlists/{serviceId}.revision` | `updatedAt` | `{ revision, updatedAt, updatedBy }` |

The slot counter is on the schedule document, not on `departmentAssignments/{id}`, because that document is deleted on unassign and a fresh document would restart at 1 and collide with a stale client's number. The `departmentAssignments` record additionally carries `revision` equal to the slot counter at write time (informational; rules allowlist gains the key).

Every accepted write sets the new counter in the same transaction and returns it as `revision`. The primary document of each handler for the returned `revision`: the profile (or highest profile) for availability, the slot for `resolveDutyAttention` and the three primitives, the setlist for song saves and corrections.

### 3.2 Existing primitives

`assignDepartmentDuty`, `overrideDepartmentAssignment`, `unassignDepartmentDuty`: accept optional `expectedRevision` and `expectedMemberName` (added to `ASSIGNMENT_COMMAND_FIELDS` and to the unassign allowlist), call `assertFresh` after the schedule read, bump `assignmentRevisions[duty]`, and return `revision`. `updateProfile` (both callers): accept optional `expectedRevision` and `expectedUpdatedAt` (added to the command allowlist in `patchFromRequest`, stripped before `normalizeProfilePatch`), move the read into `db.runTransaction`, call `assertFresh`, write `revision: nextRevision(current)`, return `revision`. `reconcileScheduleAssignmentProjection` writes `revision: currentRevision(existing) + 1` on records it rewrites and never touches `assignmentRevisions`.

Rules: `departmentProfileKeysSafe` and `assignmentKeysSafe` gain `'revision'`. Without it `canReadDepartmentProfile` would fail for every profile after the first save. `department-auth.js` allowlists gain `revision` as metadata so `authorizeProfileUpdate` does not reject it as `field-not-allowed`. The client-side profile validators (`department-profile.js`) belong to Section 4 and must tolerate the key; note it in the lane record.

## 4. Presider songs: automatic history and correction

### 4.1 History shape (reuse, no new collection)

The history record is the existing pair: `setlists/{serviceId}` with `status: 'sung'`, and per-song entries in `songStats/{songId}.history[]`. Setlist ids equal schedule ids (`serviceIdFor(date, serviceLabel)` and `svcId` produce `YYYY-MM-DD_<slug>`; the writer asserts equality when creating a setlist from a schedule document). New provenance fields, all server-written:

```
setlists/{serviceId}:
  historySource: 'automatic' | 'manual' | 'corrected'   // absent on legacy records = 'manual'
  recordedAt: number        // when the automatic recorder or a manual mark wrote status 'sung'
  recordedBy: 'automatic-history' | uid
  correctedAt?: number
  correctedByUid?: string
  correctedBy?: string      // display name, same convention as updatedBy
  revision: integer

songStats/{songId}.history[] entry:
  { date, service, by, markedAt, backfilled?, source?: 'automatic' | 'corrected' }
  // legacy entries have no source: read as manual; backfilled entries keep backfilled: true
```

`timesSung` and `lastSung` remain caches recomputed from `history` by `recompute` (server copy in `song-history.js`, same arithmetic as `song-lib.js`). Every existing entry, backfill, and `remove-history` behavior in the browser is preserved; the compact History screen reads these same documents, searchable and paginated client-side over the `setlists` snapshot it already holds.

### 4.2 Song service saves

`saveSongService` (allowed fields exactly): `serviceId`, `songs` (array of catalog ids, may be empty), `glorySong` (id or null), `thanksSong` (id or null), `notes` (string, max 2000), `confirm` (boolean, default false), `expectedRevision`, `expectedUpdatedAt`.

Authorization: `permissions.canEditSongs(actor, service, await permissionConfig())` where `service` is the schedule document (presider = `assignments.Presider` by canonical name) and `permissionConfig` is the `runtimePermissionConfig` reader from `index.js` passed into the factory. Administrators and song editors pass; the assigned presider passes for that service only.

Transaction: read `schedule/{serviceId}` (`not-found` if missing) and `setlists/{serviceId}`. If the setlist is `status: 'sung'`, reject `failed-precondition` "This list is recorded in history. Use a correction." If absent, create it with the existing `ensureSetlist` shape (`id, date, worshipType, serviceLabel, presider, notes: '', songs: [], status: 'planned', sungAt: null, source: 'compact'`). `assertFresh` against `revision` and `updatedAt`. Write the patch with `updatedAt = at`, `updatedBy` = actor display name, `updatedByUid`, `revision = nextRevision`. With `confirm: true` also write `confirmedAt = at`, `confirmedBy`, `confirmedByUid`; `songs` must be non-empty to confirm (`failed-precondition`). The existing convention holds: confirmed means `confirmedAt >= updatedAt`; a later save without `confirm` pushes `updatedAt` ahead and the list reads as changed and unconfirmed, so it will not be recorded automatically until confirmed again.

Output: `{ ok: true, revision, serviceId, setlist }`.

Firestore rules for `setlists` and `songStats` stay open for the Signal ingest; that is a documented boundary, not this section's to close. Signal writes bump `updatedAt` and not `revision`; the witness catches them.

### 4.3 Automatic recorder

`songHistoryRecorder = onSchedule({ schedule: 'every 30 minutes', timeZone: TZ, region: REGION }, () => handlers.recordSongHistory())`.

`recordSongHistory()`:

1. Query `setlists` where `status == 'planned'` (single equality). Lists that are unconfirmed stay `planned` forever and are re-read each run; at this congregation's scale that is acceptable and needs no index.
2. In memory keep lists with non-empty `songs` and `confirmedAt >= updatedAt`.
3. For each candidate read `schedule/{id}`. Skip when missing (canceled by deletion) or when `schedule.status` is `'canceled'` or `'cancelled'`. Compute the start with the existing `laStartMs(date, time)` using the same fallback table as the app (`Early Morning 05:00, Morning 09:00, Afternoon 15:00, Evening 20:00`, else `12:00`). Skip unless `start + 3 * 60 * 60 * 1000 <= now` (the existing three-hour window).
4. One `db.runTransaction` per remaining list: re-read the setlist; skip if now `sung`, or no longer confirmed, or songs empty; read `songStats/{songId}` for each distinct song; apply `applySung` semantics with entries `{ date, service: id, by: 'automatic-history', markedAt: now, source: 'automatic' }`, skipping songs that already carry an entry for this service (the existing per-service idempotency); write changed stats; write the setlist `{ status: 'sung', sungAt: now, updatedAt: now, updatedBy: 'automatic-history', historySource: 'automatic', recordedAt: now, recordedBy: 'automatic-history', revision: next }`. `confirmedAt` is left as is.

A second run finds `status: 'sung'` and does nothing; a crash between stats and setlist writes cannot happen because both are one transaction. Log counts only, never song or member data beyond ids.

### 4.4 Corrections

`correctSongHistory` (allowed fields exactly): `serviceId`, `songs` (non-empty array), `glorySong`, `thanksSong`, `notes`, `expectedRevision`, `expectedUpdatedAt`.

Authorization: same as 4.2 (`permissions.canEditSongs`): the service's presider, a song editor, or an administrator.

Transaction: read setlist (must exist and be `status: 'sung'`, else `failed-precondition` "Only a recorded list can be corrected."), `assertFresh`, read `songStats` for the union of old and new song ids. Apply `applyCorrection(statsMap, setlist, newSongs, { by, markedAt })`: for songs removed, drop the entry whose `service === serviceId` (delete the stats document when history becomes empty, as `removeHistoryEntry` does); for songs added, append `{ date, service, by, markedAt, source: 'corrected' }`; for songs kept, leave their entry untouched; recompute `timesSung` and `lastSung` for every changed document. Write the setlist patch with `historySource: 'corrected'`, `correctedAt`, `correctedByUid`, `correctedBy`, `updatedAt = at`, `updatedBy`, `updatedByUid`, `revision = next`; `status` stays `sung`, `sungAt` and `recordedAt` are unchanged. Append one audit document via `writeAudit` with `{ action: 'song-history-corrected', actorUid, serviceId, added: [ids], removed: [ids], timestamp }`.

Output: `{ ok: true, revision, serviceId, setlist, changedSongs: [ids] }`.

Undo of a recording is not a new handler; the existing browser `undo-sung` remains for editors and continues to remove entries by service key, which stays consistent with 4.3 and 4.4 because all three key entries by `service`.

## 5. What Section 3 delivers

Handlers (all through `exposeDepartmentCallable`, all returning `{ ok, revision, ... }`, all rejecting stale writes with `aborted` plus `details`):

- `saveMemberAvailability` (new, `compact-workflows.js`)
- `resolveDutyAttention` (new, `compact-workflows.js`)
- `saveSongService` (new, `compact-workflows.js`)
- `correctSongHistory` (new, `compact-workflows.js`)
- `assignDepartmentDuty`, `overrideDepartmentAssignment`, `unassignDepartmentDuty`, `updateDepartmentProfile`, `updateMemberAvailability` (extended with the revision contract)
- `songHistoryRecorder` (new `onSchedule`, every 30 minutes)
- `onScheduleWrite` (extended: marker self-healing, record `revision`)
- `exposeDepartmentCallable` (extended: passes `details`)

Modules: `functions/revision.js`, `functions/song-history.js`, `functions/compact-workflows.js` (new); `functions/department-handlers.js`, `functions/department-auth.js`, `functions/index.js` (extended); `firestore.rules` (allowlists gain `revision`).

Firestore fields added, all server-written: `departments/{d}/members/{uid}.revision`; `departmentAssignments/{id}.revision`; `schedule/{id}.needsReplacement` (map by duty) and `schedule/{id}.assignmentRevisions` (integer map by duty); `setlists/{id}.revision`, `historySource`, `recordedAt`, `recordedBy`, `correctedAt`, `correctedByUid`, `correctedBy`; `songStats/{songId}.history[].source`; `audit` action `song-history-corrected`; `requests/{id}.assignmentId` on approved resolutions. No new collections, no composite indexes, no rules changes beyond the two allowlists, no external services, no migration of existing records.

Not in this unit: tests, deploys, the client information builders and count rules (Section 4 consumes the predicates in 2.1), the Signal ingest boundary on `setlists` and `songStats`, and the client-side profile validators.

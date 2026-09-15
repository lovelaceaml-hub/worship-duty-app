# Membership interface, first bounded server unit

Status: controller-set implementation interface, not deployed.

Module: `functions/compact-membership.js`; factory `createCompactMembershipHandlers({ db, now, randomBytes })`. Reuse Node crypto by default. Calls use the existing `exposeDepartmentCallable` verified-account wrapper when integrated. The standalone unit does not change exports, rules, or production.

Every operation requires a current verified account, no forced PIN change, matching UID/role version, and active status. Use existing department authorization helpers; no name-based privilege grants. Account lookup returns only UID and display name, never account credentials, role configuration, contact information, or raw records.

| Handler | Input | Output |
| --- | --- | --- |
| searchDepartmentCandidates | departmentId, query, page (default 1) | ok, departmentId, members [{ memberUid, memberName }], page, pageSize 10, total |
| createDepartmentInvitation | departmentId | ok, token, departmentId, expiresAt |
| revokeDepartmentInvitation | token | ok, revoked |
| acceptDepartmentInvitation | token | ok, departmentId, memberUid, alreadyMember |

Search/create/revoke require management authority for the department. Search matches normalized names, minimum two query characters, exact account identity resolution, stable alphabetical order and ten-per-page. Exclude inactive accounts. Fetch only display/UID/active fields server-side and filter locally at this congregation's scale; no external search service or new index infrastructure. Existing `createDepartmentProfile` remains the direct-add operation after selection. Unknown names stay not-found; UI later offers the agreed administrator-exception path.

Invitation tokens contain 32 random bytes encoded base64url. Store only a SHA-256 token digest as the document ID in `departmentInvitations`, with departmentId, createdByUid, createdAt, expiresAt, status. Default expiry seven days. Return raw token to the creating client only; do not log it. No plaintext token in stored documents or audit entries. Accept is single-use, transactional, and atomically creates a member profile if absent and marks the invitation accepted. Current signed-in account supplies canonical identity/name. Existing profiles, roles and availability must remain unchanged. New profiles use existing normalization with role member, active status, no eligible duties, schedulable false, empty availability for later leader confirmation. Never edit the account or grant leadership. Existing membership may consume the invitation once and return alreadyMember true. Repeat acceptance returns already-exists; expired/revoked links return failed-precondition. Revoke is idempotent for an already-revoked link and must not erase acceptance history.

Write operations recheck the current actor account inside the transaction, so account revocation cannot be bypassed between lookup and write. All transaction reads precede writes. No database calls during module import. No test cases, deployments, migrations, rules edits or logs containing personal data in this unit. Verify syntax only; focused reviewer examines logic. Integration later adds names to existing guarded callable exports and keeps direct client access to invitation storage denied.

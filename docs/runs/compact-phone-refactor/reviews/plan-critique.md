# Gemini plan critique

Model: gemini-3.8-flash-low. Effort: low. Conversation: 9dac6925-5fc7-4744-966c-70e63c3fcd47

Next action: review these five findings and decide whether to patch the plan before Section 2 launches.

Here is the bounded plan critique based strictly on the provided text:

### 1. Missing decision: Automatic song recording trigger and runtime environment
- **Severity**: High
- **Evidence**: Section 2 states "Automatically record confirmed lists after the existing three-hour service window," and Section 3 lists "idempotent automatic history and correction." However, the plan never specifies what triggers or executes this window (e.g., a scheduled Cloud Function, a client-side check on next open, or a Firestore trigger).
- **Smallest correction**: Explicitly state whether this is executed by an existing scheduled Cloud Function or lazily evaluated on the next client load, so Section 3 does not guess the execution architecture.

---

### 2. Dependency gap: Server and client interface contract sequencing
- **Severity**: High
- **Evidence**: Section 2 and Section 4 depend on new server-side operations (atomic request resolution, version-aware saves, single-use invite tokens), but Section 2 (browser foundation) and Section 3 (server workflows) run in parallel separate worktrees after "settled interfaces," with no designated owner or artifact defining the shared schema contract first.
- **Smallest correction**: Assign the controller in Section 0 to produce a single locked API/schema contract artifact before Section 2 and Section 3 worktrees branch.

---

### 3. Ownership gap: Shared feature map ownership conflict between Section 3 and 5B
- **Severity**: Medium
- **Evidence**: Section 3 says "One feature map identifies shared source, actions/components, four-layout placements, owner, and documentation." Section 5B assigns ownership of the "feature map and code/document index artifacts" to a separate Luna worker, while Section 4 is concurrently writing the components across the layouts.
- **Smallest correction**: Make Section 5B strictly a consumer/compiler of the feature map at integration, with the Section 2/4 runtime worker owning the live mapping as components land.

---

### 4. Compatibility risk: Concurrent offline drafts vs. server version-checking rejection
- **Severity**: Medium
- **Evidence**: Section 2 requires "Restore filters, page, selected record, and scroll position when returning" and "retain failed edits and offer Retry," while also enforcing "version-aware assignment, profile, and song saves reject stale edits." If a user returns to a cached local draft after a background server change, the plan does not define how the concurrent diff is presented without clobbering or stranding the user's input.
- **Smallest correction**: Specify that stale edit rejection displays a simple comparison modal or prompt ("Server changed: Overwrite or Discard") to resolve the conflict cleanly on phone screens.

---

### 5. Missing decision: Single-use invitation token delivery and cleanup
- **Severity**: Low
- **Evidence**: Section 2 defines "Single-use, revocable, seven-day links can be accepted by any signed-in member" and "Record acceptance and prevent duplicate use." It does not specify whether expired or revoked tokens are purged or retained for auditing, or if token generation requires admin/leader-only callable functions.
- **Smallest correction**: Clarify that tokens are stored in a dedicated Firestore `invitations` collection with an expiration timestamp and marked `accepted: true` upon redemption.

---

### What Anthony must do
Nothing, you're clear.

---

1. Approve these five findings as-is, or drop any you consider non-blocking?
2. Shall we update the plan text directly, or proceed to Section 1 prototype approval?


## Controller disposition

1. Accepted: automatic history runs on the server with current service and confirmation rechecks. Resolve the exact scheduled function in the history interface before implementation.
2. Already required: root owns contracts before dependent writers. Membership contract is recorded in decisions/S3-MEMBERSHIP-INTERFACE.md. Further units receive contracts before launch.
3. Clarified: indexing consumes verified implementation receipts. Runtime owner owns executable layout placement. Indexing alone writes the documentary feature map.
4. Accepted in part: retain local draft and base revision, show current server values, require explicit reconciliation against the latest revision. Blind overwrite is rejected because it contradicts stale-save protection.
5. Already resolved by membership contract: authorized create/revoke, hashed token IDs, expiry, transactional consumption. Retain records; no new purge or deletion task.

Reviewer questions above are source output, not new approval gates.

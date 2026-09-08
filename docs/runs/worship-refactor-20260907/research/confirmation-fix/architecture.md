# Confirmation timestamp correction

Root reproduced a pre-existing confirmation failure from actual song-app.js functions with an advancing clock: confirmedAt was 101, updatedAt was 102, and isConfirmed returned false. A Git comparison confirms song-app.js was unchanged between the original baseline and Foundation 2.

The planner_sol max read-only critic approved an isolated fix. updateSetlist accepts an internal options argument, stamps metadata once, and when options.confirm is true assigns confirmedAt from that same updatedAt. confirmSetlist retains its nonempty-song guard and supplies confirmedBy plus the confirm option, without an earlier stamp. Ordinary edit callers stay unchanged. No option is persisted.

Preserve optimistic local application, raw song write policy, updateDoc then full-record setDoc fallback, alerts, local mode, and external song-lib importer behavior. Actual-source tests advance time for every metadata request and cover confirmation, later edits, reconfirmation, empty lists, exact persisted keys, and fallback preservation of existing fields. A fixed browser calendar is not accepted as proof of this timestamp behavior.

The writer owns only song-app.js, its lane receipt, and its confirmation-fix research folder in the isolated worktree. Native Sol review and root release checks remain required. This compatibility fix is independent of the pending visual choice.

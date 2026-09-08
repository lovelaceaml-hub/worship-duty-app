---
lane: LF2
title: Foundation state and subscriptions
state: running
model: gpt-5.6-luna
runner: Codex
worktree: /Users/anthony/Projects/worship-refactor-worktrees/foundation-state
review: pending
depends_on: LF,LR
updated: 2026-09-08T01:32Z
---

# Foundation 2 work order

Read the run INDEX and active plan first. Architecture critic approved this bounded continuation after the combined Foundation and Release review passed. One Luna max writer owns the isolated foundation-state worktree. No production interface changes.

Own app.js, index.html, new src/core/state.js and src/services/subscriptions.js, this lane receipt, and research/foundation-2 only. Keep all existing domain/storage/Firebase modules, song files, styles, functions, rules, release tooling, Git and production outside this capsule.

The state store exposes createStore(initial), get(), replace(next), setReady(key,value), areReady(keys). Preserve reference replacement, with a compatibility state alias refreshed through replaceState. Readiness lives independently of cached state and marks only members and departments; preserve explicit local/fallback readiness.

The subscription manager accepts injected raw Firebase, db, recentSince, setlistsSince, and emit. It owns idempotent start/stop, generation guards, and preview-to-full takeover, with no auth, storage, rendering, DOM, or writes. Register preview schedule, full schedule, members, settings, departments, name map, requests, setlists in that order. First full success retires preview before emitting; first empty full emits initial-empty once, later empty is authoritative. Errors leave preview alive. Emit known IDs for full snapshots. Missing document behavior stays identical.

Events: schedule-preview {services}; schedule-initial-empty {}; schedule-authoritative {services,knownIds}; schedule-error {error}; members {exists,list}; settings {exists,value}; departments {exists,map}; name-map {exists,map}; requests {items}; setlists {byId}.

App keeps exact callback ordering, writes, seeding, rendering and sync decisions. Protect render, renderSoon, afterDataChange, focus guard, ui drafts, scrolling, event delegation, renderSongs, songCtx and raw song Firebase. Do not add pagehide-only teardown or stop authoritative listeners on tab navigation. Explicit stop is for tests and true teardown. Song mount cleanup remains separate work.

Tests in research/foundation-2 verify exact replacement identity, readiness independence, listeners registering without auth waiting, preview/full ownership and late callback suppression, initial/later empty distinction, full IDs, missing docs, and start/stop/restart. Run syntax, these unit tests, existing Foundation harness, release tests and staging dry-run. Root runs fixture browser regressions before integrating or releasing. No Git/deploy by worker.

## Result

Pending implementation.

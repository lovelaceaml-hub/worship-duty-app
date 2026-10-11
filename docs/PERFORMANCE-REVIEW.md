# Performance review

Reviewed 2026-10-10. This review identifies ten opportunities in the current
code. Only item 1 is implemented in this change. Impact and effort are
qualitative estimates, not measurements of the live app.

## Ten opportunities

| # | Improvement | Evidence | Expected impact | Effort and safeguards |
| --- | --- | --- | --- | --- |
| 1 | Load Firebase Messaging only when needed for push. | [`connect()`](../app/firebase.js) previously awaited the optional SDK and its support check before startup could attach schedule and sign-in listeners. | Removes an optional network dependency from every ordinary startup. | Low. Preserve enabled push on reopen, local alerts, unsupported browsers, retries and saved-token cleanup. Selected for this PR. |
| 2 | Load privileged and infrequently used screens on demand. | [`render.js`](../app/render.js) statically imports Manage and other screens; [`Manage`](../app/screens/manage/index.js) imports all of its sections. | Less JavaScript downloaded and evaluated before the first screen. | Medium. Action registration, circular imports and offline release caching need care. |
| 3 | Reduce historical song data loaded by the planner. | [`presider/data.js`](../app/presider/data.js) listens to the complete `setlists` and `songStats` collections. | Lower initial reads and memory as song history grows. | Medium. Preserve editors' history and counts, and request older data when needed. |
| 4 | Separate near-term schedule loading from history loading. | [`sync.js`](../app/sync.js) subscribes to every schedule document, whereas the device cache retains services from 62 days back. | Lower first-load reads and memory as years accumulate. | Medium to high. Past services, annual workload, Fill's history and planning must still receive their full required data. |
| 5 | Avoid schedule-wide work for snapshots with no document changes. | [`sync.js`](../app/sync.js) always rebuilds `data.services`, queues a cache save, checks alerts and requests a redraw after processing `docChanges()`. | Avoids unnecessary work on an unchanged snapshot. Frequency is unmeasured. | Low to medium. The first snapshot, including an empty schedule, must still settle loading and remove stale cached records. |
| 6 | Cache derived filtered and sorted schedule lists. | [`shownServices()`](../app/screens/schedule/index.js) filters and sorts the schedule whenever the screen is recomputed. | Less repeated CPU work on redraws. | Medium. Invalidate for schedule, clock, feature, filter, name-map and search changes. |
| 7 | Precompute searchable service text. | [`matches()`](../app/screens/schedule/index.js) rebuilds date labels, assignment text and normalized strings per service per search. | Faster search with a large schedule. | Medium. Rebuild when services or displayed member names change. |
| 8 | Group calendar services by date once per render. | [`monthGrid()`](../app/screens/schedule/calendar.js) filters the month's service list separately for every day cell. | Replaces repeated scans with one grouping pass. Benefit is bounded by the relatively small monthly list. | Low. Keep day ordering, selected-day behavior and accessible labels unchanged. |
| 9 | Avoid full-screen DOM replacement for unrelated live updates. | [`render.js`](../app/render.js) requests a screen render for background updates; [`replaceMarkup()`](../app/ui/replace.js) recreates markup while preserving fields, focus and scroll. | Less DOM work and fewer layout changes while the app is open. | Medium to high. Preserve live badges, unsaved fields, focus, caret and clock transitions. |
| 10 | Download service-worker release assets with bounded concurrency. | [`storeRelease()`](../sw.js) fetches and caches discovered files sequentially. | Faster completion of an offline release install on a high-latency network. | Medium. Keep all-or-nothing activation, release stamps and rollback behavior. |

## Selected change

Item 1 has the strongest expected benefit relative to its small scope:
the dependency sat on the startup critical path for everyone, despite push
being optional. Other potentially large gains require broader changes to
screen loading or the completeness of schedule and history data. The
calendar grouping change is smaller but affects a modest monthly list.

`connect()` now initializes only the core Firebase services. A shared
`ensureMessaging()` promise loads and initializes Messaging when push is
registered or an existing token needs cleanup. Unsupported browsers keep
local alerts. Failed initialization can be retried and registration failures
retain the existing plain-language warning.

A saved token represents an existing server-push registration before this
page loads the SDK, so startup must not send a duplicate local reminder.
Pending registration is invalidated when cleanup starts, including sign-out
while the optional SDK is still loading.

## Verification

A fake-browser comparison ran the original source from starting commit
`ed133b9` and the changed source against the same fake Firebase, with a
deliberate 1,500 ms delay on the Messaging response:

| Version | Messaging requests before the passcode screen | Passcode screen ready |
| --- | --- | --- |
| Original | 1 | 1,987 ms |
| Changed | 0 | 122 ms |

This is a controlled demonstration of removing a blocking dependency, not
a live-site speed estimate. Network latency and device speed vary.

- Module check: 69 modules and 147 actions passed.
- Unit and source-rules tests: 106 passed; one server Fill property test
  skipped because the Functions packages were not installed.
- Browser tests: all 110 passed, including seven new push tests.
- Release build: passed; existing browser tests also exercised stamped
  builds, maintenance mode and offline releases.
- The push tests simulate notification permission, token delivery and
  cleanup. They do not send real notifications or change production data.
- No Functions or Firestore rules changed. Their deployment is not needed.

## Build log

- 2026-10-10: Reviewed the ten opportunities against the current source,
  selected optional Messaging loading, implemented it, and verified startup
  and notification regressions with fake data. Production was not deployed.

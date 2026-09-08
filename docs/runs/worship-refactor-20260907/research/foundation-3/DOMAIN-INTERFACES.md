# Foundation 3 domain interfaces

This slice adds two dependency free classic scripts. They expose frozen APIs
through both CommonJS and `window.WorshipApp.domain`.

## Member domain

`/Users/anthony/Projects/worship-refactor-worktrees/foundation-domain/src/domain/member.js`

- The composition root uses the existing schedule `dutiesFor` helper for
  assignment collection. This module owns the member renderer grouping and
  member-only request, count, and setlist selectors.
- `groupDuties(duties, serviceId)` returns the existing member renderer shape:
  date rows with `edge` and service entries containing `svc`, `id`, and
  `duties`. The construction index is private.
- `findPendingRequest(requests, serviceId, duty, name)` matches one exact
  pending request.
- `requestsForMember(requests, name)` returns a newest-first copy.
- `pendingRequestCount(requests)` counts pending entries without mutation.
- `setlistSummary(setlists, id)` returns `{count, confirmed, changed}` or
  `null`, using the existing confirmation timestamp rule.

Compatibility aliases remain available for the grouping, request count, and
setlist selectors. The module does not know about the DOM, storage, Firebase,
seed records, or the clock.

## Coordinator domain

`/Users/anthony/Projects/worship-refactor-worktrees/foundation-domain/src/domain/coordinator.js`

- `upcomingServices(services, today, serviceLabels)` filters and orders by
  date, then the existing service-label order.
- `eligibleDutyRoster(service, duty, departments, members, categories)` keeps
  the current assignment visible when a changed roster no longer contains it.
- `conflictsWithSuggestions(services, options)` returns rows containing the
  service, active conflict, and one suggestion list per conflicted duty. The
  existing schedule `activeConflicts` and `suggestSubs` helpers are required
  through `options.schedule`, so conflict and substitution policy stays in one
  module.
- `expectedDutyCounts(services)` and `expectedDuties(service, services,
  categories)` preserve the half-or-more planned-service rule.
- `gapRows(services, today, horizon, categories, serviceLabels)` returns
  `{service, missing}` rows for partially planned services in the horizon.
- `workloadRows(stats, members)` preserves the heaviest-first ordering.
- `splitRequests(requests)` returns sorted `all`, `pending`, and `resolved`
  arrays.

All selectors return new collection containers and do not write through their
inputs. Dates and the existing schedule API are injected. Notification,
reminder, command, access, Sheet network, and lifecycle decisions remain in
the host application.

## Browser order

The required runtime order in
`/Users/anthony/Projects/worship-refactor-worktrees/foundation-domain/index.html`
is `constants`, `state`, `schedule`, `member`, `coordinator`, `sheet`,
`storage`, `firebase`, `subscriptions`, then `app.js`. Each local reference
keeps `?v=DEV` for release stamping.

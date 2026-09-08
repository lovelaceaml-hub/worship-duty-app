# Calendar and service workspace prototype

Current requested revision: [acceptance and ownership](../../../runs/worship-refactor-20260907/decisions/20260908-calendar-redesign.md). Anthony authorized a broader palette and layout on 8 September 2026. Historical original-B references remain unchanged.

## Review on this Mac

[Current records, view-only](http://127.0.0.1:8100/?screen=home). Start the server with:

```sh
node /Users/anthony/Projects/worship-duty-app/scripts/real-preview.cjs
```

Choose your name in the top-right header. Home, My Duties and Presider share month navigation. The Home month list expands individual services; My Duties groups a date in one card; Presider offers My presiding and All services, actual service details and separate Preparation, Glory and Thanks groups. Manage starts with department selection.

The current-records preview is read-only and holds data in memory. Its status and fetched time appear in the footer. No records belong in reference images, tests or Git. Ordinary index.html still loads fictional fixtures and supports editable prototype journeys. No production interface approval is inferred.

## Verification

The new deterministic test lives at /Users/anthony/Projects/worship-duty-app/tests/calendar-redesign.mjs after integration. It uses injected fictional data and the loopback server. Existing production regression and emulator checks remain separate.

Current source review and verification receipts: [calendar redesign evidence](../../../runs/worship-refactor-20260907/research/calendar-redesign/). Original direction, typography and prior prototype evidence are historical, not assertions that the new revision matches an old screenshot.

## Current references

[Phone and desktop views](screenshots/calendar-20260908/README.md) use fictional information. The canonical comprehensive journey test and eight final Axe capture views passed. Native Sol high source and delta reviews passed.

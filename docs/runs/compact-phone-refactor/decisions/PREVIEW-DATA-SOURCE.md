# Preview source correction

## Verified discrepancy

The first Weekbook preview incorrectly used the bundled historical `seed-data.js` as though it satisfied the request for current app data. That file contains 74 May-July 2026 services. The controller selected the wrong source; this was a preview mistake, not evidence that October had disappeared from production.

A read-only projection of the current Firestore `schedule` collection on September 15, 2026 found 180 services: May 41, June 17, July 16, August 19, September 42, October 21, November 12, December 12. No production writes occurred.

## Existing structural contributors

- `app.js` has a bundled seed initialization path and later Firestore subscriptions. A design that reads only seed data is incomplete.
- `design-gallery/build.mjs` reads prototype sources and rewrites source text into production presentation code. A change can miss a transform or one appearance's separate path.
- The approved shared screen-information builders and explicit four-layout placement remove those duplicated behavior paths. They are planned, not implemented by these design artifacts.

## Corrected preview contract

- Read current service metadata from the named Firebase project before presenting a design. Verify month coverage and show capture time.
- Keep the snapshot outside Git. `scripts/refresh-compact-preview.cjs` exports only date, service, worship and time; it also loads the same public song catalog used by the live app (537 verified entries). It does not include member names or assignments.
- The preview reads one `/preview-data.js` resource. Do not fall back to old seed content or invent rows if it is missing.
- Missing assignment data means unknown, never unfilled or a zero attention count.
- An automatic approval review rejected retention of the complete assignment/member snapshot. Narrowed September and October assignment permission is pending with Anthony. Design structure continues using approved metadata meanwhile.
- `scripts/serve-compact-designs.py` exposes only the explicit design assets and the designated snapshot on localhost. Other repository files return 404. It performs no production operations.

## Delivery boundary

Anthony approved Weekbook and requested that this task finish the designs and produce a handoff. Runtime and release remain stopped at that boundary.

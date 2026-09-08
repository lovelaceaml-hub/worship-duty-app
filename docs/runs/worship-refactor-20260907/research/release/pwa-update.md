# PWA update and rollback verification

## Scope

This slice verifies the actual service worker resolved from
`../../sw.js` relative to the test file, with `WORSHIP_SW_PATH` available for
an explicit checkout override. It runs through a fictional loopback shell. The
test file is
`/Users/anthony/Projects/worship-refactor-worktrees/release/tests/release/pwa-update.test.mjs`.
No production source, Git state, deployment command, configuration, seed data,
or member data is written or used.

The actual worker source retains its existing Firebase imports and app
configuration unchanged. The loopback server serves that source with the
worker policy `script-src 'self'; connect-src 'self'`, which blocks remote
Firebase script initialization and remote connections at the worker boundary.
The browser context also aborts every non-loopback request, so this test makes
no production network request.

## Service worker contract observed

The source defines `const RELEASE = 'DEV'` and derives the active cache as
`wds-<release>`. Install calls `skipWaiting`. Activate deletes every cache whose
name differs from the active cache, then calls `clients.claim`. GET requests
with a `v` query use cache first. Same-origin requests without `v` use network
first and fall back to a cached response when the network fails. Foreign-origin
requests return before `respondWith`, so the service worker does not handle or
cache them.

Because activate currently deletes previous release caches, the test expects
release A cache to disappear after release B activates and release B cache to
disappear after rollback A. Those assertions are intentionally fixed to the
current contract, so a future retention change fails the test for review. A
versioned A asset is cached and distinct from the versioned B asset, and the
rollback A asset is served after A reactivates.

## Test design

The test reads the actual service worker source and transforms only its exact
`RELEASE` assignment to fictional releases A and B. It checks that this is the
only source transform. A local HTTP server serves only a fictional HTML shell
and two distinct versioned JavaScript assets. Playwright uses the existing
`chromium` package with no install. The loopback `/sw.js` response adds the
worker CSP above, and a browser context route aborts every request whose origin
is not the loopback origin, including any attempted Firebase CDN import and the
foreign-origin probe.

The browser registers the real service worker, waits for control and activation,
warms the A shell and asset cache, updates to B through
`registration.update()`, then rolls back to A. It warms the rollback shell,
turns the browser offline, and confirms the network-first shell recovers from
Cache Storage. It then probes a foreign loopback port, confirms the deny route
saw the request, and confirms no cache contains the foreign URL.

## Verification

Safe command:

```text
node --test tests/release/pwa-update.test.mjs
```

Result under the required local loopback execution boundary:

```text
1 test passed, 0 failed in 2.84 seconds
```

The combined release command `node --test tests/release/**` also passed with
9 tests and 0 failures in 4.70 seconds under the same local loopback boundary.

The explicit canonical override
`WORSHIP_SW_PATH=/Users/anthony/Projects/worship-duty-app/sw.js node --test tests/release/pwa-update.test.mjs`
also passed with 1 test and 0 failures in 2.40 seconds.

The first sandboxed attempt failed before the test body with
`listen EPERM: operation not permitted 127.0.0.1`. This is an execution
boundary failure, not a service worker or refactor regression. The same command
rerun with local loopback permission passed. No source files were changed by the
test.

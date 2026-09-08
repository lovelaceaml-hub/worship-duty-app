# Calendar redesign controller checks

## Boundary

Baseline is canonical 81e48b1. The revision affects local prototype browser assets and deterministic fictional tests only. Production runtime remains 9247f75 at Hosting stamp 20260908041730. Actual records may be displayed only by the established GET-only loopback preview, without screenshots or logs. All stored visual references and tests use fictional people and services.

## Before measurements

Headless Chromium, isolated contexts, local injected read-only fictional payload, 430x932 and 1280x932. Measured navigation to rendered screen on this Mac, not production startup. Phone Home 194ms, My Duties 24ms, Presider 27ms, Manage 24ms. Desktop Home 44ms, My Duties 25ms, Presider 26ms, Manage 22ms. Zero browser errors or horizontal page overflow in eight views. Single-run local measurements are indicative only.

## Required revised checks

Pending: calendar month/day and year boundaries, member selection, day grouping and feast labels, complete-team disclosure, department distinctions, Presider filtering and saved state fidelity, ordered song groups and Appendix display, fictional edits and failed-save recovery, keyboard focus, phone/desktop Axe, empty/error recovery, real read-only aggregate smoke, source review and safe backup.

## Current candidate render and real-read checks

Frozen LDU candidate rendered all four screens at 430x932 and1280x932 using injected fictional data, with zero browser errors or overflow. Navigation-to-screen timing: phone72/38/23/23ms, desktop49/22/19/23ms for Home/My Duties/Presider/Manage. This remains a single local comparison, not a production benchmark.

The candidate is integrated in the existing local8100 read-only server. Real aggregate-only smoke passed all four screens on both viewports: zero browser errors, page overflow, external browser requests or write attempts. Payload contained239 service/saved-plan entries,155 saved plans and517 catalog songs. No names, assignments, song contents or screenshots were emitted or retained. Native review1 corrections and full interaction checks remain pending.

## Fully enabled acceptance

After enabling every required assertion, the first full run exposed low text contrast and duplicate Home region labels. The writer darkened the two text tokens and gave the calendar its own accessible name. Root then passed the fully enabled comprehensive journey suite:1test,0failures,0skips,~11.5s. Required header focus, consecutive keyboard month changes, historical personal duties and Appendix Glory/Thanks checks all executed. Earlier diagnostic runs with temporarily disabled assertions are not acceptance evidence.

Coverage includes eight main real-mode fictional phone/desktop Axe views, fictional editing and Manage, a later-member Presider case, and four empty states. All test content is fictional, including the payload labeled as real mode. The canonical rerun and final native Sol high delta review passed.

## Canonical final check

The integrated command `WORSHIP_PREVIEW_TEST_PORT=8122 node --test /Users/anthony/Projects/worship-duty-app/tests/calendar-redesign.mjs` passed using its default prototypeRoot:1test,0failures,0skips,~11.9s. A separate final reference capture checked all four screens at both widths with zero Axe violations, browser errors or page overflow. Eight fictional images are committed under docs/design/prototype/open-bulletin/screenshots/calendar-20260908/.

The final canonical real-data smoke passed both viewports with zero browser errors, external browser requests or writes; all four screens fit without horizontal page overflow. Only aggregate results were retained. Source hashes match the frozen native review2 candidate and source-manifest.json. Native Sol high review2 passed with no actionable regressions.

---
lane: LV
title: Verification
state: reviewed
model: gpt-5.6-luna
runner: Codex
worktree: /Users/anthony/Projects/worship-refactor-worktrees/verification
review: Sol-pass
depends_on: baseline commit 5beec15d9a9299bed2c51a91c33f157fb769cd79
updated: 2026-09-08T14:52Z
---

# LV: Verification

## Work order

Run an isolated fixture-only browser baseline before Foundation integration. Establish all request intercepts before navigation, serve only fictional schedule, member, song, and configuration fixtures, deny every outgoing production path, cover the named schedule, member, presider, setlist, save, merge, year, auth, and focus cases, and capture phone and desktop screenshots, axe results, and timings. Follow the browser wave with actual Firestore emulator writes for the setlist transaction contract. Do not edit production source, deploy, publish, merge, or touch live Firebase.

## Result

The corrected fixture-only Playwright suite covered nineteen fictional scenarios against the baseline source, canonical Foundation, and F3 source. The immutable baseline reports its known advancing-clock confirmation regression explicitly, while canonical Foundation and F3 pass the same check. Coverage includes launch cleanup, fictional seeded schedule, manual duty merge, year boundaries, exact auth wait timing, whole-site passcode lock, Manage unlock and assignment write, member journey, presider remount, DOM focus preservation, schedule snapshot preservation, keyboard controls, Library empty state, Services, Insights, create-before-snapshot, confirmation, and save errors.

The browser harness starts its loopback server before each navigation, installs request interception before navigation, replaces Firebase browser modules with in-memory fixtures, blocks service workers, and denies every non-loopback `fetch`. Network evidence keeps only origins and categories. Both runs recorded zero unexpected requests. The Manage probe rejected a fictional pre-auth host write with `unauthenticated`, recorded zero successful pre-auth host writes, and observed the schedule write after auth readiness. The whole-site lock rendered an axe-clean locked screen and unlocked with the fictional passcode. Song row Enter, nested action Enter, and header-home Enter passed on phone and desktop.

Baseline evidence is isolated in `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/current/`, so the default `npm run test:ui` command cannot overwrite the original baseline folder. The current JSON records the baseline reference commit, recursively discovered runtime source SHA-256 digest, runtime source files, runtime, and `current-source` evidence scope. Baseline local stub ready times were 54.75 ms on phone and 57.96 ms on desktop. Baseline axe had no critical findings in the schedule, member, or presider views. Existing desktop serious `color-contrast` findings and Manage critical `label` and `select-name` findings remain documented as redesign input. The locked and unlocked whole-site views were axe-clean.

Integrated evidence is in `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/foundation-current/`. Its recursive runtime source digest is recorded in the JSON, including the extracted state and subscriptions modules and runtime CSS, with `current-integrated-source` evidence scope. Integrated local stub ready times were 59.85 ms on phone and 52.92 ms on desktop. The integrated Manage, keyboard, focus, remount, and lock journeys passed with the same fixture-only network result.

The actual-source emulator contract also passed with explicit `WORSHIP_EMULATOR_PROJECT=demo-worship-refactor` and `FIRESTORE_EMULATOR_HOST=127.0.0.1:8187`. The harness executes the actual `createSetlistIfAbsent` function from the selected `song-app.js` through a real emulator adapter and browser-compatible `exists()` snapshot wrapper. Baseline timings were 13.58 ms for the existing setlist path and 9.38 ms for creation. Integrated timings were 13.69 ms and 6.63 ms. Existing fictional songs were preserved, missing setlists used latest in-memory songs, and pending creation promises cleared. The checks touched only fictional setlist documents and ran with Functions emulation disabled.

The DOM focus check asserts active element identity and typed value after a schedule snapshot on both viewports. The F2 supplement below adds deterministic request draft, scroll, song root, Library view, and `nav:false` checks on both viewports, including a second snapshot after the Library search loses focus so the actual song mount path is exercised.

Changed files:

- `/Users/anthony/Projects/worship-refactor-worktrees/verification/tests/fixture-baseline.mjs`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/tests/emulator-setlist-baseline.mjs`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/tests/ui-qa.mjs`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/lanes/LV.md`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/current/`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/foundation-current/`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-correction.md`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-baseline/`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-foundation/`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-f3-foundation/`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-final-baseline/`
- `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-final-canonical/`

Verification commands and actual results:

- `node --check /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/fixture-baseline.mjs`, passed.

## Final Manage viewport correction

Recorded 2026-09-08T04:13Z. The coordinator Manage journey now runs the same
fictional editor unlock, deferred auth, edit-before-release, zero pre-auth host
attempt, actual schedule write, overflow, and Axe checks at phone 390x844 and
desktop 1440x1000. The immutable baseline desktop probe derived 33 exact
critical `label` and `select-name` findings, which are recorded under the
separate `manage-desktop` allowlist. No global Axe rule exception was added.

Final baseline command:

```text
npm_config_cache=/tmp/npm-cache WORSHIP_EXPECT_CONFIRMATION_REGRESSION=1 WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-final-baseline WORSHIP_EVIDENCE_SCOPE=round5-final-baseline-manage-phone-desktop npm run test:ui
```

Result: `passed-with-expected-regression`, 19 scenarios, 17 Axe views, 66
allowlisted Manage findings, and zero unexpected requests. Phone ready was
56.88 ms and desktop was 55.59 ms. Both Manage viewports recorded zero
pre-auth application attempts, edit observed before auth release, and the
expected existing baseline Axe findings. Confirmation remained an explicit
expected regression. Evidence:
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-final-baseline/fixture-baseline.json`.

Final canonical command:

```text
npm_config_cache=/tmp/npm-cache WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-final-canonical WORSHIP_EVIDENCE_SCOPE=round5-final-canonical-manage-phone-desktop npm run test:ui
```

Result: `passed`, 19 scenarios, 17 Axe views, zero unexpected requests. Phone
ready was 55.53 ms and desktop was 57.72 ms. Both Manage viewports passed the
same auth, edit, write, and exact Axe checks. Evidence:
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-final-canonical/fixture-baseline.json`.

Canonical source was already updated to the frozen F3 runtime before this
run. The original baseline evidence remains untouched. Native Sol round 5
review is pending. No emulator was started in this correction, and no Git,
merge, push, deployment, or production source changes were made.

## Correction round 5

Recorded 2026-09-08T03:51Z. The compatibility entrypoint now prints
fixture-only mode and explicitly says a supplied `UI_BASE_URL` is ignored.
The fixture harness now guards every captured view and every Axe impact by
exact rule ID, impact, and fixture-stable target. The allowlist contains only
the 33 existing critical Manage `label` and `select-name` findings. The guard
self-check rejects serious, moderate, and critical additions, a finding on a
different view, and duplicate nodes. The receipt marks the accessibility run
as not a full accessibility pass and lists the per-view findings.

The restored fictional primary journeys cover Library no-match empty state,
Services, and Insights on phone and desktop. Pure helper evaluation loads the
optional F3 `src/domain/member.js` and `src/domain/coordinator.js` files in
the canonical `index.html` order when present.

The `WORSHIP_EXPECT_CONFIRMATION_REGRESSION=1` override is accepted only when
the discovered runtime digest matches the immutable baseline digest, so a
current or arbitrary source cannot use the baseline exception. Canonical
verification with the override exited 1 before opening the fixture server with
the digest restriction error.

Baseline command:

```text
UI_BASE_URL=https://invalid.example.invalid npm_config_cache=/tmp/npm-cache WORSHIP_EXPECT_CONFIRMATION_REGRESSION=1 WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-baseline WORSHIP_EVIDENCE_SCOPE=round5-baseline-axe-all-journeys npm run test:ui
```

Result: `passed-with-expected-regression`, 19 scenarios, zero unexpected
requests. The wrapper reported `UI_BASE_URL` was not used. Phone ready was
55.69 ms and desktop ready was 55.18 ms. The baseline confirmation result
was `confirmed=0`, `changed=1`, with two advancing Date calls and distinct
timestamps. Evidence:
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-baseline/fixture-baseline.json`.

Canonical Foundation command:

```text
npm_config_cache=/tmp/npm-cache WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-foundation WORSHIP_EVIDENCE_SCOPE=round5-foundation-axe-all-journeys npm run test:ui
```

Result: `passed`, 19 scenarios, zero unexpected requests. Phone ready was
54.75 ms and desktop was 55.65 ms. Evidence:
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-foundation/fixture-baseline.json`.

F3 source command:

```text
npm_config_cache=/tmp/npm-cache WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/foundation-domain WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-f3-foundation WORSHIP_EVIDENCE_SCOPE=round5-f3-foundation-axe-all-journeys npm run test:ui
```

Result: `passed`, 19 scenarios, zero unexpected requests. Phone ready was
59.98 ms and desktop was 55.70 ms. Evidence:
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round5-f3-foundation/fixture-baseline.json`.

The committed original baseline evidence was not overwritten. Native Sol
round 5 review is pending. Git, merge, push, deployment, and production source
changes remain outside this lane.

## Determinism correction round 3

Recorded 2026-09-08T02:44:02Z. The fixture harness now fixes the browser
calendar to `2026-09-07T12:00:00-07:00` with `page.clock.setFixedTime` before
navigation, sets `reducedMotion: 'reduce'` on every fixture context, and sorts
all discovered runtime paths before hashing. The digest method and file order
are included in each current evidence record. Timers and performance clocks
remain real. The committed original baseline evidence was not overwritten.

Baseline command and result:

```text
npm_config_cache=/tmp/npm-cache WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round3-baseline WORSHIP_EVIDENCE_SCOPE=round3-baseline-fixed-date-motion npm run test:ui
```

Passed all fifteen fictional scenarios with zero unexpected requests. Evidence
is at `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round3-baseline/fixture-baseline.json`.
Phone ready time was 53.76 ms and desktop ready time was 54.02 ms. Sorted
source digest: `ec7ff363e5e142ad9c64f81c8d09c0ed485a12a5db6ac85a994cf33cdbdeed62`.

Canonical Foundation command and result:

```text
npm_config_cache=/tmp/npm-cache WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round3-foundation WORSHIP_EVIDENCE_SCOPE=round3-foundation-fixed-date-motion npm run test:ui
```

Passed all fifteen fictional scenarios with zero unexpected requests. Evidence
is at `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round3-foundation/fixture-baseline.json`.
Phone ready time was 58.50 ms and desktop ready time was 57.48 ms. Sorted
source digest: `46f2fa08d56dc7470be3b35afe756ef637282c45c0246f0cb88146b36bd0ed3c`.

Both runs recorded zero axe violations for schedule, My Duties, and Presider
at phone and desktop sizes. My Duties reported one incomplete axe check per
viewport, with no violation. Site lock and unlocked captures reported zero
violations and zero incomplete checks. The Manage capture retained critical
`label` and `select-name` violations. No critical axe violations were recorded
in the schedule, My Duties, Presider, site-lock, or unlocked captures. Full
details are in `research/verification/round3-correction.md`.

The earlier confirmation timeout was not reproduced in the targeted probe. Root
reproduced a source defect in unchanged `song-app.js`: `confirmSetlist` stamps
metadata and `updateSetlist` stamps the same patch again. With an advancing
clock this can produce `confirmedAt=101`, `updatedAt=102`, and
`isConfirmed=false`. The fixed browser Date is only for calendar determinism and
can conceal the double-stamp because both calls return one value. Production
correction and its advancing-clock regression are pending the root lane. This
verification lane made no production source edits.

Review status: native Sol round 4 pending. Git, deployment, and merge remain
controller-owned and were not performed by this lane.

## Correction round 4

Recorded 2026-09-08. The browser harness now exposes the immutable baseline
confirmation defect with an isolated advancing Date, while retaining the fixed
September calendar for all other journeys. The baseline is classified
`passed-with-expected-regression`, not as a clean pass. The canonical
Foundation source passes the same scenario with one metadata timestamp. The
setlist race now releases deferred snapshot listeners explicitly after the
Library picker mounts. Manage proves edit-before-release and auth release,
ready, and write order with logical event sequence, while retaining real timing
measurements when timestamps tie.

Browser baseline command:

```text
npm_config_cache=/tmp/npm-cache WORSHIP_EXPECT_CONFIRMATION_REGRESSION=1 WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round4-baseline WORSHIP_EVIDENCE_SCOPE=round4-baseline-advancing-confirmation-deferred-snapshot npm run test:ui
```

Result: `passed-with-expected-regression`, 15 scenarios, zero unexpected
requests, phone ready 55.38 ms, desktop ready 53.50 ms. Confirmation exposed
`confirmed=0`, `changed=1`, two Date calls, and distinct timestamps. Evidence:
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round4-baseline/fixture-baseline.json`.

Browser canonical command:

```text
npm_config_cache=/tmp/npm-cache WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round4-foundation WORSHIP_EVIDENCE_SCOPE=round4-foundation-advancing-confirmation-deferred-snapshot npm run test:ui
```

Result: passed, 15 scenarios, zero unexpected requests, phone ready 58.01 ms,
desktop 56.58 ms. Confirmation produced `confirmed=1`, `changed=0`, one Date
call, and equal timestamps. Evidence:
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round4-foundation/fixture-baseline.json`.

Axe remained clean for schedule, My Duties, Presider, site-lock, and unlocked
captures. My Duties had one incomplete check per viewport. Manage retained
critical `label` and `select-name` findings, which remain redesign input.

The emulator used fictional project `demo-worship-refactor`, explicit host
`127.0.0.1:8193`, cached Firebase CLI, Java at
`/Users/anthony/tools/jdk/Contents/Home/bin/java`, and temporary rules at
`/private/tmp/worship-emulator-round4/firestore.rules`. Functions emulation was
disabled. Each of two concurrent runs used a unique document suffix and
cleaned only its own setlist documents. Baseline alpha/beta existing/missing
timings were 31.79/14.93 ms and 32.24/14.30 ms. Canonical timings were
16.11/10.84 ms and 16.67/11.23 ms. Evidence:
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round4-emulator-baseline/` and
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round4-emulator-foundation/`.

Full details: `research/verification/round4-correction.md`. Native Sol round 4
review is pending. Git, merge, push, and deployment were not performed by this
lane.
- `node --check /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/emulator-setlist-baseline.mjs`, passed.
- `npm_config_cache=/tmp/npm-cache npm run test:ui`, passed. Output: current baseline evidence path above, zero unexpected requests, phone 54.75 ms, desktop 57.96 ms.
- `WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/foundation-current npm_config_cache=/tmp/npm-cache npm run test:ui`, passed. Output: integrated evidence path above, zero unexpected requests, phone 59.85 ms, desktop 52.92 ms.
- `WORSHIP_EMULATOR_PROJECT=demo-worship-refactor FIRESTORE_EMULATOR_HOST=127.0.0.1:8187 node /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/emulator-setlist-baseline.mjs`, passed. Existing 13.58 ms, missing 9.38 ms.
- `WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/foundation-current WORSHIP_EMULATOR_PROJECT=demo-worship-refactor FIRESTORE_EMULATOR_HOST=127.0.0.1:8187 node /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/emulator-setlist-baseline.mjs`, passed. Existing 13.69 ms, missing 6.63 ms.

## Review

Controller review pending. No production source seam was required. The safe `npm run test:ui` wrapper ignores `UI_BASE_URL` and routes all verification through the fixture-only harness. Current and integrated evidence are separated from the baseline reference.

## F2 regression supplement

The F2 supplement ran after the previous receipt. It kept the committed baseline evidence untouched and wrote the new baseline result to `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/f2-baseline/fixture-baseline.json` and the canonical integrated result to `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/foundation-current/fixture-baseline.json`.

Both runs passed all fifteen scenarios with zero unexpected requests. On phone and desktop, the request form kept its focused textarea, typed fictional note `Fixture request draft`, fictional request key, and document scroll at 240 pixels across a schedule snapshot. The focused Library search kept `Fixture`, active `#lib-search`, scroll, the same `#song-root` DOM node, current `Library` tab, and `nav:false`. A second snapshot after blurring the search kept the same root, query, Library tab, and `nav:false`, exercising the unfocused `renderSongs` path. The run also confirmed zero application host write attempts before auth readiness, excluding the intentional `qaProbe`, and recorded edit initiation before auth readiness.

The baseline source digest is `a3e51cf1a53229248a7bc13a1b3d1343ed63ac7d6aba031c01fa43eb0366e0ee`. The canonical integrated digest is `9842825540cec1ab8e13a58199dc589d45b5525fd5db071b380c841de9a3a3b4` and includes the recursively discovered `src/core/state.js` and `src/services/subscriptions.js` modules. Latest local stub ready times were 52.61 ms phone and 53.57 ms desktop for the baseline, and 57.13 ms phone and 55.49 ms desktop for canonical integrated source. Axe checks continued to report no critical violations in the schedule, My Duties, or Presider captures.

Exact supplement commands and results:

- `npm_config_cache=/tmp/npm-cache WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/f2-baseline WORSHIP_EVIDENCE_SCOPE=baseline-f2-snapshot npm run test:ui`, passed. Evidence: `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/f2-baseline/fixture-baseline.json`.
- `npm_config_cache=/tmp/npm-cache WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/foundation-current WORSHIP_EVIDENCE_SCOPE=foundation-current-f2-snapshot npm run test:ui`, passed. Evidence: `/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/foundation-current/fixture-baseline.json`.
- `node --check /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/fixture-baseline.mjs`, passed.

## Correction round 6

Recorded 2026-09-08. The fixture harness now captures one immutable runtime
snapshot before the server starts. The digest, static responses, and pure
helper evaluator all use that same byte map. A temporary isolated source copy
is edited after snapshot creation. The fresh disk digest changes, while the
snapshot digest and bytes served by the fixture server remain unchanged. The
copied source bytes are runtime input for this check, while browser fixture
data remains fictional.

Context routing is installed before the first page exists. The popup proof
uses the actual fixture context and opens the synthetic origin
`https://fixture-popup.invalid/initial`. The request is recorded as an
expected blocked fixture origin and fails with `net::ERR_BLOCKED_BY_CLIENT`.
It is kept separate from unexpected traffic. Launch failure cleanup still
closes its loopback server.

The local seed proof begins with an empty `wds-data-v2` store, then asserts the
fictional members and both fictional services in app state. It records the
default site lock before the test-only fixture view hook enables the capture.
The manual merge proof seeds and retains the fictional unmanaged duty
`Media Booth Fixture`.

Baseline command and result:

```text
WORSHIP_EXPECT_CONFIRMATION_REGRESSION=1 WORSHIP_EVIDENCE_SCOPE=immutable-baseline-round6 WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round6-baseline npm_config_cache=/tmp/npm-cache npm run test:ui
```

`passed-with-expected-regression`, 19 scenarios, zero unexpected requests.
Phone ready was 51.98 ms and desktop was 56.20 ms. Digest:
`ec7ff363e5e142ad9c64f81c8d09c0ed485a12a5db6ac85a994cf33cdbdeed62`.
Evidence:
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round6-baseline/fixture-baseline.json`.

Canonical command and result:

```text
WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_SCOPE=canonical-round6 WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round6-canonical npm_config_cache=/tmp/npm-cache npm run test:ui
```

`passed`, 19 scenarios, zero unexpected requests. Phone ready was 58.13 ms
and desktop was 237.40 ms. Digest:
`37af96cb1f58d3b5e061f255910269bb0ff4a896873b204703ca52215de3f7f5`.
Evidence:
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round6-canonical/fixture-baseline.json`.

Both reports captured 17 views with Axe output and the exact Manage baseline
allowlist. The reports explicitly retain the known Manage accessibility debt,
so they are not full accessibility passes. Emulator tests were not rerun.
Native Sol review 6 is pending. No production source, Git, deploy, or emulator
changes were made in this lane.

## Correction round 7

Recorded 2026-09-08. The fixture harness now classifies every captured blocked
request and denied fetch. The aggregate expected list contains only the
intentional fictional Google Docs and Apps Script guard probes. The synthetic
popup is recorded separately as an expected fixture block. Any other origin is
unexpected and fails the run. Every fixture context closes through the same
network and browser-error assertions.

The launch scenario proves the real context guard blocks an initial popup
navigation before the popup page exists. It also injects an unapproved fetch
and image resource, then proves both captured attempts are unexpected and
reject the isolated run. A separate injected console error and dynamically
executed throwing script prove that the real console and page error handlers
reject captured browser errors.

Evidence lifecycle now writes a unique `running` receipt before source
discovery, browser launch, or assertions. The shared catch path writes a
`failed` receipt before rethrowing. The failure replacement scenario invokes
that same wrapper after a prior green receipt and proves the old JSON and
Markdown are replaced while the old screenshot and source digest remain
unchanged.

Baseline command:

```text
WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round7-baseline WORSHIP_EVIDENCE_SCOPE=immutable-baseline-round7 WORSHIP_EXPECT_CONFIRMATION_REGRESSION=1 node /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/fixture-baseline.mjs
```

Result: `passed-with-expected-regression`, 19 scenarios, 17 Axe views, zero
unexpected aggregate requests, and zero unexpected captured browser errors.
The expected confirmation regression remains explicit. Digest:
`ec7ff363e5e142ad9c64f81c8d09c0ed485a12a5db6ac85a994cf33cdbdeed62`. Ready
timings: phone 53.72 ms, desktop 52.38 ms. Evidence:
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round7-baseline/fixture-baseline.json`.

Canonical command:

```text
WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round7-canonical WORSHIP_EVIDENCE_SCOPE=current-canonical-round7 node /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/fixture-baseline.mjs
```

Result: `passed`, 19 scenarios, 17 Axe views, zero unexpected aggregate
requests, and zero unexpected captured browser errors. Digest:
`37af96cb1f58d3b5e061f255910269bb0ff4a896873b204703ca52215de3f7f5`. Ready
timings: phone 55.31 ms, desktop 56.28 ms. Evidence:
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round7-canonical/fixture-baseline.json`.

The guard records 33 known critical `label` and `select-name` findings on each
Manage view, 66 total, using exact per-view target allowlists. The other 15
captured views have no known baseline findings. This is a guarded fixture
result, not a full accessibility pass. No emulator was rerun. Native Sol
round 7 review is pending.

## Correction round 8

Recorded 2026-09-08. The emulator harness now reads one immutable runtime byte
snapshot before hashing and passes that same snapshot into both concurrent
actual `createSetlistIfAbsent` evaluations. Browser screenshots now live under
`screenshots/<run-id>/`, and the running receipt creates and records the new
directory before source discovery. The actual failure replacement probe proves
the prior green screenshot remains separate and unchanged.

The pure Sheet fixture now includes a fictional `Closing Prayer` row with a
blank `Member` cell over an existing assignment. The parser and merge checks
require an empty assignment after the merge, while the seeded fictional
unmanaged `Media Booth #1` assignment remains.

Baseline command:

```text
WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round8-baseline WORSHIP_EVIDENCE_SCOPE=immutable-baseline-round8 WORSHIP_EXPECT_CONFIRMATION_REGRESSION=1 node /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/fixture-baseline.mjs
```

Result: `passed-with-expected-regression`, 19 scenarios, 17 Axe views, zero
unexpected requests and browser errors. Digest:
`ec7ff363e5e142ad9c64f81c8d09c0ed485a12a5db6ac85a994cf33cdbdeed62`. Ready
timings were 52.51 ms on phone and 54.53 ms on desktop. Evidence:
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round8-baseline/fixture-baseline.json`.
Screenshots are under the run-scoped directory recorded in that JSON.

Canonical command:

```text
WORSHIP_SOURCE_ROOT=/Users/anthony/Projects/worship-duty-app WORSHIP_EVIDENCE_ROOT=/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round8-canonical WORSHIP_EVIDENCE_SCOPE=current-canonical-round8 node /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/fixture-baseline.mjs
```

Result: `passed`, 19 scenarios, 17 Axe views, zero unexpected requests and
browser errors. Digest:
`37af96cb1f58d3b5e061f255910269bb0ff4a896873b204703ca52215de3f7f5`. Ready
timings were 57.46 ms on phone and 57.52 ms on desktop. Evidence:
`/Users/anthony/Projects/worship-refactor-worktrees/verification/docs/runs/worship-refactor-20260907/research/verification/round8-canonical/fixture-baseline.json`.

The exact Manage Axe allowlist remains 33 known critical findings per Manage
view, 66 total. The other 15 views have no known baseline findings. These are
guarded fixture results, not full accessibility passes. Root owns the actual
emulator run on the fictional project and loopback host. Native Sol round 8
review is pending. No production source, Git, deployment, or emulator changes
were made by this lane.

## Controller integration, 8 September 2026

Native Sol high review8 passed with no actionable findings. Root passed the final browser suite and both actual baseline/canonical emulator transaction runs, stopped the owned emulator, copied the three frozen test files, and verified matching SHA256s and syntax. This baseline verification lane is complete. Production redesign verification and the documented baseline Manage accessibility defects remain with later UI/integration lanes. See research/verification/controller-review-round8.md.

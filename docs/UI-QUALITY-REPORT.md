# Worship Service UI quality status

Current checkpoint: 8 September 2026. Compatible Foundation 3 and the confirmation fix are live from runtime commit `9247f75` at Hosting release `20260908041730`. The complete refactor and redesign are still in progress. Original B with smaller display typography is selected; complete prototype approval and final design fidelity/accessibility gates remain pending.

## Fictional functional verification

The UI command tests a loopback server with fictional members, services, songs and passcodes. It intercepts Firebase modules/configuration/seed files before navigation and ignores UI_BASE_URL. The corrected harness installs routing on the browser context before pages exist and proves that popup initial navigation is blocked. Runtime responses and pure helper evaluation use the exact immutable source bytes covered by the report digest. Supplying the live app URL does not turn this command into production verification. Never report its result as a live smoke check.

```sh
WORSHIP_EVIDENCE_ROOT=/private/tmp/worship-current-qa npm --prefix /Users/anthony/Projects/worship-duty-app run test:ui
```

The command writes fixture-baseline.json, fixture-baseline.md and screenshots under the explicit evidence directory. Without the override it writes current evidence under the project's docs/runs/worship-refactor-20260907/research/verification/current directory. Original baseline evidence is retained separately. Reports identify fixture-only mode, source digest, viewport, network isolation and known baseline findings.

The controller independently passed round8 against the current Foundation3 runtime: 19 fictional scenarios, 17 Axe views, zero unexpected network requests or browser errors, and no expected runtime regressions. See [controller round8 evidence](runs/worship-refactor-20260907/research/verification/controller-round8/fixture-baseline.json). Phone startup was 57.59 ms and desktop startup was 54.00 ms in this local fixture run. The historical baseline separately retains the documented confirmation defect. Earlier results remain as historical evidence, including a 237.40 ms desktop outlier in the lane's round6 run.

Native Sol review8 passed with no actionable findings. The three remaining test-evidence corrections are verified: immutable emulator source bytes, run-scoped screenshot sets with failure-path coverage, and explicit blank-member Sheet clearing. Both actual emulator runs passed against original and canonical source. Root verified exact copied test hashes before integration. See [review receipt](runs/worship-refactor-20260907/research/verification/controller-review-round8.md). This is completion of the fictional baseline verification lane, not approval of the full redesign.

## Local prototype checks

The corrected original-B clickable prototype passed 19 phone/desktop controller views with zero Axe violations, horizontal overflow, browser errors, or non-loopback requests. The open phone song panel is included. Nine targeted functional journeys and six additional Axe checkpoints passed in the design lane. Native Sol review2 requested three remaining sung-history/import edge-case corrections; correction3 is in progress. The prototype uses fictional data and does not prove production journey, accessibility, or performance completion.

## Accessibility status

Full accessibility approval is pending. Manage has 33 pre-existing critical label and select-name findings on each of the phone and desktop fictional baseline captures. The regression guard permits only those exact view, rule, impact and target combinations, with no blanket rule exclusions. My Duties also has a manual-review incomplete result. Clean scans of other named surfaces do not erase these findings. No full WCAG or all-screen accessibility pass is claimed.

The current nonvisual refactor may retain precisely documented existing baseline defects. The final redesigned interface must resolve them. Regression guards must check every captured surface and all impacts, reject new violations, and expose any narrow baseline exceptions in results. A functional pass or baseline exception is not a final accessibility approval.

## Production verification is separate

Hosting releases go through /Users/anthony/Projects/worship-duty-app/scripts/deploy.sh and its allowlisted staging directory. Before release, run the relevant fictional, domain, transaction, and release checks. After deployment, compare every public runtime file hash with its staged byte hash, then inspect the live locked interface in an isolated browser with Firebase disabled and fictional empty data. Do not select real members, load live records into captures, or write production data for QA.

Latest immediate production evidence: [20 matching runtime hashes](runs/worship-refactor-20260907/research/hosting-release-20260908041730.json) and [locked phone screen](runs/worship-refactor-20260907/research/hosting-ui-smoke-20260908041730.json). Actual service-worker release update, rollback, warmed offline recovery and foreign-origin denial passed separately. None of these results is produced by UI_BASE_URL or proves the full redesigned production journeys.

## Completion status

Foundation and the compatibility fix are live. Complete clickable prototype, approved references, redesigned member/presider/coordinator interfaces, final functional/fidelity/accessibility/performance verification, cumulative native Sol and Opus reviews, documentation and backup remain tracked in [the active plan](PLAN-REFACTOR-REDESIGN.md).

The [July report](design/archive/UI-QUALITY-2026-07-18.md) is historical only. Its live QA command, bottom-navigation description, output path and release verdict are superseded by this report.

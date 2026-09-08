# Worship Service UI quality status

Current checkpoint: 7 September 2026. Runtime confirmation fix `8acf332` is live at Hosting release `20260908030600`. The complete refactor and redesign are still in progress. Original B with smaller display typography is selected; complete prototype approval and final design fidelity/accessibility gates remain pending.

## Fictional functional verification

The UI command tests a loopback server with fictional members, services, songs and passcodes. It intercepts Firebase modules/configuration/seed files before navigation, blocks external traffic, and ignores UI_BASE_URL. Supplying the live app URL does not turn this command into production verification. Never report its result as a live smoke check.

```sh
WORSHIP_EVIDENCE_ROOT=/private/tmp/worship-current-qa npm --prefix /Users/anthony/Projects/worship-duty-app run test:ui
```

The command writes fixture-baseline.json, fixture-baseline.md and screenshots under the explicit evidence directory. Without the override it writes current evidence under the project's docs/runs/worship-refactor-20260907/research/verification/current directory. Original baseline evidence is retained separately. Reports identify fixture-only mode, source digest, viewport, network isolation and known baseline findings.

Root independently passed 15 functional scenarios against deployed source using the corrected round 4 suite: entry/passcodes, member and coordinator edits, keyboard navigation, draft/search/scroll preservation, delayed auth, explicit initial snapshot race, advancing-clock song confirmation, save errors and parsing contracts. These results are in [controller browser evidence](runs/worship-refactor-20260907/research/confirmation-fix/controller-browser/fixture-baseline.json). The Verification lane remains under correction and native review to restore all prior Library/Services/Insights assertions and enforce new accessibility regressions across every captured surface.

## Accessibility status

Full accessibility approval is pending. Manage has pre-existing critical label and select-name findings in fictional baseline captures. My Duties also has a manual-review incomplete result. Clean scans of other named surfaces do not erase these findings. No full WCAG or all-screen accessibility pass is claimed.

The current nonvisual refactor may retain precisely documented existing baseline defects. The final redesigned interface must resolve them. Regression guards must check every captured surface and all impacts, reject new violations, and expose any narrow baseline exceptions in results. A functional pass or baseline exception is not a final accessibility approval.

## Production verification is separate

Hosting releases go through /Users/anthony/Projects/worship-duty-app/scripts/deploy.sh and its allowlisted staging directory. Before release, run the relevant fictional, domain, transaction, and release checks. After deployment, compare every public runtime file hash with its staged byte hash, then inspect the live locked interface in an isolated browser with Firebase disabled and fictional empty data. Do not select real members, load live records into captures, or write production data for QA.

Latest immediate production evidence: [18 matching runtime hashes](runs/worship-refactor-20260907/research/hosting-release-20260908030600.json) and [locked phone screen](runs/worship-refactor-20260907/research/hosting-ui-smoke-20260908030600.json). Actual service-worker release update, rollback, warmed offline recovery and foreign-origin denial passed separately. None of these results is produced by UI_BASE_URL or proves the full redesigned production journeys.

## Completion status

Foundation and the compatibility fix are live. Complete clickable prototype, approved references, redesigned member/presider/coordinator interfaces, final functional/fidelity/accessibility/performance verification, cumulative native Sol and Opus reviews, documentation and backup remain tracked in [the active plan](PLAN-REFACTOR-REDESIGN.md).

The [July report](design/archive/UI-QUALITY-2026-07-18.md) is historical only. Its live QA command, bottom-navigation description, output path and release verdict are superseded by this report.

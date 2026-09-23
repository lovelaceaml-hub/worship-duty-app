# UI Quality Report

> Historical as of 2026-09-20. This report covers the 2026-07-18 rebuild of what is now the Original appearance, before member sign-in and the other three appearances. No equivalent report exists for the current app; real-phone and screen-reader checks are open items in [HANDOFF.md](HANDOFF.md) section 5.

## Release and evidence

- **App / version / date:** LV Zion Worship Service, WATV-inspired rebuild, 2026-07-18
- **Tester:** Codex automated and manual browser review
- **Browser and device / viewport:** Chromium at 1440×1000 and mobile Chromium at 360×800
- **Primary journey evidence:** `npm run test:ui` against local preview and `UI_BASE_URL=https://lv-zion-duties.web.app npm run test:ui` after release; screenshots and JSON are written to `/tmp/worship-duty-ui-evidence` for local inspection only, because the live schedule contains personal congregation assignments that must not enter Git

## Quality gate

| Check | Result | Evidence / issue | Owner / follow-up |
| --- | --- | --- | --- |
| Primary journey completes on desktop | Pass | Schedule, My Duties, Presider Home, Library search/empty result, Services, Insights, header Home, and Manage lock all loaded |, |
| Primary journey completes on phone | Pass | Same read-only journey completed at 360×800 with fixed bottom navigation |, |
| Empty, loading, error, and success states | Partial | Site lock and Library empty state exercised; explicit loading/song-load error paths preserved and source-reviewed but network failure was not forced | Future non-production fault-injection test |
| Keyboard-only completion and visible focus | Pass | Header returned to Schedule with Enter; a Library song row expanded with Enter; switch-track focus and global focus styles source-reviewed |, |
| WCAG 2.2 AA manual review | Pass | Semantic landmarks, labels, adequate targets, reduced motion, non-color active states, and phone reflow reviewed |, |
| Automated axe scan | Pass | Zero violations on lock, Schedule, My Duties, Presider Home, Library, Services, Insights, and Manage lock at both app viewports |, |
| Visual screenshots reviewed | Pass | Temporary desktop/phone Schedule and Presider screenshots visually inspected, then excluded from Git |, |
| Long content and narrow screens | Pass | Full upcoming schedule rendered without horizontal page overflow at 360px |, |

## No-instructions usability test

The automated journey used a realistic first-time goal, find an upcoming presider and inspect that service's song workspace, without implementation-specific navigation instructions. It completed on desktop and phone with no wrong turn or false completion. It intentionally did not save, reorder, or mark songs on the live production database. Representative congregation testing is still required before describing the design as validated with members.

## Decision

- **Release decision:** Ready for a visual-only Hosting release; no production data writes were used for QA.
- **Known limitations:** client-side passcodes are not strong authentication; this rebuild does not change that architecture. Local QA also records the pre-existing failed Firebase anonymous-auth request (HTTP 400); reads and the tested views still work, and this Hosting-only redesign does not change rules or authentication.

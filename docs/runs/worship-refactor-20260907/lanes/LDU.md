---
lane: LDU-CALENDAR-REDESIGN-20260908
title: Open Bulletin calendar redesign
state: merged
model: gpt-5.6-luna
runner: Codex
review: Sol-pass
worktree: /Users/anthony/Projects/worship-refactor-worktrees/calendar-redesign
updated: 2026-09-08T18:53Z
---

# LDU calendar redesign

## Outcome

The Open Bulletin prototype has a coherent calendar and service workspace candidate for root review. The final bounded correction batch preserves fictional editing, saved plan state, assignment and confirmation meanings, sung history, source IDs as data attributes, and the memory-only read-only preview boundary.

## Changed paths

- /Users/anthony/Projects/worship-refactor-worktrees/calendar-redesign/docs/design/prototype/open-bulletin/app.js
- /Users/anthony/Projects/worship-refactor-worktrees/calendar-redesign/docs/design/prototype/open-bulletin/index.html
- /Users/anthony/Projects/worship-refactor-worktrees/calendar-redesign/docs/design/prototype/open-bulletin/styles.css

real-preview.js was inspected and syntax-checked but was not changed.

## Implemented behavior

- Shared header member selector with clear name-needed state, neutral LV mark, and a quiet fictional or read-only status in the footer.
- Shared month state with explicit selected day, Whole month clear, accessible previous and next month buttons, and department controls.
- Home nearest upcoming context is bounded to the nearest upcoming date and up to three services. The selected month follows as a compact expandable service list.
- Home and complete team rows use labeled department sections with restrained accents and connected duty and person pairs.
- My Duties groups by date, combines same-date worship labels, preserves service IDs and times, opens each service complete team, and includes past records when the calendar deliberately selects a past month or day.
- Rerenders preserve focus for calendar controls, day buttons, member and filter selectors, and restore the prior vertical scroll position.
- Presider defaults to upcoming My presiding services in the selected month, supports All services across presiders, avoids historical plan auto-selection, and shows no-plan service, date, presider, prayer, and choir context.
- Presider song groups are ordered Preparation, Glory, Thanks. Fictional mode retains preparation add, reorder, remove, Glory and Thanks selects, save failure and retry, confirmation change state, and song search close and reopen. Read-only mode renders catalog values without mutation controls.
- Appendix song numbers render A## from Appendix catalog numbers. Service IDs remain internal data attributes.
- Manage begins with department selection, and assignment rows filter to the selected department in fictional and read-only views.
- A shared setlist confirmation predicate recognizes boolean confirmation and legacy confirmed, changed, or sung status values. Presider summaries and save-state controls distinguish confirmed, changed, sung, and not confirmed.
- Home month rows and the month service count use the same active department-filtered service collection, so the displayed count matches visible services.
- Real Manage keeps its safe service selector below the department-first section inside Service assignments, and real mode explicitly permits this navigation change while mutators remain blocked.
- Read-only Glory and Thanks display the normalized song label and title, including A## for Appendix catalog numbers, without changing source IDs.
- Active warm-shell tokens use AA-safe values, --mid #5b6862 and --blue #456d69. The calendar landmark is named Month Year calendar so it is distinct from the Month Year schedule landmark.

## Selector and state map

- Header: #header-member-select, [data-member-selector], #header-member-select-state, data-member-state=name-needed.
- Calendar: [data-calendar=home|duty|presider], [data-calendar-month], [data-action=calendar-prev], [data-action=calendar-next], [data-action=calendar-day][data-calendar-day], [data-action=calendar-clear]; state is calendarMonth plus calendarDay or empty.
- Departments: [data-department-control=home|duty], #home-department, #duty-department, [data-department-row], [data-department-section].
- My Duties: [data-duty-date], [data-duty-service][data-service-id], [data-action=open-duty-team], [data-complete-team].
- Presider: #presider-filter, #presider-service, [data-service-summary], [data-confirmation-state], [data-song-group=preparation|glory|thanks], #glory-song-select, #thanks-song-select, #presider-choir-song, and the song actions open-song-library, close-song-library, add-song, move-song, save-setlist, retry-save, confirm-songs.
- Manage: [data-manage-department-first], #manage-department-choice, #manage-service.

## Verification

- node --check /Users/anthony/Projects/worship-refactor-worktrees/calendar-redesign/docs/design/prototype/open-bulletin/app.js: PASS.
- node --check /Users/anthony/Projects/worship-refactor-worktrees/calendar-redesign/docs/design/prototype/open-bulletin/real-preview.js: PASS.
- Em dash and en dash scan over all four owned UI files: PASS, no matches.
- Changed-path inspection: PASS, only the three listed UI files were edited by this lane, plus this lane record and its timestamped log.
- Focus handling inspection: PASS, render captures the active control identity before replacement and restores it after header and main markup are rebuilt.
- Static UI assertions: PASS, 36 required source markers, focus path, filtered month coupling, Manage order, real safe navigation, forbidden source markers, and dash scan verified.
- Contrast and landmark assertions: PASS, both active tokens exceed 4.5 against #f6f2ea, #fffdf9, #eee8db, and #ece6da; the calendar uses a distinct dynamic accessible label.
- Browser, server, live preview, real-data reads, screenshots, Git, deployment, and publishing were not run by this lane. Root owns the LVC browser pass and final review.

## Boundary and handoff

No files outside the exclusive UI ownership surface and this LDU record/log were written. No real records, credentials, fixtures, server code, data contracts, screenshots, or Git metadata were touched. The source candidate is ready for root to copy or run for native review. Controller Sol high review remains pending, and this lane does not claim approval or overall plan completion.

Implemented-by: Codex/gpt-5.6-luna | Reviewed-by: pending controller Sol high after root integration

## Root integration result

Integrated canonical source passed the fully enabled comprehensive journey suite, final fictional reference Axe checks, aggregate-only real smoke and native Sol high review2. All accepted findings are corrected. Lane source is frozen; full-prototype production approval remains pending.

Implemented-by: Codex/gpt-5.6-luna · Reviewed-by: Codex/gpt-5.6-sol (native, high)

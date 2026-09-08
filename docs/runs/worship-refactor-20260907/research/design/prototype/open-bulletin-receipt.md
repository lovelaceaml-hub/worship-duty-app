# Open Bulletin full prototype receipt

Date: 2026-09-07.

## Decision

Anthony selected the original Open Bulletin direction. His correction was to reduce oversized text only. The immutable type-refinement copy remains the visual anchor for the new prototype.

## Source and boundary

The local prototype was built in /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/open-bulletin/. Canonical capability references were read from /Users/anthony/Projects/worship-duty-app/app.js, /Users/anthony/Projects/worship-duty-app/song-app.js, and /Users/anthony/Projects/worship-duty-app/src/core/constants.js. Fixtures contain fictional people, services, assignments, requests, songs, and passcodes only.

No Firebase, spreadsheet, external network, remote font, external image, icon package, design tool, production source, or real member data is used.

## Coverage

The prototype covers Home, My Duties, Presider, Manage, service and people lifecycles, requests, planning, sync, settings, local backup, reset, the canonical worship outline, song occurrence actions, history, runsheet, local copy text, and named empty, loading, offline, error, save-failure, and success states. The detailed capability map and state table are in the prototype folder.

## Evidence

The served Playwright and axe sweep passed at 390 by 844 and 1440 by 1000, with zero overflow and zero axe violations on the checked pages. The lane receipt records the exact screenshot paths and command outcomes. The contract validator currently stops at its committed-artifact check because this lane cannot mutate Git state.

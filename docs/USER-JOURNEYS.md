# Prototype user journeys

The prototype starts at http://127.0.0.1:8099/open-bulletin/index.html. Every route is local and uses the same fictional September 2026 state.

## 1. Find the next duty

Route: ?screen=home.

The member sees the selected name, reads My next duty above the schedule, and uses the My Duties navigation to open the personal schedule. The next assignment includes date, role, department, service label, and time. The member picker updates the fictional roster immediately.

## 2. Review the service lineup

On Home, the nearest service is expanded with real department headings and duty rows. Later services start closed and open through native disclosure controls. The selected member is marked You with pale blue highlighting. The department filter changes the visible rows. The calendar action opens a local subscription simulation with a fictional feed link, Copy link, and a separate calendar snapshot. Copy actions attempt the browser clipboard as a local convenience. No real subscription or external request is made.

## 3. Request a duty change

Route: ?screen=duty.

The member chooses Request change for a personal role, enters an optional note, submits, and sees a pending status and request history. Manage opens with the pending request first. Approve, Decline, and Open service update local request state or open the assignment editor.

## 4. Plan the worship outline

Route: ?screen=presider.

The Presider page is reachable only when the selected member has an actual Presider assignment. It switches among those services and shows Glory song, Opening prayer, Thanks song where applicable, Prayer of thanks, Choir song, Sermon, and Closing prayer. Preparation duration excludes Glory and Thanks. The song library supports search, category filters, details, history, Add, Up, Down, and Remove. It remains beside the outline on desktop. On phones, Search songs opens a panel with focus management, an Escape action, and focus return to the opener.

## 5. Save, confirm, and record service history

Save changes enters Saving and then Saved locally. The review route ?screen=presider&review=save-failure enters Save failed and Retry save returns to Saved locally. Confirm songs enters Confirmed. Editing a confirmed outline enters Changed after confirmation until it is confirmed again. Mark sung records each song once per service, even when the outline repeats it. Repeating Mark sung is idempotent. Undo sung affects the selected service and recomputes counts and the last-sung date from remaining history. Runsheet and Copy outline expose real local text. Backfill adds a fictional history entry. History deletion recomputes song statistics. Delete setlist requires a visible confirmation and leaves a Recreate outline recovery action.

## 6. Coordinate the roster

Route: ?screen=manage.

Manage starts with Assignments and the pending request band. The coordinator can edit assignment selects, add a blank service, edit date, time, label, worship type, notes, and choir song, acknowledge or reopen derived conflicts, delete a service with confirmation, add a person, rename a person, preview and confirm name consolidation, remove a person after future-duty impact confirmation, and edit department rosters. Planning scopes derived conflicts, workload, and coverage to the selected window and applies a concrete suggestion. Sync edits the fictional Sheet URL, reports syncing and warning results, exports a local backup, imports only a validated prototype-marked fictional JSON backup, and requires distinct confirmation before restoring the sample or resetting local changes. Settings uses human feature labels, changes both fictional passcodes, and locks and unlocks the editor or site. The site lock gates every route, including navigation and Return Home.

## 7. Recover from route states

The closed review toolbar below product content opens unique Empty, Loading, Offline, Error, and Success routes. Each state has a marker and a visible recovery action. The error recovery action reaches the Success state. Main navigation and the product name remain available on ordinary routes. Focus moves to the page heading after route changes.

## Accessibility and input behavior

Buttons, links, selects, fields, file input, and checkboxes use native semantics and visible focus. The prototype is checked at 390 by 844 and 1440 by 1000 with no horizontal overflow. Optional mobile swiping requires at least 60px horizontal movement, more than 1.5 times vertical movement, and less than 600ms. Inputs, links, buttons, and horizontal scrollers are ignored. Reduced motion removes spinner and smooth-scroll animation.

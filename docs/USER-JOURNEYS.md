# User Journeys

Last updated: 2026-09-20. Step-by-step guides are in [USER-GUIDE.md](USER-GUIDE.md) and [USER-MANUAL.md](USER-MANUAL.md).

## Journey: Find my next duty

- **User:** a congregation member on a phone.
- **Starting situation:** the member has opened the private app, entered the site passcode, and signed in with their name and member PIN.
- **Goal:** identify the next duty and service time.
- **Success is observable when:** My Duties shows the next assignment, date, service, and duty category.
- **Steps:** open My Duties from the bottom bar, read the first duty card. A green dot on My Duties marks a newly added duty.
- **States:** loading says the schedule is loading; no duties explains that none are assigned; connection problems fall back to available local data and show a banner.
- **Recovery:** Sign out is under the member's name at the top right of every screen; signing in again as the right member is immediate.
- **Phone:** the main navigation floats at the bottom in all four appearances and hides while the keyboard is open.
- **Keyboard:** tabs, name picker, cards, and actions are reachable with visible focus.

## Journey: Plan songs for my service

- **User:** an assigned presider.
- **Starting situation:** the presider is signed in and has an upcoming service.
- **Goal:** choose an ordered set of songs with an appropriate total duration.
- **Success is observable when:** the service record shows the saved ordered set and total time.
- **Steps:** open Presider or Pick songs, choose the service, search/filter the library, add and order songs, confirm the list, review the run sheet.
- **States:** the planner names the active service; empty library/search results explain what to change; save feedback is immediate; load failure offers a retry message.
- **Recovery:** songs can be removed or reordered before the service is marked sung.
- **Phone:** Home, Library, Services, Insights sit in one row under the header; full-width controls avoid horizontal page scrolling.
- **Keyboard:** internal tabs and song controls remain ordinary buttons and form controls.

## Journey: Coordinate the schedule

- **User:** a department leader or administrator.
- **Starting situation:** the leader is signed in; Manage appears because of their account's role. There is no editor passcode.
- **Goal:** review or update a service without disturbing unrelated schedule data.
- **Success is observable when:** the edited service is reflected in the shared schedule and sync remains live.
- **Steps:** open Manage, choose the department, choose a section (one row under the header on a phone), make the narrow edit, confirm the result.
- **States:** no-access, loading, validation, saved, conflict-warning, and sync-error states use explicit text. A red dot on Manage marks pending requests or conflicts.
- **Recovery:** destructive actions require confirmation; backup export remains available.
- **Phone:** edit labels stack above fields when width is limited.
- **Keyboard:** section navigation, fields, and action buttons are keyboard operable.

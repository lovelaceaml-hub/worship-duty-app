# User Journeys

## Journey: Find my next duty

- **User:** a congregation member on a phone.
- **Starting situation:** the member has opened the private app and entered the site passcode.
- **Goal:** identify the next duty and service time.
- **Success is observable when:** My Duties shows the next assignment, date, service, and duty category.
- **Steps:** open My Duties, choose a name, read the first duty card.
- **States:** loading says the schedule is loading; no duties explains that none are assigned; connection problems fall back to available local data and show a banner.
- **Recovery:** changing the selected name is immediate and reversible.
- **Phone:** navigation remains visible at the bottom; swipe is optional.
- **Keyboard:** tabs, name picker, cards, and actions are reachable with visible focus.

## Journey: Plan songs for my service

- **User:** an assigned presider.
- **Starting situation:** the presider has selected their name and has an upcoming service.
- **Goal:** choose an ordered set of songs with an appropriate total duration.
- **Success is observable when:** the service record shows the saved ordered set and total time.
- **Steps:** open Presider or Pick songs, choose the service, search/filter the library, add and order songs, save/review the run sheet.
- **States:** the planner names the active service; empty library/search results explain what to change; save feedback is immediate; load failure offers a retry message.
- **Recovery:** songs can be removed or reordered before the service is marked sung.
- **Phone:** compact tabs and full-width controls avoid horizontal page scrolling.
- **Keyboard:** internal tabs and song controls remain ordinary buttons and form controls.

## Journey: Coordinate the schedule

- **User:** the authorized scheduler.
- **Starting situation:** Manage is locked.
- **Goal:** review or update a service without disturbing unrelated schedule data.
- **Success is observable when:** the edited service is reflected in the shared schedule and sync remains live.
- **Steps:** open Manage, unlock, choose a management section, make the narrow edit, confirm the result.
- **States:** locked, loading, validation, saved, conflict-warning, and sync-error states use explicit text.
- **Recovery:** destructive actions require confirmation; backup export remains available.
- **Phone:** edit labels stack above fields when width is limited.
- **Keyboard:** unlock, section navigation, fields, and action buttons are keyboard operable.

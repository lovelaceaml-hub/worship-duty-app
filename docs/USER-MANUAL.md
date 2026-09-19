# LV Zion Worship Duty

Current member guide for the live app: [lv-zion-duties.web.app](https://lv-zion-duties.web.app).

## Sign in

1. Open the app. If the site passcode screen appears, enter the shared site
   passcode. This is a device-level screen gate.
2. Select your member account and enter your 4 to 6 digit member PIN.
3. If the app asks you to change your PIN, enter and save a new 4 to 6 digit
   PIN before continuing.

The member PIN is checked by the app's authentication service. A successful
sign-in creates a verified account session, and the browser can restore that
session after a reload. Your account and its current role determine what you
can see or change. A shared editor passcode is not the live authorization
method.

## Find duties

Use **Schedule** for the congregation's services and **My Duties** for your
assigned duties. Schedule starts at the next upcoming service in Pacific
time; as soon as a service's start time arrives, the default advances to the
next one. You can still select an earlier service or date. Use department filters
to narrow the list, and expand a service to see its assignments and any choir
song.

On **My Duties**, you can:

- review upcoming assignments;
- expand **Who else is serving?**;
- request a schedule change and track its status;
- edit your own department availability, when a department profile exists;
- enable push notifications or add your duties to a calendar.

On iPhone, add the app to the Home Screen to receive web push while the app is
closed. iOS web push requires iOS 16.4 or later.

## Presider songs

Members with an upcoming Presider assignment or song-editor permission see the
**Presider** workspace. Use its Home view for upcoming services, Library to
choose songs, and Services to review upcoming and past setlists. Save a draft
before confirming songs.
After a confirmed list changes, confirm it again. Use the service's Runsheet
when it is available. Signal song picks continue through the existing ingest
flow.

## Department management

Department leaders and administrators see **Manage** for the departments their
verified account can manage. Select a department, then use **Departments** to
open its secure roster or **Services** to work with assignments.

To add an existing account, open the department roster and find **Add a
department member**. Type at least two letters of the member's name, choose
**Search**, then choose **Add** beside the right person. Members already in the
department are labeled instead of offered again. Only registered, active
accounts appear. Adding a profile does not grant leadership or administrator
access.

Authorized leaders can update a department member's active status, eligible
duties, schedulability, recurring availability, and date exceptions. Members
can update only their own availability from My Duties. Archiving a department
profile removes it from the active roster while preserving the member and
assignment history.

Assignment pickers use active, eligible, schedulable, and available profiles in
the selected department. An administrator can use the labeled override when a
documented exception is necessary. The override still requires the authorized
account session and a reason.

## Schedule import and choir songs

The Google Sheet is an import source. An administrator can run **Manage → Data
& Sync → Sync now** after signing in. The expected columns are Month, Date,
Service, Worship, Time, Category, Duty, and Member. Category is ignored when
the duty name identifies a department.

- A listed duty row changes only that duty.
- A valid duty row with a blank Member cell clears that duty. Keep Date,
  Service, and Duty filled in.
- Deleting a row does not clear the duty, because an absent row means the
  sheet does not manage that slot.
- A `Choir Song` row stores its Member cell as a song title. A blank Member
  cell clears the choir song for that exact date and service. If no Choir Song
  row exists, a manual choir song remains. A later non-empty row replaces it.
- Unknown duty names are skipped and reported in Data & Sync.

Use Manage for assignments or songs the sheet does not contain. Manual-only
services and assignments remain when the sheet has no matching row.

## Appearance and current refactor

Use **Appearance** (the small palette icon in the header, next to your name) to
choose Original, Prism, Navy & Cream, or Aurora. Every appearance shares one
header layout: the LV badge, "LV ZION", the current screen's name, and the
signed-in member. Prism and Aurora follow the device's dark mode setting and
every appearance follows the device's reduce-motion setting; the app has no
dark mode or pause button. These
four appearances share the released schedule, account sign-in, permissions,
and song data. The approved [complete phone refactor plan](PLAN-COMPACT-PHONE-REFACTOR.md)
is in progress; prototype approval and the integrated preview are pending.
Planned refactor behavior is not live until that work is approved and released.

## Member feedback (administrators)

Signed-in members can send feedback, bug reports, and suggestions with the
small round button at the bottom right of the app. Administrators read them in
**Manage**, then **Feedback**. The entry appears for administrators only;
department leaders and members never see it, and the app never requests the
list for them.

- The list shows the latest 100 notes, newest first: the member's name, the
  kind of note, the message, when it was sent, and which screen and appearance
  the member was using.
- **Mark done** moves a note from **New** to the done group (open it with
  **Show done**). **Delete** removes a note for good after a confirmation.
- The list loads when you open it. Tap **Refresh** to check for new notes.
- If you see "The feedback list is not available yet.", the server rule for
  feedback has not been released yet. Nothing is lost; try again after the
  release.

## Getting help

For a missing duty, request, or department action, first confirm that you are
signed in to the intended member account. Leaders should confirm they selected
the department their account is authorized to manage. If a save fails, keep the
draft visible and retry after the connection returns. Contact the app
administrator for account PIN resets or role changes.

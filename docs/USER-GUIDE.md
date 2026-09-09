# LV Zion Worship Service, user manual

This manual describes the current production app at
[lv-zion-duties.web.app](https://lv-zion-duties.web.app). The restored
production layout is the source of truth for the instructions below.

On iPhone, use Share, then Add to Home Screen. This makes the app easier to
open and is required for notifications while the app is closed.

## Getting in

Open the app on your phone or computer. If it asks for the site passcode, get
it from the person who shared the link. Your device remembers it. Existing
member name selection and site/editor passcodes remain the access method.

## Finding your duties

Open **My Duties** from the top or bottom navigation. The first time, choose
your name in the **Who are you?** selector. The app remembers your choice.
Each duty card shows the date, time, service, and role. Choose **Who else is
serving?** to see the full team for that service.

Choose **Turn on notifications** and allow the browser prompt to receive an
alert when a new duty is assigned or a duty starts within 24 hours.

Choose **Add my duties to my calendar** to subscribe to your live duty list.
The calendar follows assignment and service-time changes. On Android, use
**Copy calendar link**, then Google Calendar, **Other calendars**, **From URL**.

## Schedule

Open **Schedule** to see upcoming services for everyone, grouped by day.
Cards show the service, time, departments, and assigned people. Use the
department controls to narrow the list. Choose **Show past services** when
you need to look back.

## Planning songs as a presider

If you have an upcoming Presider duty, a **Presider** tab appears between My
Duties and Manage. You can also choose **Plan songs for your service** or
**Pick songs** from My Duties.

In the song planner, use **Library** to search songs and add them. **Home**
shows your upcoming services, **Services** shows everyone's, and **Insights**
shows songs that are overdue. Set Glory and Thanks with their Choose controls.
On the service day, use **Runsheet** for the order of worship. Afterward,
choose **Mark as sung** in Services so song history stays accurate. The first
editor action asks you to create a short editor PIN.

## Requesting a schedule change

From a duty card, choose **Request change**, add an optional note, and choose
**Submit**. The card shows **Request pending**. The coordinator reviews it and
must make the actual assignment change. Confirm the new assignment in
Schedule or My Duties before assuming the change is complete.

## Manage, for coordinators

Manage requires the separate editor passcode. Use **Services** to expand a
service and edit assignments. Use **People** to add people, correct a name,
or manage department membership. Use **Requests** to approve or decline a
request, then open the service to make the actual assignment change.

Use **Data & Sync** for Sheet sync, name unification, export backup, and
restore. The Google Sheet is a one-way input. A blank Member cell clears the
duty represented by that row. Deleting a row does not clear an in-app-only
assignment. Use **Features** to change the available app settings and
notification recipient.

## Local redesign preview

A flatter redesign is being tested locally. [Open the current-records
preview](http://127.0.0.1:8101/). It holds records in memory and has saves
disabled. It has fewer boxes and fewer disclosures, with a month calendar,
grouped duties, a Presider workspace, department management, and Blue, Sage,
and Sand themes. This is a preview candidate awaiting explicit local user
testing. It is not the live app, and its controls should not be used as
instructions for the current production layout.

## If something looks wrong

Reload the app and confirm the selected name. If the duty is still wrong,
contact the coordinator. Coordinators should edit the shared Google Sheet for
normal schedule work, or use Manage for a quick correction the Sheet does not
carry. Schedule edits do not require a new app release.

### Current local layout revision

The current local revision uses the available page width. Member selection is the only header control; Appearance is under the footer Settings button. Home has one date-grouped month schedule and a department dropdown that supports multiple choices, with All selected initially. Home omits choir song titles; Presider retains choir details. My Duties uses the selected month and grouped duty rows. Manage opens to Schedule after the department choice, with Roster and the other tools in separate tabs. Presider uses compact service rows and visible sections for Services, Select Songs, Order of Worship, Library, and Insights. This describes the local candidate only.

Local Presider now distinguishes loading song plans from an empty plan. If online updates fail, the last loaded information remains visible and Retry loading reconnects the subscriptions. Song save failures continue to use their separate Retry action. The expanded outline includes Choir; Home omits choir titles.


## Using the local release candidate

This section describes the [local preview](http://127.0.0.1:8101/), not the restored live interface. The preview displays current records in memory and disables saving. Its manager access is simulated for inspection.

### Home and My Duties

Choose your name at the top. Home shows the month calendar, your next duty, and one schedule grouped by date. Use the arrows to change month and a date to jump to its services. Future services start open; services starting more than 30 minutes ago start closed. Open Departments to select several departments, or select All to clear the individual choices. Choir titles are omitted on Home.

My Duties uses the same month selection. Each date groups your duties with time, worship session, duty, and assigned person. View full team shows the other assignments. Calendar subscription, notifications, and change requests retain their existing meanings. Save and subscription actions are unavailable in the read-only preview.

### Presider and song selection

Presider starts with your presiding services. Switch My presiding to All services to browse the full month. Calendar dates highlight your presiding duties; choosing a date jumps to it without hiding the rest of the month. Each service shows its presider, songs, preparation duration, confirmation state, prayer assignments, and choir title.

Choose Select Songs on a service, or choose a service in the selector. Services, Select Songs, Order of Worship, Library, and Insights are separate sections and retain your selected service. The outline lists preparation songs, Glory, applicable Thanks, and Choir. Early Morning and other services without Thanks omit that slot.

In Select Songs, search by song number, title, or a word in the title. Appendix numbers appear as A followed by the number. Use the plus button to add a song, the role selector to change its purpose, the arrow buttons to reorder preparation songs, and the remove button to remove a selection. Empty Glory and Thanks slots offer a direct add action. Confirm Songs confirms the current selections; later edits show Changed and require reconfirmation. A failed save remains visible with Retry. Loading and failed online updates are displayed separately from an empty plan.

### Manage

Department managers choose a department first. Schedule shows monthly assignments; select an assigned person or the empty assignment control to change it. Roster manages department membership, duty qualifications, and availability. Auto assign creates a proposal for review. Nothing is persisted until Save proposal is chosen. Existing passcodes and selected names remain the access method.

Choir managers select Choir, choose the service, and enter or select a suggested song title. A custom title belongs only to that service and is never added to the shared song library. Planning, Requests, Services, People, Features, Data & Sync, and Settings remain separate sections, subject to existing manager permissions and feature switches.

### Appearance

Choose Settings at the bottom of the app to select Blue, Sage, or Sand. Themes share the same layout. Appearance is stored as a device preference; in the local preview it remains memory-only.

Local candidate access: all selected members can browse song plans. Only the service's currently assigned presider or an unlocked song editor can change its songs or confirmation. Schedule auto-assignment proposals save each service atomically; a conflicting edit remains for review instead of overwriting another manager's change. Choir titles are stored on the service and do not create an extra assignment duty.

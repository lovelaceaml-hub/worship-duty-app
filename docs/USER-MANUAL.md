# LV Zion Worship Service: Manual for Leaders and Administrators

Live app: https://lv-zion-duties.web.app

Last updated: 2026-09-20.

Everything a member does is in the [Member Guide](USER-GUIDE.md): getting in,
Schedule, My Duties, Availability, Settings, Presider, Appearance, and the
feedback button. Read that first. This manual covers what department leaders
and administrators do on top of it.

## 1. Who sees what

| You are | You also see |
| --- | --- |
| A member | Schedule, My Duties, your name menu, the feedback button |
| A presider with an upcoming service, or a song editor | **Presider** |
| A department leader | **Manage**, for your own departments only |
| An administrator | **Manage** for all departments, plus Features, Data & Sync, and Feedback |

Access comes from the account you sign in with. There is no separate editor
passcode any more.

## 2. Getting to Manage

1. Sign in (site passcode if asked, then your name and member PIN).
2. Tap **Manage**. On a phone it is in the bar at the bottom; on a wide screen
   it is at the top.
3. Pick a department in **Manage department**. Administrators can also pick
   **All Departments**.
4. Pick a section. On a phone the sections are one row under the top bar;
   swipe the row sideways to reach the rest.

Sections: **Departments**, **Services**, **Planning**, **Requests**. Some
leaders also have **Leader config**. Administrators also have **Features**,
**Data & Sync**, and **Feedback**.

A **red dot on Manage** means there is a pending change request or a
scheduling conflict in a department you lead. The numbers beside **Planning**
and **Requests** show how many.

## 3. Departments (the roster)

1. Open **Departments** and tap **Open department** on a department card.
2. The page lists **Active profiles** and **Inactive profiles** for that
   department only.

### Add a member

1. Under **Add a department member**, type at least two letters of the
   person's name and tap **Search**.
2. Tap **Add** beside the right person. Anyone already in the department is
   labeled "Already in" that department instead.

Only people with an active member account appear. Adding someone never makes
them a leader or an administrator. If the person is not found, check the
spelling, then ask an administrator whether they have an account yet.

### Change a member's profile

1. Tap the member's name to open **Member profile**.
2. Set **Schedulable** (whether they appear in normal assignment choices).
3. Tick their **Eligible duties**.
4. Set **Recurring availability** for each service time.
5. Add **Date exceptions** for single days. A date exception wins over the
   recurring pattern.
6. Tap **Save profile changes**. **Discard changes** puts it back.

The page shows who last changed the profile and when. Members edit only their
own availability (their name, then **Availability**); you and the member are
editing the same record.

### Archive or restore

Tap **Archive** on a roster row to move a member to inactive. Their past
assignments are kept. Tap **Restore** to bring them back.

### Reset a member's PIN

1. Tap **Reset PIN** on the member's roster row and confirm.
2. Tell the member. The next time they sign in, the app asks them to choose a
   new PIN.

The button appears for administrators, and for leaders on members of their own
department.

## 4. Services (assignments)

1. Open **Services** and tap a service to expand it.
2. Each duty has a dropdown. Pick a name and it saves for everyone at once.
3. The dropdown offers only members of that department who are active,
   eligible for the duty, schedulable, and available at that date and time.
4. Administrators can use **Administrator override** to assign someone outside
   those limits. A **Reason** is required and is recorded.
5. Administrators can also add a service (date, time, label, worship) with
   **Add**, edit the choir song, change a service's date or time, and delete a
   service.

### Double-duty warnings

When one person has two or more duties in the same service, a warning shows on
that service everywhere. One prayer duty plus one usher duty is treated as
intentional and shows no warning. To silence a warning you accept, expand the
service and tap **Mark as OK**. If that person's duties in the service change
later, the warning comes back by itself.

## 5. Planning

- **Double-duty conflicts, upcoming**: each conflict with suggested substitutes
  you can assign in one tap, plus **Open service** and **Mark as OK**.
- **Unfilled duties, next 4 weeks**: planned services that still have empty
  duties.
- **Workload, who is carrying what**: how many duties each person has had and
  has coming, and when they last served.

## 6. Requests

1. Open **Requests** to see change requests from members in your departments.
2. Tap **Approve** or **Decline**. The member is notified.
3. Approving does NOT change the schedule. Tap **Open service** to jump to that
   service and make the reassignment yourself.

Resolved requests stay in a history further down the page. The person who gets
notified of new requests is set by an administrator under **Features**,
**Scheduler**.

## 7. Leader config

For accounts allowed to manage leaders. For each department, add or remove
**Department leaders**. Under **Choir song editors**, add or remove people who
may edit songs only.

## 8. Features (administrators)

On and off switches that apply to the whole congregation at once. The full
list is in [FEATURES.md](FEATURES.md). Also on this screen:

- **Change the site passcode**: the 4-digit code every device enters once.
  Changing it makes every device ask again.
- **Scheduler**: who is notified when a member submits a change request.

The **Editor passcode** switch and **Change the editor passcode** card are left
over from before member sign-in. They control nothing now.

## 9. Data & Sync (administrators)

The Google Sheet is where the schedule is normally entered. The app imports
from it; nothing is written back to the Sheet.

- The app checks the Sheet when it opens (at most every five minutes per
  device), and the server checks every two hours.
- Tap **Sync now** to import immediately. It reports what was added or updated
  and lists anything it skipped.
- Expected columns: Month, Date, Service, Worship, Time, Category, Duty, Member.

How the import treats rows:

- A listed duty row changes only that duty.
- A duty row with a blank Member cell clears that duty. Keep Date, Service, and
  Duty filled in.
- Deleting a row does not clear the duty. A missing row means "the Sheet does
  not manage this slot".
- A `Choir Song` row stores its Member cell as the song title for that date and
  service. A blank cell clears it. With no Choir Song row, a song typed in the
  app is kept.
- Duty names the app does not know are skipped and listed on the card.
- Services and assignments made only in the app are kept.

Also on this screen:

- **Export backup file** and **Import backup file**. Import overwrites the
  shared schedule for everyone.
- **Unify member names**: merges old spellings of a name into the current one
  everywhere. Safe to run more than once. If you also tidy names in the Sheet,
  run the Sheet's own tool first, then **Sync now**, then **Unify member
  names**.
- **Reset to spreadsheet data**: do NOT use this on the live app. It replaces
  the whole schedule with the original May to July 2026 data for everyone.

## 10. Feedback (administrators)

Members send notes with the round button at the bottom right of the app. Read
them under **Manage**, **Feedback**. Only administrators see this section.

- The list shows the latest 100 notes, newest first: the member's name, the
  kind of note, the message, when it was sent, and which screen and appearance
  they were using.
- **Mark done** moves a note out of **New**. Open the finished ones with
  **Show done**. **Delete** removes a note for good, after a confirmation.
- The list loads when you open it. Tap **Refresh** to check for new notes.
- If you see "The feedback list is not available yet.", tell Anthony: the
  server setting for feedback is missing and needs to be released again.

## 11. Presider songs (leaders of worship)

The member steps are in the [Member Guide, section 7](USER-GUIDE.md).
Two things worth knowing as a leader:

- A presider confirms a song list with **Done, these are my songs**. If the
  list changes afterwards (including a pick arriving from the Signal group), it
  reads as changed until confirmed again.
- Since 2026-09-17 the server is set to record a confirmed list as sung by
  itself, about three hours after the service starts. This is new and has not
  been watched closely yet. If a finished service still does not show as sung
  the next day, use **Mark as sung**.

## 12. Notifications

- Members turn on notifications per device, from My Duties or from their name,
  **Settings**.
- "New duty assigned to you" is sent when an assignment changes to a new
  person, whether from Manage or from the Sheet import.
- "Duty reminder" is sent within 24 hours before a duty.
- iPhone members need the app on their Home Screen (iOS 16.4 or later).
- The calendar subscription works even with notifications off.

## 13. Getting help

- A save failed: check the connection and try again. Make sure you picked a
  department you lead.
- A member cannot see a duty: confirm they signed in under their own name.
- Anything to do with releasing the app, passcodes, or the server: see the
  [Playbook](PLAYBOOK.md).

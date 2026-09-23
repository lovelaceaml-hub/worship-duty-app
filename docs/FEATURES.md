# Feature Switches

Last updated: 2026-09-20.

Administrators switch these on or off in **Manage, Features**. They are stored
in the shared database (`app/settings.features`) and apply to **every member's
device instantly**. No release is needed.

This page is about the on and off switches only. For the released features F1
to F11 (bottom bar, shared header, name menu, feedback button, and so on) see
[HANDOFF.md](HANDOFF.md) section 4. Those have no switch.

| Switch | Default | What it controls |
|---|---|---|
| Site passcode | ON | The whole app asks for the 4-digit site passcode once per device, before member sign-in. Turning this OFF skips that screen; member sign-in still applies. |
| Editor passcode | ON | Nothing. Left over from before member sign-in. Manage access now comes from the signed-in account's role. Listed in open items for removal. |
| New-duty alerts | ON | Members are alerted (in the app, by push, and with the green dot on My Duties) when a duty is added for them. |
| Day-before reminders | ON | Members are reminded within 24 hours of each duty (push, plus in the app while it is open). |
| Add-to-calendar button | ON | "Add my duties to my calendar" on My Duties and in Settings: a calendar subscription that stays correct when a duty or time changes. |
| "Who else is serving?" | ON | The expander on each My Duties card showing the full service lineup. |
| Choir song on services | ON | The choir song line on service cards. |
| Presider song picker | ON | Presiders get the **Presider** screen plus the "Plan songs for your service" button and "Pick songs" links on My Duties. OFF hides all of them. |
| Past services | ON | The "Show past services" link on Schedule. |
| Show unassigned duties | OFF | Schedule shows every duty slot even without a name. |
| Double-duty warnings | ON | A notice when one person has two or more duties in the same service. One prayer duty plus one usher duty is treated as intentional. Leaders can "Mark as OK" per service in Manage. |
| Google Sheet sync | ON | Pulls schedule updates from the published Google Sheet (when the app opens, throttled, plus "Sync now" in Manage, Data & Sync). |
| Change requests | ON | Members can request a schedule change from a duty on My Duties. The scheduler (chosen in Manage, Features, Scheduler) is notified, and requests are reviewed in Manage, Requests. Approving a request does not edit the schedule itself. |

## How it works, and adding a switch

The registry is the `FEATURES` array near the top of `app.js`:

```js
{ id: 'myFeature', label: 'Shown in Manage', desc: 'One-line explanation.', def: true }
```

1. Add an entry there (it appears in Manage, Features automatically).
2. Gate the behavior anywhere in the code with `feat('myFeature')`.
3. Release through [PLAYBOOK.md](PLAYBOOK.md) section 8. Unset switches fall
   back to their `def` value, so the database needs no migration.

## Site passcode notes

- It gates the whole app once per device. It is a screen gate, not the security
  boundary. Member sign-in, Firestore rules, and the server functions are the
  boundary.
- Stored only as a hash in `app/settings.sitePinHash`. A device that unlocks
  keeps the hash in its own storage under `wds-site-unlock`.
- The current passcode is not written anywhere in this repository. Change it in
  Manage, Features, "Change the site passcode". Every device then asks for the
  new one.
- Lost passcode: see [PLAYBOOK.md](PLAYBOOK.md) section 2.

## Retired: the editor passcode

Before member sign-in (released 2026-09-13), a shared editor passcode opened
Manage. It is retired. The "Editor passcode" switch and the "Change the editor
passcode" card still appear on the Features screen, but no code reads them
(`feat('editorLock')` is never called, and `renderUnlock()` is never used).

# Feature Toggles

Every feature below can be switched on/off in **Manage → Features** (behind
the editor passcode). Toggles are stored in the shared database
(`app/settings.features`) and apply to **every member's device instantly** —
no deploy needed.

| Toggle | Default | What it controls |
|---|---|---|
| Site passcode | ON | The whole app requires the 4-digit site passcode before any screen is shown. Turning this OFF makes the app open with no passcode at all. |
| Editor passcode | ON | Manage tab requires the passcode. Turning this OFF lets anyone edit — only do that temporarily. |
| New-duty alerts | ON | Members get an alert (in-app + push notification) when a duty is added for them. |
| Day-before reminders | ON | Members are reminded within 24 hours of each duty (push notification, plus in-app while the app is open). |
| Add-to-calendar button | ON | The .ics download on My Duties (phone-calendar reminders). |
| "Who else is serving?" | ON | The expander on each duty card showing the full service lineup. |
| Choir song on services | ON | The choir-song line on service cards. |
| Past services | ON | The "Show past services" link on the Schedule tab. |
| Show unassigned duties | OFF | Schedule shows every duty slot even without a name (useful when planning gaps, noisy otherwise). |
| Double-duty warnings | ON | Shows a notice when one person has two or more duties in the same service; editors can "Mark as OK" per service in Manage. |
| Google Sheet sync | ON | Automatically pulls schedule updates from the published Google Sheet (auto on app open, throttled, plus a "Sync now" button in Manage → Data & Sync). |
| Change requests | ON | Members can request a schedule change from their duty cards on My Duties; the scheduler (chosen in Manage → Features → Scheduler) gets a push notification, and requests are reviewed in Manage → Requests. Approving a request does not edit the schedule itself. |
| Presider song picker | ON | Presiders get a **Presider** tab in the bottom bar plus a "Plan songs for your service" button on My Duties, both opening the merged song-selection screen (Home / Library / Services / Insights) inside this app. Turning it OFF hides the tab, the button, and the "Pick songs" links. See `docs/HANDOFF.md` → "Presider song picker". |

## How it works / adding a new toggle

The registry is the `FEATURES` array at the top of `app.js`:

```js
{ id: 'myFeature', label: 'Shown in Manage', desc: 'One-line explanation.', def: true }
```

1. Add an entry there (it appears in Manage → Features automatically).
2. Gate the behavior anywhere in the code with `feat('myFeature')`.
3. Deploy. Unset toggles fall back to their `def` value, so existing
   databases need no migration.

## Editor passcode notes

- Stored as a SHA-256 hash in `app/settings.pinHash`; never in plain text.
- The current passcode is not printed here — ask the coordinator. Change it in
  Manage → Features → "Change the editor passcode".
- Changing it instantly relocks every other device.
- Lost passcode: delete the `pinHash` field on the `app/settings` document
  in the Firestore console — the app will offer to create a new one.

## Site passcode notes

- Gates the entire app (all three screens) before the site passcode is
  entered once per device — separate from, and in addition to, the editor
  passcode above.
- Stored as a SHA-256 hash in `app/settings.sitePinHash`; never in plain
  text. A device that unlocks caches the hash in
  `localStorage['wds-site-unlock']`.
- The current passcode is not printed here — ask the coordinator. Change it in
  Manage → Features → "Change the site passcode".
- Changing it instantly relocks every other device — everyone re-enters
  the new passcode the next time they open the app.
- Lost passcode: delete the `sitePinHash` field on the `app/settings`
  document in the Firestore console — the app will treat it as never-set
  and accept the next passcode entered as the new one.
- Honest security note: this is a client-side deterrent, not real access
  control. The Firestore rules themselves are open — a technical person
  could read or write the data directly, bypassing the passcode UI
  entirely. See `docs/PLAYBOOK.md` Brief 1 for the path to real security
  (Firebase Auth + locked-down rules).

# Feature Toggles

Every feature below can be switched on/off in **Manage → Features** (behind
the editor passcode). Toggles are stored in the shared database
(`app/settings.features`) and apply to **every member's device instantly** —
no deploy needed.

| Toggle | Default | What it controls |
|---|---|---|
| Editor passcode | ON | Manage tab requires the passcode. Turning this OFF lets anyone edit — only do that temporarily. |
| New-duty alerts | ON | Members get an alert (in-app + system notification) when a duty is added for them. |
| Day-before reminders | ON | Members are reminded within 24 hours of each duty while/when they open the app. |
| Add-to-calendar button | ON | The .ics download on My Duties (phone-calendar reminders). |
| "Who else is serving?" | ON | The expander on each duty card showing the full service lineup. |
| Choir song on services | ON | The italic choir-song line on service cards. |
| Past services | ON | The "Show past services" link on the Schedule tab. |
| Show unassigned duties | OFF | Schedule shows every duty slot even without a name (useful when planning gaps, noisy otherwise). |

## How it works / adding a new toggle

The registry is the `FEATURES` array at the top of `app.js`:

```js
{ id: 'myFeature', label: 'Shown in Manage', desc: 'One-line explanation.', def: true }
```

1. Add an entry there (it appears in Manage → Features automatically).
2. Gate the behavior anywhere in the code with `feat('myFeature')`.
3. Deploy. Unset toggles fall back to their `def` value, so existing
   databases need no migration.

## Passcode notes

- Stored as a SHA-256 hash in `app/settings.pinHash`; never in plain text.
- Initial passcode set on 2026-07-03: `2026`. Change it in Manage →
  Features → "Change the editor passcode".
- Changing it instantly relocks every other device.
- Lost passcode: delete the `pinHash` field on the `app/settings` document
  in the Firestore console — the app will offer to create a new one.

# The usage counter — and the sign-in bug it uncovered

*Added 26 July 2026.*

## Why this exists

Until now there was no way to answer "does anyone actually open this app?" A schedule read
by fifty people every week and a completely dead app produced **identical** data, because
reading leaves no trace and the only writes came from the sync job.

That mattered: a review on 26 July counted member activity across all the church apps and
had to record "cannot tell" for this one — the flagship.

## What it records

One document per day: `pulse/2026-07-26`, holding plain integers.

| Field | Meaning |
|---|---|
| `date` | the day, so the document reads on its own |
| `opens` | how many **devices** opened the app that day |
| `tab_schedule` | devices that looked at the Schedule tab |
| `tab_my` | devices that looked at My Duties |
| `tab_songs` | devices that opened the song planner |
| `tab_manage` | devices that opened Manage |

**It stores nothing about anyone.** No name, no device id, no session id, no free text —
only a date and a set of counters. There is nothing in this collection to leak.

Each device counts itself **at most once per event per day**, using a note kept in that
phone's own browser storage that never leaves the device. So `opens: 12` means "twelve
devices", not "twelve taps".

## How to read it

Any time, without opening a console:

```bash
curl -s "https://firestore.googleapis.com/v1/projects/lv-zion-duties/databases/(default)/documents/pulse/$(date +%F)"
```

Or ask Claude: *"how many devices opened the worship app this week?"*

## How it fails

Safely. If the write is rejected — offline, quota, rules — the counter simply does not
increment and the app carries on untouched. It never blocks rendering and never shows an
error to a member.

One subtlety worth preserving if you change `pulse()` in `app.js`: the device only records
"already counted today" **after** the write actually succeeds. An earlier version marked it
first, which meant a single failed write silently stopped that device counting for the rest
of the day.

## ⚠️ The bug this uncovered — Firebase Authentication was never switched on

While testing the counter, anonymous sign-in was failing on the live site with
`auth/configuration-not-found`. The cause: **Firebase Authentication had never been
initialised on the `lv-zion-duties` project at all.** The Identity Toolkit API returned
`CONFIGURATION_NOT_FOUND` — not "anonymous is disabled", but "no auth configuration exists".

This matters because `firestore.rules` requires `request.auth != null` for **every**
member-side write. With sign-in impossible, that meant:

- enabling duty reminders (writing a push token) — rejected
- submitting a duty-swap request — rejected
- any Manage edit made in the browser — rejected

**So `requests` sitting at 0 records was never disinterest. The feature could not work.**
Two Cloud Functions (`onRequestCreated`, `onRequestResolved`) were built behind a door that
would not open.

**Fixed 26 July 2026:** Firebase Auth was initialised and anonymous sign-in enabled. Verified
by calling the sign-in endpoint directly (returns a token), by a signed-in write to `pulse`
succeeding while an unauthenticated one is refused with 403, and by the live app loading with
a clean console and "Live sync on".

**Note for whoever reads this next:** the rules file already carried the warning —
*"DEPLOY ORDER: enable Anonymous auth + ship the signing-in client BEFORE deploying these
rules, or writes will fail."* The rules were committed on 8 July; the auth half was never
done. If you ever tighten rules to require auth again, check the provider is actually on
first — `firebase deploy` will happily ship rules that lock out your own members.

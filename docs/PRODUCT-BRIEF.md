# Product Brief

## Product

- **Name:** LV Zion Worship Service
- **Audience:** LV Zion members, worship presiders, and schedule coordinators.
- **Problem it solves:** one private, phone-friendly place to view worship assignments, see personal duties, plan New Song selections, and maintain the schedule.
- **First successful moment:** a member can open the app, choose their name, and clearly see the next duty assigned to them.

## Main tasks

1. Check the upcoming worship service schedule.
2. See personal duties and add them to a calendar.
3. Plan and review songs for an assigned service.
4. Manage services, people, requests, and sync settings when authorized.

## Constraints

- Phones are the primary device; desktop supports coordinators.
- The interface must meet WCAG 2.2 AA where practical.
- Use the WATV color language without copying the official site or logo.
- No cross, church-building, or religious imagery and no emoji.
- Preserve the one-way Google Sheet to Firestore source-of-truth flow.
- Preserve the existing private access and editor gates.

## Risks and exclusions

- The client-side passcode is a deterrent, not strong authentication.
- Firestore security hardening is outside this visual rebuild.
- Schedule rules, data, notifications, calendar feed, and song-history behavior must not change.
- The retired standalone New Song project must remain a redirect.

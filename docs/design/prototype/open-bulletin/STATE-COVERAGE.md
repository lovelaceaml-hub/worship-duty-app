# Prototype state coverage

Each row names a route or action that can be opened from the local prototype. The route state is identified in the page marker and the result is visible in the page.

| State or journey | Route and action selector | Visible result |
| --- | --- | --- |
| Home to My Duties | /open-bulletin/index.html?screen=home, [data-action="open-my-duties"] | My Duties page replaces Home and receives focus. |
| My Duties request | /open-bulletin/index.html?screen=duty, [data-action="request-change"] then [data-form="request"] | Pending request status and request history row. |
| Manage approval | /open-bulletin/index.html?screen=manage, [data-action="approve-request"] | Pending count decreases and the request becomes approved. |
| Phone song search | /open-bulletin/index.html?screen=presider, [data-action="open-song-library"] | Phone panel opens as an accessible dialog, focuses search, traps Tab, closes with Escape or Close, and returns focus to the trigger while preserving service and query state. |
| Presider save | /open-bulletin/index.html?screen=presider, [data-action="save-setlist"] | Save state changes from Ready to Saving to Saved locally. |
| Presider failure recovery | /open-bulletin/index.html?screen=presider&review=save-failure, [data-action="save-setlist"] then [data-action="retry-save"] | Save failed changes to Saved locally after retry. |
| Confirmed outline edit | /open-bulletin/index.html?screen=presider, [data-action="confirm-songs"] then [data-change="setlist-notes"] | Confirmed changes to Changed after confirmation. |
| Sung history | /open-bulletin/index.html?screen=presider, [data-action="mark-sung"] then [data-action="confirm-mark-sung"] | One history entry per song and service uses the service date. Repeated mark is idempotent, Undo sung is scoped to the selected service, and count plus last date recompute after undo or removal. |
| Calendar feed and snapshot | /open-bulletin/index.html?screen=duty, [data-action="subscribe-calendar"], [data-action="copy-feed-link"], [data-action="calendar"] | Reserved example feed URL is visible and copyable, subscription is simulated locally, and the one-time calendar snapshot remains available without navigation or a calendar launch. |
| Name consolidation | /open-bulletin/index.html?screen=manage, Sync tab, [data-action="preview-name-unify"] | Impact preview lists member, service, and department changes. Cancel preserves the variant, and confirmation applies the canonical map locally. |
| Backup marker gate | /open-bulletin/index.html?screen=manage, Sync tab, [data-change="import-file"] | Imports require the exact fictional marker, fixture identifier, signature, version, September service records, member references, and known song shape before state changes. |
| Reset and restore | /open-bulletin/index.html?screen=manage, Sync tab, [data-action="restore-sample"] or [data-action="reset-prototype"] | Restore and reset show separate confirmations. Cancel preserves the edited local state, and confirmation resets the selected operation. |
| Site lock all routes | /open-bulletin/index.html?screen=manage, Settings, [data-action="lock-site"] | Site gate remains visible after header navigation and Return Home until the fictional site passcode is entered. |
| Planning range | /open-bulletin/index.html?screen=manage, Planning tab, [data-change="plan-window"] | Conflicts, gaps, suggestions, workload, and service count derive from the selected planning window. |
| Recreate outline | /open-bulletin/index.html?screen=presider, [data-action="delete-setlist"] then [data-action="delete-setlist-confirm"] | Deleting a setlist preserves the service and exposes an explicit Recreate outline action. |
| Empty state | /open-bulletin/index.html?screen=empty | Empty marker and Return Home recovery action. |
| Loading state | /open-bulletin/index.html?screen=loading | Loading marker and Return Home recovery action. |
| Offline state | /open-bulletin/index.html?screen=offline | Offline marker and Return Home recovery action. |
| Error state | /open-bulletin/index.html?screen=error | Error marker and Continue locally recovery action. |
| Success state | /open-bulletin/index.html?screen=success | Success marker and Return Home recovery action. |

The four unique important state routes are Empty, Loading, Error, and Success. Offline is also covered because the page offers a distinct recovery message.

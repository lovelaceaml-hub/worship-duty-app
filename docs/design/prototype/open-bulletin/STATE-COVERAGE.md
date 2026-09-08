# Prototype state coverage

Each row names a route or action that can be opened from the local prototype. The route state is identified in the page marker and the result is visible in the page.

| State or journey | Route and action selector | Visible result |
| --- | --- | --- |
| Home to My Duties | /open-bulletin/index.html?screen=home, [data-action="open-my-duties"] | My Duties page replaces Home and receives focus. |
| My Duties request | /open-bulletin/index.html?screen=duty, [data-action="request-change"] then [data-form="request"] | Pending request status and request history row. |
| Manage approval | /open-bulletin/index.html?screen=manage, [data-action="approve-request"] | Pending count decreases and the request becomes approved. |
| Presider save | /open-bulletin/index.html?screen=presider, [data-action="save-setlist"] | Save state changes from Ready to Saving to Saved locally. |
| Presider failure recovery | /open-bulletin/index.html?screen=presider&review=save-failure, [data-action="save-setlist"] then [data-action="retry-save"] | Save failed changes to Saved locally after retry. |
| Confirmed outline edit | /open-bulletin/index.html?screen=presider, [data-action="confirm-songs"] then [data-change="setlist-notes"] | Confirmed changes to Changed after confirmation. |
| Sung history | /open-bulletin/index.html?screen=presider, [data-action="mark-sung"] then [data-action="confirm-mark-sung"] | Sung status and song counts update, Undo sung restores them. |
| Calendar text | /open-bulletin/index.html?screen=duty, [data-action="calendar"] or [data-action="copy-calendar"] | Local calendar text appears in a read-only text area, with clipboard fallback. |
| Empty state | /open-bulletin/index.html?screen=empty | Empty marker and Return Home recovery action. |
| Loading state | /open-bulletin/index.html?screen=loading | Loading marker and Return Home recovery action. |
| Offline state | /open-bulletin/index.html?screen=offline | Offline marker and Return Home recovery action. |
| Error state | /open-bulletin/index.html?screen=error | Error marker and Continue locally recovery action. |
| Success state | /open-bulletin/index.html?screen=success | Success marker and Return Home recovery action. |

The four unique important state routes are Empty, Loading, Error, and Success. Offline is also covered because the page offers a distinct recovery message.

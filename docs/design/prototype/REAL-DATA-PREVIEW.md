# Current-records design preview

Anthony requested real information and data on 8 September 2026 after reporting duplicated team rows. This local view supports that design review. It is not a production interface release or a full-prototype approval.

Open [the view-only preview](http://127.0.0.1:8100/?screen=home) on this Mac. Choose a name for personal duties. Choose your name in the top-right header. Home, My Duties and Presider share a month calendar with previous/next arrows and clickable days. Whole month clears the day filter. Presider defaults to My presiding; choose All services to browse every presider in the selected month without selecting a name. Manage shows the selected service's assignments, pending requests, people, department rosters and feature values without editing controls.

To start from the canonical repository:

```sh
node /Users/anthony/Projects/worship-duty-app/scripts/real-preview.cjs
```

The server binds only to 127.0.0.1. A page reload reads current allowlisted Firestore records, and the footer shows when they were fetched. Navigation and filtering use that in-memory view. There is no background subscription or offline persistence in this preview. If reading fails, the page displays an unavailable state without substituting sample records.

The server reads schedule, roster, departments, requests, saved song plans, song history and feature settings. The catalog comes from the same local static catalog currently used by the live app. It preserves saved plans without matching schedule documents for Presider browsing, while Home lists scheduled services only.

The browser has no Firebase client, notifications, sync or save capability. The server has no write endpoints, authentication credentials, tokens, arbitrary proxy or directory listing. Host/origin checks, asset allowlisting, content policy and no-store responses constrain the local surface. Records remain in memory and must not be copied into Git, screenshots, published boards or review artifacts.

The fictional prototype at port 8099 remains separate. Automated checks use fictional data, including real-mode fixtures, so they never edit production or depend on real member selections.

# Prototype capability map

This map records the capability audit against the local prototype. All results are fictional in-memory actions. No production data or service call is used.

| Audit area | Reachable local result |
| --- | --- |
| Member access and schedule | Home and My Duties use the selected member picker, My next duty, real department filters, later service expansion, past service toggle, alert clearing, request history, calendar text generation, copy fallback, and the no Presider duty state. |
| Services and assignments | Manage Assignments selects a service, edits worship type, label, date, time, notes, choir song, every existing duty, and blank unassigned slots when Show unassigned duties is on. Add blank service creates no automatic assignments. Conflict rows derive from the selected service, skip prayer plus usher pairs, and support Acknowledge and Reopen. Delete service requires a confirmation view. |
| People and rosters | Manage People adds a fictional person, renames a person across assignments, requests, departments, and setlists, removes a person only after a future-duty impact confirmation, and edits department roster checkboxes. |
| Planning | Manage Planning calculates conflicts, coverage gaps, workload, and the selected window. It exposes next four weeks, four weeks, eight weeks, upcoming, year, and last windows. Apply suggestion changes one named assignment and shows the changed assignment locally. |
| Sync and settings | Manage Sync edits the fictional local Sheet URL, reports saving, syncing, complete, and warning results, exports a local JSON backup, imports a local JSON backup, restores the sample, and resets all in-memory state. Settings uses human feature labels and changes both fictional passcodes, then locks and unlocks editor and site gates. |
| Presider outline | Presider is shown for actual Presider assignments only. It switches service, edits notes, Glory, Thanks, and service choir song, renders the canonical outline, keeps duplicate song occurrences independent, excludes Glory and Thanks from preparation duration, and supports song search, category, detail, history, add, remove, and index-based reorder. |
| History and service record | Save exposes saving, saved, failed, retry, and confirmed states. Editing a confirmed outline exposes Changed after confirmation until reconfirmed. Mark sung increments every song occurrence, Undo sung restores counts, and song history supports backfill and removal. Runsheet, copy, and delete-setlist confirmation produce visible local results. |

## Canonical references

The audit was checked against the read-only source at /Users/anthony/Projects/worship-duty-app/app.js, /Users/anthony/Projects/worship-duty-app/song-app.js, and /Users/anthony/Projects/worship-duty-app/src/core/constants.js. The prototype fixture contains only fictional names, service records, and songs.

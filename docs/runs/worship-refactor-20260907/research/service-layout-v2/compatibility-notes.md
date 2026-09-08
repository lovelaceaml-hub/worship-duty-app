# Revision 2 compatibility findings

Read-only source investigation against baseline02cd552. No real records, credentials or notification tokens were copied.

## Manager and choir contracts

Production uses the existing global editor passcode and selected member preference. Department visibility and editor controls can follow the owner-provided manager mapping; this does not introduce verified identity. The owner explicitly chose to preserve this access model. Department rosters currently store membership in app/departments.map. Per-duty qualifications, availability and manager assignments require additive private configuration; no replacement of existing roster shape is necessary. Prototype demonstrations use fictional mappings only.

Choir selection already supports a catalog ID or title text in schedule.choirSong. Preserve this scalar contract. Custom choir titles never enter the shared catalog, as explicitly chosen. Sheet ownership must remain consistent: existing nonempty Sheet choir input can replace the service value, so editing must show the existing sync ownership rather than promise unconditional manual ownership.

## Identity correction dependency

The existing app/nameMap is consumed by calendar generation and both Sheet sync paths, which supports old subscription links and prevents old Sheet spelling from being reintroduced. A complete correction also needs members, department rosters, schedule assignments and conflict acknowledgements, setlist presider/confirmedBy/updatedBy, songStats.history.by, requests.name, schedulerName and notification target names evaluated. Use explicit identity fields; never replace substrings in notes or titles. Preserve IDs, timestamps, song order and sung/confirmed semantics.

Current functions/handlers.js onScheduleWrite compares raw assignment names. Updating a title in assignments can therefore send a new-duty notification. Reminder markers include the sanitized member name. A safe real correction must first preserve alias-aware notification equality and deduplication, then apply an optimistic, field-scoped data plan with rollback and aggregate verification. Do not use the read-only preview server or ordinary browser UI to perform a bulk correction. Actual correction remains pending this reviewed implementation; owner authority for all historical records is recorded.

## Search

Current deployed title search already supports a single case-insensitive substring. Root confirmed a title-word query against actual preview data returned matches without capturing records. The revised workspace adds obvious number/title search and Appendix filtering; tokenized multiword matching is a bounded usability improvement. Unknown catalog IDs remain visible placeholders and never silently disappear from a saved plan.

## Review adjudication

The architecture critic's pending-policy alternatives predated the owner's answers. Current decisions are authoritative: existing passcodes/names, proposal then save, all-history title correction, 30-minute disclosure cutoff and service-only custom choir titles. Production schema connection and the complete historical correction remain separately verified work; local prototype controls must not claim those writes occurred.

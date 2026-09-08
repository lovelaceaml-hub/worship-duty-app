# Native Sol review round 1

Verdict: changes required. Seven findings accepted for correction. Source review used an isolated snapshot and fictional fixtures only. No real records were supplied.

1. Limit the local request payload to pending records.
2. Preserve supplied song usage totals and last-sung date when retained history is shorter.
3. Keep the service picker available when a selected assignment has no saved plan.
4. Show the saved plan's actual presider when no member is selected.
5. Preserve standalone plans' recorded time when present.
6. Exclude standalone plan dates from Home and My Duties schedule strips.
7. Label requests for removed services from their own metadata instead of an unrelated first service.

Item 6 was already corrected in the parallel final browser delta. The remaining bounded changes are assigned to the existing browser and server writers with disjoint ownership. Retry remains required after checks; no review is waived.

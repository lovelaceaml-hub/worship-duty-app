# Controller draft checks

These are development findings, not final acceptance or approved visual references. All browser data was fictional and injected locally. No external browser traffic, real records or screenshots were used.

Two controller phone/desktop draft sweeps rendered Home, My Duties, Presider and Manage with no page overflow or runtime errors. Visual inspection found multiple duties concatenated into one service row, excess Presider stacking, and an old workspace appended below the month list. The implementation lane received the exact requirement to render one row per duty, keep compact prayer and song columns, and replace the month list with a dedicated selected-service editor.

A separate all-screen accessibility diagnostic passed Home and My Duties at both viewports. It found repeated Presider prayer-section landmark labels and twelve unnamed assignment selectors per Manage viewport. These were assigned to the UI lane before final acceptance.

The strict test lane also exposed lost native-details disclosure state after rerender. Root identified the non-bubbling toggle event registered without capture. Other source corrections include preserving actual duty/service identifiers, removing pseudo test rows, requiring reconfirmation after a presider change, and displaying the assigned presider rather than the viewer in service context.

Final acceptance must use frozen bytes, the full strict journey suite, fresh phone/desktop captures, accessibility, real aggregate-only smoke and native Sol review. None of these draft receipts substitutes for those gates.

# LDU review1 correction freeze

- Task ID: LDU-CALENDAR-REDESIGN-20260908
- Event: bounded source corrections saved and candidate frozen for native review2.
- Corrections: shared setlist confirmation predicate now recognizes legacy status confirmed and preserves changed and sung labels; Home month list and count share the department-filtered visible service collection; real Manage service selection moved below Choose a department into Service assignments and remains safe navigation in real mode; read-only Glory and Thanks now show songLabel plus title so Appendix values render A##.
- Focus verification: existing captureRenderFocus, findRenderFocus, restoreRenderFocus, and render call path preserve calendar, member, and filter focus and vertical scroll across rerenders.
- Validation command: node --check /Users/anthony/Projects/worship-refactor-worktrees/calendar-redesign/docs/design/prototype/open-bulletin/app.js, PASS.
- Validation command: node --check /Users/anthony/Projects/worship-refactor-worktrees/calendar-redesign/docs/design/prototype/open-bulletin/real-preview.js, PASS.
- Validation command: static Node assertions over app.js, index.html, and styles.css, PASS, 36 source markers, forbidden visible source markers absent, focus path and filtered month coupling verified, Manage order and real safe navigation verified, no en dash or em dash.
- Protected boundary: only the owned UI files and this LDU lane record and log were written. No server, fixture, production, test, plan, index, Git, screenshot, live-data, deployment, or network action was run.
- Review status: Controller Sol high review remains pending after root integration. No approval or overall plan completion is claimed.

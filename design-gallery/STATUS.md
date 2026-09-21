# Appearance gallery status

QA status as of 2026-09-20: `design-gallery/test.mjs` is being updated (lane F13) because features F3 to F10 changed what it clicks and expects. Until that lands, treat its results with care; see the open items in `docs/HANDOFF.md`.
The suite mocks Firebase Auth and Firestore, blocks external traffic, and checks Original, Prism, Navy & Cream, and Aurora at phone and desktop widths.
Build validation is review-only. No Firebase deployment is performed by GitHub Actions.

# Appearance gallery restored

Anthony reported that the live designs were missing after the department
release. Sol confirmed that `scripts/deploy.sh` had published the plain root
Hosting bundle instead of the compiled four-design gallery. The database
migration, named Functions, schedule trigger, and Firestore rules were not
affected.

Sol ran the guarded gallery publisher from the exact reviewed production tree.
It verified the live plain bundle was compatible, then released Hosting only.
Production release `gallery1789403828659` now exposes Original, Prism, Navy &
Cream, and Aurora. The live release manifest and app bundle contain all four
choices. Fresh desktop and phone smoke checks passed with zero accessibility
violations, console errors, or failed responses.

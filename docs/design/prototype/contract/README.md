# Design Contract Gate

Copy this package after Anthony selects a direction and before the selected prototype is approved. Record all seven candidate categories in `docs/DESIGN-CANDIDATES.json`, marking irrelevant categories with a specific reason. Every relevant category needs five direct reference links, five exact adoption candidates with license/cost/performance/responsive evidence, and only one to three auditioned finalists.

Configure:

- two or three direction IDs with committed phone and desktop artifact paths;
- Anthony's selected direction, exact selection date, and note;
- one committed runtime-neutral prototype artifact;
- phone and desktop interaction checks for that selected prototype;
- at least four primary-journey moments plus unique empty, loading, error, and success states;
- whether signature motion is part of the approved direction.

Run this command before `design:approve`:

```text
node scripts/design-contract.mjs
```

The command confirms that all direction/prototype artifacts exist, then opens the selected prototype, every journey moment, and every important state at the canonical phone and desktop sizes. It activates each documented control and rejects an outcome that was already visible before the action. Each important state must show its own marker while hiding the other three. It tests approved signature motion with both normal and reduced-motion settings.

Fewer than two or more than three directions, missing committed artifacts, an inferred or malformed Anthony selection, an inert prototype, duplicate states, broken signature motion, incomplete shortlists, homepage/search links, or missing adoption evidence fail closed. After this passes, freeze the approved references and cite them under `## Frozen design targets` in the active plan before production implementation.

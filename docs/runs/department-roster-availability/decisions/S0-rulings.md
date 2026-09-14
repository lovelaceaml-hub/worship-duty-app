# Sol rulings on S0 critique

All six findings are accepted as integration requirements.

1. Use least-privilege department-scoped reads and writes. Interface filtering alone is insufficient.
2. Normal assignment writes must reject ineligible targets. Only an authenticated administrator may use an explicit override, and the override must not change the member profile.
3. Members may edit only their own shared availability. Assigned department leaders may edit availability only for members of their department. Administrators retain recovery access. Field allowlists prevent role or department escalation.
4. Persist profiles by canonical member UID. Names are display data and aliases are migration inputs, not durable authorization keys.
5. Human edits outrank later history or Sheet evidence. Seed and sync may add provenance without reactivating, re-enabling, or overwriting a human decision.
6. Interpret recurring service-time availability in the congregation's configured timezone. A date-specific exception wins over the recurring choice for that service date. Tests must include daylight-saving boundaries.

These rulings use the product decisions already locked in the plan and require no new production access.

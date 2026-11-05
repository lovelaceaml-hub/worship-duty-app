## Full-suite testing requires Anthony's explicit approval (2026-10-17)

This rule applies to every agent and project, including delegated agents, CI,
release wrappers and scheduled jobs. It supersedes any older instruction below
that says to run a full suite by default.

- Run a full repository or project test suite only when Anthony's current prompt
  explicitly requests full-suite testing, or after recommending the exact suite
  and receiving his explicit approval immediately before executing it.
- Approval covers only the named project, suite and run. A generic request to
  test, verify, finish, release or deploy is not approval for a full suite.
- Keep focused checks tied to the change: selected test files or cases, syntax,
  types, lint, guards and limited smoke checks. Do not recreate a full suite by
  splitting it into several supposedly focused commands.
- Full suites must not start automatically on pushes, pull-request updates,
  merges or schedules. In workflows, use a manual dispatch and an explicit
  `full_suite_approved` input that defaults to false. Agents may set it true only
  for the current user-authorized run; a release request alone does not qualify.
- Pass this rule and the precise approved scope to every helper. Before invoking
  a script, package command, deploy hook or workflow, inspect what it runs. Report
  focused evidence and any full suite left unrun without claiming a full pass.


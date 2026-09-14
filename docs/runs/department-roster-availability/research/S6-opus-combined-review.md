# S6 combined Opus review

Verdict: `CHANGES_REQUIRED`

This was the one external Opus review permitted by Anthony's locked routing.
It reviewed the cumulative change from `b31ae73` through `8c9f84b`. No second
Opus review will run. All findings went directly to Sol.

## Findings

1. Assignment callables trusted client service identity and display names, read profiles outside the transaction, could create phantom schedule documents, and profile creation did not verify an account.
2. Normal assignment could commit a double booking before the client rejected it.
3. Empty migrated availability blocked normal scheduling, and release ordering did not enforce migration before rules and Hosting.
4. Existing administrator bulk assignment journeys were denied by the new schedule rule and could diverge locally.
5. Failed roster loads automatically retried without a stopping condition.
6. The rules contract test still described client-writable department assignment records.
7. Identity alias resolution could invent a UID for an unresolved name target.

## Sol disposition

Sol accepted all seven findings. Corrections bind assignments to an existing
schedule and transaction-fresh profile, derive identity from server records,
prevent normal double booking before and during the call, seed historical
service-time availability, preserve administrator bulk schedule compatibility
with projection reconciliation, stop automatic roster retries after an error,
update the server-only rules contract test, reject unresolved alias targets,
and document the required release sequence.

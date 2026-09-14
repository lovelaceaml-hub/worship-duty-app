# Department authorization rule diagram

```mermaid
flowchart TD
  Member[Verified member] --> Own[Own availability callable]
  Leader[Verified department leader] --> Roster[Scoped roster callable]
  Leader --> Profile[Scoped profile callable]
  Leader --> Assign[Normal assignment callable]
  Admin[Verified administrator] --> Override[Audited override callable]
  Admin --> Bulk[Legacy bulk schedule update]
  Assign --> Tx[Atomic schedule and assignment transaction]
  Override --> Tx
  Bulk --> Reconcile[Schedule trigger reconciliation]
  Own --> ProfileDoc[UID-keyed department profile]
  Profile --> ProfileDoc
  Tx --> Schedule[Public schedule projection]
  Tx --> Assignment[Leader-visible assignment record]
  Reconcile --> Assignment
```

Date exceptions override recurring availability. Normal assignments require an
active, eligible, schedulable, available profile. Administrator override never
changes the profile and requires a recorded reason.

# Calendar redesign source review 1

Reviewer: native gpt-5.6-sol, high. Read-only isolated calendar-review worktree. Baseline 81e48b1, frozen source manifest retained locally. Review ended successfully with three actionable P2 findings.

1. Prominent confirmation summary must recognize status-only confirmed records consistently with the existing state bar.
2. Selected-month service count must apply the same department predicate as the visible list.
3. Keyboard calendar controls must retain focus after rerender.

All findings accepted. The final source candidate already contains focus restoration, which was added while the frozen initial snapshot was reviewed. The remaining two changes are assigned to the same LDU writer. LVC checks include corresponding fictional edge cases. No real records, network or production writes were used by the reviewer. Final correction/delta review is pending.

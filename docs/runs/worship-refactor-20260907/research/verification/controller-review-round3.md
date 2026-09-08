# Verification native Sol review, round 3

Native Codex gpt-5.6-sol high review requested changes. Consecutive unsuccessful results for this gate: 3.

1. Fixed browser Date concealed the known double-stamp song confirmation defect. Add an advancing-clock confirmation scenario that fails original source and passes corrected source. The separate LCF actual-source regression already proves this defect and the fix.
2. Replace the 700 ms initial setlist snapshot timer with explicit deferred release after the required picker state.
3. Give emulator document IDs a unique run suffix and clean up only owned documents so concurrent baseline/integrated checks cannot interfere.

Root also observed a strict timestamp comparison fail despite the deferred-auth state guard passing. Use logical event sequencing that tolerates equal performance clock ticks. Retain real measurements and pre-auth attempt assertions. Correct broad accessibility wording: Manage retains baseline critical label/select-name findings; clean captures apply only to the named member/presider/site-lock views.

These are test reliability corrections, assigned to the sole Verification Luna writer. No production data was accessed or changed.

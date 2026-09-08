# Identity backup access boundary

Controller verification on 8 September 2026. Existing Firebase CLI authentication was used in memory for read-only Rules API calls. No credentials or record values were emitted or persisted.

The deployed Firestore release contains one source file, exactly matching the local firestore.rules bytes. SHA256: `3391556e2e62316afe2b1a32bc00d4b32bab6776757ac1a748aa267632a61b01`.

The exact rules were loaded into the loopback Firestore emulator at 127.0.0.1:8193 with the explicit project demo-worship-refactor. Unauthenticated and fictional anonymous-authenticated REST clients were denied both read and write access to the proposed private backup document and nested item. Eight denial assertions passed. Two control schedule reads returned the expected missing-document response, proving client access was evaluated rather than blanket authentication failure. No test document was written.

This establishes the current rules boundary for provider-only identity backups without a rules change. The correction runner, notification compatibility tests, native review, targeted function deployment and actual correction remain separate gates. This receipt does not claim the correction has run.

An aggregate-only read of the existing alias map passed the new pure map validation: nine entries, zero chains requiring flattening, no blank values, self-links or cycles. Values stayed in process memory. No production writes occurred. This reduces the risk that the notification compatibility update would reject existing configuration; it does not validate an unrun correction.

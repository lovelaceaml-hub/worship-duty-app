# Release authentication blocked

Anthony authorized full production release. The required read-only Firestore
backup failed with `PERMISSION_DENIED` before reading production data. The active
Google application-default account did not have Firestore access.

A Firebase CLI account diagnostic exposed credential material in command
output. Sol immediately logged that Firebase CLI account out to revoke the
session. No credentials are recorded in this run tree. No Functions, rules,
Hosting, or production data changed.

Resume only after Anthony signs Firebase CLI into an account with Firestore read,
deployment, and migration authority for `lv-zion-duties`.

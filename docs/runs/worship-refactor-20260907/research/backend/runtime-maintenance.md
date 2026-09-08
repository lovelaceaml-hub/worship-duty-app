# Existing runtime maintenance follow-up

The scoped deployment CLI reported that the existing Node.js 20 Functions runtime is deprecated and is scheduled for decommission on 2026-10-30. It also reported an older firebase-functions SDK. Neither runtime nor SDK was changed by this compatibility refactor.

Plan a separate tested runtime and dependency upgrade before that date. Official provider reference: https://cloud.google.com/functions/docs/runtime-support . This is an observed provider notice, not a deployment failure or a waived completion check for the current source extraction.

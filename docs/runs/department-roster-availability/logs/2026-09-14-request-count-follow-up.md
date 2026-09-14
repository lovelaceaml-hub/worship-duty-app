# Request count follow-up

- Anthony reported that the alert, Requests tab, and dashboard counts disagreed.
- Root cause: the Requests tab displayed requests plus conflicts, the alert included past conflicts, and pending requests were not re-evaluated after an assignment changed.
- Sol made the Requests tab request-only, aligned conflict attention with upcoming Planning scope, and presents schedule-changed requests as completed history.
- Verification: 30 focused Node tests passed, followed by the complete four-appearance browser suite.
- Release: Hosting only, `gallery1789404563426`, verified at `https://lv-zion-duties.web.app/`.
- Unchanged: Firestore data, Functions, rules, accounts, and schedule records.

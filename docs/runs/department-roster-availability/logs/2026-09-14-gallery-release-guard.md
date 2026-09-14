# Gallery release guard

- Anthony requested a permanent safeguard so the four designs cannot disappear in a later release.
- Root cause: the repository Firebase configuration still allowed Hosting to publish the single-design root directly.
- `scripts/deploy.sh` now delegates to `design-gallery/release.mjs --publish`.
- `firebase.json` now runs `scripts/guard-gallery-deploy.mjs` before Hosting, and only the gallery publisher supplies the required guard token.
- Focused tests prove an unguarded call is rejected and the gallery publisher path is allowed.
- Production content did not need another deployment because the four-design gallery was already live.

/*
 * Compatibility entrypoint for `npm run test:ui`.
 *
 * The approved UI check owns its loopback server and installs fixture-only
 * request guards before navigation. UI_BASE_URL is intentionally ignored so
 * this legacy command cannot target a live or user-supplied site.
 */
console.log('UI QA: fixture-only mode; UI_BASE_URL is ignored' + (process.env.UI_BASE_URL ? ' (supplied value was not used)' : ''));
import './fixture-baseline.mjs';

/* The release this page came from, and whether a newer one is live.
   scripts/build.mjs stamps every module address with ?v=<release> and writes
   release.json beside the app. Hosting serves the newest files whatever the
   stamp asks for, so a page opened before a release must not load files it
   has not loaded yet (the song planner, a theme): they would be the next
   release's, and would start a second copy of the app. Unbuilt source
   (npm start) has no stamp and never checks. */
const PAGE = new URL(import.meta.url).searchParams.get('v') || 'DEV';

export async function newerRelease() {
  if (PAGE === 'DEV') return false;
  try {
    const response = await fetch('release.json', { cache: 'no-store' });
    if (!response.ok) return false;
    const live = await response.json();
    return !!live && typeof live.release === 'string' && live.release !== PAGE;
  } catch (_error) {
    return false; // offline: this release's own files come from the device
  }
}

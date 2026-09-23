import {unifiedNameMap, feat, sheetUrl} from './constants.js';
import {svcId, dutyCategory} from './format.js';
import {parseCSV, sheetRowsToServices} from './sheet-parse.js';
import {state, departmentsLoaded, persistService, persistDepartments, fb, membersLoaded, ui, persistMembers} from './state.js';
import {isVerifiedSession, authActor, canPermission} from './auth.js';
import {addBanner, afterDataChange} from './notify.js';
// findService (actions/dispatch.js, Section 5) and render (views/shell.js,
// Section 4) are not imported: neither module exists yet, and a real
// import back to app.js would risk the same evaluation-order problem
// Section 2 found. app.js pushes the live references in once.
let findService, render;
export function setSheetSyncRefs(findServiceFn, renderFn) { findService = findServiceFn; render = renderFn; }

export const SHEET_SYNC_MIN_MS = 5 * 60 * 1000; // auto-sync throttle window
export function mergeSheetServices(services) {
  let added = 0, updated = 0;
  let deptsChanged = false;
  const addToDept = (duty, member) => {
    if (!member || !departmentsLoaded) return;
    const cat = dutyCategory(duty).name;
    if (!state.departments) state.departments = {};
    const roster = state.departments[cat] || (state.departments[cat] = []);
    if (roster.indexOf(member) === -1) { roster.push(member); roster.sort(); deptsChanged = true; }
  };
  services.forEach(sheetSvc => {
    const existing = findService(svcId(sheetSvc));
    if (!existing) {
      const fresh = {
        date: sheetSvc.date,
        time: sheetSvc.time || '',
        service: sheetSvc.service,
        worship: sheetSvc.worship || '',
        choirSong: sheetSvc.choirSong || '',
        assignments: Object.assign({}, sheetSvc.assignments)
      };
      state.services.push(fresh);
      persistService(fresh);
      Object.keys(fresh.assignments).forEach(duty => addToDept(duty, fresh.assignments[duty]));
      added++;
      return;
    }
    let changed = false;
    if (sheetSvc.time && existing.time !== sheetSvc.time) { existing.time = sheetSvc.time; changed = true; }
    if (sheetSvc.worship && existing.worship !== sheetSvc.worship) { existing.worship = sheetSvc.worship; changed = true; }
    const choirSongSeen = sheetSvc._sheetChoirSongSeen === true ||
      (!Object.prototype.hasOwnProperty.call(sheetSvc, '_sheetChoirSongSeen') && Boolean(sheetSvc.choirSong));
    if (choirSongSeen && existing.choirSong !== sheetSvc.choirSong) { existing.choirSong = sheetSvc.choirSong; changed = true; }
    if (!existing.assignments) existing.assignments = {};
    // Only touch duties the sheet mentions, Media Booth, Parking Lot and
    // Offering assignments are preserved.
    Object.keys(sheetSvc.assignments).forEach(duty => {
      addToDept(duty, sheetSvc.assignments[duty]);
      if (existing.assignments[duty] !== sheetSvc.assignments[duty]) {
        existing.assignments[duty] = sheetSvc.assignments[duty];
        changed = true;
      }
    });
    if (changed) { persistService(existing); updated++; }
  });
  if (deptsChanged) persistDepartments();
  return { added: added, updated: updated };
}
export async function syncFromSheet(manual) {
  if (!feat('sheetSync')) { if (manual) alert('Google Sheet sync is turned off in Manage → Features.'); return; }
  if (fb && (!isVerifiedSession() || !canPermission('isAdmin', authActor()))) {
    if (manual) addBanner('Only an authorized administrator can sync the schedule from the sheet.', true);
    return;
  }
  const url = sheetUrl();
  if (!url) { if (manual) alert('No sheet link is set. Add one in Manage → Data & Sync.'); return; }
  if (!manual) {
    const last = Number(localStorage.getItem('wds-sheet-sync-at') || 0);
    if (Date.now() - last < SHEET_SYNC_MIN_MS) return; // throttled
  }
  localStorage.setItem('wds-sheet-sync-at', String(Date.now()));

  if (manual) { ui.syncing = true; render(); }
  let text;
  try {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    text = await resp.text();
  } catch (e) {
    ui.syncing = false;
    if (manual) { render(); alert('Could not reach the Google Sheet. Check the link and your connection, then try again.'); }
    else console.warn('Sheet sync failed:', e);
    return;
  }

  const parsed = sheetRowsToServices(parseCSV(text), new Date());
  // Canonicalize sheet names before merging so the sheet can't re-introduce
  // variant spellings the app has already unified (keeps push + .ics targeting
  // aligned with the canonical name). Blank '' clears pass through unchanged.
  const nameMap = unifiedNameMap();
  const canon = n => (n && nameMap[n]) || n;
  parsed.services.forEach(svc => {
    const a = svc.assignments || {};
    Object.keys(a).forEach(duty => { a[duty] = canon(a[duty]); });
  });
  parsed.members = Array.from(new Set(parsed.members.map(canon))).sort();
  const merge = mergeSheetServices(parsed.services);

  // add any new members the sheet introduced
  let addedMembers = 0;
  parsed.members.forEach(name => {
    if (state.members.indexOf(name) === -1) { state.members.push(name); addedMembers++; }
  });
  if (addedMembers) { state.members.sort(); persistMembers(); }

  localStorage.setItem('wds-sheet-sync-result', JSON.stringify({
    t: Date.now(), added: merge.added, updated: merge.updated, members: addedMembers,
    warnings: parsed.warnings.length, warningMsgs: parsed.warnings.slice(0, 6)
  }));

  ui.syncing = false;
  afterDataChange();

  if (manual) {
    const total = merge.added + merge.updated + addedMembers;
    let msg;
    if (!total) {
      msg = 'Everything already matches the sheet.';
    } else {
      const parts = [];
      if (merge.added) parts.push(merge.added + ' service' + (merge.added > 1 ? 's' : '') + ' added');
      if (merge.updated) parts.push(merge.updated + ' service' + (merge.updated > 1 ? 's' : '') + ' updated');
      if (addedMembers) parts.push(addedMembers + ' new ' + (addedMembers > 1 ? 'people' : 'person'));
      msg = 'Synced from the sheet: ' + parts.join(', ') + '.';
    }
    if (parsed.warnings.length) msg += '\n\n' + parsed.warnings.length + ' row type(s) were skipped (unknown duties).';
    alert(msg);
  }
}
export let sheetSyncTried = false;
export let autoSyncWaits = 0;
export function autoSyncOnce() {
  if (sheetSyncTried) return;
  // Roster auto-add (mergeSheetServices → addToDept) needs the members and
  // departments docs; if the sync fired before they land, new names silently
  // miss their department. Wait for both (bounded ~10s so we never stall).
  if (fb && !(membersLoaded && departmentsLoaded) && autoSyncWaits < 20) {
    autoSyncWaits++;
    setTimeout(autoSyncOnce, 500);
    return;
  }
  sheetSyncTried = true;
  syncFromSheet(false);
}
export let sheetSyncScheduled = false;
export function scheduleSyncSoon() {
  if (sheetSyncScheduled) return;
  sheetSyncScheduled = true;
  setTimeout(autoSyncOnce, 1500);
}

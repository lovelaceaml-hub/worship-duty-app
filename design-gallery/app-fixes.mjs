import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

function replaceExactlyOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Choir-date fix source drift: ${label} (${count})`);
  return source.replace(before, after);
}

/**
 * Keep Google Sheet choir-song rows authoritative for the exact date + service.
 *
 * Previously a blank Choir Song cell was ignored and mergeSheetServices only
 * copied non-empty choir songs. If a song was moved from one service/date to
 * another, the old Firestore service could therefore keep the previous value
 * and display it on the wrong date. We track whether the sheet explicitly had
 * a Choir Song row and allow that row to clear the stale value when blank.
 * Services with no Choir Song row at all are left alone, so manual-only values
 * are not erased accidentally.
 */
function choirDateSyncAlreadyApplied(source) {
  return source.includes('_sheetChoirSongSeen: false') &&
    source.includes('svc._sheetChoirSongSeen = true') &&
    source.includes('const choirSongSeen = sheetSvc._sheetChoirSongSeen === true');
}

export function patchChoirDateSync(source) {
  if (choirDateSyncAlreadyApplied(source)) {
    return source;
  }
  source = replaceExactlyOnce(
    source,
    "svc = { date: iso, service: serviceLabel, worship: iWorship >= 0 ? cell(iWorship) : '', time: parseSheetTime(cell(iTime)), assignments: {}, choirSong: '' };",
    "svc = { date: iso, service: serviceLabel, worship: iWorship >= 0 ? cell(iWorship) : '', time: parseSheetTime(cell(iTime)), assignments: {}, choirSong: '', _sheetChoirSongSeen: false };",
    'sheet service initializer'
  );

  source = replaceExactlyOnce(
    source,
    "if (isChoirSong) {\n      if (member) svc.choirSong = member; // never clear the song on a blank cell\n      continue;\n    }",
    "if (isChoirSong) {\n      svc._sheetChoirSongSeen = true;\n      svc.choirSong = member; // an explicit blank Choir Song row clears a stale synced value\n      continue;\n    }",
    'choir row parser'
  );

  source = replaceExactlyOnce(
    source,
    "if (sheetSvc.choirSong && existing.choirSong !== sheetSvc.choirSong) { existing.choirSong = sheetSvc.choirSong; changed = true; }",
    "if (sheetSvc._sheetChoirSongSeen && existing.choirSong !== sheetSvc.choirSong) { existing.choirSong = sheetSvc.choirSong; changed = true; }",
    'choir merge rule'
  );

  return source;
}

export async function applyStagedAppFixes(dest) {
  const appPath = path.join(dest, 'app.js');
  const before = await fs.readFile(appPath, 'utf8');

  // docs/PLAN-2026-09-22-APP-JS-SPLIT.md moved sheetRowsToServices and
  // mergeSheetServices (the functions this fix's three markers live inside)
  // out of app.js into core/sheet-parse.js and core/sheet-sync.js. The
  // baseline app.js this fix originally targeted already carried the patch
  // before the split started, and the split preserved that code verbatim in
  // its new home, so the already-applied check must also read those two
  // staged files when they exist, or it will never see the markers and will
  // try (and fail) to reapply a fix that already landed years earlier.
  const relocated = await Promise.all(
    ['core/sheet-parse.js', 'core/sheet-sync.js'].map(rel =>
      fs.readFile(path.join(dest, rel), 'utf8').catch(() => '')
    )
  );
  if (choirDateSyncAlreadyApplied(before + relocated.join(''))) {
    return { appPath, changed: false };
  }

  const after = patchChoirDateSync(before);
  await fs.writeFile(appPath, after);
  return { appPath, changed: after !== before };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const target = process.argv[2] ? path.resolve(process.argv[2]) : path.join(repoRoot, '.hosting-gallery');
  const result = await applyStagedAppFixes(target);
  console.log(`Applied choir date/service sync fix to ${result.appPath}`);
}

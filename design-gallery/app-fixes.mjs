import fs from 'node:fs/promises';
import path from 'node:path';

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
export function patchChoirDateSync(source) {
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
  const after = patchChoirDateSync(before);
  await fs.writeFile(appPath, after);
  return { appPath, changed: after !== before };
}

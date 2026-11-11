'use strict';

/* TEST ONLY. A stand-in for sheets.js's createSheets(): tabs are plain 2-D
   arrays. Inserts, deletes, tab copies and cell writes change them the way
   the Sheets API would, as do cell values sent with them (updateCells);
   format copies are only recorded. */

function fakeSheets(tabs) {
  const sheets = Object.entries(tabs).map(([title, values], index) => ({ sheetId: 100 + index, title, index, values: values.map(row => row.slice()) }));
  const log = [];
  const byTitle = title => sheets.find(sheet => sheet.title === title);
  const byId = id => sheets.find(sheet => sheet.sheetId === id);

  function parseA1(range) {
    const match = range.match(/^'((?:[^']|'')+)'!([A-Z]+)(\d+)$/);
    if (!match) throw new Error('Bad range ' + range);
    const column = match[2].split('').reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
    return { sheet: byTitle(match[1].replace(/''/g, "'")), row: Number(match[3]) - 1, column };
  }

  return {
    log,
    sheets,
    tab: title => byTitle(title).values,
    async tabs() { return sheets.map(({ sheetId, title, index }) => ({ sheetId, title, index })); },
    async values(title) {
      const sheet = byTitle(title);
      if (!sheet) throw new Error('No tab ' + title);
      return sheet.values.map(row => row.slice());
    },
    async write(data) {
      data.forEach(({ range, values }) => {
        const { sheet, row, column } = parseA1(range);
        values.forEach((cells, r) => cells.forEach((value, c) => {
          while (sheet.values.length <= row + r) sheet.values.push([]);
          const line = sheet.values[row + r];
          while (line.length <= column + c) line.push('');
          line[column + c] = value;
        }));
      });
      log.push({ write: data.map(item => item.range) });
    },
    async update(requests) {
      const replies = requests.map(request => {
        if (request.insertDimension) {
          const { sheetId, startIndex, endIndex } = request.insertDimension.range;
          const sheet = byId(sheetId);
          while (sheet.values.length < startIndex) sheet.values.push([]);
          sheet.values.splice(startIndex, 0, ...Array.from({ length: endIndex - startIndex }, () => []));
          log.push({ insert: [sheet.title, startIndex + 1, endIndex - startIndex] });
          return {};
        }
        if (request.deleteDimension) {
          const { sheetId, startIndex, endIndex } = request.deleteDimension.range;
          const sheet = byId(sheetId);
          sheet.values.splice(startIndex, endIndex - startIndex);
          log.push({ delete: [sheet.title, startIndex + 1, endIndex - startIndex] });
          return {};
        }
        if (request.duplicateSheet) {
          const { sourceSheetId, insertSheetIndex, newSheetName, newSheetId } = request.duplicateSheet;
          const copy = { sheetId: newSheetId || 100 + sheets.length, title: newSheetName, index: insertSheetIndex, values: byId(sourceSheetId).values.map(row => row.slice()) };
          sheets.push(copy);
          log.push({ duplicate: newSheetName });
          return { duplicateSheet: { properties: { sheetId: copy.sheetId, title: newSheetName, index: insertSheetIndex } } };
        }
        if (request.updateCells) {
          const { start, rows } = request.updateCells;
          const sheet = byId(start.sheetId);
          rows.forEach((row, r) => row.values.forEach((cell, c) => {
            while (sheet.values.length <= start.rowIndex + r) sheet.values.push([]);
            const line = sheet.values[start.rowIndex + r];
            while (line.length <= start.columnIndex + c) line.push('');
            const value = cell.userEnteredValue || {};
            line[start.columnIndex + c] = value.numberValue != null ? value.numberValue : value.stringValue != null ? value.stringValue : '';
          }));
          log.push({ cells: [sheet.title, start.rowIndex + 1] });
          return {};
        }
        if (request.copyPaste) {
          log.push({ look: [byId(request.copyPaste.source.sheetId).title, request.copyPaste.source.startRowIndex + 1, request.copyPaste.destination.startRowIndex + 1, request.copyPaste.pasteType] });
          return {};
        }
        throw new Error('Unexpected request ' + Object.keys(request)[0]);
      });
      return { replies };
    }
  };
}

module.exports = { fakeSheets };

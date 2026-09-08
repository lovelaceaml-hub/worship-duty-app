'use strict';

/* Pure parser for the published schedule CSV. It has no access to browser
   globals, configuration, network, or time. Pass the reference date and duty
   catalog explicitly when converting rows. */
(function expose(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.window) {
    const app = root.window.WorshipApp || (root.window.WorshipApp = {});
    const domain = app.domain || (app.domain = {});
    domain.sheet = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSheetDomain() {
  const MONTHS = Object.freeze({
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  });

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const source = String(text == null ? '' : text);
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (inQuotes) {
        if (char === '"') {
          if (source[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && source[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
      } else {
        field += char;
      }
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function validDutySet(categories) {
    const set = {};
    (categories || []).forEach(category => category.duties.forEach(duty => { set[duty] = true; }));
    return set;
  }

  function parseSheetDate(raw) {
    if (!raw) return null;
    const cleaned = String(raw).replace(/^[a-z]+,?\s*/i, '').trim();
    const match = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
    if (!match) return null;
    const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
    if (month == null) return null;
    const day = parseInt(match[2], 10);
    if (!(day >= 1 && day <= 31)) return null;
    return { month, day };
  }

  function pad(value) {
    return (value < 10 ? '0' : '') + value;
  }

  function inferYearISO(month, day, today) {
    if (!(today instanceof Date) || Number.isNaN(today.getTime())) {
      throw new TypeError('inferYearISO requires a valid reference Date');
    }
    const year = today.getFullYear();
    const nowTime = today.getTime();
    let best = null;
    let bestDiff = Infinity;
    [year - 1, year, year + 1].forEach(candidateYear => {
      const date = new Date(candidateYear, month, day, 12, 0, 0);
      const diff = Math.abs(date.getTime() - nowTime);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = date;
      }
    });
    return best.getFullYear() + '-' + pad(best.getMonth() + 1) + '-' + pad(best.getDate());
  }

  function parseSheetTime(raw) {
    if (!raw) return '';
    const match = String(raw).trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp])[Mm]?$/);
    if (!match) return '';
    let hour = parseInt(match[1], 10);
    const minute = match[2];
    const isPm = match[3].toLowerCase() === 'p';
    if (hour === 12) hour = 0;
    if (isPm) hour += 12;
    return pad(hour) + ':' + minute;
  }

  /* Convert rows to service-shaped records. A blank member explicitly clears
     a listed duty. An absent duty row remains outside the merge contract. */
  function sheetRowsToServices(rows, today, categories) {
    const result = { services: [], members: [], warnings: [] };
    if (!rows || !rows.length) return result;
    const header = rows[0].map(value => String(value == null ? '' : value).trim().toLowerCase());
    const column = name => header.indexOf(name);
    const iDate = column('date');
    const iService = column('service');
    const iWorship = column('worship');
    const iTime = column('time');
    const iDuty = column('duty');
    const iMember = column('member');
    if (iDate < 0 || iService < 0 || iDuty < 0 || iMember < 0) {
      result.warnings.push('Sheet is missing required columns (Date, Service, Duty, Member).');
      return result;
    }
    const valid = validDutySet(categories);
    const byKey = {};
    const membersSeen = {};
    const unknownDuties = {};
    for (let index = 1; index < rows.length; index++) {
      const row = rows[index];
      const cell = columnIndex => columnIndex >= 0 && columnIndex < row.length
        ? String(row[columnIndex] == null ? '' : row[columnIndex]).trim()
        : '';
      const rawDate = cell(iDate);
      const serviceLabel = cell(iService);
      const duty = cell(iDuty);
      const member = cell(iMember);
      if (!rawDate || !serviceLabel || !duty) continue;
      const monthDay = parseSheetDate(rawDate);
      if (!monthDay) continue;
      const iso = inferYearISO(monthDay.month, monthDay.day, today);
      const isChoirSong = duty === 'Choir Song';
      if (!isChoirSong && !valid[duty]) {
        if (!unknownDuties[duty]) {
          unknownDuties[duty] = true;
          result.warnings.push('Unknown duty in sheet: "' + duty + '"');
        }
        continue;
      }
      const key = iso + '|' + serviceLabel;
      let service = byKey[key];
      if (!service) {
        service = {
          date: iso,
          service: serviceLabel,
          worship: iWorship >= 0 ? cell(iWorship) : '',
          time: parseSheetTime(cell(iTime)),
          assignments: {},
          choirSong: ''
        };
        byKey[key] = service;
        result.services.push(service);
      }
      if (isChoirSong) {
        if (member) service.choirSong = member;
        continue;
      }
      service.assignments[duty] = member;
      if (member) membersSeen[member] = true;
    }
    result.members = Object.keys(membersSeen).sort();
    return result;
  }

  return {
    parseCSV,
    validDutySet,
    parseSheetDate,
    inferYearISO,
    parseSheetTime,
    sheetRowsToServices
  };
});

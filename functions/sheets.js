'use strict';

/* The Google Sheets API, called with the server's own Google account. The
   Sheet must be shared with that account as an Editor. createSheets() takes
   a request function so tests (and scripts/sheet-try.mjs) can use their own. */

const { GoogleAuth } = require('google-auth-library');

const API = 'https://sheets.googleapis.com/v4/spreadsheets/';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
let auth = null;

/* The ID in a Sheet's address (".../spreadsheets/d/<id>/edit"), or a bare ID. */
function sheetIdFrom(value) {
  const input = String(value || '').trim();
  const match = input.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/) || input.match(/^([A-Za-z0-9_-]{20,})$/);
  return match ? match[1] : '';
}

async function googleRequest(options) {
  auth = auth || new GoogleAuth({ scopes: [SCOPE] });
  const client = await auth.getClient();
  try {
    return (await client.request(options)).data;
  } catch (error) {
    throw await explain(error);
  }
}

/* The server account's address, for "share the Sheet with ..." messages. */
async function accountEmail() {
  try {
    auth = auth || new GoogleAuth({ scopes: [SCOPE] });
    return (await auth.getCredentials()).client_email || '';
  } catch (_error) {
    return '';
  }
}

async function explain(error) {
  const status = error && error.response && error.response.status;
  const detail = error && error.response && error.response.data && error.response.data.error && error.response.data.error.message;
  let message = detail || (error && error.message) || 'The Sheet could not be reached.';
  if (status === 403) message = 'The Sheet is not shared with the app\'s server account' + (await accountEmail().then(email => email ? ' (' + email + ')' : '')) + '. Share it as an Editor.';
  if (status === 404) message = 'No Sheet was found at that link.';
  return Object.assign(new Error(message), { status: status || 0 });
}

function createSheets(spreadsheetId, request = googleRequest) {
  if (!spreadsheetId) throw new Error('No Sheet link is set.');
  const base = API + encodeURIComponent(spreadsheetId);
  return {
    /* [{ sheetId, title, index }] */
    async tabs() {
      const result = await request({ method: 'GET', url: base, params: { fields: 'sheets.properties(sheetId,title,index)' } });
      return (result.sheets || []).map(sheet => sheet.properties);
    },
    /* A tab's values, dates as serial numbers. */
    async values(title) {
      const range = "'" + title.replace(/'/g, "''") + "'";
      const result = await request({ method: 'GET', url: base + '/values/' + encodeURIComponent(range),
        params: { valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' } });
      return result.values || [];
    },
    /* [{ range: "'2026 Entry'!A4", values: [[...]] }], written as typed (RAW), never as formulas. */
    async write(data) {
      if (!data.length) return null;
      return request({ method: 'POST', url: base + '/values:batchUpdate', data: { valueInputOption: 'RAW', data } });
    },
    /* Structural changes: insert or delete rows, copy formats, copy a tab. */
    async update(requests) {
      if (!requests.length) return { replies: [] };
      return request({ method: 'POST', url: base + ':batchUpdate', data: { requests } });
    }
  };
}

module.exports = { createSheets, sheetIdFrom, accountEmail };

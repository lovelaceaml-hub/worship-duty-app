'use strict';

/* The Google Sheets API, called as the Sheet account below, which the duty
   Sheet is shared with as an Editor. The server's own account borrows it
   (it holds Service Account Token Creator on it). createSheets() takes a
   request function so tests (and scripts/sheet-try.mjs) can use their own. */

const { GoogleAuth, Impersonated } = require('google-auth-library');

const API = 'https://sheets.googleapis.com/v4/spreadsheets/';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SHEET_ACCOUNT = 'lv-zion-worship@lv-zion-duties.iam.gserviceaccount.com';
let client = null;

/* A client signed in as the Sheet account. A failed sign-in is not kept, so
   the next call tries again. */
function sheetClient() {
  client = client || (async () => {
    const source = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();
    return new Impersonated({ sourceClient: source, targetPrincipal: SHEET_ACCOUNT, targetScopes: [SCOPE], lifetime: 3600 });
  })().catch(error => { client = null; throw error; });
  return client;
}

/* The ID in a Sheet's address (".../spreadsheets/d/<id>/edit"), or a bare ID. */
function sheetIdFrom(value) {
  const input = String(value || '').trim();
  const match = input.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/) || input.match(/^([A-Za-z0-9_-]{20,})$/);
  return match ? match[1] : '';
}

/* A request the API refused for its per-minute quota (429) was not carried
   out, so it is tried again, after a growing pause. Other failures are not:
   a structural change (inserting a row) might have happened already. */
const RETRY = Object.freeze({ retry: 3, statusCodesToRetry: [[429, 429]], httpMethodsToRetry: ['GET', 'POST'], noResponseRetries: 0 });

async function googleRequest(options) {
  try {
    return (await (await sheetClient()).request(Object.assign({ retry: true, retryConfig: Object.assign({}, RETRY) }, options))).data;
  } catch (error) {
    throw await explain(error);
  }
}

/* The Sheet account's address, for "share the Sheet with ..." messages. */
async function accountEmail() {
  return SHEET_ACCOUNT;
}

async function explain(error) {
  const status = error && error.response && error.response.status;
  const detail = error && error.response && error.response.data && error.response.data.error && error.response.data.error.message;
  let message = detail || (error && error.message) || 'The Sheet could not be reached.';
  if (/impersonate/i.test(String(error && error.message))) message = 'The app could not sign in as the Sheet account (' + SHEET_ACCOUNT + ').';
  else if (status === 403) message = 'The Sheet is not shared with the Sheet account (' + SHEET_ACCOUNT + '). Share it as an Editor.';
  if (status === 404) message = 'No Sheet was found at that link.';
  return Object.assign(new Error(message), { status: status || 0 });
}

function createSheets(spreadsheetId, request = googleRequest) {
  if (!spreadsheetId) throw new Error('No Sheet link is set.');
  const base = API + encodeURIComponent(spreadsheetId);
  return {
    /* The spreadsheet's own title. */
    async title() {
      const result = await request({ method: 'GET', url: base, params: { fields: 'properties.title' } });
      return (result.properties && result.properties.title) || '';
    },
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

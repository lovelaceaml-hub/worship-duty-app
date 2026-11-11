'use strict';

/* The Signal song ingest's way into the song data. The ingest (the
   song-ingest repository, on Anthony's Mac or the Signal hub VM) reads and
   writes `setlists` and `songStats` here with a bearer token, so those two
   collections need not be open to anyone on the internet.

   POST, JSON body:
     { op: 'get',   collection, id }          -> { exists, data }
     { op: 'patch', collection, id, fields }  -> { ok: true }
   `patch` writes only the top-level fields given, each one whole, and leaves
   the rest of the document alone: what the ingest's Firestore REST PATCH with
   an update mask did. Nothing else can be read or written through here. */
const crypto = require('node:crypto');

const COLLECTIONS = ['setlists', 'songStats'];
const MAX_BODY_BYTES = 256 * 1024;

/* Compared as hashes, so the time taken says nothing about the token. */
function sameToken(given, expected) {
  if (!given || !expected) return false;
  const hash = text => crypto.createHash('sha256').update(String(text)).digest();
  return crypto.timingSafeEqual(hash(given), hash(expected));
}

function createSongIngestEndpoint({ db, logger, token }) {
  return async function songIngest(request, response) {
    const reply = (status, body) => response.status(status).json(body);
    try {
      if (request.method !== 'POST') return reply(405, { error: 'method-not-allowed' });
      const header = String(request.get('authorization') || '');
      const given = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
      if (!sameToken(given, token())) return reply(401, { error: 'unauthorized' });
      const body = request.body && typeof request.body === 'object' ? request.body : {};
      if (JSON.stringify(body).length > MAX_BODY_BYTES) return reply(413, { error: 'too-large' });
      const collection = String(body.collection || '');
      const id = String(body.id || '');
      if (!COLLECTIONS.includes(collection) || !id || id.includes('/') || id.length > 200 || id === '.' || id === '..') {
        return reply(400, { error: 'invalid-document' });
      }
      const reference = db.collection(collection).doc(id);
      if (body.op === 'get') {
        const snapshot = await reference.get();
        return reply(200, { exists: snapshot.exists, data: snapshot.exists ? snapshot.data() : null });
      }
      if (body.op === 'patch') {
        const fields = body.fields;
        const names = fields && typeof fields === 'object' && !Array.isArray(fields) ? Object.keys(fields) : [];
        // Plain field names only, so a name is never read as a path into a field.
        if (!names.length || names.length > 50 || names.some(name => !/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(name))) {
          return reply(400, { error: 'invalid-fields' });
        }
        await reference.set(fields, { mergeFields: names });
        logger.info('songIngest: patched', { collection, id, fields: names });
        return reply(200, { ok: true });
      }
      return reply(400, { error: 'invalid-op' });
    } catch (error) {
      logger.error('songIngest failed', { error: String(error && error.message || error) });
      return reply(500, { error: 'internal' });
    }
  };
}

module.exports = { createSongIngestEndpoint, sameToken };

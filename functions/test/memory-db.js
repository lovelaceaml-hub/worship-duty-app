'use strict';

/* Just enough Firestore for the handler tests: documents by path, reads and
   transactions whose merge writes merge nested maps and honour
   FieldValue.delete(), as Firestore does. `store` holds the documents. */
const { FieldValue } = require('firebase-admin/firestore');

const DELETE = FieldValue.delete();
const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const isDelete = value => !!value && typeof value.isEqual === 'function' && value.isEqual(DELETE);
const isMap = value => !!value && typeof value === 'object' && !Array.isArray(value) && !isDelete(value);

/* Firestore's merge: maps merge key by key, a delete sentinel removes its key,
   anything else replaces. */
function merge(target, patch) {
  const out = Object.assign({}, target);
  Object.entries(patch).forEach(([key, value]) => {
    if (isDelete(value)) delete out[key];
    else if (isMap(value)) out[key] = merge(isMap(out[key]) ? out[key] : {}, value);
    else out[key] = clone(value);
  });
  return out;
}

/* Values written without merge, with any delete sentinel dropped. */
function plain(value) {
  if (!isMap(value)) return clone(value);
  const out = {};
  Object.entries(value).forEach(([key, field]) => { if (!isDelete(field)) out[key] = plain(field); });
  return out;
}

function memoryDb(docs = {}) {
  const store = new Map(Object.entries(clone(docs)));
  const snapshot = path => ({ id: path.split('/').pop(), exists: store.has(path), data: () => clone(store.get(path)) });
  const ref = path => ({
    path,
    id: path.split('/').pop(),
    collection: name => collection(path + '/' + name),
    get: async () => snapshot(path),
    set: async (value, options) => { apply([path, value, options]); }
  });
  // A collection's documents, and `where(field, '==', value)` over them.
  const collection = prefix => ({
    doc: id => ref(prefix + '/' + id),
    where: (field, op, value) => ({
      get: async () => {
        if (op !== '==') throw new Error('memoryDb supports == only');
        const docs = [...store.keys()].filter(path => path.startsWith(prefix + '/') && !path.slice(prefix.length + 1).includes('/') &&
          (store.get(path) || {})[field] === value).map(snapshot);
        return { docs, empty: !docs.length, size: docs.length };
      }
    })
  });
  const apply = ([path, value, options]) => {
    if (value === undefined) store.delete(path);
    else if (options && options.merge) store.set(path, merge(store.get(path) || {}, value));
    else store.set(path, plain(value));
  };
  return {
    store,
    collection,
    async runTransaction(work) {
      const writes = [];
      const result = await work({
        getAll: (...refs) => Promise.all(refs.map(item => item.get())),
        get: item => item.get(),
        set: (item, value, options) => { writes.push([item.path, value, options]); },
        update: (item, value) => { writes.push([item.path, value, { merge: true }]); },
        delete: item => { writes.push([item.path, undefined]); }
      });
      writes.forEach(apply);
      return result;
    }
  };
}

module.exports = { memoryDb };

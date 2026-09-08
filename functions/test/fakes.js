'use strict';

function copy(value) {
  return value === undefined ? value : structuredClone(value);
}

class FakeDocumentSnapshot {
  constructor(ref, value) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = value !== undefined;
    this._value = copy(value);
  }

  data() {
    return copy(this._value);
  }
}

class FakeDocumentReference {
  constructor(db, collectionName, id) {
    this.db = db;
    this.collectionName = collectionName;
    this.id = id;
  }

  async get() {
    this.db.events.push({ type: 'get-doc', collection: this.collectionName, id: this.id });
    return new FakeDocumentSnapshot(this, this.db._get(this.collectionName, this.id));
  }

  async set(value, options) {
    this.db.events.push({ type: 'set-doc', collection: this.collectionName, id: this.id });
    this.db._set(this.collectionName, this.id, value, options);
  }

  async delete() {
    this.db.events.push({ type: 'delete-doc', collection: this.collectionName, id: this.id });
    this.db._delete(this.collectionName, this.id);
  }
}

class FakeQuery {
  constructor(db, collectionName, filters, ordering, limitCount) {
    this.db = db;
    this.collectionName = collectionName;
    this.filters = filters || [];
    this.ordering = ordering || [];
    this.limitCount = limitCount;
  }

  where(field, operator, value) {
    return new FakeQuery(this.db, this.collectionName,
      this.filters.concat([{ field, operator, value }]), this.ordering, this.limitCount);
  }

  orderBy(field, direction) {
    return new FakeQuery(this.db, this.collectionName, this.filters,
      this.ordering.concat([{ field, direction: direction || 'asc' }]), this.limitCount);
  }

  limit(count) {
    return new FakeQuery(this.db, this.collectionName, this.filters, this.ordering, count);
  }

  async get() {
    this.db.events.push({
      type: 'get-query',
      collection: this.collectionName,
      filters: copy(this.filters),
      ordering: copy(this.ordering),
      limit: this.limitCount
    });
    let entries = Array.from(this.db._collection(this.collectionName).entries());
    entries = entries.filter(([, value]) => this.filters.every(filter => {
      const actual = value && value[filter.field];
      if (filter.operator === '>=') return actual >= filter.value;
      if (filter.operator === '<') return actual < filter.value;
      if (filter.operator === '==') return actual === filter.value;
      throw new Error('Unsupported fake query operator: ' + filter.operator);
    }));
    for (let i = this.ordering.length - 1; i >= 0; i--) {
      const sort = this.ordering[i];
      entries.sort((left, right) => {
        const a = left[1] && left[1][sort.field];
        const b = right[1] && right[1][sort.field];
        const result = a < b ? -1 : a > b ? 1 : 0;
        return sort.direction === 'desc' ? -result : result;
      });
    }
    if (this.limitCount !== undefined) entries = entries.slice(0, this.limitCount);
    const docs = entries.map(([id, value]) =>
      new FakeDocumentSnapshot(new FakeDocumentReference(this.db, this.collectionName, id), value));
    return {
      docs,
      forEach(callback) { docs.forEach(callback); }
    };
  }
}

class FakeCollection extends FakeQuery {
  constructor(db, collectionName) {
    super(db, collectionName);
  }

  doc(id) {
    return new FakeDocumentReference(this.db, this.collectionName, id);
  }
}

class FakeBulkWriter {
  constructor(db) {
    this.db = db;
    this.operations = [];
    this.closed = false;
  }

  set(ref, value, options) {
    this.operations.push({ ref, value: copy(value), options: copy(options) });
    return this;
  }

  async close() {
    this.db.events.push({ type: 'bulk-close', count: this.operations.length });
    this.operations.forEach(operation => operation.ref.db._set(
      operation.ref.collectionName, operation.ref.id, operation.value, operation.options));
    this.closed = true;
  }
}

class FakeDb {
  constructor(initial) {
    this.records = new Map();
    this.events = [];
    Object.entries(initial || {}).forEach(([collectionName, values]) => {
      const collection = new Map();
      Object.entries(values || {}).forEach(([id, value]) => collection.set(id, copy(value)));
      this.records.set(collectionName, collection);
    });
  }

  collection(collectionName) {
    return new FakeCollection(this, collectionName);
  }

  bulkWriter() {
    this.events.push({ type: 'bulk-create' });
    return new FakeBulkWriter(this);
  }

  _collection(collectionName) {
    if (!this.records.has(collectionName)) this.records.set(collectionName, new Map());
    return this.records.get(collectionName);
  }

  _get(collectionName, id) {
    return copy(this._collection(collectionName).get(id));
  }

  _set(collectionName, id, value, options) {
    const collection = this._collection(collectionName);
    const next = options && options.merge
      ? Object.assign({}, collection.get(id) || {}, copy(value))
      : copy(value);
    collection.set(id, next);
  }

  _delete(collectionName, id) {
    this._collection(collectionName).delete(id);
  }
}

function snapshot(db, collectionName, id, value) {
  return new FakeDocumentSnapshot(new FakeDocumentReference(db, collectionName, id), value);
}

module.exports = { FakeDb, snapshot };

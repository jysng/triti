// @ts-check
// Minimal promise wrapper around IndexedDB.
//
// Schema history (never edit a past step, only append new ones):
//   v1: entries { date (key), updatedAt, box: {iv, ct} }, meta { key (key), ... }

export const DB_VERSION = 1;

/** @param {IDBRequest} req */
function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @param {IDBTransaction} tx */
function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

/** @param {string} name */
function openRaw(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (event.oldVersion < 1) {
        db.createObjectStore('entries', { keyPath: 'date' });
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Triti is open in another tab that is blocking an upgrade. Close it and reload.'));
  });
}

export class DB {
  /** @param {IDBDatabase} idb */
  constructor(idb) {
    this.idb = idb;
    idb.onversionchange = () => idb.close();
  }

  static async open(name = 'triti') {
    return new DB(await openRaw(name));
  }

  /** @param {string} name */
  static destroy(name) {
    return request(indexedDB.deleteDatabase(name));
  }

  /** @param {string} store @param {IDBValidKey} key */
  get(store, key) {
    return request(this.idb.transaction(store).objectStore(store).get(key));
  }

  /** @param {string} store @returns {Promise<any[]>} */
  all(store) {
    return request(this.idb.transaction(store).objectStore(store).getAll());
  }

  /** @param {string} store @param {any} value */
  put(store, value) {
    return this.write({ [store]: [value] });
  }

  /** @param {string} store @param {IDBValidKey} key */
  async delete(store, key) {
    const tx = this.idb.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    await done(tx);
  }

  /** Atomically put values into one or more stores. @param {Record<string, any[]>} ops */
  async write(ops) {
    const stores = Object.keys(ops).filter((s) => ops[s].length);
    if (!stores.length) return;
    const tx = this.idb.transaction(stores, 'readwrite');
    const finished = done(tx);
    try {
      for (const s of stores) for (const v of ops[s]) tx.objectStore(s).put(v);
    } catch (err) {
      // A synchronous put() error (e.g. missing key) would otherwise let earlier puts commit.
      tx.abort();
      await finished.catch(() => {});
      throw err;
    }
    await finished;
  }

  /** @param {...string} stores */
  async clear(...stores) {
    const tx = this.idb.transaction(stores, 'readwrite');
    for (const s of stores) tx.objectStore(s).clear();
    await done(tx);
  }

  close() {
    this.idb.close();
  }
}

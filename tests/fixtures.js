// @ts-check
// Shared fixtures: an isolated IndexedDB per test and fast key derivation.
import { DB } from '../js/db.js';
import { Journal } from '../js/journal.js';
import { Vault } from '../js/vault.js';

export const PASS = 'correct horse battery';
let n = 0;

/** Fresh, empty database + vault + journal. Fast PBKDF2 (tests only). */
export async function fixture({ create = true } = {}) {
  const name = `triti-test-${Date.now()}-${n++}`;
  await DB.destroy(name);
  const db = await DB.open(name);
  const vault = new Vault(db, { iterations: 1000 });
  await vault.load();
  if (create) await vault.create(PASS);
  const journal = new Journal(db, vault);
  return {
    db, vault, journal, name,
    async cleanup() {
      db.close();
      await DB.destroy(name);
    },
  };
}

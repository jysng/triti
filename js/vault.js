// @ts-check
// Owns the encryption key. The key lives only in memory while unlocked and is
// never persisted. Events: 'unlock', 'lock'.
import {
  PBKDF2_ITERATIONS, decryptJSON, deriveKey, encryptJSON, fromB64, randomBytes, toB64,
} from './crypto.js';

const VERIFIER = 'triti-verifier-v1';
export const MIN_PASSPHRASE = 8;

/**
 * @typedef {{ key: 'vault', version: 1, salt: string, iterations: number,
 *   verifier: import('./crypto.js').Box, createdAt: number }} VaultMeta
 */

/** @param {string} p */
export function assertPassphrase(p) {
  if (typeof p !== 'string' || [...p].length < MIN_PASSPHRASE) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE} characters.`);
  }
}

/** Rough 0–4 strength score for UI feedback only. @param {string} p */
export function passphraseStrength(p) {
  if (!p) return 0;
  let score = 0;
  if (p.length >= MIN_PASSPHRASE) score++;
  if (p.length >= 14) score++;
  if (/\s/.test(p) || p.length >= 20) score++;
  if ([/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/].filter((r) => r.test(p)).length >= 3) score++;
  return Math.min(score, 4);
}

export class Vault extends EventTarget {
  /**
   * @param {import('./db.js').DB} db
   * @param {{ iterations?: number }} [opts] lower iterations are for tests only
   */
  constructor(db, { iterations = PBKDF2_ITERATIONS } = {}) {
    super();
    this.db = db;
    this.iterations = iterations;
    /** @type {CryptoKey | null} */
    this.key = null;
    /** @type {VaultMeta | null} */
    this.meta = null;
  }

  async load() {
    this.meta = (await this.db.get('meta', 'vault')) ?? null;
    return this.meta;
  }

  get isSetUp() { return this.meta !== null; }
  get isUnlocked() { return this.key !== null; }

  /** @param {string} passphrase */
  async create(passphrase) {
    if (this.meta) throw new Error('A journal already exists in this browser.');
    assertPassphrase(passphrase);
    const salt = randomBytes(16);
    const key = await deriveKey(passphrase, salt, this.iterations);
    /** @type {VaultMeta} */
    const meta = {
      key: 'vault', version: 1, salt: toB64(salt), iterations: this.iterations,
      verifier: await encryptJSON(key, VERIFIER, VERIFIER), createdAt: Date.now(),
    };
    await this.db.put('meta', meta);
    this.#open(meta, key);
  }

  /** @param {string} passphrase @returns {Promise<boolean>} */
  async unlock(passphrase) {
    if (!this.meta) throw new Error('No journal to unlock.');
    const key = await Vault.keyFor(this.meta, passphrase);
    if (!key) return false;
    this.#open(this.meta, key);
    return true;
  }

  /** Derive and verify the key for any vault metadata (also used for backups). */
  static async keyFor(/** @type {VaultMeta} */ meta, /** @type {string} */ passphrase) {
    const key = await deriveKey(passphrase, fromB64(meta.salt), meta.iterations);
    try {
      return (await decryptJSON(key, meta.verifier, VERIFIER)) === VERIFIER ? key : null;
    } catch {
      return null;
    }
  }

  /** Install verified meta + key, e.g. after restoring a backup on a new device. */
  adopt(/** @type {VaultMeta} */ meta, /** @type {CryptoKey} */ key) {
    this.#open(meta, key);
  }

  lock() {
    if (!this.key) return;
    this.key = null;
    this.dispatchEvent(new Event('lock'));
  }

  /** @param {unknown} value @param {string} aad */
  encrypt(value, aad) {
    if (!this.key) throw new Error('Journal is locked.');
    return encryptJSON(this.key, value, aad);
  }

  /** @param {import('./crypto.js').Box} box @param {string} aad */
  decrypt(box, aad) {
    if (!this.key) throw new Error('Journal is locked.');
    return decryptJSON(this.key, box, aad);
  }

  /** Re-encrypts every entry under a new salt + key in one transaction. */
  async changePassphrase(/** @type {string} */ current, /** @type {string} */ next) {
    if (!this.meta) throw new Error('No journal exists.');
    assertPassphrase(next);
    const oldKey = await Vault.keyFor(this.meta, current);
    if (!oldKey) throw new Error('Current passphrase is incorrect.');
    const salt = randomBytes(16);
    const newKey = await deriveKey(next, salt, this.iterations);
    const entries = [];
    for (const r of await this.db.all('entries')) {
      const value = await decryptJSON(oldKey, r.box, r.date);
      entries.push({ ...r, box: await encryptJSON(newKey, value, r.date) });
    }
    /** @type {VaultMeta} */
    const meta = {
      ...this.meta, salt: toB64(salt), iterations: this.iterations,
      verifier: await encryptJSON(newKey, VERIFIER, VERIFIER),
    };
    await this.db.write({ entries, meta: [meta] });
    this.meta = meta;
    this.key = newKey;
  }

  /** Permanently deletes the journal from this browser. */
  async erase() {
    await this.db.clear('entries', 'meta');
    this.meta = null;
    this.key = null;
    this.dispatchEvent(new Event('lock'));
  }

  /** @param {VaultMeta} meta @param {CryptoKey} key */
  #open(meta, key) {
    this.meta = meta;
    this.key = key;
    this.dispatchEvent(new Event('unlock'));
  }
}

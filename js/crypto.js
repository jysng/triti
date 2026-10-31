// @ts-check
// Web Crypto only. Passphrase -> PBKDF2-SHA256 -> AES-GCM-256 key (non-extractable).
// Every encryption uses a fresh random 12-byte IV; additional data binds a
// ciphertext to its context (e.g. the entry date) so records can't be swapped.

export const PBKDF2_ITERATIONS = 600_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

/** @typedef {{ iv: string, ct: string }} Box */

/** @param {number} n */
export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** @param {Uint8Array} bytes */
export function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

/** @param {string} b64 */
export function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * @param {string} passphrase
 * @param {Uint8Array} salt
 * @param {number} [iterations]
 */
export async function deriveKey(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
  const material = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * @param {CryptoKey} key
 * @param {unknown} value JSON-serialisable
 * @param {string} [aad]
 * @returns {Promise<Box>}
 */
export async function encryptJSON(key, value, aad = '') {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(JSON.stringify(value)),
  );
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

/**
 * Throws if the key, IV, ciphertext or additional data don't match.
 * @param {CryptoKey} key
 * @param {Box} box
 * @param {string} [aad]
 */
export async function decryptJSON(key, box, aad = '') {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(box.iv), additionalData: enc.encode(aad) }, key, fromB64(box.ct),
  );
  return JSON.parse(dec.decode(pt));
}

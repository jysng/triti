// @ts-check
import { decryptJSON, deriveKey, encryptJSON, fromB64, randomBytes, toB64 } from '../js/crypto.js';
import { describe, expect, it } from './harness.js';

const enc = new TextEncoder();

describe('crypto', () => {
  it('base64 round-trips arbitrary bytes', () => {
    const bytes = randomBytes(300);
    expect([...fromB64(toB64(bytes))]).toEqual([...bytes]);
  });

  it('matches the PBKDF2-HMAC-SHA256 RFC test vector', async () => {
    const base = await crypto.subtle.importKey('raw', enc.encode('password'), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('salt'), iterations: 1 }, base, 256);
    const hex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
  });

  it('derives a non-extractable AES-GCM key', async () => {
    const key = await deriveKey('correct horse', randomBytes(16), 1000);
    expect(key.extractable).toBe(false);
    expect(key.algorithm.name).toBe('AES-GCM');
  });

  it('encrypts with a fresh IV and decrypts back', async () => {
    const key = await deriveKey('correct horse', randomBytes(16), 1000);
    const value = { text: 'secret 🌙', mood: 4 };
    const a = await encryptJSON(key, value, '2024-01-01');
    const b = await encryptJSON(key, value, '2024-01-01');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
    expect(atob(a.ct)).not.toContain('secret');
    expect(await decryptJSON(key, a, '2024-01-01')).toEqual(value);
  });

  it('rejects the wrong key, wrong AAD and tampering', async () => {
    const salt = randomBytes(16);
    const key = await deriveKey('correct horse', salt, 1000);
    const other = await deriveKey('wrong horse!', salt, 1000);
    const box = await encryptJSON(key, 'hi', '2024-01-01');
    await expect(() => decryptJSON(other, box, '2024-01-01')).rejects();
    await expect(() => decryptJSON(key, box, '2024-01-02')).rejects();
    const ct = fromB64(box.ct);
    ct[0] ^= 1;
    await expect(() => decryptJSON(key, { ...box, ct: toB64(ct) }, '2024-01-01')).rejects();
  });
});

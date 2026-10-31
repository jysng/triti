// @ts-check
import { Vault, assertPassphrase, passphraseStrength } from '../js/vault.js';
import { fixture, PASS } from './fixtures.js';
import { describe, expect, it } from './harness.js';

describe('vault', () => {
  it('enforces a minimum passphrase length', async () => {
    let threw = false;
    try { assertPassphrase('short'); } catch { threw = true; }
    expect(threw).toBe(true);
    expect(passphraseStrength('')).toBe(0);
    expect(passphraseStrength('Correct horse battery staple 9!')).toBe(4);
  });

  it('creates, locks and unlocks; wrong passphrase fails', async () => {
    const f = await fixture();
    try {
      expect(f.vault.isUnlocked).toBe(true);
      const meta = await f.db.get('meta', 'vault');
      expect(JSON.stringify(meta)).not.toContain(PASS);
      f.vault.lock();
      expect(f.vault.isUnlocked).toBe(false);
      await expect(() => f.vault.encrypt('x', 'y')).rejects(/locked/);
      expect(await f.vault.unlock('not the passphrase')).toBe(false);
      expect(await f.vault.unlock(PASS)).toBe(true);
    } finally { await f.cleanup(); }
  });

  it('survives a reload from IndexedDB', async () => {
    const f = await fixture();
    try {
      const v2 = new Vault(f.db, { iterations: 1000 });
      await v2.load();
      expect(v2.isSetUp).toBe(true);
      expect(await v2.unlock(PASS)).toBe(true);
    } finally { await f.cleanup(); }
  });

  it('refuses to create a second vault', async () => {
    const f = await fixture();
    try {
      await expect(() => f.vault.create('another passphrase')).rejects(/already exists/);
    } finally { await f.cleanup(); }
  });

  it('changes the passphrase and re-encrypts entries', async () => {
    const f = await fixture();
    try {
      await f.journal.save('2024-01-01', { text: 'first entry' });
      const before = await f.db.get('entries', '2024-01-01');
      await expect(() => f.vault.changePassphrase('wrong passphrase', 'brand new passphrase')).rejects(/incorrect/);
      await f.vault.changePassphrase(PASS, 'brand new passphrase');
      const after = await f.db.get('entries', '2024-01-01');
      expect(after.box.ct).not.toBe(before.box.ct);
      f.vault.lock();
      expect(await f.vault.unlock(PASS)).toBe(false);
      expect(await f.vault.unlock('brand new passphrase')).toBe(true);
      await f.journal.loadAll();
      expect(f.journal.get('2024-01-01')?.text).toBe('first entry');
    } finally { await f.cleanup(); }
  });

  it('erase wipes everything', async () => {
    const f = await fixture();
    try {
      await f.journal.save('2024-01-01', { text: 'gone soon' });
      await f.vault.erase();
      expect(await f.db.all('entries')).toEqual([]);
      expect(await f.db.get('meta', 'vault')).toBe(undefined);
      const v2 = new Vault(f.db);
      expect(await v2.load()).toBeNull();
    } finally { await f.cleanup(); }
  });

  it('DB.write is atomic across stores', async () => {
    const f = await fixture();
    try {
      let failed = false;
      try {
        // Second record has no key path value, so the whole transaction must roll back.
        await f.db.write({ entries: [{ date: '2024-02-02', updatedAt: 1, box: { iv: 'a', ct: 'b' } }, { nope: true }] });
      } catch { failed = true; }
      expect(failed).toBe(true);
      expect(await f.db.get('entries', '2024-02-02')).toBe(undefined);
    } finally { await f.cleanup(); }
  });

});

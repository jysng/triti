// @ts-check
import { buildBackup, mergeBackup, parseBackup, restoreBackup, toMarkdown } from '../js/export.js';
import { Vault } from '../js/vault.js';
import { crc32, createZip } from '../js/zip.js';
import { fixture, PASS } from './fixtures.js';
import { describe, expect, it } from './harness.js';

describe('zip', () => {
  it('computes CRC-32', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686);
  });
  it('writes a valid store-only archive', async () => {
    const blob = createZip([{ name: 'a/b.md', data: 'hé' }, { name: 'c.txt', data: 'x' }]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const eocd = bytes.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2);
  });
});

describe('backup', () => {
  it('round-trips into a fresh browser', async () => {
    const src = await fixture();
    const dst = await fixture({ create: false });
    try {
      await src.journal.save('2024-01-01', { text: 'portable #memory', mood: 4 });
      const backup = parseBackup(await (await buildBackup(src.db)).text());
      expect(JSON.stringify(backup)).not.toContain('portable');
      await expect(() => restoreBackup(backup, 'wrong passphrase', dst)).rejects(/does not open/);
      expect(await restoreBackup(backup, PASS, dst)).toBe(1);
      expect(dst.vault.isUnlocked).toBe(true);
      await dst.journal.loadAll();
      expect(dst.journal.get('2024-01-01')?.text).toBe('portable #memory');
    } finally {
      await src.cleanup();
      await dst.cleanup();
    }
  });

  it('merges a backup from another vault; newer edits win', async () => {
    const a = await fixture();
    const b = await fixture();
    try {
      await a.journal.save('2024-01-01', { text: 'only in A' });
      await a.journal.save('2024-01-02', { text: 'old in A' });
      await new Promise((r) => setTimeout(r, 5));
      await b.journal.save('2024-01-02', { text: 'newer in B' });
      await b.journal.save('2024-01-03', { text: 'only in B' });
      const backup = parseBackup(await (await buildBackup(a.db)).text());
      const key = await Vault.keyFor(backup.vault, PASS);
      if (!key) throw new Error('key');
      expect(await mergeBackup(backup, key, b)).toEqual({ added: 1, updated: 0, skipped: 1 });
      await b.journal.loadAll();
      expect(b.journal.get('2024-01-01')?.text).toBe('only in A');
      expect(b.journal.get('2024-01-02')?.text).toBe('newer in B');
      expect(b.journal.size).toBe(3);
    } finally {
      await a.cleanup();
      await b.cleanup();
    }
  });

  it('rejects malformed files', () => {
    for (const bad of ['nope', '{}', '{"format":"triti-backup","version":1,"vault":{},"entries":[]}',
      JSON.stringify({ format: 'triti-backup', version: 1, vault: { salt: 'a', verifier: {}, iterations: 1 }, entries: [{ date: '../x', box: { iv: '', ct: '' } }] })]) {
      let threw = false;
      try { parseBackup(bad); } catch { threw = true; }
      expect(threw).toBe(true);
    }
  });

  it('exports Markdown with front matter', async () => {
    const f = await fixture();
    try {
      const e = await f.journal.save('2024-01-01', { text: 'Hello #world', mood: 5, prompt: 'What "went" well?' });
      if (!e) throw new Error('entry');
      expect(toMarkdown(e)).toBe('---\ndate: 2024-01-01\nmood: 5\ntags: [world]\nprompt: "What \\"went\\" well?"\n---\nHello #world\n');
    } finally { await f.cleanup(); }
  });
});

// @ts-check
import { fixture } from './fixtures.js';
import { describe, expect, it } from './harness.js';

describe('journal', () => {
  it('saves encrypted entries and reloads them', async () => {
    const f = await fixture();
    try {
      const entry = await f.journal.save('2024-03-01', { text: 'Hiking with #Friends today', mood: 5 });
      expect(entry?.tags).toEqual(['friends']);
      expect(entry?.words).toBe(4);
      const raw = await f.db.get('entries', '2024-03-01');
      expect(Object.keys(raw).sort()).toEqual(['box', 'date', 'updatedAt']);
      expect(JSON.stringify(raw)).not.toContain('Hiking');
      f.vault.lock();
      expect(f.journal.size).toBe(0);
      await f.vault.unlock('correct horse battery');
      await f.journal.loadAll();
      expect(f.journal.get('2024-03-01')?.mood).toBe(5);
    } finally { await f.cleanup(); }
  });

  it('merges patches and preserves createdAt', async () => {
    const f = await fixture();
    try {
      const a = await f.journal.save('2024-03-01', { text: 'one' });
      const b = await f.journal.save('2024-03-01', { mood: 3 });
      expect(b?.text).toBe('one');
      expect(b?.mood).toBe(3);
      expect(b?.createdAt).toBe(a?.createdAt);
    } finally { await f.cleanup(); }
  });

  it('removes entries that become empty', async () => {
    const f = await fixture();
    try {
      await f.journal.save('2024-03-01', { text: 'temp' });
      expect(await f.journal.save('2024-03-01', { text: '   ' })).toBeNull();
      expect(await f.db.get('entries', '2024-03-01')).toBe(undefined);
      expect(f.journal.size).toBe(0);
    } finally { await f.cleanup(); }
  });

  it('sanitises invalid moods', async () => {
    const f = await fixture();
    try {
      const e = await f.journal.save('2024-03-01', { text: 'x', mood: /** @type {any} */ (9) });
      expect(e?.mood).toBeNull();
    } finally { await f.cleanup(); }
  });

  it('refuses tampered ciphertext moved to another day', async () => {
    const f = await fixture();
    try {
      await f.journal.save('2024-03-01', { text: 'mine' });
      const rec = await f.db.get('entries', '2024-03-01');
      await f.db.put('entries', { ...rec, date: '2024-03-02' });
      await expect(() => f.journal.loadAll()).rejects();
    } finally { await f.cleanup(); }
  });

  it('searches text, #tags and mood filters', async () => {
    const f = await fixture();
    try {
      await f.journal.save('2024-01-01', { text: 'Coffee with Sam #friends', mood: 4 });
      await f.journal.save('2024-01-02', { text: 'Coffee alone #work', mood: 2 });
      await f.journal.save('2024-01-03', { text: 'Long run in the rain #health', mood: 4 });
      const dates = (/** @type {string} */ q) => f.journal.search(q).results.map((r) => r.entry.date).sort();
      expect(dates('coffee')).toEqual(['2024-01-01', '2024-01-02']);
      expect(dates('coff #work')).toEqual(['2024-01-02']);
      expect(dates('mood:4')).toEqual(['2024-01-01', '2024-01-03']);
      expect(dates('#health mood:4')).toEqual(['2024-01-03']);
      expect(dates('nothing-matches')).toEqual([]);
      expect(f.journal.tags().map((t) => t.tag)).toEqual(['friends', 'health', 'work']);
      expect(f.journal.list()[0].date).toBe('2024-01-03');
    } finally { await f.cleanup(); }
  });
});

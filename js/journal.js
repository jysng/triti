// @ts-check
// Decrypted, in-memory view of the journal. Only exists while the vault is
// unlocked; persists encrypted records through the vault. Event: 'change'.
import { SearchIndex, tokenize } from './search.js';
import { countWords, extractTags } from './text.js';

/**
 * @typedef {{ date: string, text: string, mood: number | null, prompt: string | null,
 *   tags: string[], words: number, createdAt: number, updatedAt: number }} Entry
 */

export const MOODS = [
  { value: 1, emoji: '😞', label: 'Awful' },
  { value: 2, emoji: '😕', label: 'Low' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Great' },
];

/** @param {number | null | undefined} value */
export const moodOf = (value) => MOODS.find((m) => m.value === value) ?? null;

/** @param {any} raw @returns {Entry} */
export function normalize(raw) {
  const text = typeof raw.text === 'string' ? raw.text : '';
  const mood = Number.isInteger(raw.mood) && raw.mood >= 1 && raw.mood <= 5 ? raw.mood : null;
  return {
    date: raw.date,
    text,
    mood,
    prompt: typeof raw.prompt === 'string' && raw.prompt ? raw.prompt : null,
    tags: extractTags(text),
    words: countWords(text),
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

export class Journal extends EventTarget {
  /**
   * @param {import('./db.js').DB} db
   * @param {import('./vault.js').Vault} vault
   */
  constructor(db, vault) {
    super();
    this.db = db;
    this.vault = vault;
    /** @type {Map<string, Entry>} */
    this.entries = new Map();
    this.index = new SearchIndex();
    vault.addEventListener('lock', () => {
      this.entries.clear();
      this.index.clear();
    });
  }

  async loadAll() {
    this.entries.clear();
    this.index.clear();
    for (const r of await this.db.all('entries')) {
      const data = await this.vault.decrypt(r.box, r.date);
      const entry = normalize({ ...data, date: r.date, updatedAt: r.updatedAt });
      this.entries.set(entry.date, entry);
      this.index.add(entry.date, entry.text);
    }
    this.dispatchEvent(new CustomEvent('change', { detail: { date: null } }));
  }

  get size() { return this.entries.size; }

  /** @param {string} date */
  get(date) { return this.entries.get(date) ?? null; }

  /** Newest first. */
  list() {
    return [...this.entries.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  /**
   * Merge a patch into the day's entry and persist it encrypted. Empty entries are removed.
   * @param {string} date
   * @param {{ text?: string, mood?: number | null, prompt?: string | null }} patch
   */
  async save(date, patch) {
    const prev = this.get(date);
    const now = Date.now();
    const entry = normalize({ ...(prev ?? { createdAt: now }), ...patch, date, updatedAt: now });
    if (!entry.text.trim() && entry.mood === null) {
      if (prev) await this.remove(date);
      return null;
    }
    const payload = { text: entry.text, mood: entry.mood, prompt: entry.prompt, createdAt: entry.createdAt };
    const box = await this.vault.encrypt(payload, date);
    await this.db.put('entries', { date, updatedAt: now, box });
    this.entries.set(date, entry);
    this.index.add(date, entry.text);
    this.dispatchEvent(new CustomEvent('change', { detail: { date } }));
    return entry;
  }

  /** @param {string} date */
  async remove(date) {
    await this.db.delete('entries', date);
    this.entries.delete(date);
    this.index.remove(date);
    this.dispatchEvent(new CustomEvent('change', { detail: { date } }));
  }

  /** @returns {{ tag: string, count: number }[]} */
  tags() {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const e of this.entries.values()) for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts].map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  /**
   * Supports free text (prefix matching), `#tag` filters and `mood:1-5`.
   * @param {string} query
   */
  search(query) {
    /** @type {string[]} */
    const tagFilters = [];
    /** @type {number | null} */
    let mood = null;
    const rest = [];
    for (const part of query.trim().split(/\s+/)) {
      if (!part) continue;
      if (part.startsWith('#') && part.length > 1) tagFilters.push(part.slice(1).toLowerCase());
      else if (/^mood:[1-5]$/i.test(part)) mood = Number(part.slice(5));
      else rest.push(part);
    }
    const text = rest.join(' ');
    const hits = text
      ? this.index.search(text).map(({ id, score }) => ({ entry: this.entries.get(id), score }))
      : this.list().map((entry) => ({ entry, score: 0 }));
    const results = /** @type {{ entry: Entry, score: number }[]} */ (hits.filter((h) => h.entry
      && tagFilters.every((t) => h.entry?.tags.includes(t))
      && (mood === null || h.entry.mood === mood)));
    results.sort((a, b) => b.score - a.score || (a.entry.date < b.entry.date ? 1 : -1));
    return { results, terms: tokenize(text) };
  }
}

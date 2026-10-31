// @ts-check
// Tiny in-memory full-text index. Built from decrypted entries after unlock and
// discarded on lock, so nothing searchable ever touches disk.

/** Lower-cased, accent-folded word tokens. @param {string} text */
export function tokenize(text) {
  return text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[\p{L}\p{N}]+/gu) ?? [];
}

export class SearchIndex {
  constructor() {
    /** @type {Map<string, Map<string, number>>} doc id -> term counts */
    this.docs = new Map();
    /** @type {Map<string, Map<string, number>>} term -> doc id -> count */
    this.postings = new Map();
  }

  get size() { return this.docs.size; }

  clear() {
    this.docs.clear();
    this.postings.clear();
  }

  /** @param {string} id @param {string} text */
  add(id, text) {
    this.remove(id);
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const t of tokenize(text)) counts.set(t, (counts.get(t) ?? 0) + 1);
    this.docs.set(id, counts);
    for (const [t, c] of counts) {
      let p = this.postings.get(t);
      if (!p) this.postings.set(t, (p = new Map()));
      p.set(id, c);
    }
  }

  /** @param {string} id */
  remove(id) {
    const counts = this.docs.get(id);
    if (!counts) return;
    for (const t of counts.keys()) {
      const p = this.postings.get(t);
      p?.delete(id);
      if (p && !p.size) this.postings.delete(t);
    }
    this.docs.delete(id);
  }

  /**
   * All query terms must match (exact or prefix). Exact matches score higher.
   * @param {string} query
   * @returns {{ id: string, score: number }[]}
   */
  search(query) {
    const terms = [...new Set(tokenize(query))];
    if (!terms.length) return [];
    const n = this.docs.size;
    /** @type {Map<string, number> | null} */
    let acc = null;
    for (const q of terms) {
      /** @type {Map<string, number>} */
      const scores = new Map();
      for (const [term, p] of this.postings) {
        const weight = term === q ? 2 : term.startsWith(q) ? 1 : 0;
        if (!weight) continue;
        const idf = Math.log(1 + n / p.size);
        for (const [id, c] of p) scores.set(id, (scores.get(id) ?? 0) + weight * (1 + Math.log(c)) * idf);
      }
      if (acc === null) {
        acc = scores;
      } else {
        /** @type {Map<string, number>} */
        const next = new Map();
        for (const [id, s] of scores) if (acc.has(id)) next.set(id, (acc.get(id) ?? 0) + s);
        acc = next;
      }
      if (!acc.size) return [];
    }
    return [...(acc ?? [])].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
  }
}

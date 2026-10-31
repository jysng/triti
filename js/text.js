// @ts-check

const TAG_RE = /(?:^|\s)#([\p{L}\p{N}_-]{1,40})/gu;

/** Hashtags written in the entry, lower-cased and de-duplicated. @param {string} text */
export function extractTags(text) {
  const tags = new Set();
  for (const m of text.matchAll(TAG_RE)) tags.add(m[1].toLowerCase());
  return [...tags].sort();
}

/** @param {string} text */
export function countWords(text) {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

/** Plain-text preview with Markdown punctuation stripped. @param {string} text @param {number} [max] */
export function excerpt(text, max = 140) {
  const plain = text
    .replace(/^\s*(?:[-*+]|\d+[.)]|>|#{1,6})\s+/gm, '')
    .replace(/^\[[ xX]\]\s+/gm, '')
    .replace(/[*_`~[\]]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

/** @param {string} s */
export const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

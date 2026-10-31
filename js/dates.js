// @ts-check
// Local-calendar date helpers. Entries are keyed by local "YYYY-MM-DD" strings,
// which also sort correctly as plain strings.

/** @param {number} n */
export const pad = (n) => String(n).padStart(2, '0');

/** @param {Date} [d] */
export function toKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** @param {string} key */
export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** @param {unknown} key @returns {key is string} */
export function isValidKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && toKey(fromKey(key)) === key;
}

export const today = () => toKey(new Date());

/** @param {string} key @param {number} n */
export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** @param {number} year @param {number} monthIndex */
export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** @param {string} key @param {number} n */
export function addMonths(key, n) {
  const d = fromKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return toKey(d);
}

/** Whole days from a to b (rounding absorbs DST shifts). @param {string} a @param {string} b */
export function diffDays(a, b) {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86_400_000);
}

/** Monday-based week start. @param {string} key */
export function startOfWeek(key) {
  return addDays(key, -((fromKey(key).getDay() + 6) % 7));
}

/** @param {string} key */
export const startOfMonth = (key) => `${key.slice(0, 7)}-01`;

/** @param {string} key */
export function endOfMonth(key) {
  const d = fromKey(key);
  return toKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Inclusive list of keys between from and to. @param {string} from @param {string} to */
export function eachDay(from, to) {
  const out = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

/**
 * @param {string} key
 * @param {Intl.DateTimeFormatOptions} [opts]
 */
export function formatDate(key, opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) {
  return fromKey(key).toLocaleDateString(undefined, opts);
}

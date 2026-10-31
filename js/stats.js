// @ts-check
import { addDays, diffDays, fromKey, today as todayKey } from './dates.js';

/**
 * @param {string[]} dates entry date keys (any order)
 * @param {string} [today]
 * A streak stays "current" until the end of the day after the last entry.
 */
export function streaks(dates, today = todayKey()) {
  const sorted = [...new Set(dates)].sort();
  let longest = 0;
  let run = 0;
  /** @type {string | null} */
  let prev = null;
  for (const d of sorted) {
    run = prev && diffDays(prev, d) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  const set = new Set(sorted);
  let current = 0;
  let k = set.has(today) ? today : addDays(today, -1);
  while (set.has(k)) {
    current++;
    k = addDays(k, -1);
  }
  return { current, longest, total: sorted.length };
}

/**
 * Same calendar day in earlier years, newest first.
 * @param {import('./journal.js').Entry[]} entries
 * @param {string} key
 */
export function onThisDay(entries, key) {
  const md = key.slice(5);
  return entries.filter((e) => e.date.slice(5) === md && e.date < key)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Heat level 0–4 by word count. @param {number} words */
export function wordLevel(words) {
  if (!words) return 0;
  if (words < 50) return 1;
  if (words < 150) return 2;
  if (words < 400) return 3;
  return 4;
}

/**
 * @param {import('./journal.js').Entry[]} entries
 * @param {string} from inclusive date key
 * @param {string} to inclusive date key
 */
export function summarize(entries, from, to) {
  const inRange = entries.filter((e) => e.date >= from && e.date <= to);
  const moods = inRange.filter((e) => e.mood !== null).map((e) => /** @type {number} */ (e.mood));
  /** @type {Map<string, number>} */
  const tagCounts = new Map();
  const weekday = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
  const hours = new Array(24).fill(0);
  let words = 0;
  /** @type {import('./journal.js').Entry | null} */
  let longest = null;
  /** @type {import('./journal.js').Entry | null} */
  let best = null;
  for (const e of inRange) {
    words += e.words;
    for (const t of e.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    if (e.mood !== null) {
      const wd = weekday[(fromKey(e.date).getDay() + 6) % 7];
      wd.sum += e.mood;
      wd.count++;
      if (!best || e.mood > (best.mood ?? 0) || (e.mood === best.mood && e.words > best.words)) best = e;
    }
    hours[new Date(e.createdAt).getHours()]++;
    if (!longest || e.words > longest.words) longest = e;
  }
  return {
    count: inRange.length,
    words,
    avgMood: moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null,
    longest,
    best,
    tags: [...tagCounts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count),
    weekdayMood: weekday.map((w) => (w.count ? w.sum / w.count : null)),
    hours,
    byDate: new Map(inRange.map((e) => [e.date, e])),
  };
}

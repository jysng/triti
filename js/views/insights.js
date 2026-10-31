// @ts-check
import {
  addDays, addMonths, eachDay, endOfMonth, formatDate, fromKey, startOfMonth, startOfWeek, today,
} from '../dates.js';
import { moodOf } from '../journal.js';
import { summarize } from '../stats.js';
import { excerpt } from '../text.js';
import { barChart, lineChart } from '../ui/charts.js';
import { h } from '../ui/dom.js';

const PERIODS = /** @type {const} */ (['week', 'month', 'year']);
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** @param {'week' | 'month' | 'year'} period @param {string} anchor */
function rangeFor(period, anchor) {
  if (period === 'week') {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6), label: `Week of ${formatDate(from, { month: 'short', day: 'numeric', year: 'numeric' })}` };
  }
  if (period === 'month') {
    return { from: startOfMonth(anchor), to: endOfMonth(anchor), label: formatDate(anchor, { month: 'long', year: 'numeric' }) };
  }
  const y = anchor.slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: y };
}

/** @param {'week' | 'month' | 'year'} period @param {string} anchor @param {number} dir */
function shift(period, anchor, dir) {
  if (period === 'week') return addDays(anchor, 7 * dir);
  if (period === 'month') return addMonths(anchor, dir);
  return addMonths(anchor, 12 * dir);
}

/**
 * @param {HTMLElement} root
 * @param {import('../context.js').Ctx} ctx
 * @param {URLSearchParams} params
 * @returns {import('../context.js').View}
 */
export function renderInsights(root, ctx, params) {
  const period = /** @type {'week' | 'month' | 'year'} */ (PERIODS.find((p) => p === params.get('period')) ?? 'month');
  const t = today();
  const at = params.get('at');
  const anchor = at && /^\d{4}-\d{2}-\d{2}$/.test(at) && at <= t ? at : t;
  const { from, to, label } = rangeFor(period, anchor);
  const s = summarize(ctx.journal.list(), from, to);
  const nextAnchor = shift(period, anchor, 1);
  /** @param {string} a @param {string} [p] */
  const link = (a, p = period) => `#/insights?period=${p}&at=${a}`;

  let moodPoints;
  let wordItems;
  let labelEvery = 1;
  if (period === 'year') {
    const y = Number(from.slice(0, 4));
    const months = Array.from({ length: 12 }, (_, m) => {
      const key = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const es = [...s.byDate.values()].filter((e) => e.date.slice(0, 7) === key.slice(0, 7));
      const moods = es.filter((e) => e.mood !== null).map((e) => /** @type {number} */ (e.mood));
      return {
        label: formatDate(key, { month: 'narrow' }),
        name: formatDate(key, { month: 'long' }),
        mood: moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null,
        words: es.reduce((sum, e) => sum + e.words, 0),
      };
    });
    moodPoints = months.map((m) => ({ label: m.label, value: m.mood }));
    wordItems = months.map((m) => ({ label: m.label, value: m.words, title: `${m.name}: ${m.words} words` }));
  } else {
    const days = eachDay(from, to);
    labelEvery = period === 'month' ? 5 : 1;
    const dayLabel = (/** @type {string} */ d) => (period === 'week' ? WEEKDAYS[(fromKey(d).getDay() + 6) % 7] : String(Number(d.slice(8))));
    moodPoints = days.map((d) => ({ label: dayLabel(d), value: s.byDate.get(d)?.mood ?? null }));
    wordItems = days.map((d) => ({ label: dayLabel(d), value: s.byDate.get(d)?.words ?? 0, title: `${formatDate(d, { month: 'short', day: 'numeric' })}: ${s.byDate.get(d)?.words ?? 0} words` }));
  }

  /** @param {string} value @param {string} name */
  const stat = (value, name) => h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, name));
  /** @param {string} title @param {any} body */
  const card = (title, body) => h('section', { class: 'card' }, h('h2', null, title), body);
  const avg = s.avgMood === null ? '—' : `${moodOf(Math.round(s.avgMood))?.emoji} ${s.avgMood.toFixed(1)}`;

  root.append(h('section', { class: 'page insights' },
    h('header', { class: 'page-head' },
      h('h1', null, 'Insights'),
      h('nav', { class: 'segmented', 'aria-label': 'Period' }, PERIODS.map((p) => h('a', {
        class: 'btn small ghost', href: link(anchor, p), 'aria-current': p === period ? 'page' : undefined,
      }, p[0].toUpperCase() + p.slice(1))))),
    h('nav', { class: 'year-nav', 'aria-label': 'Change period' },
      h('a', { class: 'icon-btn', href: link(shift(period, anchor, -1)), 'aria-label': `Previous ${period}` }, '‹'),
      h('span', { class: 'year' }, label),
      to < t && nextAnchor <= t ? h('a', { class: 'icon-btn', href: link(nextAnchor), 'aria-label': `Next ${period}` }, '›') : h('span', { class: 'icon-btn', 'aria-hidden': 'true' })),
    h('div', { class: 'stats' },
      stat(String(s.count), 'Entries'),
      stat(s.words.toLocaleString(), 'Words'),
      stat(avg, 'Average mood'),
      stat(s.count ? String(Math.round(s.words / s.count)) : '—', 'Words per entry')),
    s.count === 0
      ? h('p', { class: 'empty' }, 'No entries in this period yet. Write a little each day and patterns will appear here.')
      : h('div', { class: 'grid-2' },
        card('Mood over time', lineChart({ points: moodPoints, min: 1, max: 5, ariaLabel: `Mood over ${label}. Average ${avg}.`, labelEvery })),
        card('Words written', barChart({ items: wordItems, ariaLabel: `Words written during ${label}: ${s.words} total.`, labelEvery })),
        card('Mood by weekday', barChart({
          items: s.weekdayMood.map((v, i) => ({ label: WEEKDAYS[i], value: v === null ? null : Math.round(v * 10) / 10, title: `${WEEKDAYS[i]}: ${v === null ? 'no data' : v.toFixed(1)}` })),
          max: 5, ariaLabel: 'Average mood for each weekday', color: 'var(--accent-2)',
        })),
        card('When you write', barChart({
          items: s.hours.map((v, i) => ({ label: String(i), value: v, title: `${i}:00 – ${v} entries` })),
          ariaLabel: 'Number of entries started in each hour of the day', labelEvery: 3, color: 'var(--accent-2)',
        })),
        card('Top tags', s.tags.length
          ? h('ol', { class: 'rank' }, s.tags.slice(0, 8).map(({ tag, count }) => h('li', null,
            h('a', { href: `#/search?q=${encodeURIComponent(`#${tag}`)}` }, `#${tag}`), h('span', { class: 'muted' }, ` ${count}`))))
          : h('p', { class: 'muted' }, 'No tags used in this period.')),
        card('Highlights', h('ul', { class: 'card-list' },
          s.best ? h('li', null, h('a', { class: 'memory', href: `#/day/${s.best.date}` },
            h('span', { class: 'eyebrow' }, `Brightest day · ${formatDate(s.best.date, { month: 'short', day: 'numeric' })} ${moodOf(s.best.mood)?.emoji ?? ''}`),
            h('span', null, excerpt(s.best.text, 120) || '(mood only)'))) : null,
          s.longest ? h('li', null, h('a', { class: 'memory', href: `#/day/${s.longest.date}` },
            h('span', { class: 'eyebrow' }, `Longest entry · ${s.longest.words} words`),
            h('span', null, excerpt(s.longest.text, 120)))) : null)))));
  return { title: 'Insights' };
}

// @ts-check
import { diffDays, eachDay, formatDate, startOfWeek, today } from '../dates.js';
import { moodOf } from '../journal.js';
import { streaks, wordLevel } from '../stats.js';
import { excerpt } from '../text.js';
import { h } from '../ui/dom.js';

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'short' }));

/**
 * @param {HTMLElement} root
 * @param {import('../context.js').Ctx} ctx
 * @param {URLSearchParams} params
 * @returns {import('../context.js').View}
 */
export function renderCalendar(root, ctx, params) {
  const thisYear = new Date().getFullYear();
  const year = Math.min(Number(params.get('year')) || thisYear, thisYear);
  const mode = ctx.settings.heatMode === 'words' ? 'words' : 'mood';
  const entries = ctx.journal.list();
  const all = streaks(entries.map((e) => e.date));
  const yearEntries = entries.filter((e) => e.date.startsWith(`${year}-`));
  const yearWords = yearEntries.reduce((s, e) => s + e.words, 0);
  const t = today();

  const first = `${year}-01-01`;
  const last = `${year}-12-31`;
  const start = startOfWeek(first);

  const cells = eachDay(start, last).map((d) => {
    if (d < first) return h('span', { class: 'cell out', 'aria-hidden': 'true' });
    const e = ctx.journal.get(d);
    const label = `${formatDate(d, { weekday: 'short', month: 'short', day: 'numeric' })}: ${e
      ? `${e.words} words${e.mood ? `, feeling ${moodOf(e.mood)?.label.toLowerCase()}` : ''}`
      : 'no entry'}`;
    const level = e ? (mode === 'mood' ? (e.mood ? `m${e.mood}` : 'm0') : `w${wordLevel(e.words) || 1}`) : '';
    const cls = `cell${d > t ? ' future' : ''}${d === t ? ' today' : ''}`;
    return e || d === t
      ? h('a', { class: cls, href: `#/day/${d}`, title: label, 'aria-label': label, dataset: { level } })
      : h('span', { class: cls, title: d > t ? undefined : label, dataset: { level } });
  });

  const monthLabels = MONTHS.map((m, i) => {
    const col = Math.floor(diffDays(start, `${year}-${String(i + 1).padStart(2, '0')}-01`) / 7) + 1;
    return h('span', { class: 'month-label', style: { 'grid-column': `${col} / span 4` } }, m);
  });

  /** @param {'mood' | 'words'} m @param {string} label */
  const modeBtn = (m, label) => h('button', {
    type: 'button', class: 'btn small ghost', 'aria-pressed': String(mode === m),
    onclick: () => {
      ctx.updateSettings({ heatMode: m });
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    },
  }, label);

  const legend = mode === 'mood'
    ? h('div', { class: 'legend' }, ['m1', 'm2', 'm3', 'm4', 'm5'].map((l, i) => h('span', { class: 'legend-item' },
      h('span', { class: 'cell', dataset: { level: l }, 'aria-hidden': 'true' }), moodOf(i + 1)?.label)),
    h('span', { class: 'legend-item' }, h('span', { class: 'cell', dataset: { level: 'm0' }, 'aria-hidden': 'true' }), 'No mood'))
    : h('div', { class: 'legend' }, 'Fewer words',
      ['w1', 'w2', 'w3', 'w4'].map((l) => h('span', { class: 'cell', dataset: { level: l }, 'aria-hidden': 'true' })), 'More');

  /** @param {string} value @param {string} label */
  const stat = (value, label) => h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, label));

  root.append(h('section', { class: 'page calendar' },
    h('header', { class: 'page-head' },
      h('h1', null, 'Your year'),
      h('nav', { class: 'year-nav', 'aria-label': 'Year' },
        h('a', { class: 'icon-btn', href: `#/calendar?year=${year - 1}`, 'aria-label': 'Previous year' }, '‹'),
        h('span', { class: 'year' }, String(year)),
        year < thisYear ? h('a', { class: 'icon-btn', href: `#/calendar?year=${year + 1}`, 'aria-label': 'Next year' }, '›') : h('span', { class: 'icon-btn', 'aria-hidden': 'true' }))),
    h('div', { class: 'stats' },
      stat(`🔥 ${all.current}`, 'Current streak'),
      stat(String(all.longest), 'Longest streak'),
      stat(String(yearEntries.length), `Entries in ${year}`),
      stat(yearWords.toLocaleString(), `Words in ${year}`)),
    h('div', { class: 'heat-controls' }, h('span', { class: 'muted' }, 'Colour by'), modeBtn('mood', 'Mood'), modeBtn('words', 'Words')),
    h('div', { class: 'heatmap-scroll' },
      h('div', { class: 'heatmap' },
        h('div', { class: 'heat-months', 'aria-hidden': 'true' }, monthLabels),
        h('div', { class: 'heat-days', 'aria-hidden': 'true' }, ['Mon', '', 'Wed', '', 'Fri', '', ''].map((d) => h('span', null, d))),
        h('div', { class: 'heat-grid', role: 'group', 'aria-label': `Journal activity in ${year}` }, cells))),
    legend,
    h('h2', null, yearEntries.length ? 'Recent entries' : 'No entries this year yet'),
    h('ul', { class: 'card-list' }, yearEntries.slice(0, 10).map((e) => h('li', null,
      h('a', { class: 'memory', href: `#/day/${e.date}` },
        h('span', { class: 'eyebrow' }, `${formatDate(e.date, { weekday: 'short', month: 'short', day: 'numeric' })} · ${e.words} words`),
        h('span', null, `${moodOf(e.mood)?.emoji ?? ''} ${excerpt(e.text) || '(mood only)'}`)))))));
  // On narrow screens, start the heatmap scrolled so today (or the year's end) is visible.
  requestAnimationFrame(() => {
    const scroller = root.querySelector('.heatmap-scroll');
    const target = /** @type {HTMLElement | null} */ (root.querySelector('.cell.today'));
    if (scroller && scroller.scrollWidth > scroller.clientWidth) {
      scroller.scrollLeft = target ? target.offsetLeft - scroller.clientWidth / 2 : scroller.scrollWidth;
    }
  });
  return { title: `Calendar ${year}` };
}

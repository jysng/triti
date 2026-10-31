// @ts-check
import { formatDate } from '../dates.js';
import { moodOf } from '../journal.js';
import { escapeRegExp } from '../text.js';
import { h, highlight } from '../ui/dom.js';

/**
 * @param {string} text
 * @param {RegExp | null} re
 */
function snippet(text, re) {
  const flat = text.replace(/\s+/g, ' ').trim();
  re && (re.lastIndex = 0);
  const m = re ? re.exec(flat) : null;
  const at = m?.index ?? 0;
  const start = Math.max(0, at - 60);
  const body = flat.slice(start, start + 200);
  return `${start > 0 ? '…' : ''}${body}${start + 200 < flat.length ? '…' : ''}`;
}

/**
 * @param {HTMLElement} root
 * @param {import('../context.js').Ctx} ctx
 * @param {URLSearchParams} params
 * @returns {import('../context.js').View}
 */
export function renderSearch(root, ctx, params) {
  const input = /** @type {HTMLInputElement} */ (h('input', {
    type: 'search', id: 'search-input', class: 'search-input', value: params.get('q') ?? '',
    placeholder: 'Search words, #tags or mood:5', autocomplete: 'off', 'aria-describedby': 'search-help',
    oninput: () => {
      history.replaceState(null, '', `#/search${input.value ? `?q=${encodeURIComponent(input.value)}` : ''}`);
      update();
    },
  }));
  const summary = h('p', { class: 'muted', 'aria-live': 'polite' });
  const list = h('ul', { class: 'card-list results' });
  const cloud = h('div', { class: 'tag-cloud' });

  function update() {
    const q = input.value.trim();
    cloud.hidden = Boolean(q);
    if (!q) {
      summary.textContent = `${ctx.journal.size} entries in your journal.`;
      list.replaceChildren();
      return;
    }
    const { results, terms } = ctx.journal.search(q);
    const re = terms.length ? new RegExp(terms.map(escapeRegExp).join('|'), 'gi') : null;
    summary.textContent = `${results.length} ${results.length === 1 ? 'entry' : 'entries'} found.`;
    list.replaceChildren(...results.slice(0, 100).map(({ entry }) => h('li', null,
      h('a', { class: 'memory', href: `#/day/${entry.date}` },
        h('span', { class: 'eyebrow' }, `${formatDate(entry.date, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })} ${moodOf(entry.mood)?.emoji ?? ''}`),
        h('span', null, highlight(snippet(entry.text, re) || '(mood only)', re)),
        entry.tags.length ? h('span', { class: 'tag-list' }, entry.tags.map((t) => h('span', { class: 'chip' }, `#${t}`))) : null))));
  }

  const tags = ctx.journal.tags();
  const maxCount = Math.max(1, ...tags.map((t) => t.count));
  cloud.append(
    h('h2', null, 'Tags'),
    tags.length
      ? h('div', { class: 'tag-list' }, tags.map(({ tag, count }) => h('button', {
        type: 'button', class: 'chip', style: { '--weight': String(0.85 + (count / maxCount) * 0.6) },
        onclick: () => {
          input.value = `#${tag}`;
          input.dispatchEvent(new Event('input'));
          input.focus();
        },
      }, `#${tag} `, h('span', { class: 'muted' }, String(count)))))
      : h('p', { class: 'muted' }, 'Add #hashtags to your entries and they will show up here.'));

  root.append(h('section', { class: 'page search' },
    h('header', { class: 'page-head' }, h('h1', null, 'Search')),
    h('label', { class: 'sr-only', for: 'search-input' }, 'Search your journal'),
    input,
    h('p', { id: 'search-help', class: 'hint' }, 'Everything is searched privately on your device. Combine words with #tag or mood:1–5.'),
    summary, list, cloud));
  update();
  input.focus();
  return { title: 'Search' };
}

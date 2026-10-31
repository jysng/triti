// @ts-check
import { formatDate } from '../dates.js';
import { moodOf } from '../journal.js';
import { renderMarkdown } from '../markdown.js';
import { h } from '../ui/dom.js';

/**
 * Print-friendly view of entries in a date range; use the browser's "Save as PDF".
 * @param {HTMLElement} root
 * @param {import('../context.js').Ctx} ctx
 * @param {URLSearchParams} params
 * @returns {import('../context.js').View}
 */
export function renderPrint(root, ctx, params) {
  const all = ctx.journal.list().reverse();
  const from = params.get('from') || all[0]?.date || '';
  const to = params.get('to') || all.at(-1)?.date || '';
  const entries = all.filter((e) => e.date >= from && e.date <= to);

  const fromInput = /** @type {HTMLInputElement} */ (h('input', { type: 'date', id: 'print-from', value: from }));
  const toInput = /** @type {HTMLInputElement} */ (h('input', { type: 'date', id: 'print-to', value: to }));

  root.append(h('section', { class: 'page print-view' },
    h('header', { class: 'page-head no-print' },
      h('h1', null, 'Print or save as PDF'),
      h('form', {
        class: 'row wrap',
        onsubmit: (/** @type {SubmitEvent} */ e) => {
          e.preventDefault();
          location.hash = `#/print?from=${fromInput.value}&to=${toInput.value}`;
        },
      },
      h('label', { for: 'print-from' }, 'From'), fromInput,
      h('label', { for: 'print-to' }, 'To'), toInput,
      h('button', { type: 'submit', class: 'btn ghost' }, 'Apply'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => window.print() }, 'Print…'))),
    h('p', { class: 'no-print hint' }, `${entries.length} entries. Choose "Save as PDF" as the printer to create a PDF. The PDF is not encrypted.`),
    entries.map((e) => {
      const body = h('div', { class: 'prose' });
      body.innerHTML = renderMarkdown(e.text);
      return h('article', { class: 'print-entry' },
        h('h2', null, formatDate(e.date), ' ', moodOf(e.mood)?.emoji ?? ''),
        e.prompt ? h('p', { class: 'prompt-text' }, e.prompt) : null,
        body);
    })));
  return { title: 'Print' };
}

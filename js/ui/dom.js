// @ts-check
// Small DOM helpers: element builder, dialogs and toasts.

/**
 * @param {string} tag
 * @param {Record<string, any> | null} [props]
 * @param {...any} children
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, String(val));
    else if (k === 'value' || k === 'checked') /** @type {any} */ (el)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {string} tag
 * @param {Record<string, any> | null} [attrs]
 * @param {...any} children
 */
export function svg(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) if (v != null && v !== false) el.setAttribute(k, String(v));
  append(el, children);
  return el;
}

/** @param {Element} el @param {any[]} children */
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

/** @param {Element} el */
export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
}

/** Wrap matches of `re` in <mark> without using innerHTML. @param {string} text @param {RegExp | null} re */
export function highlight(text, re) {
  if (!re) return [text];
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (!m[0]) continue;
    parts.push(text.slice(last, i), h('mark', null, m[0]));
    last = i + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

let dialogId = 0;

/**
 * Modal dialog. Resolves with field values on confirm, or null when cancelled.
 * @param {{ title: string, body?: any, fields?: { name: string, label: string, type?: string,
 *   autocomplete?: string, minlength?: number, required?: boolean }[],
 *   confirmLabel?: string, cancelLabel?: string | null, danger?: boolean }} opts
 * @returns {Promise<Record<string, string> | null>}
 */
export function openDialog({ title, body, fields = [], confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const titleId = `dialog-title-${++dialogId}`;
    /** @type {Record<string, string> | null} */
    let result = null;
    const form = h('form', { method: 'dialog', class: 'dialog-form' },
      h('h2', { id: titleId }, title),
      body ? (typeof body === 'string' ? h('p', null, body) : body) : null,
      fields.map((f) => h('label', { class: 'field' },
        h('span', null, f.label),
        h('input', {
          name: f.name, type: f.type ?? 'text', required: f.required ?? true,
          autocomplete: f.autocomplete ?? 'off', minlength: f.minlength,
        }))),
      h('div', { class: 'dialog-actions' },
        cancelLabel ? h('button', { type: 'button', class: 'btn ghost', onclick: () => dialog.close() }, cancelLabel) : null,
        h('button', { type: 'submit', class: danger ? 'btn danger' : 'btn primary' }, confirmLabel)));
    const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': titleId }, form);
    form.addEventListener('submit', () => {
      result = /** @type {Record<string, string>} */ (Object.fromEntries(new FormData(/** @type {HTMLFormElement} */ (form))));
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    document.body.append(dialog);
    /** @type {HTMLDialogElement} */ (dialog).showModal();
  });
}

/**
 * @param {string} message
 * @param {{ actionLabel?: string, onAction?: () => void, timeout?: number }} [opts]
 */
export function toast(message, { actionLabel, onAction, timeout = 4000 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = h('div', { class: 'toast' },
    h('span', null, message),
    actionLabel ? h('button', { type: 'button', class: 'btn small', onclick: () => { el.remove(); onAction?.(); } }, actionLabel) : null,
    h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Dismiss', onclick: () => el.remove() }, '×'));
  host.append(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
}

/** @param {File} file @returns {Promise<string>} */
export const readFile = (file) => file.text();

/** Ask the user to pick a file. @param {string} accept @returns {Promise<File | null>} */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept, hidden: true }));
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

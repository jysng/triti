// @ts-check
// Safe Markdown subset. The whole source is HTML-escaped first; only tags we
// generate ourselves are emitted, and links are limited to http(s)/mailto.

/** @param {string} s */
export function escapeHTML(s) {
  return s.replace(/[&<>"']/g, (c) => /** @type {Record<string, string>} */ ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

const PLACEHOLDER = /\u0000(\d+)\u0000/g;

/** @param {string} s already-escaped text */
function inline(s) {
  /** @type {string[]} */
  const codes = [];
  let out = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  out = out
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => (/^(https?:|mailto:)/i.test(url)
      ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : m))
    .replace(/\*\*(?!\s)(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?![\s*])([^*]+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?![\s_])([^_]+?)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(?!\s)(.+?)~~/g, '<del>$1</del>')
    .replace(/(^|\s)#([\p{L}\p{N}_-]{1,40})/gu, (_, pre, tag) => `${pre}<a class="tag" href="#/search?q=${encodeURIComponent(`#${tag.toLowerCase()}`)}">#${tag}</a>`);
  return out.replace(PLACEHOLDER, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

const BLOCK_START = /^(```|#{1,3}\s|&gt;|\s*[-*+]\s+|\s*\d+[.)]\s+|(-{3,}|\*{3,})\s*$)/;

/** @param {string} source @returns {string} trusted HTML */
export function renderMarkdown(source) {
  const lines = escapeHTML(source.replace(/\u0000/g, '').replace(/\r\n?/g, '\n')).split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (/^```/.test(line)) {
      const body = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(`<pre><code>${body.join('\n')}</code></pre>`);
    } else if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
      const level = m[1].length + 1;
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
      i++;
    } else if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push('<hr>');
      i++;
    } else if (/^&gt;/.test(line)) {
      const body = [];
      while (i < lines.length && /^&gt;/.test(lines[i])) body.push(inline(lines[i++].replace(/^&gt;\s?/, '')));
      out.push(`<blockquote><p>${body.join('<br>')}</p></blockquote>`);
    } else if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items = [];
      const itemRe = ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
      while (i < lines.length && (m = itemRe.exec(lines[i]))) {
        const task = /^\[([ xX])\]\s+(.*)$/.exec(m[1]);
        items.push(task
          ? `<li class="task"><input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'}> ${inline(task[2])}</li>`
          : `<li>${inline(m[1])}</li>`);
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.join('')}</${tag}>`);
    } else if (!line.trim()) {
      i++;
    } else {
      const body = [];
      while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])) body.push(inline(lines[i++]));
      out.push(`<p>${body.join('<br>')}</p>`);
    }
  }
  return out.join('\n');
}

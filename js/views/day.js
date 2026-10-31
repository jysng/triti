// @ts-check
import { addDays, diffDays, formatDate, today } from '../dates.js';
import { MOODS, moodOf } from '../journal.js';
import { renderMarkdown } from '../markdown.js';
import { promptFor } from '../prompts.js';
import { onThisDay, streaks } from '../stats.js';
import { countWords, excerpt, extractTags } from '../text.js';
import { h, openDialog, toast } from '../ui/dom.js';
import { startDictation, voiceSupported } from '../voice.js';

/** @param {string} date */
function relativeLabel(date) {
  const d = diffDays(date, today());
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return formatDate(date, { weekday: 'long' });
}

/**
 * @param {HTMLElement} root
 * @param {import('../context.js').Ctx} ctx
 * @param {string} date
 * @returns {import('../context.js').View}
 */
export function renderDay(root, ctx, date) {
  const { journal } = ctx;
  const entry = journal.get(date);
  let text = entry?.text ?? '';
  /** @type {number | null} */
  let mood = entry?.mood ?? null;
  /** @type {string | null} */
  let prompt = entry?.prompt ?? null;
  let promptOffset = 0;
  let dirty = false;
  let timer = 0;
  /** @type {Promise<unknown>} */
  let saving = Promise.resolve();
  /** @type {(() => void) | null} */
  let stopVoice = null;

  // ---- saving -------------------------------------------------------------
  const status = h('span', { class: 'save-status', 'aria-live': 'polite' }, entry ? 'Saved' : '');
  function persist() {
    clearTimeout(timer);
    if (!dirty) return saving;
    dirty = false;
    const snapshot = { text, mood, prompt };
    status.textContent = 'Saving…';
    saving = saving
      .then(() => journal.save(date, snapshot))
      .then(() => {
        status.textContent = `Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      })
      .catch((err) => {
        dirty = true;
        status.textContent = `Not saved: ${err.message}`;
      });
    return saving;
  }
  function schedule(delay = 700) {
    dirty = true;
    status.textContent = 'Editing…';
    clearTimeout(timer);
    timer = window.setTimeout(persist, delay);
  }

  // ---- editor -------------------------------------------------------------
  const editor = /** @type {HTMLTextAreaElement} */ (h('textarea', {
    class: 'entry-editor', id: 'entry-editor', 'aria-label': 'Journal entry', spellcheck: 'true',
    placeholder: 'Start writing… Use #tags to organise and **Markdown** for style.',
    value: text,
  }));
  const preview = h('div', { class: 'prose entry-preview', hidden: true, tabindex: '0', 'aria-label': 'Entry preview' });
  const words = h('span', { class: 'muted' });
  const tags = h('span', { class: 'tag-list' });

  function autogrow() {
    editor.style.setProperty('height', 'auto');
    editor.style.setProperty('height', `${editor.scrollHeight + 2}px`);
  }
  function updateFooter() {
    const n = countWords(text);
    words.textContent = `${n} ${n === 1 ? 'word' : 'words'}`;
    tags.replaceChildren(...extractTags(text).map((t) => h('a', { class: 'chip', href: `#/search?q=${encodeURIComponent(`#${t}`)}` }, `#${t}`)));
  }
  function onEdit() {
    text = editor.value;
    autogrow();
    updateFooter();
    renderPrompt();
    schedule();
  }
  editor.addEventListener('input', onEdit);

  /** @param {string} before @param {string} [after] @param {string} [placeholder] */
  function wrap(before, after = before, placeholder = 'text') {
    const { selectionStart: s, selectionEnd: e, value } = editor;
    const sel = value.slice(s, e) || placeholder;
    editor.setRangeText(before + sel + after, s, e, 'end');
    editor.setSelectionRange(s + before.length, s + before.length + sel.length);
    editor.focus();
    onEdit();
  }
  /** Toggle a prefix on every selected line. @param {string} prefix */
  function prefixLines(prefix) {
    const { selectionStart: s, selectionEnd: e, value } = editor;
    const start = value.lastIndexOf('\n', s - 1) + 1;
    let end = value.indexOf('\n', e);
    if (end === -1) end = value.length;
    const lines = value.slice(start, end).split('\n');
    const all = lines.every((l) => l.startsWith(prefix));
    editor.setRangeText(lines.map((l) => (all ? l.slice(prefix.length) : prefix + l)).join('\n'), start, end, 'select');
    editor.focus();
    onEdit();
  }
  /** @param {string} insert */
  function insertAtCursor(insert) {
    const { selectionStart: s, selectionEnd: e, value } = editor;
    const pad = s > 0 && !/\s$/.test(value.slice(0, s)) ? ' ' : '';
    editor.setRangeText(pad + insert, s, e, 'end');
    onEdit();
  }

  editor.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); wrap('**'); }
    if (k === 'i') { e.preventDefault(); wrap('*'); }
  });

  // ---- toolbar ------------------------------------------------------------
  /** @param {string} label @param {string} icon @param {() => void} fn */
  const tool = (label, icon, fn) => h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, title: label, onclick: fn }, icon);
  const previewBtn = h('button', {
    type: 'button', class: 'btn small ghost', 'aria-pressed': 'false',
    onclick: () => {
      const on = preview.hidden;
      preview.hidden = !on;
      editor.hidden = on;
      previewBtn.setAttribute('aria-pressed', String(on));
      previewBtn.textContent = on ? 'Edit' : 'Preview';
      if (on) {
        preview.innerHTML = text.trim() ? renderMarkdown(text) : '<p class="muted">Nothing written yet.</p>';
      } else {
        editor.focus();
      }
    },
  }, 'Preview');

  const voiceStatus = h('span', { class: 'voice-interim muted', 'aria-live': 'polite' });
  const voiceBtn = voiceSupported
    ? h('button', {
      type: 'button', class: 'icon-btn', 'aria-label': 'Dictate', title: 'Dictate with your voice', 'aria-pressed': 'false',
      onclick: toggleVoice,
    }, '🎙')
    : null;
  async function toggleVoice() {
    if (stopVoice) {
      stopVoice();
      return;
    }
    if (!ctx.settings.voiceAcknowledged) {
      const ok = await openDialog({
        title: 'Voice dictation',
        body: 'Dictation uses your browser\'s built-in speech recognition. In Chrome and Edge, audio is sent to the browser vendor for transcription. The text you keep is still encrypted and stored only in this browser.',
        confirmLabel: 'Start dictation',
      });
      if (!ok) return;
      ctx.updateSettings({ voiceAcknowledged: true });
    }
    voiceBtn?.setAttribute('aria-pressed', 'true');
    voiceBtn?.classList.add('recording');
    editor.focus();
    try {
      stopVoice = startDictation({
        onText: (finalText, interim) => {
          if (finalText.trim()) insertAtCursor(finalText.trim());
          voiceStatus.textContent = interim;
        },
        onEnd: () => {
          stopVoice = null;
          voiceBtn?.setAttribute('aria-pressed', 'false');
          voiceBtn?.classList.remove('recording');
          voiceStatus.textContent = '';
        },
        onError: (err) => toast(err === 'not-allowed' ? 'Microphone permission was denied.' : `Dictation stopped (${err}).`),
      });
    } catch (err) {
      toast(`Dictation unavailable: ${/** @type {Error} */ (err).message}`);
      voiceBtn?.setAttribute('aria-pressed', 'false');
      voiceBtn?.classList.remove('recording');
    }
  }

  const focusBtn = h('button', {
    type: 'button', class: 'icon-btn', 'aria-label': 'Focus mode', title: 'Focus mode (Ctrl/⌘+Shift+F)', 'aria-pressed': 'false',
    onclick: () => toggleFocus(),
  }, '⤢');
  /** @param {boolean} [force] */
  function toggleFocus(force) {
    const on = document.body.classList.toggle('focus', force);
    focusBtn.setAttribute('aria-pressed', String(on));
    if (on) editor.focus();
  }

  const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Formatting' },
    tool('Bold (Ctrl/⌘+B)', 'B', () => wrap('**')),
    tool('Italic (Ctrl/⌘+I)', 'I', () => wrap('*')),
    tool('Heading', 'H', () => prefixLines('## ')),
    tool('Bulleted list', '•', () => prefixLines('- ')),
    tool('Checklist', '☑', () => prefixLines('- [ ] ')),
    tool('Quote', '❝', () => prefixLines('> ')),
    h('span', { class: 'toolbar-sep' }),
    previewBtn,
    voiceBtn,
    focusBtn,
    h('span', { class: 'spacer' }),
    voiceStatus,
    status);

  // ---- mood ---------------------------------------------------------------
  const section = h('section', { class: 'day', dataset: { mood: String(mood ?? '') } });
  const clearMood = h('button', {
    type: 'button', class: 'link-btn small', hidden: mood === null,
    onclick: () => {
      for (const input of moodset.querySelectorAll('input')) /** @type {HTMLInputElement} */ (input).checked = false;
      setMood(null);
    },
  }, 'Clear');
  /** @param {number | null} value */
  function setMood(value) {
    mood = value;
    section.dataset.mood = String(mood ?? '');
    clearMood.hidden = mood === null;
    schedule(0);
  }
  const moodset = h('fieldset', { class: 'mood-picker' },
    h('legend', null, 'How are you feeling?'),
    MOODS.map((m) => h('label', { class: 'mood-option', title: m.label },
      h('input', {
        type: 'radio', name: 'mood', value: String(m.value), checked: mood === m.value,
        onchange: () => setMood(m.value),
      }),
      h('span', { class: 'mood-emoji', 'aria-hidden': 'true' }, m.emoji),
      h('span', { class: 'mood-label' }, m.label))),
    clearMood);

  // ---- prompt -------------------------------------------------------------
  const promptCard = h('aside', { class: 'prompt-card', 'aria-label': 'Writing prompt' });
  function renderPrompt() {
    if (prompt) {
      promptCard.hidden = false;
      promptCard.replaceChildren(
        h('p', { class: 'eyebrow' }, 'Prompt'),
        h('p', { class: 'prompt-text' }, prompt),
        h('button', { type: 'button', class: 'link-btn small', onclick: () => { prompt = null; renderPrompt(); schedule(); } }, 'Remove prompt'));
      return;
    }
    promptCard.hidden = Boolean(text.trim());
    const suggestion = promptFor(date, promptOffset);
    promptCard.replaceChildren(
      h('p', { class: 'eyebrow' }, 'Need a spark?'),
      h('p', { class: 'prompt-text' }, suggestion),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn small primary', onclick: () => { prompt = suggestion; renderPrompt(); editor.focus(); schedule(); } }, 'Write about this'),
        h('button', { type: 'button', class: 'btn small ghost', onclick: () => { promptOffset++; renderPrompt(); } }, 'Another prompt')));
  }

  // ---- on this day --------------------------------------------------------
  const memories = onThisDay(journal.list(), date);
  const otd = memories.length
    ? h('section', { class: 'on-this-day', 'aria-labelledby': 'otd-title' },
      h('h2', { id: 'otd-title' }, 'On this day'),
      h('ul', { class: 'card-list' }, memories.map((m) => h('li', null,
        h('a', { class: 'memory', href: `#/day/${m.date}` },
          h('span', { class: 'eyebrow' }, `${Number(date.slice(0, 4)) - Number(m.date.slice(0, 4))} year${Number(date.slice(0, 4)) - Number(m.date.slice(0, 4)) === 1 ? '' : 's'} ago · ${m.date.slice(0, 4)}`),
          h('span', null, `${moodOf(m.mood)?.emoji ?? ''} ${excerpt(m.text, 180)}`))))))
    : null;

  // ---- header -------------------------------------------------------------
  const isToday = date === today();
  const streak = streaks([...journal.entries.keys()]).current;
  const header = h('header', { class: 'day-head' },
    h('a', { class: 'icon-btn nav-arrow', href: `#/day/${addDays(date, -1)}`, 'aria-label': 'Previous day', title: 'Previous day (Alt+←)' }, '‹'),
    h('div', { class: 'day-title' },
      h('p', { class: 'eyebrow' }, relativeLabel(date), streak > 0 && isToday ? h('span', { class: 'streak' }, ` · 🔥 ${streak}-day streak`) : null),
      h('h1', null, formatDate(date))),
    isToday
      ? h('span', { class: 'icon-btn nav-arrow', 'aria-hidden': 'true' })
      : h('a', { class: 'icon-btn nav-arrow', href: `#/day/${addDays(date, 1)}`, 'aria-label': 'Next day', title: 'Next day (Alt+→)' }, '›'));

  const footer = h('footer', { class: 'entry-foot' },
    words, tags,
    h('span', { class: 'spacer' }),
    !isToday ? h('a', { class: 'btn small ghost', href: `#/day/${today()}` }, 'Go to today') : null,
    entry ? h('button', {
      type: 'button', class: 'btn small ghost',
      onclick: async () => {
        const ok = await openDialog({ title: 'Delete this entry?', body: `This permanently deletes your entry for ${formatDate(date)}.`, confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        clearTimeout(timer);
        dirty = false;
        await journal.remove(date);
        toast('Entry deleted.');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      },
    }, 'Delete') : null);

  section.append(header, moodset, promptCard, toolbar, editor, preview, footer);
  if (otd) section.append(otd);
  root.append(section);
  renderPrompt();
  updateFooter();
  autogrow();
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(editor.value.length, editor.value.length);

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    const inField = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      toggleFocus();
    } else if (e.key === 'Escape' && document.body.classList.contains('focus')) {
      toggleFocus(false);
    } else if (e.altKey && !inField && e.key === 'ArrowLeft') {
      location.hash = `#/day/${addDays(date, -1)}`;
    } else if (e.altKey && !inField && e.key === 'ArrowRight' && !isToday) {
      location.hash = `#/day/${addDays(date, 1)}`;
    }
  }
  document.addEventListener('keydown', onKey);

  return {
    title: formatDate(date, { month: 'short', day: 'numeric', year: 'numeric' }),
    flush: persist,
    destroy() {
      clearTimeout(timer);
      stopVoice?.();
      document.removeEventListener('keydown', onKey);
    },
  };
}

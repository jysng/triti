// @ts-check
import { analyticsEndpoint } from '../analytics.js';
import { formatDate, toKey, today } from '../dates.js';
import { buildBackup, download, markdownZip, mergeBackup, parseBackup } from '../export.js';
import { THEMES } from '../settings.js';
import { h, openDialog, pickFile, toast } from '../ui/dom.js';
import { MIN_PASSPHRASE, Vault } from '../vault.js';

const VERSION_URL = './version.txt';

/**
 * @param {HTMLElement} root
 * @param {import('../context.js').Ctx} ctx
 * @returns {import('../context.js').View}
 */
export function renderSettings(root, ctx) {
  const s = ctx.settings;

  /** @param {string} title @param {...any} body */
  const section = (title, ...body) => h('section', { class: 'card settings-section' }, h('h2', null, title), ...body);
  /** @param {string} label @param {string} id @param {HTMLElement} control @param {string} [hint] */
  const row = (label, id, control, hint) => h('div', { class: 'setting' },
    h('label', { for: id }, label), control, hint ? h('p', { class: 'hint' }, hint) : null);
  /**
   * @param {string} id
   * @param {[string, string][]} options
   * @param {string} value
   * @param {(v: string) => void} onChange
   */
  const select = (id, options, value, onChange) => h('select', {
    id, onchange: (/** @type {Event} */ e) => onChange(/** @type {HTMLSelectElement} */ (e.target).value),
  }, options.map(([v, l]) => {
    const o = /** @type {HTMLOptionElement} */ (h('option', { value: v }, l));
    o.selected = v === value;
    return o;
  }));

  // ---- appearance ---------------------------------------------------------
  const themePicker = h('fieldset', { class: 'theme-picker' },
    h('legend', null, 'Theme'),
    THEMES.map((t) => h('label', { class: 'theme-swatch', dataset: { swatch: t } },
      h('input', { type: 'radio', name: 'theme', value: t, checked: s.theme === t, onchange: () => ctx.updateSettings({ theme: t }) }),
      h('span', { class: 'swatch-preview', 'aria-hidden': 'true' }),
      h('span', null, t[0].toUpperCase() + t.slice(1)))));

  const accent = /** @type {HTMLInputElement} */ (h('input', {
    type: 'color', id: 'accent', value: s.accent || '#6d5efc',
    oninput: () => ctx.updateSettings({ accent: accent.value }),
  }));
  const size = /** @type {HTMLInputElement} */ (h('input', {
    type: 'range', id: 'font-size', min: 15, max: 24, step: 1, value: String(s.fontSize),
    oninput: () => ctx.updateSettings({ fontSize: Number(size.value) }),
  }));

  const appearance = section('Appearance',
    themePicker,
    row('Accent colour', 'accent', h('div', { class: 'row' }, accent,
      h('button', { type: 'button', class: 'btn small ghost', onclick: () => { ctx.updateSettings({ accent: '' }); accent.value = '#6d5efc'; } }, 'Reset'))),
    row('Writing font', 'font', select('font', [['serif', 'Serif — bookish'], ['sans', 'Sans — clean'], ['mono', 'Mono — typewriter']], s.font, (v) => ctx.updateSettings({ font: v }))),
    row('Text size', 'font-size', size),
    row('Line width', 'width', select('width', [['narrow', 'Narrow'], ['normal', 'Comfortable'], ['wide', 'Wide']], s.width, (v) => ctx.updateSettings({ width: v }))));

  // ---- security -----------------------------------------------------------
  const security = section('Privacy & security',
    h('p', { class: 'hint' }, 'Entries are encrypted with AES-256-GCM using a key derived from your passphrase. Your entries never leave this browser.'),
    row('Auto-lock after', 'autolock', select('autolock',
      [['1', '1 minute'], ['5', '5 minutes'], ['10', '10 minutes'], ['30', '30 minutes'], ['60', '1 hour'], ['0', 'Never']],
      String(s.autoLockMinutes), (v) => ctx.updateSettings({ autoLockMinutes: Number(v) })), 'Locks the journal when you are inactive.'),
    analyticsEndpoint() ? h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', id: 'analytics', checked: s.analytics,
        onchange: (/** @type {Event} */ e) => ctx.updateSettings({ analytics: /** @type {HTMLInputElement} */ (e.target).checked }),
      }),
      h('span', null, 'Count my visit anonymously (no cookies; never includes your entries, dates or searches). Do Not Track is always respected.')) : null,
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn ghost', onclick: changePassphrase }, 'Change passphrase'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => ctx.lock() }, 'Lock now')));

  async function changePassphrase() {
    const answer = await openDialog({
      title: 'Change passphrase',
      body: 'Every entry will be re-encrypted with the new passphrase. Old backups still need the old passphrase.',
      fields: [
        { name: 'current', label: 'Current passphrase', type: 'password', autocomplete: 'current-password' },
        { name: 'next', label: 'New passphrase', type: 'password', autocomplete: 'new-password', minlength: MIN_PASSPHRASE },
        { name: 'confirm', label: 'Confirm new passphrase', type: 'password', autocomplete: 'new-password' },
      ],
      confirmLabel: 'Change',
    });
    if (!answer) return;
    if (answer.next !== answer.confirm) {
      toast('New passphrases do not match.');
      return;
    }
    try {
      await ctx.vault.changePassphrase(answer.current, answer.next);
      toast('Passphrase changed. Make a fresh backup.');
    } catch (err) {
      toast(/** @type {Error} */ (err).message, { timeout: 6000 });
    }
  }

  // ---- data ---------------------------------------------------------------
  const lastBackup = s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleDateString() : 'never';
  const storageInfo = h('p', { class: 'hint' }, 'Checking storage…');
  (async () => {
    const persisted = await navigator.storage?.persisted?.();
    const est = await navigator.storage?.estimate?.();
    const used = est?.usage ? `${(est.usage / 1024 / 1024).toFixed(1)} MB used. ` : '';
    storageInfo.textContent = `${used}${persisted ? 'Storage is persistent — the browser will not clear it automatically.' : 'Storage is not yet persistent; the browser may clear it under storage pressure.'}`;
  })();

  const data = section('Your data',
    h('p', null, `${ctx.journal.size} ${ctx.journal.size === 1 ? 'entry' : 'entries'} · last backup: ${lastBackup}`),
    h('div', { class: 'row wrap' },
      h('button', {
        type: 'button', class: 'btn primary',
        onclick: async () => {
          download(await buildBackup(ctx.db), `triti-backup-${today()}.json`);
          ctx.updateSettings({ lastBackupAt: Date.now() });
          toast('Encrypted backup downloaded. Keep it somewhere safe.');
        },
      }, 'Download encrypted backup'),
      h('button', { type: 'button', class: 'btn ghost', onclick: importBackup }, 'Import backup'),
      h('button', {
        type: 'button', class: 'btn ghost',
        onclick: async () => {
          const ok = await openDialog({
            title: 'Export as Markdown?',
            body: 'This creates an unencrypted .zip of Markdown files that anyone with the file can read.',
            confirmLabel: 'Export',
          });
          if (ok) download(markdownZip(ctx.journal.list().reverse()), `triti-markdown-${today()}.zip`);
        },
      }, 'Export Markdown (.zip)'),
      h('a', { class: 'btn ghost', href: '#/print' }, 'Print / Save as PDF')),
    storageInfo,
    h('button', {
      type: 'button', class: 'btn small ghost',
      onclick: async () => {
        const granted = await navigator.storage?.persist?.();
        toast(granted ? 'Storage is now persistent.' : 'The browser declined. Installing Triti as an app usually helps.');
      },
    }, 'Request persistent storage'));

  async function importBackup() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      // A new salt is generated whenever the passphrase changes, so a matching salt means the same key.
      let key = backup.vault.salt === ctx.vault.meta?.salt ? ctx.vault.key : null;
      if (!key) {
        const answer = await openDialog({
          title: 'Backup passphrase',
          body: 'Enter the passphrase that was used when this backup was created.',
          fields: [{ name: 'passphrase', label: 'Backup passphrase', type: 'password', autocomplete: 'off' }],
          confirmLabel: 'Import',
        });
        if (!answer) return;
        key = await Vault.keyFor(backup.vault, answer.passphrase);
        if (!key) throw new Error('That passphrase does not open this backup.');
      }
      const r = await mergeBackup(backup, key, ctx);
      await ctx.journal.loadAll();
      toast(`Imported: ${r.added} new, ${r.updated} updated, ${r.skipped} unchanged.`, { timeout: 6000 });
    } catch (err) {
      toast(/** @type {Error} */ (err).message, { timeout: 6000 });
    }
  }

  // ---- danger + about -----------------------------------------------------
  const danger = section('Danger zone',
    h('p', { class: 'hint' }, 'Permanently delete every entry and your passphrase from this browser.'),
    h('button', {
      type: 'button', class: 'btn danger',
      onclick: async () => {
        const answer = await openDialog({
          title: 'Erase everything?', danger: true, confirmLabel: 'Erase journal',
          body: 'This cannot be undone. Download a backup first if you might want your entries later.',
          fields: [{ name: 'confirm', label: 'Type ERASE to confirm' }],
        });
        if (answer?.confirm?.trim() === 'ERASE') await ctx.vault.erase();
      },
    }, 'Erase journal'));

  const version = h('span', null, '…');
  fetch(VERSION_URL).then((r) => (r.ok ? r.text() : '')).then((v) => { version.textContent = v.trim() || 'dev'; }).catch(() => { version.textContent = 'dev'; });

  const about = section('About',
    h('p', null, 'Triti ', version, ` · journal started ${ctx.vault.meta ? formatDate(toKey(new Date(ctx.vault.meta.createdAt)), { year: 'numeric', month: 'long', day: 'numeric' }) : ''}`),
    h('h3', null, 'Keyboard shortcuts'),
    h('dl', { class: 'shortcuts' },
      [['Ctrl/⌘ + K', 'Search'], ['Ctrl/⌘ + Shift + L', 'Lock'], ['Ctrl/⌘ + Shift + F', 'Focus mode'],
        ['Ctrl/⌘ + B / I', 'Bold / italic'], ['Alt + ← / →', 'Previous / next day'], ['Esc', 'Leave focus mode']]
        .map(([k, v]) => [h('dt', null, h('kbd', null, k)), h('dd', null, v)])));

  root.append(h('section', { class: 'page settings' },
    h('header', { class: 'page-head' }, h('h1', null, 'Settings')),
    appearance, security, data, danger, about));
  return { title: 'Settings' };
}

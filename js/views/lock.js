// @ts-check
import { parseBackup, restoreBackup } from '../export.js';
import { h, openDialog, pickFile, toast } from '../ui/dom.js';
import { MIN_PASSPHRASE, passphraseStrength } from '../vault.js';

const STRENGTH = ['Too short', 'Okay', 'Good', 'Strong', 'Excellent'];

/** @param {HTMLElement} root @param {import('../context.js').Ctx} ctx @returns {import('../context.js').View} */
export function renderLock(root, ctx) {
  const setUp = ctx.vault.isSetUp;
  root.append(h('section', { class: 'lock-screen' },
    h('div', { class: 'lock-card' },
      h('img', { class: 'brand-mark', src: './icons/icon.svg', alt: '', width: 64, height: 64 }),
      setUp ? unlockForm(ctx) : onboarding(ctx))));
  /** @type {HTMLInputElement | null} */ (root.querySelector('input[type=password]'))?.focus();
  return { title: setUp ? 'Locked' : 'Welcome' };
}

/** @param {import('../context.js').Ctx} ctx */
function onboarding(ctx) {
  const error = h('p', { class: 'error', role: 'alert' });
  const meterBar = h('span', { class: 'meter-bar' });
  const hint = h('p', { class: 'hint', id: 'strength-hint' }, `Use ${MIN_PASSPHRASE}+ characters. A short sentence works great.`);
  const pass = /** @type {HTMLInputElement} */ (h('input', {
    type: 'password', id: 'new-pass', name: 'passphrase', autocomplete: 'new-password',
    minlength: MIN_PASSPHRASE, required: true, 'aria-describedby': 'strength-hint',
    oninput: () => {
      const s = pass.value.length < MIN_PASSPHRASE ? 0 : passphraseStrength(pass.value);
      meterBar.style.setProperty('--strength', String(pass.value ? Math.max(s, 0.3) : 0));
      meterBar.dataset.level = String(s);
      hint.textContent = pass.value ? `Strength: ${STRENGTH[s]}` : `Use ${MIN_PASSPHRASE}+ characters. A short sentence works great.`;
    },
  }));
  const confirm = /** @type {HTMLInputElement} */ (h('input', {
    type: 'password', id: 'confirm-pass', name: 'confirm', autocomplete: 'new-password', required: true,
  }));
  const submit = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn primary block', type: 'submit' }, 'Create my journal'));

  const form = h('form', {
    class: 'stack',
    onsubmit: async (/** @type {SubmitEvent} */ e) => {
      e.preventDefault();
      error.textContent = '';
      if (pass.value !== confirm.value) {
        error.textContent = 'Passphrases do not match.';
        confirm.focus();
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Creating…';
      try {
        await ctx.vault.create(pass.value);
      } catch (err) {
        error.textContent = /** @type {Error} */ (err).message;
        submit.disabled = false;
        submit.textContent = 'Create my journal';
      }
    },
  },
  h('input', { type: 'text', name: 'username', autocomplete: 'username', value: 'Triti journal', hidden: true }),
  h('label', { class: 'field', for: 'new-pass' }, h('span', null, 'Create a passphrase'), pass),
  h('div', { class: 'meter', 'aria-hidden': 'true' }, meterBar),
  hint,
  h('label', { class: 'field', for: 'confirm-pass' }, h('span', null, 'Confirm passphrase'), confirm),
  h('label', { class: 'check' },
    h('input', { type: 'checkbox', required: true, name: 'ack' }),
    h('span', null, 'I understand that if I forget my passphrase, my journal ', h('strong', null, 'cannot be recovered'), '.')),
  error,
  submit);

  return h('div', { class: 'stack' },
    h('h1', null, 'Welcome to Triti'),
    h('p', { class: 'lede' }, 'A private journal that lives only in this browser. Everything you write is encrypted with your passphrase before it is saved, and your entries are never uploaded.'),
    form,
    h('div', { class: 'divider' }, h('span', null, 'or')),
    h('button', { class: 'btn ghost block', type: 'button', onclick: () => restore(ctx) }, 'Restore from a backup file'));
}

/** @param {import('../context.js').Ctx} ctx */
async function restore(ctx) {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  try {
    const backup = parseBackup(await file.text());
    const answer = await openDialog({
      title: 'Unlock backup',
      body: `This backup has ${backup.entries.length} entries. Enter the passphrase that was used when it was created.`,
      fields: [{ name: 'passphrase', label: 'Backup passphrase', type: 'password', autocomplete: 'current-password' }],
      confirmLabel: 'Restore',
    });
    if (!answer) return;
    const count = await restoreBackup(backup, answer.passphrase, ctx);
    toast(`Restored ${count} ${count === 1 ? 'entry' : 'entries'}.`);
  } catch (err) {
    toast(/** @type {Error} */ (err).message, { timeout: 6000 });
  }
}

/** @param {import('../context.js').Ctx} ctx */
function unlockForm(ctx) {
  const error = h('p', { class: 'error', role: 'alert' });
  const pass = /** @type {HTMLInputElement} */ (h('input', {
    type: 'password', id: 'unlock-pass', name: 'passphrase', autocomplete: 'current-password', required: true,
  }));
  const submit = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn primary block', type: 'submit' }, 'Unlock'));
  const form = h('form', {
    class: 'stack',
    onsubmit: async (/** @type {SubmitEvent} */ e) => {
      e.preventDefault();
      error.textContent = '';
      submit.disabled = true;
      submit.textContent = 'Unlocking…';
      const ok = await ctx.vault.unlock(pass.value).catch(() => false);
      if (!ok) {
        error.textContent = 'That passphrase is not correct.';
        submit.disabled = false;
        submit.textContent = 'Unlock';
        pass.select();
      }
    },
  },
  h('input', { type: 'text', name: 'username', autocomplete: 'username', value: 'Triti journal', hidden: true }),
  h('label', { class: 'field', for: 'unlock-pass' }, h('span', null, 'Passphrase'), pass),
  error,
  submit);

  return h('div', { class: 'stack' },
    h('h1', null, 'Welcome back'),
    h('p', { class: 'lede' }, 'Your journal is locked. Enter your passphrase to continue.'),
    form,
    h('button', { class: 'link-btn', type: 'button', onclick: () => forgot(ctx) }, 'Forgot your passphrase?'));
}

/** @param {import('../context.js').Ctx} ctx */
async function forgot(ctx) {
  const answer = await openDialog({
    title: 'Start over?',
    body: 'Your entries are encrypted with your passphrase and nobody — including Triti — can recover them without it. If you have a backup and remember its passphrase, you can restore it after starting over. Type ERASE to permanently delete this journal from this browser.',
    fields: [{ name: 'confirm', label: 'Type ERASE to confirm' }],
    confirmLabel: 'Erase journal',
    danger: true,
  });
  if (answer?.confirm?.trim() === 'ERASE') {
    await ctx.vault.erase();
    toast('Journal erased.');
  }
}

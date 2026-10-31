// @ts-check
import { decryptJSON } from './crypto.js';
import { isValidKey } from './dates.js';
import { Vault } from './vault.js';
import { createZip } from './zip.js';

export const BACKUP_FORMAT = 'triti-backup';

/**
 * @typedef {{ format: string, version: number, exportedAt: string,
 *   vault: import('./vault.js').VaultMeta,
 *   entries: { date: string, updatedAt: number, box: import('./crypto.js').Box }[] }} Backup
 */

/** @param {Blob} blob @param {string} filename */
export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Encrypted backup — safe to store anywhere; needs the passphrase to read. @param {import('./db.js').DB} db */
export async function buildBackup(db) {
  /** @type {Backup} */
  const backup = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    vault: await db.get('meta', 'vault'),
    entries: await db.all('entries'),
  };
  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}

/** @param {string} text @returns {Backup} */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (data?.format !== BACKUP_FORMAT || data.version !== 1) throw new Error('This is not a Triti backup file.');
  if (!data.vault?.salt || !data.vault?.verifier || !Number.isInteger(data.vault?.iterations) || !Array.isArray(data.entries)) {
    throw new Error('This backup file is incomplete.');
  }
  for (const r of data.entries) {
    if (!isValidKey(r?.date) || typeof r.box?.iv !== 'string' || typeof r.box?.ct !== 'string') {
      throw new Error('This backup contains an invalid entry.');
    }
  }
  return data;
}

/** First-run restore: adopt the backup's vault as-is. */
export async function restoreBackup(/** @type {Backup} */ backup, /** @type {string} */ passphrase,
  /** @type {{ db: import('./db.js').DB, vault: Vault }} */ { db, vault }) {
  const key = await Vault.keyFor(backup.vault, passphrase);
  if (!key) throw new Error('That passphrase does not open this backup.');
  const meta = { ...backup.vault, key: /** @type {'vault'} */ ('vault') };
  await db.write({ meta: [meta], entries: backup.entries });
  vault.adopt(meta, key);
  return backup.entries.length;
}

/**
 * Merge a backup into the unlocked journal; the newer edit of each day wins.
 * @param {Backup} backup
 * @param {CryptoKey} backupKey
 * @param {{ db: import('./db.js').DB, vault: Vault }} deps
 */
export async function mergeBackup(backup, backupKey, { db, vault }) {
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const writes = [];
  for (const r of backup.entries) {
    const existing = await db.get('entries', r.date);
    if (existing && existing.updatedAt >= r.updatedAt) {
      skipped++;
      continue;
    }
    const value = await decryptJSON(backupKey, r.box, r.date);
    writes.push({ date: r.date, updatedAt: r.updatedAt, box: await vault.encrypt(value, r.date) });
    if (existing) updated++;
    else added++;
  }
  await db.write({ entries: writes });
  return { added, updated, skipped };
}

/** @param {import('./journal.js').Entry} e */
export function toMarkdown(e) {
  const fm = ['---', `date: ${e.date}`];
  if (e.mood) fm.push(`mood: ${e.mood}`);
  if (e.tags.length) fm.push(`tags: [${e.tags.join(', ')}]`);
  if (e.prompt) fm.push(`prompt: ${JSON.stringify(e.prompt)}`);
  fm.push('---', '');
  return `${fm.join('\n')}${e.text.trimEnd()}\n`;
}

/** Plain-text export — NOT encrypted. @param {import('./journal.js').Entry[]} entries */
export function markdownZip(entries) {
  return createZip(entries.map((e) => ({
    name: `triti/${e.date.slice(0, 4)}/${e.date}.md`,
    data: toMarkdown(e),
    date: new Date(e.updatedAt),
  })));
}

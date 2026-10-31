// @ts-check
// Shared types for views. No runtime code.

/**
 * @typedef {{
 *   db: import('./db.js').DB,
 *   vault: import('./vault.js').Vault,
 *   journal: import('./journal.js').Journal,
 *   settings: import('./settings.js').Settings,
 *   updateSettings: (patch: Partial<import('./settings.js').Settings>) => void,
 *   lock: () => Promise<void>,
 * }} Ctx
 */

/**
 * @typedef {{ title: string, flush?: () => Promise<void>, destroy?: () => void }} View
 */

export {};

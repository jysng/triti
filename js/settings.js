// @ts-check
// Non-sensitive UI preferences only — never store journal content here.

const KEY = 'triti.settings';

export const THEMES = ['auto', 'light', 'dark', 'sepia', 'midnight'];

export const DEFAULTS = {
  theme: 'auto',
  accent: '',
  font: 'serif',
  fontSize: 18,
  width: 'normal',
  autoLockMinutes: 10,
  heatMode: 'mood',
  voiceAcknowledged: false,
  lastBackupAt: 0,
  analytics: true,
};

/** @typedef {typeof DEFAULTS} Settings */

/** @returns {Settings} */
export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

/** @param {Settings} s */
export function saveSettings(s) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** @param {Settings} s @param {HTMLElement} [root] */
export function applySettings(s, root = document.documentElement) {
  const theme = s.theme === 'auto'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : s.theme;
  root.dataset.theme = theme;
  root.dataset.font = s.font;
  root.dataset.width = s.width;
  root.style.setProperty('--entry-size', `${s.fontSize}px`);
  if (/^#[0-9a-f]{6}$/i.test(s.accent)) root.style.setProperty('--accent', s.accent);
  else root.style.removeProperty('--accent');
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

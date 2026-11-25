// @ts-check
import { DB } from './db.js';
import { isValidKey, today } from './dates.js';
import { Journal } from './journal.js';
import { countVisit } from './analytics.js';
import { applySettings, loadSettings, saveSettings } from './settings.js';
import { h, toast } from './ui/dom.js';
import { Vault } from './vault.js';
import { renderCalendar } from './views/calendar.js';
import { renderDay } from './views/day.js';
import { renderInsights } from './views/insights.js';
import { renderLock } from './views/lock.js';
import { renderPrint } from './views/print.js';
import { renderSearch } from './views/search.js';
import { renderSettings } from './views/settings.js';

const main = /** @type {HTMLElement} */ (document.getElementById('main'));
const topbar = /** @type {HTMLElement} */ (document.getElementById('topbar'));

/** @param {string} message */
function fatal(message) {
  main.replaceChildren(h('section', { class: 'lock-screen' }, h('div', { class: 'lock-card' },
    h('h1', null, 'Triti can’t start'), h('p', null, message))));
}

const settings = loadSettings();
applySettings(settings);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applySettings(settings));
countVisit(settings);

async function boot() {
  if (!globalThis.crypto?.subtle) {
    fatal('Encryption is unavailable. Open Triti over https:// (or http://localhost during development).');
    return;
  }
  let db;
  try {
    db = await DB.open();
  } catch (err) {
    fatal(`This browser blocked local storage (${/** @type {Error} */ (err).message}). Private windows in some browsers do this.`);
    return;
  }
  const vault = new Vault(db);
  await vault.load();
  const journal = new Journal(db, vault);

  /** @type {import('./context.js').View | null} */
  let view = null;
  let routeToken = 0;

  /** @type {import('./context.js').Ctx} */
  const ctx = {
    db, vault, journal, settings,
    updateSettings(patch) {
      Object.assign(settings, patch);
      saveSettings(settings);
      applySettings(settings);
    },
    lock,
  };

  async function lock() {
    await view?.flush?.();
    vault.lock();
  }

  async function route() {
    const token = ++routeToken;
    await view?.flush?.();
    if (token !== routeToken) return;
    view?.destroy?.();
    view = null;
    document.body.classList.remove('focus');
    main.replaceChildren();
    window.scrollTo(0, 0);

    const unlocked = vault.isUnlocked;
    topbar.hidden = !unlocked;
    if (!unlocked) {
      view = renderLock(main, ctx);
    } else {
      const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
      const params = new URLSearchParams(query);
      const [name = 'day', arg] = path.split('/').filter(Boolean);
      switch (name) {
        case 'day': {
          const date = isValidKey(arg) && arg <= today() ? arg : today();
          if (date !== arg) history.replaceState(null, '', `#/day/${date}`);
          view = renderDay(main, ctx, date);
          break;
        }
        case 'calendar': view = renderCalendar(main, ctx, params); break;
        case 'search': view = renderSearch(main, ctx, params); break;
        case 'insights': view = renderInsights(main, ctx, params); break;
        case 'settings': view = renderSettings(main, ctx); break;
        case 'print': view = renderPrint(main, ctx, params); break;
        default:
          history.replaceState(null, '', `#/day/${today()}`);
          view = renderDay(main, ctx, today());
      }
      const section = name === 'day' && !arg ? 'day' : name;
      for (const a of topbar.querySelectorAll('a[data-route]')) {
        if (/** @type {HTMLElement} */ (a).dataset.route === section) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      }
    }
    document.title = `${view?.title ?? 'Journal'} · Triti`;
  }

  vault.addEventListener('lock', route);
  vault.addEventListener('unlock', async () => {
    await journal.loadAll();
    await route();
    remindBackup();
  });
  window.addEventListener('hashchange', route);

  // Persist storage after the first save so the browser doesn't evict the journal.
  let persistAsked = false;
  journal.addEventListener('change', () => {
    if (persistAsked || !journal.size) return;
    persistAsked = true;
    navigator.storage?.persist?.().catch(() => {});
  });

  function remindBackup() {
    const days = (Date.now() - settings.lastBackupAt) / 86_400_000;
    if (journal.size >= 5 && days > 30) {
      toast('It’s been a while since your last backup.', { actionLabel: 'Back up', timeout: 10_000, onAction: () => { location.hash = '#/settings'; } });
    }
  }

  // Auto-lock after inactivity.
  let lastActivity = Date.now();
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true, capture: true });
  }
  setInterval(() => {
    const minutes = settings.autoLockMinutes;
    if (vault.isUnlocked && minutes > 0 && Date.now() - lastActivity > minutes * 60_000) lock();
  }, 15_000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') view?.flush?.();
  });
  addEventListener('pagehide', () => { view?.flush?.(); });

  addEventListener('keydown', (e) => {
    if (!vault.isUnlocked || !(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'k' && !e.shiftKey) {
      e.preventDefault();
      location.hash = '#/search';
    } else if (k === 'l' && e.shiftKey) {
      e.preventDefault();
      lock();
    }
  });

  document.getElementById('lock-btn')?.addEventListener('click', () => lock());
  document.getElementById('skip-link')?.addEventListener('click', () => {
    const target = /** @type {HTMLElement | null} */ (main.querySelector('h1, textarea, input')) ?? main;
    target.focus();
  });

  registerServiceWorker(() => view?.flush?.() ?? Promise.resolve());
  await route();
}

/** @param {() => Promise<unknown>} flush */
function registerServiceWorker(flush) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  // Skip during local development (stale caches are confusing); opt in with ?sw
  if (!('serviceWorker' in navigator) || (local && !new URLSearchParams(location.search).has('sw'))) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          toast('A new version of Triti is ready.', {
            actionLabel: 'Update', timeout: 0,
            onAction: async () => { await flush(); worker.postMessage('skipWaiting'); },
          });
        }
      });
    });
  }).catch((err) => console.warn('Service worker registration failed:', err));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
}

boot();

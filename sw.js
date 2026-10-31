// Triti service worker: precaches the app shell for offline use.
// The deploy workflow replaces __BUILD__ with the commit SHA so every release
// gets a fresh cache. Keep ASSETS in sync with the files on disk —
// `python3 scripts/check.py` fails if they drift.

const VERSION = '__BUILD__';
const CACHE = `triti-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './version.txt',
  './css/app.css',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg',
  './js/analytics.js',
  './js/context.js',
  './js/crypto.js',
  './js/dates.js',
  './js/db.js',
  './js/export.js',
  './js/journal.js',
  './js/main.js',
  './js/markdown.js',
  './js/prompts.js',
  './js/search.js',
  './js/settings.js',
  './js/stats.js',
  './js/text.js',
  './js/ui/charts.js',
  './js/ui/dom.js',
  './js/vault.js',
  './js/views/calendar.js',
  './js/views/day.js',
  './js/views/insights.js',
  './js/views/lock.js',
  './js/views/print.js',
  './js/views/search.js',
  './js/views/settings.js',
  './js/voice.js',
  './js/zip.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('triti-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === 'navigate') {
      return (await cache.match('./index.html')) ?? fetch(request);
    }
    return (await cache.match(request, { ignoreSearch: true })) ?? fetch(request);
  })());
});

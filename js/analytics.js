// @ts-check
// Optional, cookieless visitor counting via GoatCounter's tracking pixel.
// Disabled unless the deploy step fills <meta name="triti-analytics">. Only the
// page path is sent — never the #/… route, which can contain dates or searches.

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/** @param {string} endpoint @param {Location | URL} loc @param {number} [width] */
export function countURL(endpoint, loc, width) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.goatcounter\.com$/.test(url.hostname) || url.pathname !== '/count') {
    throw new Error('Invalid analytics endpoint');
  }
  url.searchParams.set('p', loc.pathname || '/');
  url.searchParams.set('t', 'Triti');
  if (width) url.searchParams.set('s', String(Math.round(width)));
  url.searchParams.set('rnd', Math.random().toString(36).slice(2, 8));
  return url.href;
}

/** @param {{ analytics: boolean }} settings */
export function shouldCount(settings, nav = navigator, loc = location) {
  if (!settings.analytics || LOCAL_HOSTS.includes(loc.hostname)) return false;
  const n = /** @type {Navigator & { globalPrivacyControl?: boolean }} */ (nav);
  return n.doNotTrack !== '1' && n.globalPrivacyControl !== true;
}

export function analyticsEndpoint() {
  return document.querySelector('meta[name="triti-analytics"]')?.getAttribute('content')?.trim() ?? '';
}

/** Count one visit per page load. @param {{ analytics: boolean }} settings */
export function countVisit(settings) {
  const endpoint = analyticsEndpoint();
  if (!endpoint || !shouldCount(settings)) return;
  try {
    const img = new Image(1, 1);
    img.referrerPolicy = 'no-referrer';
    img.src = countURL(endpoint, location, screen.width);
  } catch {
    // Analytics must never affect the app.
  }
}

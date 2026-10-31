// @ts-check
import { countURL, shouldCount } from '../js/analytics.js';
import { describe, expect, it } from './harness.js';

const EP = 'https://triti.goatcounter.com/count';
const site = /** @type {any} */ ({ hostname: 'me.github.io' });

describe('analytics', () => {
  it('sends only the page path, never the private #/ route or query', () => {
    const href = countURL(EP, new URL('https://me.github.io/triti/?x=1#/search?q=%23secret'), 1280);
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe(EP);
    expect(url.searchParams.get('p')).toBe('/triti/');
    expect(url.searchParams.get('s')).toBe('1280');
    expect(href).not.toContain('secret');
    expect(href).not.toContain('x=1');
  });

  it('rejects endpoints other than GoatCounter over https', () => {
    for (const bad of ['http://triti.goatcounter.com/count', 'https://evil.example/count', 'https://triti.goatcounter.com/other']) {
      let threw = false;
      try { countURL(bad, new URL('https://me.github.io/')); } catch { threw = true; }
      expect(threw).toBe(true);
    }
  });

  it('respects the setting, Do Not Track, GPC and localhost', () => {
    const nav = /** @type {any} */ ({ doNotTrack: null });
    expect(shouldCount({ analytics: true }, nav, site)).toBe(true);
    expect(shouldCount({ analytics: false }, nav, site)).toBe(false);
    expect(shouldCount({ analytics: true }, /** @type {any} */ ({ doNotTrack: '1' }), site)).toBe(false);
    expect(shouldCount({ analytics: true }, /** @type {any} */ ({ globalPrivacyControl: true }), site)).toBe(false);
    expect(shouldCount({ analytics: true }, nav, /** @type {any} */ ({ hostname: 'localhost' }))).toBe(false);
  });
});

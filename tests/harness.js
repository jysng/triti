// @ts-check
// Tiny zero-dependency test harness. Runs in any modern browser and in CI via
// Playwright (tests/test_app.py reads window.__TEST_RESULTS__).

/** @type {{ name: string, fn: () => unknown }[]} */
const tests = [];
/** @type {string[]} */
const stack = [];

/** @param {string} name @param {() => void} fn */
export function describe(name, fn) {
  stack.push(name);
  try { fn(); } finally { stack.pop(); }
}

/** @param {string} name @param {() => unknown} fn */
export function it(name, fn) {
  tests.push({ name: [...stack, name].join(' › '), fn });
}

/** @param {unknown} v */
const show = (v) => {
  try { return JSON.stringify(v); } catch { return String(v); }
};

/** @param {unknown} a @param {unknown} b @returns {boolean} */
function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length
    && ka.every((k) => deepEqual(/** @type {any} */ (a)[k], /** @type {any} */ (b)[k]));
}

/** @param {any} actual */
export function expect(actual) {
  /** @param {boolean} ok @param {string} msg */
  const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
  return {
    toBe: (/** @type {unknown} */ e) => assert(Object.is(actual, e), `expected ${show(actual)} to be ${show(e)}`),
    toEqual: (/** @type {unknown} */ e) => assert(deepEqual(actual, e), `expected ${show(actual)} to equal ${show(e)}`),
    toBeTruthy: () => assert(Boolean(actual), `expected ${show(actual)} to be truthy`),
    toBeFalsy: () => assert(!actual, `expected ${show(actual)} to be falsy`),
    toBeNull: () => assert(actual === null, `expected ${show(actual)} to be null`),
    toContain: (/** @type {any} */ e) => assert(actual?.includes?.(e), `expected ${show(actual)} to contain ${show(e)}`),
    toMatch: (/** @type {RegExp} */ re) => assert(re.test(String(actual)), `expected ${show(actual)} to match ${re}`),
    toBeGreaterThan: (/** @type {number} */ n) => assert(actual > n, `expected ${actual} > ${n}`),
    not: {
      toBe: (/** @type {unknown} */ e) => assert(!Object.is(actual, e), `expected ${show(actual)} not to be ${show(e)}`),
      toContain: (/** @type {any} */ e) => assert(!actual?.includes?.(e), `expected ${show(actual)} not to contain ${show(e)}`),
      toMatch: (/** @type {RegExp} */ re) => assert(!re.test(String(actual)), `expected ${show(actual)} not to match ${re}`),
    },
    /** Await a promise/async fn and assert it rejects (optionally matching a message). */
    async rejects(/** @type {RegExp} */ re = /./) {
      try {
        await (typeof actual === 'function' ? actual() : actual);
      } catch (err) {
        const e = /** @type {Error} */ (err);
        const msg = e?.message || e?.name || String(err);
        assert(re.test(msg), `rejected with "${msg}" not matching ${re}`);
        return;
      }
      throw new Error('expected promise to reject');
    },
  };
}

/** Run every registered test sequentially and render the results. */
export async function run(out = document.getElementById('results')) {
  const failures = [];
  let passed = 0;
  for (const t of tests) {
    const li = document.createElement('li');
    try {
      await t.fn();
      passed++;
      li.className = 'pass';
      li.textContent = `✓ ${t.name}`;
    } catch (err) {
      const message = /** @type {Error} */ (err)?.message ?? String(err);
      failures.push({ name: t.name, message });
      li.className = 'fail';
      li.textContent = `✗ ${t.name} — ${message}`;
    }
    out?.append(li);
  }
  const summary = document.getElementById('summary');
  if (summary) {
    summary.textContent = `${passed} passed, ${failures.length} failed`;
    summary.className = failures.length ? 'fail' : 'pass';
  }
  /** @type {any} */ (window).__TEST_RESULTS__ = { passed, failed: failures.length, failures };
  return failures.length;
}

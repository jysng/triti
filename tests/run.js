// @ts-check
// Entry point for tests/index.html. Add new *.test.js files to this list.
import { run } from './harness.js';
import './text-dates.test.js';
import './crypto.test.js';
import './vault.test.js';
import './journal.test.js';
import './markdown.test.js';
import './stats.test.js';
import './export.test.js';
import './analytics.test.js';

run();

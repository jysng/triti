// @ts-check
import { addDays, addMonths, diffDays, eachDay, endOfMonth, fromKey, isValidKey, startOfWeek, toKey } from '../js/dates.js';
import { promptFor, PROMPTS } from '../js/prompts.js';
import { tokenize, SearchIndex } from '../js/search.js';
import { countWords, excerpt, extractTags } from '../js/text.js';
import { describe, expect, it } from './harness.js';

describe('dates', () => {
  it('round-trips local date keys', () => {
    expect(toKey(fromKey('2024-02-29'))).toBe('2024-02-29');
    expect(toKey(new Date(2024, 0, 5))).toBe('2024-01-05');
  });
  it('validates keys strictly', () => {
    expect(isValidKey('2024-02-29')).toBe(true);
    expect(isValidKey('2023-02-29')).toBe(false);
    expect(isValidKey('2024-13-01')).toBe(false);
    expect(isValidKey('<script>')).toBe(false);
    expect(isValidKey(/** @type {any} */ (undefined))).toBe(false);
  });
  it('does date arithmetic across month/year/DST boundaries', () => {
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2024-03-10', 1)).toBe('2024-03-11');
    expect(addDays('2024-11-03', 1)).toBe('2024-11-04');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(diffDays('2024-03-01', '2024-03-31')).toBe(30);
    expect(endOfMonth('2023-02-10')).toBe('2023-02-28');
  });
  it('starts weeks on Monday', () => {
    expect(startOfWeek('2024-06-16')).toBe('2024-06-10'); // Sunday
    expect(startOfWeek('2024-06-10')).toBe('2024-06-10');
  });
  it('lists every day in a range', () => {
    expect(eachDay('2024-02-27', '2024-03-01')).toEqual(['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01']);
  });
});

describe('text', () => {
  it('extracts unique, lower-cased hashtags including unicode', () => {
    expect(extractTags('#Work then #work and #café, not a#b or # alone')).toEqual(['café', 'work']);
  });
  it('ignores headings', () => {
    expect(extractTags('# Heading\n## Sub')).toEqual([]);
  });
  it('counts words', () => {
    expect(countWords('')).toBe(0);
    expect(countWords("It's a fine-looking day — 2 coffees!")).toBe(6);
  });
  it('builds plain excerpts', () => {
    expect(excerpt('# Title\n- **bold** item', 100)).toBe('Title bold item');
    expect(excerpt('a'.repeat(200), 10).length).toBe(10);
    expect(excerpt('- [x] done\n- [ ] todo')).toBe('done todo');
  });
});

describe('search index', () => {
  it('folds case and accents', () => {
    expect(tokenize('Café NOÉL')).toEqual(['cafe', 'noel']);
  });
  it('requires all terms and supports prefixes', () => {
    const idx = new SearchIndex();
    idx.add('a', 'walked the dog in the park');
    idx.add('b', 'parked the car');
    idx.add('c', 'dog food');
    expect(idx.search('park').map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(idx.search('dog park').map((r) => r.id)).toEqual(['a']);
    idx.remove('a');
    expect(idx.search('dog park')).toEqual([]);
  });
});

describe('prompts', () => {
  it('are deterministic per day and vary with offset', () => {
    expect(PROMPTS.length).toBeGreaterThan(30);
    expect(promptFor('2024-05-01')).toBe(promptFor('2024-05-01'));
    expect(promptFor('2024-05-01', 1)).not.toBe(promptFor('2024-05-01', 0));
  });
});

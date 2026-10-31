// @ts-check
import { normalize } from '../js/journal.js';
import { onThisDay, streaks, summarize, wordLevel } from '../js/stats.js';
import { describe, expect, it } from './harness.js';

/** @param {string} date @param {string} text @param {number | null} [mood] */
const entry = (date, text, mood = null) => normalize({ date, text, mood, createdAt: new Date(`${date}T21:30:00`).getTime() });

describe('stats', () => {
  it('computes current and longest streaks', () => {
    const dates = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-10', '2024-01-11'];
    expect(streaks(dates, '2024-01-11')).toEqual({ current: 2, longest: 3, total: 5 });
    expect(streaks(dates, '2024-01-12')).toEqual({ current: 2, longest: 3, total: 5 });
    expect(streaks(dates, '2024-01-13').current).toBe(0);
    expect(streaks([], '2024-01-13')).toEqual({ current: 0, longest: 0, total: 0 });
  });

  it('streaks cross month and year ends', () => {
    expect(streaks(['2023-12-30', '2023-12-31', '2024-01-01'], '2024-01-01').current).toBe(3);
  });

  it('finds the same day in previous years', () => {
    const list = [entry('2022-05-04', 'a'), entry('2023-05-04', 'b'), entry('2024-05-04', 'c'), entry('2023-05-05', 'd')];
    expect(onThisDay(list, '2024-05-04').map((e) => e.date)).toEqual(['2023-05-04', '2022-05-04']);
  });

  it('maps word counts to heat levels', () => {
    expect([0, 1, 60, 200, 1000].map(wordLevel)).toEqual([0, 1, 2, 3, 4]);
  });

  it('summarises a period', () => {
    const list = [
      entry('2024-06-10', 'Monday #work #gym', 2),
      entry('2024-06-11', 'Tuesday was a much longer day #work', 4),
      entry('2024-06-12', 'no mood'),
      entry('2024-07-01', 'outside range', 5),
    ];
    const s = summarize(list, '2024-06-01', '2024-06-30');
    expect(s.count).toBe(3);
    expect(s.avgMood).toBe(3);
    expect(s.tags[0]).toEqual({ tag: 'work', count: 2 });
    expect(s.best?.date).toBe('2024-06-11');
    expect(s.longest?.date).toBe('2024-06-11');
    expect(s.weekdayMood[0]).toBe(2);
    expect(s.weekdayMood[1]).toBe(4);
    expect(s.hours[21]).toBe(3);
  });
});

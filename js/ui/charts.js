// @ts-check
// Dependency-free SVG charts. Each chart carries an accessible summary label
// and per-item <title>s for hover/screen-reader detail.
import { svg } from './dom.js';

/**
 * @param {{ items: { label: string, value: number | null, title?: string }[],
 *   max?: number, height?: number, ariaLabel: string, labelEvery?: number, color?: string }} opts
 */
export function barChart({ items, max, height = 140, ariaLabel, labelEvery = 1, color = 'var(--accent)' }) {
  const width = Math.max(items.length * 18, 240);
  const top = 8;
  const bottom = 20;
  const plotH = height - top - bottom;
  const peak = max ?? Math.max(1, ...items.map((i) => i.value ?? 0));
  const slot = width / Math.max(items.length, 1);
  const barW = Math.max(2, slot * 0.7);
  return svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', role: 'img', 'aria-label': ariaLabel },
    svg('line', { x1: 0, x2: width, y1: top + plotH, y2: top + plotH, class: 'chart-axis' }),
    items.map((item, i) => {
      const v = item.value ?? 0;
      const barH = (v / peak) * plotH;
      const x = i * slot + (slot - barW) / 2;
      return svg('g', null,
        svg('rect', { x, y: top + plotH - barH, width: barW, height: Math.max(barH, v ? 1 : 0), rx: 2, fill: color },
          svg('title', null, item.title ?? `${item.label}: ${v}`)),
        i % labelEvery === 0
          ? svg('text', { x: x + barW / 2, y: height - 5, 'text-anchor': 'middle', class: 'chart-label' }, item.label)
          : null);
    }));
}

/**
 * Line chart with gaps for missing values.
 * @param {{ points: { label: string, value: number | null }[], min: number, max: number,
 *   height?: number, ariaLabel: string, labelEvery?: number }} opts
 */
export function lineChart({ points, min, max, height = 140, ariaLabel, labelEvery = 1 }) {
  const width = Math.max(points.length * 18, 240);
  const top = 10;
  const bottom = 20;
  const plotH = height - top - bottom;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const x = (/** @type {number} */ i) => (points.length > 1 ? i * step : width / 2);
  const y = (/** @type {number} */ v) => top + plotH - ((v - min) / (max - min)) * plotH;
  const segments = [];
  let current = '';
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current) segments.push(current);
      current = '';
    } else {
      current += `${current ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
    }
  });
  if (current) segments.push(current);
  return svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', role: 'img', 'aria-label': ariaLabel },
    [min, (min + max) / 2, max].map((v) => svg('line', { x1: 0, x2: width, y1: y(v), y2: y(v), class: 'chart-grid' })),
    segments.map((d) => svg('path', { d, class: 'chart-line' })),
    points.map((p, i) => [
      p.value === null ? null : svg('circle', { cx: x(i), cy: y(p.value), r: 3.5, class: 'chart-dot' },
        svg('title', null, `${p.label}: ${p.value}`)),
      i % labelEvery === 0
        ? svg('text', { x: Math.min(Math.max(x(i), 10), width - 10), y: height - 5, 'text-anchor': 'middle', class: 'chart-label' }, p.label)
        : null,
    ]));
}

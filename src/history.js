export const MAX_POINTS = 30;

const BARS = '▁▂▃▄▅▆▇█';

export function readHistory(text) {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const appendPoint = (history, point, max = MAX_POINTS) => [...history.filter((entry) => entry.sha !== point.sha), point].slice(-max);

export function sparkline(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return BARS[3].repeat(values.length);
  return values.map((value) => BARS[Math.round(((value - min) / (max - min)) * (BARS.length - 1))]).join('');
}

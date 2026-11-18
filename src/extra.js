export function classify(value) {
  if (value < 0) return 'negative';
  if (value === 0) return 'zero';
  if (value < 10) return 'small';
  return 'large';
}

export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function neverCalled() {
  return 'dead code';
}

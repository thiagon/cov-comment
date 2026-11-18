import { normalizePath } from './lcov.js';

export const MAX_ANNOTATIONS = 10;

const escapeData = (value) => String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

const escapeProperty = (value) => escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');

function command(level, properties, message) {
  const props = Object.entries(properties)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${escapeProperty(value)}`)
    .join(',');
  return `::${level} ${props}::${escapeData(message)}`;
}

export function buildAnnotations({ rows, changed, tests, root, max = MAX_ANNOTATIONS }) {
  const failed = (tests?.cases ?? []).filter((item) => item.status === 'failure' || item.status === 'error');
  const errors = failed.slice(0, max).map((item) =>
    command(
      'error',
      { file: item.file ? normalizePath(item.file, root) : '', line: item.line, title: `Test failed: ${item.name}` },
      item.message || 'Test failed',
    ),
  );

  const warnings = [];
  for (const row of rows.filter((item) => changed?.has(item.path))) {
    for (const [start, end] of row.missing) {
      const message = start === end ? `Line ${start} is not covered by tests` : `Lines ${start}-${end} are not covered by tests`;
      warnings.push(command('warning', { file: row.path, line: start, endLine: end, title: 'Not covered' }, message));
    }
  }
  return [...errors, ...warnings.slice(0, max)];
}

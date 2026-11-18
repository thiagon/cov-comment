import { percent, total } from './lcov.js';

export const MARKER = '<!-- cov-comment -->';

export const tier = (pct) => (pct >= 90 ? 'brightgreen' : pct >= 70 ? 'yellow' : 'red');

export const badgeUrl = (pct) => `https://img.shields.io/badge/Coverage-${Math.round(pct)}%25-${tier(pct)}`;

export const formatPercent = (pct) => `${pct.toFixed(1)}%`;

export function formatDelta(current, baseline) {
  if (baseline == null) return '';
  const diff = current - baseline;
  if (Math.abs(diff) < 0.05) return '=';
  return `${diff > 0 ? '▲ +' : '▼ '}${diff.toFixed(1)}`;
}

export const formatRanges = (missing) => missing.map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`)).join(', ');

const MAX_FILES = 100;

export function renderMarkdown({ title, rows, baseRows, reportUrl }) {
  const totals = total(rows);
  const baseTotals = baseRows ? total(baseRows) : null;
  const basePaths = baseRows ? new Map(baseRows.map((row) => [row.path, row])) : null;
  const linesPct = percent(totals.lines);

  const summary = ['lines', 'functions', 'branches'].map((kind) => {
    const pct = percent(totals[kind]);
    const delta = formatDelta(pct, baseTotals ? percent(baseTotals[kind]) : null);
    return `| ${kind} | ${formatPercent(pct)} | ${delta} | ${totals[kind].hit}/${totals[kind].found} |`;
  });

  const ordered = [...rows].sort((a, b) => percent(a.lines) - percent(b.lines));
  const files = ordered.slice(0, MAX_FILES).map((row) => {
    const base = basePaths?.get(row.path);
    const delta = formatDelta(percent(row.lines), base ? percent(base.lines) : null);
    return `| ${row.path} | ${formatPercent(percent(row.lines))} | ${delta} | ${formatRanges(row.missing)} |`;
  });
  const truncated = ordered.length > MAX_FILES ? `\n\n_${ordered.length - MAX_FILES} more files in the full report._` : '';

  const lines = [
    MARKER,
    `### ${title}`,
    '',
    `![Coverage](${badgeUrl(linesPct)})`,
    '',
    '| Metric | Coverage | Δ | Covered |',
    '| --- | --- | --- | --- |',
    ...summary,
    '',
    `<details><summary>Files (${rows.length})</summary>`,
    '',
    '| File | Lines | Δ | Missing |',
    '| --- | --- | --- | --- |',
    ...files,
    truncated,
    '',
    '</details>',
  ];
  if (reportUrl) lines.push('', `[Full HTML report](${reportUrl})`);
  return lines.join('\n');
}

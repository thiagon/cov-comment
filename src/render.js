import { percent, total } from './lcov.js';

export const MARKER = '<!-- cov-comment -->';
export const DEFAULT_THRESHOLDS = [90, 70];

const EMOJI = { brightgreen: '🟢', yellow: '🟡', red: '🔴' };
const MAX_FILES = 100;

export const tier = (pct, [green, yellow] = DEFAULT_THRESHOLDS) => (pct >= green ? 'brightgreen' : pct >= yellow ? 'yellow' : 'red');

export const badgeUrl = (pct, thresholds) => `https://img.shields.io/badge/Coverage-${Math.round(pct)}%25-${tier(pct, thresholds)}`;

export function parseThresholds(value) {
  const parts = String(value).split(',').map(Number);
  const valid = parts.length === 2 && parts.every(Number.isFinite) && parts[0] >= parts[1];
  return valid ? parts : DEFAULT_THRESHOLDS;
}

export const formatPercent = (pct) => `${pct.toFixed(1)}%`;

export function formatDelta(current, baseline) {
  if (baseline == null) return '';
  const diff = current - baseline;
  if (Math.abs(diff) < 0.05) return '=';
  return `${diff > 0 ? '▲ +' : '▼ '}${diff.toFixed(1)}`;
}

export const formatRanges = (missing) => missing.map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`)).join(', ');

const after = (stat, thresholds) => {
  if (stat.found === 0) return '⚪ n/a';
  const pct = percent(stat);
  return `${EMOJI[tier(pct, thresholds)]} ${formatPercent(pct)}`;
};

const before = (stat) => (stat && stat.found > 0 ? formatPercent(percent(stat)) : '—');

const delta = (stat, baseStat) => (stat.found > 0 && baseStat?.found > 0 ? formatDelta(percent(stat), percent(baseStat)) : '');

const metricRow = (label, stat, baseStat, thresholds) =>
  `| ${label} | ${before(baseStat)} | ${after(stat, thresholds)} | ${delta(stat, baseStat)} | ${stat.hit}/${stat.found} |`;

function fileTable(rows, basePaths, thresholds) {
  const body = rows.map((row) => {
    const base = basePaths?.get(row.path)?.lines;
    return `| ${row.path} | ${before(base)} | ${after(row.lines, thresholds)} | ${delta(row.lines, base)} | ${formatRanges(row.missing)} |`;
  });
  return ['| File | Before | After | Δ | Missing |', '| --- | --- | --- | --- | --- |', ...body];
}

export function renderMarkdown({ title, rows, baseRows, reportUrl, changed, commit, run, thresholds = DEFAULT_THRESHOLDS }) {
  const totals = total(rows);
  const baseTotals = baseRows ? total(baseRows) : null;
  const basePaths = baseRows ? new Map(baseRows.map((row) => [row.path, row])) : null;
  const ordered = [...rows].sort((a, b) => percent(a.lines) - percent(b.lines));

  const out = [MARKER, `### 📊 ${title}`, '', `![Coverage](${badgeUrl(percent(totals.lines), thresholds)})`];

  const origin = [];
  if (commit) origin.push(`Commit [\`${commit.sha.slice(0, 7)}\`](${commit.url})`);
  if (run) origin.push(`[${run.label}](${run.url})`);
  if (origin.length) out.push('', origin.join(' · '));

  out.push(
    '',
    '#### 📈 Summary',
    '',
    '| Metric | Before | After | Δ | Covered |',
    '| --- | --- | --- | --- | --- |',
    metricRow('📈 Lines', totals.lines, baseTotals?.lines, thresholds),
    metricRow('🔧 Functions', totals.functions, baseTotals?.functions, thresholds),
    metricRow('🌿 Branches', totals.branches, baseTotals?.branches, thresholds),
  );

  if (changed) {
    const touched = ordered.filter((row) => changed.has(row.path));
    out.push('', '#### 📁 Changed files', '');
    out.push(...(touched.length ? fileTable(touched, basePaths, thresholds) : ['No coverage data for changed files.']));
  }

  out.push('', `<details><summary>🗂️ All files (${rows.length})</summary>`, '', ...fileTable(ordered.slice(0, MAX_FILES), basePaths, thresholds));
  if (ordered.length > MAX_FILES) out.push('', `_${ordered.length - MAX_FILES} more files in the full report._`);
  out.push('', '</details>', '', `> 🟢 ≥ ${thresholds[0]}% · 🟡 ≥ ${thresholds[1]}% · 🔴 below ${thresholds[1]}% · ⚪ no data`);
  if (reportUrl) out.push('', `📄 [Full HTML report](${reportUrl})`);
  return out.join('\n');
}

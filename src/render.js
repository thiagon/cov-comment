import { sparkline } from './history.js';
import { formatTime } from './junit.js';
import { isFullyCovered, percent, total } from './lcov.js';

export const MARKER = '<!-- cov-comment -->';
export const DEFAULT_THRESHOLDS = [90, 70];

const MAX_FILES = 100;
const TIER_EMOJI = { brightgreen: '🟢', yellow: '🟡', red: '🔴' };
const MAX_FAILED = 20;
const MAX_MESSAGE = 500;

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

const fileUrl = (blobUrl, path) => `${blobUrl}/${path.split('/').map(encodeURIComponent).join('/')}`;

const fileCell = (path, blobUrl) => (blobUrl ? `[${path}](${fileUrl(blobUrl, path)})` : path);

const missingCell = (row, blobUrl) =>
  row.missing
    .map(([start, end]) => {
      const label = start === end ? `${start}` : `${start}-${end}`;
      return blobUrl ? `[${label}](${fileUrl(blobUrl, row.path)}#L${start}${start === end ? '' : `-L${end}`})` : label;
    })
    .join(', ');

const after = (stat, thresholds) => {
  if (stat.found === 0) return '⚪ n/a';
  const pct = percent(stat);
  return `${TIER_EMOJI[tier(pct, thresholds)]} ${formatPercent(pct)}`;
};

const before = (stat) => (stat && stat.found > 0 ? formatPercent(percent(stat)) : '—');

const delta = (stat, baseStat) => (stat.found > 0 && baseStat?.found > 0 ? formatDelta(percent(stat), percent(baseStat)) : '');

const metricRow = (label, stat, baseStat, thresholds) =>
  `| ${label} | ${before(baseStat)} | ${after(stat, thresholds)} | ${delta(stat, baseStat)} | ${stat.hit}/${stat.found} |`;

function fileTable(rows, basePaths, thresholds, blobUrl) {
  const body = rows.map((row) => {
    const base = basePaths?.get(row.path)?.lines;
    return `| ${fileCell(row.path, blobUrl)} | ${row.lines.found} | ${row.lines.found - row.lines.hit} | ${before(base)} | ${after(row.lines, thresholds)} | ${delta(row.lines, base)} | ${missingCell(row, blobUrl)} |`;
  });
  return ['| File | Stmts | Miss | Before | After | Δ | Missing |', '| --- | --- | --- | --- | --- | --- | --- |', ...body];
}

const cell = (text) => text.replaceAll('|', '\\|');

const FAILED = new Set(['failure', 'error']);

function testsSection(tests, slowestCount) {
  const passed = tests.tests - tests.failures - tests.errors - tests.skipped;
  const out = [
    '',
    '#### 🧪 Tests',
    '',
    '| Tests | ✅ Passed | ⏭️ Skipped | ❌ Failures | 💥 Errors | ⏱️ Time |',
    '| --- | --- | --- | --- | --- | --- |',
    `| ${tests.tests} | ${passed} | ${tests.skipped} | ${tests.failures} | ${tests.errors} | ${formatTime(tests.time)} |`,
  ];

  const failed = tests.cases.filter((item) => FAILED.has(item.status));
  if (failed.length) {
    out.push('', `<details open><summary>❌ Failed tests (${failed.length})</summary>`, '');
    for (const item of failed.slice(0, MAX_FAILED)) {
      out.push(`- **${item.name}**${item.classname ? ` (${item.classname})` : ''}`);
      if (item.message) out.push('', '```', item.message.replaceAll('```', "'''").slice(0, MAX_MESSAGE), '```');
      out.push('');
    }
    out.push('</details>');
  }

  const slow = tests.cases.filter((item) => item.time > 0).sort((a, b) => b.time - a.time).slice(0, slowestCount);
  if (slow.length) {
    out.push('', '<details><summary>🐢 Slowest tests</summary>', '', '| Test | Time |', '| --- | --- |');
    out.push(...slow.map((item) => `| ${cell(item.name)} | ${formatTime(item.time)} |`));
    out.push('', '</details>');
  }
  return out;
}

export function renderMarkdown({
  title,
  rows,
  baseRows,
  reportUrl,
  changed,
  commit,
  run,
  blobUrl,
  tests = null,
  slowestTests = 0,
  history = [],
  hideFullyCovered = false,
  thresholds = DEFAULT_THRESHOLDS,
}) {
  const totals = total(rows);
  const baseTotals = baseRows ? total(baseRows) : null;
  const basePaths = baseRows ? new Map(baseRows.map((row) => [row.path, row])) : null;
  const ordered = [...rows].sort((a, b) => percent(a.lines) - percent(b.lines));

  const out = [MARKER, `### 📊 ${title}`, '', `![Coverage](${badgeUrl(percent(totals.lines), thresholds)})`];

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

  if (history.length >= 2) {
    const values = history.map((point) => point.lines);
    out.push('', `📉 Trend (last ${values.length} runs): ${sparkline(values)} ${formatPercent(values[0])} → ${formatPercent(values.at(-1))}`);
  }

  if (tests) out.push(...testsSection(tests, slowestTests));

  if (changed) {
    const touched = ordered.filter((row) => changed.has(row.path));
    out.push('', `<details open><summary>📁 Changed files (${touched.length})</summary>`, '');
    out.push(...(touched.length ? fileTable(touched, basePaths, thresholds, blobUrl) : ['No coverage data for changed files.']));
    out.push('', '</details>');
  }

  const listed = hideFullyCovered ? ordered.filter((row) => !isFullyCovered(row)) : ordered;
  const hidden = ordered.length - listed.length;
  if (listed.length) {
    const count = hidden ? `${listed.length}, ${hidden} fully covered hidden` : `${listed.length}`;
    out.push('', `<details><summary>🗂️ All files (${count})</summary>`, '', ...fileTable(listed.slice(0, MAX_FILES), basePaths, thresholds, blobUrl));
    if (listed.length > MAX_FILES) out.push('', `_${listed.length - MAX_FILES} more files in the full report._`);
    out.push('', '</details>');
  }

  if (reportUrl) out.push('', `📄 [Full HTML report](${reportUrl})`);

  const origin = [];
  if (commit) origin.push(`Commit [\`${commit.sha.slice(0, 7)}\`](${commit.url})`);
  if (run) origin.push(`[${run.label}](${run.url})`);
  if (origin.length) out.push('', origin.join(' · '));
  return out.join('\n');
}

export const badgeJson = (pct, thresholds) => ({
  schemaVersion: 1,
  label: 'coverage',
  message: `${Math.round(pct)}%`,
  color: tier(pct, thresholds),
});

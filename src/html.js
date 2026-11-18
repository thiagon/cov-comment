import { readFileSync } from 'node:fs';
import { formatTime } from './junit.js';
import { percent, total } from './lcov.js';
import { DEFAULT_THRESHOLDS, formatPercent, tier } from './render.js';

// one template file: the page, plus the repeatable blocks marked with <!--@name--> ... <!--@/name-->
const source = readFileSync(new URL('../template/coverage.html', import.meta.url), 'utf8');
const blocks = {};
const page = source.replace(/[ \t]*<!--@(\w+)-->\n([\s\S]*?)[ \t]*<!--@\/\1-->\n/g, (_, name, body) => {
  blocks[name] = body;
  return '';
});
const templates = { page, file: blocks.file, tests: blocks.tests };

const escape = (value) =>
  String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

// single pass, so values are never re-scanned for placeholders
const fill = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key]);

const TONES = {
  brightgreen: { name: 'green', text: 'text-[#1a7f37] dark:text-[#3fb950]', bg: 'bg-[#2da44e] dark:bg-[#238636]', square: 'bg-[#2da44e] dark:bg-[#3fb950]', icon: 'check' },
  yellow: { name: 'yellow', text: 'text-[#9a6700] dark:text-[#d29922]', bg: 'bg-[#bf8700] dark:bg-[#9e6a03]', square: 'bg-[#bf8700] dark:bg-[#d29922]', icon: 'alert-triangle' },
  red: { name: 'red', text: 'text-[#cf222e] dark:text-[#f85149]', bg: 'bg-[#cf222e] dark:bg-[#da3633]', square: 'bg-[#cf222e] dark:bg-[#f85149]', icon: 'x' },
};

const SQUARES = 5;
const squares = (pct, tone) =>
  Array.from({ length: SQUARES }, (_, index) =>
    `<span class="w-2 h-2 rounded-[1px] ${index < Math.round((pct / 100) * SQUARES) ? tone.square : 'bg-[#d0d7de] dark:bg-[#30363d]'}"></span>`,
  ).join('');

function renderSource(row, source, fileId) {
  if (source == null) return '<p class="px-4 py-3 text-xs text-[#656d76] dark:text-[#7d8590]">Source not available.</p>';
  const body = source
    .split('\n')
    .map((text, index) => {
      const hits = row.lineHits.get(index + 1);
      const kind = hits === undefined ? 'none' : hits > 0 ? 'hit' : 'miss';
      return `<tr class="${kind}" id="${fileId}-L${index + 1}"><td class="no">${index + 1}</td><td class="hits">${hits ?? ''}</td><td><pre>${escape(text)}</pre></td></tr>`;
    })
    .join('');
  return `<table class="source">${body}</table>`;
}

const MAX_PILLS = 5;
const PILL_CLASS =
  'shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#ffebe9] dark:bg-[#f85149]/15 text-[#cf222e] dark:text-[#f85149] hover:underline';

function missingPills(row, fileId) {
  const shown = row.missing.slice(0, MAX_PILLS).map(([start, end]) => {
    const label = start === end ? `L${start}` : `L${start}-${end}`;
    return `<button type="button" onclick="jumpToLine(event, '${fileId}', ${start})" class="${PILL_CLASS}">${label}</button>`;
  });
  const rest = row.missing.length - MAX_PILLS;
  if (rest > 0) shown.push(`<span class="text-[10px] text-[#656d76] dark:text-[#7d8590]">+${rest} more</span>`);
  return shown.join(' ');
}

const CHANGED_BADGE =
  ' <span class="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[#ddf4ff] dark:bg-[#388bfd]/15 text-[#0969da] dark:text-[#58a6ff]">changed</span>';

function fileCard(row, sources, isChanged, thresholds, index) {
  const pct = percent(row.lines);
  const tone = TONES[tier(pct, thresholds)];
  const id = `file-${index}`;
  return fill(templates.file, {
    open: isChanged ? ' open' : '',
    id,
    name: escape(row.path),
    pct,
    tone: tone.name,
    tone_text: tone.text,
    pct_label: formatPercent(pct),
    squares: squares(pct, tone),
    changed: isChanged,
    changed_badge: isChanged ? CHANGED_BADGE : '',
    lines_hit: row.lines.hit,
    lines_found: row.lines.found,
    missed_lines: row.lines.found - row.lines.hit,
    missing_pills: missingPills(row, id),
    fn_hit: row.functions.hit,
    fn_found: row.functions.found,
    br_hit: row.branches.hit,
    br_found: row.branches.found,
    source: renderSource(row, sources.get(row.path), id),
  });
}

function testsCard(tests) {
  if (!tests) return '';
  const passed = tests.tests - tests.failures - tests.errors - tests.skipped;
  return fill(templates.tests, {
    time: formatTime(tests.time),
    passed,
    passed_class: tests.failures + tests.errors ? TONES.red.text : TONES.brightgreen.text,
    tests: tests.tests,
    failures: tests.failures,
    errors: tests.errors,
    skipped: tests.skipped,
  });
}

export function renderHtml({ title, rows, sources, changed = null, tests = null, thresholds = DEFAULT_THRESHOLDS }) {
  const totals = total(rows);
  const ordered = [...rows].sort((a, b) => percent(a.lines) - percent(b.lines));
  const isChanged = (row) => Boolean(changed?.has(row.path));
  const shown = [...ordered.filter(isChanged), ...ordered.filter((row) => !isChanged(row))];
  const changedCount = shown.filter(isChanged).length;
  const linesPct = percent(totals.lines);
  const tone = TONES[tier(linesPct, thresholds)];
  const missing = totals.lines.found - totals.lines.hit;
  const metric = (kind) => ({ [`${kind}_pct`]: formatPercent(percent(totals[kind])), [`${kind}_count`]: `${totals[kind].hit} / ${totals[kind].found}`, [`${kind}_width`]: percent(totals[kind]).toFixed(1) });
  return fill(templates.page, {
    title: escape(title),
    badge_class: tone.bg,
    badge_icon: tone.icon,
    badge_label: `${formatPercent(linesPct)} lines`,
    subtitle: `${rows.length} files with ${totals.lines.hit} covered lines and ${missing} ${missing === 1 ? 'miss' : 'misses'}${changed ? `, ${changedCount} changed` : ''}`,
    ...metric('lines'),
    ...metric('functions'),
    ...metric('branches'),
    scope: changedCount ? 'changed' : 'all',
    scope_hidden: changed ? '' : 'hidden ',
    changed_count: changedCount,
    total_count: shown.length,
    tests_card: testsCard(tests),
    miss_count: shown.reduce((sum, row) => sum + row.lines.found - row.lines.hit, 0),
    file_count: shown.length,
    files: shown.length
      ? shown.map((row, index) => fileCard(row, sources, isChanged(row), thresholds, index)).join('\n')
      : '<p class="text-xs text-[#656d76] dark:text-[#7d8590]">No coverage data to show.</p>',
  });
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHtml } from '../src/html.js';
import { parseLcov, summarize } from '../src/lcov.js';
import { badgeUrl, formatDelta, formatRanges, MARKER, renderMarkdown, tier } from '../src/render.js';

const rows = summarize(parseLcov('SF:a.js\nDA:1,1\nDA:2,0\nDA:3,0\nend_of_record\nSF:b.js\nDA:1,1\nend_of_record\n'));
const better = summarize(parseLcov('SF:a.js\nDA:1,1\nDA:2,1\nDA:3,0\nend_of_record\n'));

test('badge color follows thresholds', () => {
  assert.equal(tier(95), 'brightgreen');
  assert.equal(tier(80), 'yellow');
  assert.equal(tier(10), 'red');
  assert.equal(badgeUrl(66.6), 'https://img.shields.io/badge/Coverage-67%25-red');
});

test('delta formatting', () => {
  assert.equal(formatDelta(50, null), '');
  assert.equal(formatDelta(50, 50.01), '=');
  assert.equal(formatDelta(60, 50), '▲ +10.0');
  assert.equal(formatDelta(40, 50), '▼ -10.0');
  assert.equal(formatRanges([[1, 1], [3, 5]]), '1, 3-5');
});

test('markdown has marker, badge, deltas and report link', () => {
  const body = renderMarkdown({ title: 'Cov', rows, baseRows: better, reportUrl: 'https://x/report' });
  assert.ok(body.startsWith(MARKER));
  assert.match(body, /img\.shields\.io/);
  assert.match(body, /\| a\.js \| 33\.3% \| ▼ -33\.3 \| 2-3 \|/);
  assert.match(body, /\| b\.js \| 100\.0% \|  \|/);
  assert.match(body, /\[Full HTML report\]\(https:\/\/x\/report\)/);
});

test('markdown without baseline or link, truncating long file lists', () => {
  const many = Array.from({ length: 101 }, (_, i) => ({ ...rows[0], path: `f${i}.js` }));
  const body = renderMarkdown({ title: 'Cov', rows: many, baseRows: null });
  assert.match(body, /1 more files/);
  assert.doesNotMatch(body, /Full HTML report/);
});

test('html is self-contained and escapes source', () => {
  const sources = new Map([['a.js', 'if (a < b) {}\nx\ny\nz'], ['b.js', null]]);
  const html = renderHtml({ title: 'T "x"', rows, sources });
  assert.match(html, /a &lt; b/);
  assert.match(html, /Source not available/);
  assert.match(html, /class="hit"/);
  assert.match(html, /class="miss"/);
  assert.match(html, /class="none"/);
  assert.doesNotMatch(html, /<script src=|<link /);
});

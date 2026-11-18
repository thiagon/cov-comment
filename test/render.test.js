import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHtml } from '../src/html.js';
import { parseLcov, summarize } from '../src/lcov.js';
import { badgeUrl, formatDelta, formatRanges, MARKER, parseEmojis, parseThresholds, renderMarkdown, tier } from '../src/render.js';

const rows = summarize(parseLcov('SF:a.js\nDA:1,1\nDA:2,0\nDA:3,0\nend_of_record\nSF:b.js\nDA:1,1\nend_of_record\nSF:c.js\nDA:1,1\nDA:2,1\nend_of_record\n'));
const baseline = summarize(parseLcov('SF:a.js\nDA:1,1\nDA:2,1\nDA:3,0\nFN:1,f\nFNDA:1,f\nend_of_record\nSF:c.js\nDA:1,1\nDA:2,1\nend_of_record\n'));

test('badge color follows thresholds', () => {
  assert.equal(tier(95), 'brightgreen');
  assert.equal(tier(80), 'yellow');
  assert.equal(tier(10), 'red');
  assert.equal(tier(60, [50, 40]), 'brightgreen');
  assert.equal(badgeUrl(66.6), 'https://img.shields.io/badge/Coverage-67%25-red');
});

test('thresholds parsing falls back to defaults', () => {
  assert.deepEqual(parseThresholds('80,50'), [80, 50]);
  assert.deepEqual(parseThresholds('50,80'), [90, 70]);
  assert.deepEqual(parseThresholds('abc'), [90, 70]);
  assert.deepEqual(parseThresholds('90'), [90, 70]);
});

test('emojis parsing falls back to defaults', () => {
  assert.deepEqual(parseEmojis('✅, ⚠️, ❌, ➖'), ['✅', '⚠️', '❌', '➖']);
  assert.deepEqual(parseEmojis('a,b,c'), ['🟢', '🟡', '🔴', '⚪']);
  assert.deepEqual(parseEmojis('a,b,c,'), ['🟢', '🟡', '🔴', '⚪']);
});

test('delta formatting', () => {
  assert.equal(formatDelta(50, null), '');
  assert.equal(formatDelta(50, 50.01), '=');
  assert.equal(formatDelta(60, 50), '▲ +10.0');
  assert.equal(formatDelta(40, 50), '▼ -10.0');
  assert.equal(formatRanges([[1, 1], [3, 5]]), '1, 3-5');
});

test('markdown shows before, after, delta, origin and legend', () => {
  const body = renderMarkdown({
    title: 'Coverage Report',
    rows,
    baseRows: baseline,
    reportUrl: 'https://x/report',
    changed: new Set(['a.js', 'b.js']),
    commit: { sha: 'abcdef123456', url: 'https://x/commit' },
    run: { label: 'ci #4', url: 'https://x/run' },
    blobUrl: 'https://x/blob/abc',
    emojis: ['✅', '⚠️', '❌', '➖'],
  });
  assert.ok(body.startsWith(MARKER));
  assert.match(body, /### 📊 Coverage Report/);
  assert.match(body, /Commit \[`abcdef1`\]\(https:\/\/x\/commit\) · \[ci #4\]\(https:\/\/x\/run\)/);
  assert.match(body, /\| 📈 Lines \| 80.0% \| ❌ 66\.7% \| ▼ -13\.3 \| 4\/6 \|/);
  assert.match(body, /\| 🔧 Functions \| 100\.0% \| ➖ n\/a \|  \| 0\/0 \|/);
  assert.match(body, /\| \[a\.js\]\(https:\/\/x\/blob\/abc\/a\.js\) \| 66\.7% \| ❌ 33\.3% \| ▼ -33\.3 \| \[2-3\]\(https:\/\/x\/blob\/abc\/a\.js#L2-L3\) \|/);
  assert.match(body, /\| \[b\.js\]\(https:\/\/x\/blob\/abc\/b\.js\) \| — \| ✅ 100\.0% \|  \|/);
  assert.match(body, /#### 📁 Changed files[\s\S]*a\.js[\s\S]*<details>/);
  assert.doesNotMatch(body.split('<details>')[0], /c\.js/);
  assert.doesNotMatch(body, /below|no data/);
  assert.match(body, /📄 \[Full HTML report\]\(https:\/\/x\/report\)/);
});

test('markdown links single missing lines and encodes paths', () => {
  const single = summarize(parseLcov('SF:dir with space/a.js\nDA:1,1\nDA:2,0\nend_of_record\n'));
  const body = renderMarkdown({ title: 'T', rows: single, baseRows: null, blobUrl: 'https://x/blob/abc' });
  assert.match(body, /\[dir with space\/a\.js\]\(https:\/\/x\/blob\/abc\/dir%20with%20space\/a\.js\)/);
  assert.match(body, /\[2\]\(https:\/\/x\/blob\/abc\/dir%20with%20space\/a\.js#L2\)/);
});

test('markdown without baseline, origin or link', () => {
  const body = renderMarkdown({ title: 'T', rows, baseRows: null, changed: new Set(['zzz.js']) });
  assert.match(body, /No coverage data for changed files/);
  assert.match(body, /\| 📈 Lines \| — \|/);
  assert.doesNotMatch(body, /Commit \[|Full HTML report/);
  assert.doesNotMatch(renderMarkdown({ title: 'T', rows, baseRows: null }), /Changed files/);
});

test('markdown with only a commit and truncating long file lists', () => {
  const many = Array.from({ length: 101 }, (_, i) => ({ ...rows[0], path: `f${i}.js` }));
  const body = renderMarkdown({ title: 'T', rows: many, baseRows: null, commit: { sha: 'abcdef1234', url: 'u' } });
  assert.match(body, /1 more files/);
  assert.match(body, /^Commit \[`abcdef1`\]\(u\)$/m);
});

test('html is self-contained and escapes source', () => {
  const sources = new Map([['a.js', 'if (a < b) {}\nx\ny\nz'], ['b.js', null]]);
  const html = renderHtml({ title: 'T "x"', rows, sources });
  assert.match(html, /a &lt; b/);
  assert.match(html, /Source not available/);
  assert.match(html, /class="hit"/);
  assert.match(html, /class="miss"/);
  assert.match(html, /class="none"/);
  assert.doesNotMatch(html, /<script|<link /);
});

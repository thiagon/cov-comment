import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHtml } from '../src/html.js';
import { parseLcov, summarize } from '../src/lcov.js';
import { badgeJson, badgeUrl, formatDelta, formatRanges, MARKER, parseThresholds, renderMarkdown, tier } from '../src/render.js';

const rows = summarize(parseLcov('SF:a.js\nDA:1,1\nDA:2,0\nDA:3,0\nend_of_record\nSF:b.js\nDA:1,1\nend_of_record\nSF:c.js\nDA:1,1\nDA:2,1\nend_of_record\n'));
const baseline = summarize(parseLcov('SF:a.js\nDA:1,1\nDA:2,1\nDA:3,0\nFN:1,f\nFNDA:1,f\nend_of_record\nSF:c.js\nDA:1,1\nDA:2,1\nend_of_record\n'));

test('badge color follows thresholds', () => {
  assert.equal(tier(95), 'brightgreen');
  assert.equal(tier(80), 'yellow');
  assert.equal(tier(10), 'red');
  assert.equal(tier(60, [50, 40]), 'brightgreen');
  assert.equal(badgeUrl(66.6), 'https://img.shields.io/badge/Coverage-67%25-red');
  assert.deepEqual(badgeJson(97.4, [95, 80]), { schemaVersion: 1, label: 'coverage', message: '97%', color: 'brightgreen' });
});

test('thresholds parsing falls back to defaults', () => {
  assert.deepEqual(parseThresholds('80,50'), [80, 50]);
  assert.deepEqual(parseThresholds('50,80'), [90, 70]);
  assert.deepEqual(parseThresholds('abc'), [90, 70]);
  assert.deepEqual(parseThresholds('90'), [90, 70]);
});

test('delta formatting', () => {
  assert.equal(formatDelta(50, null), '');
  assert.equal(formatDelta(50, 50.01), '=');
  assert.equal(formatDelta(60, 50), '▲ +10.0');
  assert.equal(formatDelta(40, 50), '▼ -10.0');
  assert.equal(formatRanges([[1, 1], [3, 5]]), '1, 3-5');
});

test('markdown shows before, after, delta, statements, origin last and custom thresholds', () => {
  const body = renderMarkdown({
    title: 'Coverage Report',
    rows,
    baseRows: baseline,
    reportUrl: 'https://x/report',
    changed: new Set(['a.js', 'b.js']),
    commit: { sha: 'abcdef123456', url: 'https://x/commit' },
    run: { label: 'ci #4', url: 'https://x/run' },
    blobUrl: 'https://x/blob/abc',
    thresholds: [95, 60],
  });
  assert.ok(body.startsWith(MARKER));
  assert.match(body, /### 📊 Coverage Report/);
  assert.match(body, /\| 📈 Lines \| 80\.0% \| 🟡 66\.7% \| ▼ -13\.3 \| 4\/6 \|/);
  assert.match(body, /\| 🔧 Functions \| 100\.0% \| ⚪ n\/a \|  \| 0\/0 \|/);
  assert.match(body, /\| 🌿 Branches \| — \| ⚪ n\/a \|/);
  assert.match(body, /\| \[a\.js\]\(https:\/\/x\/blob\/abc\/a\.js\) \| 3 \| 2 \| 66\.7% \| 🔴 33\.3% \| ▼ -33\.3 \| \[2-3\]\(https:\/\/x\/blob\/abc\/a\.js#L2-L3\) \|/);
  assert.match(body, /\| \[b\.js\]\(https:\/\/x\/blob\/abc\/b\.js\) \| 1 \| 0 \| — \| 🟢 100\.0% \|  \|/);
  assert.match(body, /<details open><summary>📁 Changed files \(2\)<\/summary>[\s\S]*a\.js[\s\S]*<details><summary>🗂️ Other files \(1\)/);
  assert.doesNotMatch(body.split('<details><summary>🗂️')[0], /c\.js/);
  assert.doesNotMatch(body, /below|no data/);
  assert.ok(body.trimEnd().endsWith('[ci #4](https://x/run)'));
  assert.ok(body.indexOf('Full HTML report') < body.indexOf('Commit ['));
  assert.match(body, /Commit \[`abcdef1`\]\(https:\/\/x\/commit\) · \[ci #4\]/);
});

test('changed files section can start collapsed', () => {
  const changed = new Set(['a.js']);
  assert.match(renderMarkdown({ title: 'T', rows, baseRows: null, changed }), /<details open><summary>📁 Changed files/);
  assert.match(renderMarkdown({ title: 'T', rows, baseRows: null, changed, expandChanged: false }), /<details><summary>📁 Changed files/);
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
  assert.doesNotMatch(body, /Commit \[|Full HTML report|Trend/);
  assert.doesNotMatch(renderMarkdown({ title: 'T', rows, baseRows: null }), /Changed files/);
});

test('markdown with only a commit and truncating long file lists', () => {
  const many = Array.from({ length: 101 }, (_, i) => ({ ...rows[0], path: `f${i}.js` }));
  const body = renderMarkdown({ title: 'T', rows: many, baseRows: null, commit: { sha: 'abcdef1234', url: 'u' } });
  assert.match(body, /1 more files/);
  assert.match(renderMarkdown({ title: 'T', rows: many, baseRows: null, maxFiles: 99 }), /2 more files/);
  assert.match(body, /^Commit \[`abcdef1`\]\(u\)$/m);
});

test('hides fully covered files from the all files list but keeps changed ones', () => {
  const body = renderMarkdown({ title: 'T', rows, baseRows: null, changed: new Set(['b.js']), skipCovered: true });
  const [changedPart, allPart] = body.split('<details><summary>🗂️');
  assert.match(changedPart, /b\.js/);
  assert.match(allPart, /Other files \(1, 1 fully covered hidden\)/);
  assert.doesNotMatch(allPart, /b\.js|c\.js/);
  assert.match(allPart, /a\.js/);
});

test('lists every file as all files when there is no pull request', () => {
  assert.match(renderMarkdown({ title: 'T', rows, baseRows: null }), /🗂️ All files \(3\)/);
});

test('omits the all files list when everything is hidden', () => {
  const full = rows.filter((row) => row.path !== 'a.js');
  const body = renderMarkdown({ title: 'T', rows: full, baseRows: null, skipCovered: true });
  assert.doesNotMatch(body, /All files/);
});

test('trend line needs at least two points', () => {
  const point = (lines) => ({ lines });
  assert.doesNotMatch(renderMarkdown({ title: 'T', rows, baseRows: null, history: [point(50)] }), /Trend/);
  const body = renderMarkdown({ title: 'T', rows, baseRows: null, history: [point(50), point(75), point(100)] });
  assert.match(body, /📉 Trend \(last 3 runs\): ▁▅█ 50\.0% → 100\.0%/);
});

const tests = {
  tests: 6,
  failures: 1,
  errors: 1,
  skipped: 1,
  time: 65.25,
  cases: [
    { name: 'ok', classname: '', time: 0.01, status: 'passed', message: '' },
    { name: 'bad', classname: 'suite', time: 0, status: 'failure', message: 'expected ```x``` to equal y' },
    { name: 'broken', classname: '', time: 0, status: 'error', message: '' },
    { name: 'skip', classname: '', time: 0, status: 'skipped', message: '' },
  ],
};

test('markdown shows the tests table after the coverage sections', () => {
  const body = renderMarkdown({ title: 'T', rows, baseRows: null, tests, reportUrl: 'https://x/r', commit: { sha: 'abcdef1', url: 'u' } });
  assert.match(body, /#### 🧪 Tests/);
  assert.match(body, /\| 6 \| 3 \| 1 \| 1 \| 1 \| 1m 5\.3s \|/);
  assert.doesNotMatch(body, /Failed tests|boom|```/);
  const at = (text) => body.indexOf(text);
  assert.ok(at('All files') < at('#### 🧪 Tests'));
  assert.ok(at('#### 🧪 Tests') < at('Full HTML report'));
  assert.ok(at('Full HTML report') < at('Commit ['));
  assert.doesNotMatch(renderMarkdown({ title: 'T', rows, baseRows: null }), /Tests/);
});

test('html lists every file, changed ones first and expanded, with a Changed / All scope', () => {
  const sources = new Map();
  const html = renderHtml({ title: 'T', rows, sources, changed: new Set(['b.js']) });
  assert.match(html, /<details open class="file-card[^>]*data-filename="b\.js"[^>]*data-changed="true"/);
  assert.match(html, /data-filename="c\.js"[^>]*data-changed="false"/);
  assert.match(html, /<span id="fileCountBadge"[^>]*>3<\/span>/);
  assert.ok(html.indexOf('data-filename="b.js"') < html.indexOf('data-filename="a.js"'));
  assert.match(html, /<body data-scope="changed"/);
  assert.match(html, /Changed \(1\)/);
  assert.match(html, /All \(3\)/);
  assert.doesNotMatch(html, /hidden inline-flex/);
});

test('html says so when there is no coverage data at all', () => {
  assert.match(renderHtml({ title: 'T', rows: [], sources: new Map() }), /No coverage data to show/);
});

test('html defaults to all files and hides the scope filter when nothing is known about changes', () => {
  const sources = new Map();
  const noPull = renderHtml({ title: 'T', rows, sources });
  assert.match(noPull, /<body data-scope="all"/);
  assert.match(noPull, /hidden inline-flex[^>]*>\s*<button onclick="setScope/);
  assert.match(renderHtml({ title: 'T', rows, sources, changed: new Set() }), /<body data-scope="all"/);
});

test('html fills every placeholder, shows the tests summary and escapes content', () => {
  const noTests = renderHtml({ title: 'T', rows, sources: new Map() });
  assert.doesNotMatch(noTests, /\{\{\w+\}\}|>[^<]*\bundefined\b[^<]*</);
  assert.doesNotMatch(noTests, /Test Suite/);
  const withTests = renderHtml({ title: 'T', rows, sources: new Map(), tests });
  assert.doesNotMatch(withTests, /\{\{\w+\}\}|>[^<]*\bundefined\b[^<]*</);
  assert.match(withTests, /Test Suite/);
  assert.match(withTests, /1m 5\.3s/);
  const sources = new Map([['a.js', 'if (a < b) {}\nx\ny\nz'], ['b.js', null]]);
  const html = renderHtml({ title: 'T "x" {{files}}', rows, sources });
  assert.match(html, /<title>T &quot;x&quot; \{\{files\}\}<\/title>/);
  assert.match(html, /a &lt; b/);
  assert.match(html, /Source not available/);
  assert.match(html, /class="hit"/);
  assert.match(html, /class="miss"/);
  assert.match(html, /class="none"/);
});

test('html subtitle and tests card adapt to a single miss and to all tests passing', () => {
  const single = summarize(parseLcov('SF:a.js\nDA:1,1\nDA:2,0\nend_of_record\n'));
  const html = renderHtml({ title: 'T', rows: single, sources: new Map(), tests: { ...tests, tests: 3, failures: 0, errors: 0, skipped: 0 } });
  assert.match(html, /1 miss</);
  assert.doesNotMatch(html, /1 misses/);
  assert.match(html, /text-\[#1a7f37\][^>]*>3<\/span>/);
});

test('html lists the uncovered lines as pills, ids every source line and counts functions and branches', () => {
  const many = summarize(parseLcov(`SF:m.js\n${[1, 3, 5, 7, 9, 11, 12].map((n) => `DA:${n},0`).join('\n')}\nDA:2,1\nFNF:2\nFN:1,f\nFNDA:1,f\nBRDA:1,0,0,1\nBRDA:1,0,1,0\nend_of_record\n`));
  const html = renderHtml({ title: 'T', rows: many, sources: new Map([['m.js', 'a\nb\nc']]) });
  assert.match(html, /data-missed="7"/);
  assert.match(html, /jumpToLine\(event, 'file-0', 1\)[^>]*>L1</);
  assert.match(html, /\+1 more/);
  assert.match(html, /<tr class="miss" id="file-0-L1">/);
  assert.match(html, /· 1\/1 fn · 1\/2 br/);
});

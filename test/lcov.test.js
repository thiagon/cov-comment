import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { normalizePath, parseLcov, percent, ranges, summarize, total } from '../src/lcov.js';

const text = readFileSync(new URL('./fixtures/lcov.info', import.meta.url), 'utf8');

test('merges repeated records of the same file', () => {
  const rows = summarize(parseLcov(text), '/work');
  const a = rows.find((row) => row.path === 'src/a.js');
  assert.deepEqual(a.lines, { found: 6, hit: 3 });
  assert.deepEqual(a.functions, { found: 2, hit: 2 });
  assert.deepEqual(a.branches, { found: 2, hit: 1 });
  assert.deepEqual(a.missing, [[6, 7], [9, 9]]);
});

test('normalizes absolute and dot-relative paths', () => {
  assert.equal(normalizePath('/work/src/a.js', '/work'), 'src/a.js');
  assert.equal(normalizePath('/work/src/a.js', '/work/'), 'src/a.js');
  assert.equal(normalizePath('./src/b.js', '/work'), 'src/b.js');
});

test('totals and percentages', () => {
  const totals = total(summarize(parseLcov(text), '/work'));
  assert.deepEqual(totals.lines, { found: 7, hit: 4 });
  assert.equal(percent({ found: 0, hit: 0 }), 100);
  assert.equal(percent(totals.lines).toFixed(2), '57.14');
});

test('groups consecutive numbers into ranges', () => {
  assert.deepEqual(ranges([5, 1, 2, 3, 9]), [[1, 3], [5, 5], [9, 9]]);
});

test('ignores records outside a file and lcov 2 function names', () => {
  const files = parseLcov('DA:1,1\nSF:x.js\nFN:1,3,named\nFNDA:1,named\nend_of_record\n');
  assert.deepEqual([...files.get('x.js').functions], [['named', 1]]);
});

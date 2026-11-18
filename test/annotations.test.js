import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAnnotations, parseAnnotationType } from '../src/annotations.js';
import { parseLcov, summarize } from '../src/lcov.js';

const rows = summarize(parseLcov('SF:a.js\nDA:1,1\nDA:2,0\nDA:4,0\nDA:5,0\nend_of_record\nSF:b.js\nDA:1,0\nend_of_record\n'));
const failure = (name, extra = {}) => ({ name, classname: '', file: '/w/t.js', line: 9, time: 0, status: 'failure', message: 'bad, really: 100%\nnext', ...extra });

test('annotates failed tests with escaped messages and relative paths', () => {
  const tests = { cases: [failure('one'), failure('two', { status: 'error', file: '', line: 0, message: '' }), { name: 'ok', status: 'passed' }] };
  const lines = buildAnnotations({ rows, changed: null, tests, root: '/w' });
  assert.deepEqual(lines, [
    '::error file=t.js,line=9,title=Test failed%3A one::bad, really: 100%25%0Anext',
    '::error title=Test failed%3A two::Test failed',
  ]);
});

test('annotates uncovered ranges of changed files only', () => {
  const lines = buildAnnotations({ rows, changed: new Set(['a.js']), tests: null, root: '/w' });
  assert.deepEqual(lines, [
    '::warning file=a.js,line=2,endLine=2,title=Not covered::Line 2 is not covered by tests',
    '::warning file=a.js,line=4,endLine=5,title=Not covered::Lines 4-5 are not covered by tests',
  ]);
  assert.deepEqual(buildAnnotations({ rows, changed: null, tests: null, root: '/w' }), []);
});

test('caps each kind of annotation', () => {
  const cases = Array.from({ length: 12 }, (_, i) => failure(`t${i}`));
  const many = summarize(parseLcov(`SF:m.js\n${Array.from({ length: 24 }, (_, i) => `DA:${i * 2 + 1},0`).join('\n')}\nend_of_record\n`));
  const lines = buildAnnotations({ rows: many, changed: new Set(['m.js']), tests: { cases }, root: '/w' });
  assert.equal(lines.filter((line) => line.startsWith('::error')).length, 10);
  assert.equal(lines.filter((line) => line.startsWith('::warning')).length, 10);
  assert.equal(buildAnnotations({ rows, changed: null, tests: { cases }, root: '/w', max: 3 }).length, 3);
});

test('uncovered lines can use another level or be turned off', () => {
  const changed = new Set(['a.js']);
  assert.ok(buildAnnotations({ rows, changed, tests: null, root: '/w', type: 'notice' }).every((line) => line.startsWith('::notice ')));
  assert.deepEqual(buildAnnotations({ rows, changed, tests: null, root: '/w', missingLines: false }), []);
  const failing = { cases: [failure('one')] };
  assert.equal(buildAnnotations({ rows, changed, tests: failing, root: '/w', missingLines: false }).length, 1);
});

test('annotation type falls back to warning', () => {
  assert.equal(parseAnnotationType('error'), 'error');
  assert.equal(parseAnnotationType('loud'), 'warning');
  assert.equal(parseAnnotationType(undefined), 'warning');
});

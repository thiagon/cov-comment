import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendPoint, readHistory, sparkline } from '../src/history.js';

test('reads history defensively', () => {
  assert.deepEqual(readHistory('[{"sha":"a"}]'), [{ sha: 'a' }]);
  assert.deepEqual(readHistory('{"sha":"a"}'), []);
  assert.deepEqual(readHistory('not json'), []);
});

test('appends points, replacing the same sha and trimming to the limit', () => {
  const history = [{ sha: 'a', lines: 1 }, { sha: 'b', lines: 2 }];
  assert.deepEqual(appendPoint(history, { sha: 'b', lines: 3 }), [{ sha: 'a', lines: 1 }, { sha: 'b', lines: 3 }]);
  assert.deepEqual(appendPoint(history, { sha: 'c', lines: 3 }, 2), [{ sha: 'b', lines: 2 }, { sha: 'c', lines: 3 }]);
  assert.equal(appendPoint(Array.from({ length: 40 }, (_, i) => ({ sha: `${i}` })), { sha: 'x' }).length, 30);
});

test('draws a sparkline, flat when nothing changes', () => {
  assert.equal(sparkline([0, 50, 100]), '▁▅█');
  assert.equal(sparkline([80, 80, 80]), '▄▄▄');
});

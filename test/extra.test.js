import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, clamp } from '../src/extra.js';

test('classifies negative and zero', () => {
  assert.equal(classify(-1), 'negative');
  assert.equal(classify(0), 'zero');
});

test('classifies a small value as medium', () => {
  assert.equal(classify(5), 'medium');
});

test('clamps inside the range', () => {
  assert.equal(clamp(5, 0, 10), 5);
});

test('fails with an exception', () => {
  throw new Error('boom | with a pipe');
});

test('is skipped for now', { skip: 'not ready' }, () => {
  assert.fail('never runs');
});

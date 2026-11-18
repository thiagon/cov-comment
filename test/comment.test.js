import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listChangedFiles, upsertComment } from '../src/comment.js';

const marker = '<!-- m -->';
const base = { token: 't', repository: 'o/r', issueNumber: 7, body: `${marker} new`, marker };

function fakeFetch(pages) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body });
    if (!init.method) return { ok: true, json: async () => pages.shift() ?? [] };
    return { ok: true, json: async () => ({ id: 1 }) };
  };
  return { impl, calls };
}

test('creates a comment when none carries the marker', async () => {
  const { impl, calls } = fakeFetch([[{ id: 1, body: 'other' }, { id: 2, body: null }]]);
  await upsertComment({ ...base, fetchImpl: impl });
  assert.equal(calls.at(-1).method, 'POST');
  assert.match(calls.at(-1).url, /issues\/7\/comments$/);
});

test('updates the marked comment found on a later page', async () => {
  const full = Array.from({ length: 100 }, (_, i) => ({ id: i, body: 'x' }));
  const { impl, calls } = fakeFetch([full, [{ id: 500, body: `${marker} old` }]]);
  await upsertComment({ ...base, fetchImpl: impl });
  assert.equal(calls.at(-1).method, 'PATCH');
  assert.match(calls.at(-1).url, /issues\/comments\/500$/);
});

test('throws on API failure', async () => {
  const impl = async () => ({ ok: false, status: 403 });
  await assert.rejects(upsertComment({ ...base, fetchImpl: impl }), /403/);
});

test('throws when writing the comment fails', async () => {
  const impl = async (url, init = {}) => (init.method ? { ok: false, status: 422 } : { ok: true, json: async () => [] });
  await assert.rejects(upsertComment({ ...base, fetchImpl: impl }), /422 for POST/);
});

test('lists changed files across pages', async () => {
  const first = Array.from({ length: 100 }, (_, i) => ({ filename: `f${i}.js` }));
  const { impl, calls } = fakeFetch([first, [{ filename: 'last.js' }]]);
  const files = await listChangedFiles({ token: 't', repository: 'o/r', issueNumber: 7, fetchImpl: impl });
  assert.equal(files.size, 101);
  assert.ok(files.has('last.js'));
  assert.match(calls[0].url, /pulls\/7\/files\?per_page=100&page=1/);
});

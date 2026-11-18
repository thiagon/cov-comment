import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../template/coverage.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];

const classList = (initial = []) => {
  const set = new Set(initial);
  return {
    add: (...names) => names.forEach((name) => set.add(name)),
    remove: (...names) => names.forEach((name) => set.delete(name)),
    toggle(name, force) {
      const on = force ?? !set.has(name);
      if (on) set.add(name);
      else set.delete(name);
      return on;
    },
    contains: (name) => set.has(name),
  };
};

const element = (props = {}) => ({ classList: classList(), dataset: {}, className: '', textContent: '', value: '', ...props });

function card({ name, tone = 'green', pct = '100', code = ['a', 'b'], classes = [] }) {
  const rows = code.map((text) => ({ querySelector: () => ({ textContent: text }) }));
  const table = { innerText: code.join('\n') };
  const self = element({
    open: false,
    id: `file-${name}`,
    dataset: { filename: name, tone, pct },
    getAttribute: (key) => (key === 'data-filename' ? name : null),
    querySelector: (selector) => (selector === 'table.source' ? table : null),
    querySelectorAll: () => rows,
    scrollIntoView() {},
  });
  self.classList = classList(classes);
  return self;
}

function load(cards) {
  const ids = {};
  for (const id of ['sidebarNav', 'searchInput', 'clearSearchBtn', 'fileCountBadge', 'emptyState', 'toast', 'toggleHeatmapBtn', 'btn-filter-all', 'btn-filter-hits', 'btn-filter-miss']) ids[id] = element();
  ids.toast.classList = classList(['translate-y-20', 'opacity-0']);
  const created = [];
  const written = [];
  const timers = [];
  const document = {
    body: element(),
    documentElement: element(),
    getElementById: (id) => ids[id],
    createElement: () => {
      const link = element();
      created.push(link);
      return link;
    },
    querySelectorAll: (selector) => (selector === '.file-card:not(.hidden)' ? cards.filter((item) => !item.classList.contains('hidden')) : cards),
  };
  ids.sidebarNav.appendChild = (child) => ids.sidebarNav.children.push(child);
  ids.sidebarNav.children = [];
  const context = {
    document,
    window: {},
    lucide: { createIcons() {} },
    navigator: { clipboard: { writeText: (text) => (written.push(text), Promise.resolve()) } },
    setTimeout: (fn) => timers.push(fn),
  };
  vm.createContext(context);
  vm.runInContext(script, context);
  return { context, ids, document, created, written, timers };
}

test('window load builds the sidebar from each card tone and percentage', () => {
  const cards = [card({ name: 'a<b>.js', tone: 'red', pct: '40.4' }), card({ name: 'b.js', tone: 'unknown', pct: '100' })];
  const { context, ids, created } = load(cards);
  context.window.onload();
  assert.equal(ids.sidebarNav.children.length, 2);
  assert.match(created[0].innerHTML, /a&lt;b&gt;\.js/);
  assert.match(created[0].innerHTML, /40%/);
  assert.match(created[0].innerHTML, /bg-\[#cf222e\]/);
  assert.match(created[1].innerHTML, /bg-\[#2da44e\]/, 'unknown tones fall back to green');
  let scrolled = false;
  cards[0].scrollIntoView = () => (scrolled = true);
  let prevented = false;
  created[0].onclick({ preventDefault: () => (prevented = true) });
  assert.ok(cards[0].open && scrolled && prevented);
});

test('expand all and collapse all only touch visible cards', () => {
  const cards = [card({ name: 'a' }), card({ name: 'b', classes: ['hidden'] })];
  const { context } = load(cards);
  context.toggleAllDetails(true);
  assert.deepEqual(cards.map((item) => item.open), [true, false]);
  context.toggleAllDetails(false);
  assert.equal(cards[0].open, false);
});

test('copy puts the file code in the clipboard and shows the toast', async () => {
  const cards = [card({ name: 'a', code: ['one', 'two'] })];
  const { context, written, ids, timers } = load(cards);
  const events = { preventDefault() {}, stopPropagation() {} };
  context.copyFileCode(events, { closest: () => cards[0] });
  await Promise.resolve();
  assert.deepEqual(written, ['one\ntwo']);
  assert.ok(!ids.toast.classList.contains('opacity-0'));
  timers[0]();
  assert.ok(ids.toast.classList.contains('opacity-0'));
});

test('search filters cards by file name or code and shows the empty state', () => {
  const cards = [card({ name: 'src/a.js', code: ['alpha'] }), card({ name: 'src/b.js', code: ['beta'] })];
  const { context, ids } = load(cards);
  ids.searchInput.value = ' BETA ';
  context.filterFiles();
  assert.deepEqual(cards.map((item) => item.classList.contains('hidden')), [true, false]);
  assert.equal(ids.fileCountBadge.textContent, 1);
  assert.ok(ids.emptyState.classList.contains('hidden'));
  assert.ok(!ids.clearSearchBtn.classList.contains('hidden'));
  ids.searchInput.value = 'nothing';
  context.filterFiles();
  assert.ok(!ids.emptyState.classList.contains('hidden'));
  ids.searchInput.focus = () => {};
  context.clearSearch();
  assert.equal(ids.searchInput.value, '');
  assert.equal(ids.fileCountBadge.textContent, 2);
  assert.ok(ids.clearSearchBtn.classList.contains('hidden'));
});

test('a card without source is still searchable by name', () => {
  const noSource = card({ name: 'gone.js' });
  noSource.querySelector = () => null;
  const { context, ids } = load([noSource]);
  ids.searchInput.value = 'gone';
  context.filterFiles();
  assert.ok(!noSource.classList.contains('hidden'));
  ids.searchInput.value = 'zzz';
  context.filterFiles();
  assert.ok(noSource.classList.contains('hidden'));
});

test('line filters and the heatmap toggle switch body classes and button styles', () => {
  const { context, document, ids } = load([]);
  context.setLineFilter('hits');
  assert.ok(document.body.classList.contains('filter-hits-only'));
  assert.match(ids['btn-filter-hits'].className, /bg-\[#0969da\]/);
  assert.doesNotMatch(ids['btn-filter-all'].className, /bg-\[#0969da\]/);
  context.setLineFilter('miss');
  assert.ok(document.body.classList.contains('filter-miss-only'));
  assert.ok(!document.body.classList.contains('filter-hits-only'));
  context.setLineFilter('all');
  assert.ok(!document.body.classList.contains('filter-miss-only'));
  context.toggleHeatmap();
  assert.ok(document.body.classList.contains('hide-heatmap'));
  assert.ok(ids.toggleHeatmapBtn.classList.contains('opacity-60'));
  context.toggleHeatmap();
  assert.ok(!ids.toggleHeatmapBtn.classList.contains('opacity-60'));
});

test('theme toggle flips the dark class', () => {
  const { context, document } = load([]);
  context.toggleTheme();
  assert.ok(document.documentElement.classList.contains('dark'));
  context.toggleTheme();
  assert.ok(!document.documentElement.classList.contains('dark'));
});

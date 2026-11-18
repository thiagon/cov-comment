export function parseLcov(text) {
  const files = new Map();
  let file = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('SF:')) {
      const path = line.slice(3);
      file = files.get(path) ?? { path, lines: new Map(), functions: new Map(), branches: new Map() };
      files.set(path, file);
    } else if (!file) {
      continue;
    } else if (line.startsWith('DA:')) {
      const [no, hits] = line.slice(3).split(',');
      file.lines.set(Number(no), (file.lines.get(Number(no)) ?? 0) + Number(hits));
    } else if (line.startsWith('FNDA:')) {
      const rest = line.slice(5);
      const comma = rest.indexOf(',');
      const name = rest.slice(comma + 1);
      file.functions.set(name, (file.functions.get(name) ?? 0) + Number(rest.slice(0, comma)));
    } else if (line.startsWith('FN:')) {
      const rest = line.slice(3);
      const name = rest.slice(rest.lastIndexOf(',') + 1);
      if (!file.functions.has(name)) file.functions.set(name, 0);
    } else if (line.startsWith('BRDA:')) {
      const [no, block, branch, taken] = line.slice(5).split(',');
      const key = `${no},${block},${branch}`;
      file.branches.set(key, (file.branches.get(key) ?? 0) + (taken === '-' ? 0 : Number(taken)));
    } else if (line === 'end_of_record') {
      file = null;
    }
  }
  return files;
}

export function normalizePath(path, root) {
  const prefix = root.endsWith('/') ? root : `${root}/`;
  const relative = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  return relative.replace(/^\.\//, '');
}

const count = (map) => ({ found: map.size, hit: [...map.values()].filter((hits) => hits > 0).length });

export function ranges(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const result = [];
  for (const n of sorted) {
    const last = result.at(-1);
    if (last && n === last[1] + 1) last[1] = n;
    else result.push([n, n]);
  }
  return result;
}

export function summarize(files, root = '') {
  return [...files.values()]
    .map((file) => ({
      path: normalizePath(file.path, root),
      lines: count(file.lines),
      functions: count(file.functions),
      branches: count(file.branches),
      lineHits: file.lines,
      missing: ranges([...file.lines].filter(([, hits]) => hits === 0).map(([no]) => no)),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function total(rows) {
  const sum = (kind) =>
    rows.reduce((acc, row) => ({ found: acc.found + row[kind].found, hit: acc.hit + row[kind].hit }), {
      found: 0,
      hit: 0,
    });
  return { lines: sum('lines'), functions: sum('functions'), branches: sum('branches') };
}

export const percent = ({ found, hit }) => (found === 0 ? 100 : (hit / found) * 100);

export const isFullyCovered = (row) => ['lines', 'functions', 'branches'].every((kind) => row[kind].hit === row[kind].found);

export function debugRows(rows) {
  return rows.map((row) => `${row.path}: ${row.lines.hit}/${row.lines.found}`).join('\n');
}

import { formatTime } from './junit.js';
import { isFullyCovered, percent, total } from './lcov.js';
import { badgeUrl, formatPercent, formatRanges } from './render.js';

const escape = (value) =>
  String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

function renderSource(row, source) {
  if (source == null) return '<p class="muted">Source not available.</p>';
  const body = source
    .split('\n')
    .map((text, index) => {
      const hits = row.lineHits.get(index + 1);
      const kind = hits === undefined ? 'none' : hits > 0 ? 'hit' : 'miss';
      return `<tr class="${kind}"><td class="no">${index + 1}</td><td class="hits">${hits ?? ''}</td><td><pre>${escape(text)}</pre></td></tr>`;
    })
    .join('');
  return `<table class="source">${body}</table>`;
}

const style = `
:root { color-scheme: light dark; --hit: #d1f7d6; --miss: #fbd3d3; --border: #8885; }
@media (prefers-color-scheme: dark) { :root { --hit: #12361b; --miss: #4a1a1a; } }
body { font: 14px/1.5 system-ui, sans-serif; max-width: 1100px; margin: 2rem auto; padding: 0 1rem; }
table { border-collapse: collapse; width: 100%; }
th, td { padding: 4px 8px; border-bottom: 1px solid var(--border); text-align: left; }
details { border: 1px solid var(--border); border-radius: 6px; margin: 8px 0; }
summary { cursor: pointer; padding: 6px 10px; display: flex; gap: 12px; }
summary .name { flex: 1; font-family: monospace; }
.source { font-family: monospace; font-size: 12px; }
.source td { border: 0; padding: 0 8px; }
.source pre { margin: 0; white-space: pre; }
.source .no, .source .hits { text-align: right; opacity: .6; user-select: none; }
.hit { background: var(--hit); } .miss { background: var(--miss); }
.muted { opacity: .6; padding: 0 10px; }
`;

const fileBlock = (row, sources, open) =>
  `<details${open ? ' open' : ''}><summary><span class="name">${escape(row.path)}</span><span>${formatPercent(percent(row.lines))}</span><span class="muted">${escape(formatRanges(row.missing))}</span></summary>${renderSource(row, sources.get(row.path))}</details>`;

export function renderHtml({ title, rows, sources, changed = null, tests = null, hideFullyCovered = false }) {
  const totals = total(rows);
  const summary = ['lines', 'functions', 'branches']
    .map((kind) => `<tr><td>${kind}</td><td>${formatPercent(percent(totals[kind]))}</td><td>${totals[kind].hit}/${totals[kind].found}</td></tr>`)
    .join('');
  const ordered = [...rows].sort((a, b) => percent(a.lines) - percent(b.lines));
  const touched = changed ? ordered.filter((row) => changed.has(row.path)) : [];
  const others = ordered.filter((row) => !changed?.has(row.path) && !(hideFullyCovered && isFullyCovered(row)));
  const sections = [];
  if (changed) sections.push(`<h2>Changed files</h2>${touched.map((row) => fileBlock(row, sources, true)).join('') || '<p class="muted">No coverage data for changed files.</p>'}`);
  if (others.length) sections.push(`<h2>${changed ? 'Other files' : 'Files'}</h2>${others.map((row) => fileBlock(row, sources, false)).join('')}`);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title><style>${style}</style></head>
<body>
<h1>${escape(title)}</h1>
<p><img alt="Coverage" src="${badgeUrl(percent(totals.lines))}"></p>
<table><thead><tr><th>Metric</th><th>Coverage</th><th>Covered</th></tr></thead><tbody>${summary}</tbody></table>
${tests ? `<p>🧪 ${tests.tests} tests · ❌ ${tests.failures} failures · 💥 ${tests.errors} errors · ⏭️ ${tests.skipped} skipped · ⏱️ ${formatTime(tests.time)}</p>` : ''}
${sections.join('\n')}
</body></html>
`;
}

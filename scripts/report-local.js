// Runs our own tests with coverage and renders the HTML report to coverage/report.html
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { renderHtml } from '../src/html.js';
import { parseJunit } from '../src/junit.js';
import { parseLcov, summarize } from '../src/lcov.js';

const out = 'coverage';
mkdirSync(out, { recursive: true });

// failing tests are fine here, the report is exactly for looking at them
spawnSync(
  process.execPath,
  [
    '--test',
    '--experimental-test-coverage',
    '--test-coverage-exclude=test/**',
    '--test-reporter=spec',
    '--test-reporter-destination=stderr',
    '--test-reporter=lcov',
    `--test-reporter-destination=${out}/lcov.info`,
    '--test-reporter=junit',
    `--test-reporter-destination=${out}/junit.xml`,
  ],
  { stdio: 'inherit' },
);

const root = process.cwd();
const rows = summarize(parseLcov(readFileSync(`${out}/lcov.info`, 'utf8')), root);
const sources = new Map(rows.map((row) => [row.path, existsSync(row.path) ? readFileSync(row.path, 'utf8') : null]));
const tests = parseJunit(readFileSync(`${out}/junit.xml`, 'utf8'));
// the first file stands in for a pull request's changed files
const changed = new Set(rows.slice(0, 1).map((row) => row.path));

writeFileSync(`${out}/report.html`, renderHtml({ title: 'Coverage Report', rows, sources, changed, tests }));
console.log(`\nReport: ${root}/${out}/report.html`);

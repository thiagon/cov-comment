import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAnnotations } from './annotations.js';
import { listChangedFiles, upsertComment } from './comment.js';
import { renderHtml } from './html.js';
import { appendPoint, readHistory } from './history.js';
import { parseJunit } from './junit.js';
import { parseLcov, percent, summarize, total } from './lcov.js';
import { badgeJson, MARKER, parseThresholds, renderMarkdown } from './render.js';

const env = process.env;
const root = process.cwd();
const outDir = join(env.RUNNER_TEMP ?? root, 'cov-comment');
const htmlPath = join(outDir, env.INPUT_HTML_NAME);
const tempRoot = env.RUNNER_TEMP ?? root;
const baselineDir = join(tempRoot, 'cov-comment-baseline');
const historyFile = join(baselineDir, 'history.json');
const previousHistory = () => (existsSync(historyFile) ? readHistory(readFileSync(historyFile, 'utf8')) : []);

const load = (path) => summarize(parseLcov(readFileSync(path, 'utf8')), root);
const rows = load(env.INPUT_LCOV_FILE);
const baseRows = env.INPUT_BASELINE_FILE && existsSync(env.INPUT_BASELINE_FILE) ? load(env.INPUT_BASELINE_FILE) : null;
const tests = env.INPUT_JUNIT_FILE && existsSync(env.INPUT_JUNIT_FILE) ? parseJunit(readFileSync(env.INPUT_JUNIT_FILE, 'utf8')) : null;
const totalLines = percent(total(rows).lines);

const event = env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) : {};
const pull = event.pull_request;
const repository = env.GITHUB_REPOSITORY;
const server = env.GITHUB_SERVER_URL ?? 'https://github.com';
const sha = pull?.head.sha ?? env.GITHUB_SHA;
const canComment = Boolean(pull && env.INPUT_GITHUB_TOKEN);
const hideFullyCovered = env.INPUT_HIDE_FULLY_COVERED === 'true';
const fetchChanged = () =>
  canComment ? listChangedFiles({ fetchImpl: fetch, token: env.INPUT_GITHUB_TOKEN, repository, issueNumber: pull.number }) : null;

const setOutput = (key, value) => env.GITHUB_OUTPUT && appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);

const commands = {
  async report() {
    const changed = await fetchChanged();
    const sources = new Map(rows.map((row) => [row.path, existsSync(row.path) ? readFileSync(row.path, 'utf8') : null]));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(htmlPath, renderHtml({ title: env.INPUT_TITLE, rows, sources, changed, tests, hideFullyCovered }));
    setOutput('html-path', htmlPath);
    setOutput('total-coverage', totalLines.toFixed(2));
  },

  async comment() {
    const changed = await fetchChanged();
    const body = renderMarkdown({
      title: env.INPUT_TITLE,
      rows,
      baseRows,
      reportUrl: env.REPORT_URL,
      changed,
      thresholds: parseThresholds(env.INPUT_THRESHOLDS),
      history: previousHistory(),
      tests,
      hideFullyCovered,
      expandChanged: env.INPUT_EXPAND_CHANGED_FILES !== 'false',
      blobUrl: sha ? `${server}/${repository}/blob/${sha}` : null,
      commit: sha ? { sha, url: `${server}/${repository}/commit/${sha}` } : null,
      run: env.GITHUB_RUN_ID
        ? { label: `${env.GITHUB_WORKFLOW} #${env.GITHUB_RUN_NUMBER}`, url: `${server}/${repository}/actions/runs/${env.GITHUB_RUN_ID}` }
        : null,
    });
    if (env.INPUT_ANNOTATIONS !== 'false') buildAnnotations({ rows, changed, tests, root }).forEach((line) => console.log(line));
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${body}\n`);
    if (!canComment) return;
    await upsertComment({ fetchImpl: fetch, token: env.INPUT_GITHUB_TOKEN, repository, issueNumber: pull.number, body, marker: MARKER });
  },

  history() {
    const totals = total(rows);
    const point = {
      sha,
      date: new Date().toISOString(),
      lines: Number(percent(totals.lines).toFixed(2)),
      functions: Number(percent(totals.functions).toFixed(2)),
      branches: Number(percent(totals.branches).toFixed(2)),
    };
    const publishDir = join(tempRoot, 'cov-comment-publish');
    mkdirSync(publishDir, { recursive: true });
    copyFileSync(env.INPUT_LCOV_FILE, join(publishDir, 'lcov.info'));
    writeFileSync(join(publishDir, 'history.json'), JSON.stringify(appendPoint(previousHistory(), point)));
  },

  badge() {
    const badgeDir = join(tempRoot, 'cov-comment-badge');
    mkdirSync(badgeDir, { recursive: true });
    writeFileSync(join(badgeDir, 'coverage.json'), JSON.stringify(badgeJson(totalLines, parseThresholds(env.INPUT_THRESHOLDS))));
  },

  gate() {
    const minimum = Number(env.INPUT_MINIMUM_COVERAGE);
    if (Number.isNaN(minimum)) throw new Error(`Invalid minimum-coverage: ${env.INPUT_MINIMUM_COVERAGE}`);
    if (totalLines < minimum) {
      console.error(`Line coverage ${totalLines.toFixed(2)}% is below the minimum of ${minimum}%`);
      process.exitCode = 1;
    }
  },
};

const command = commands[process.argv[2]];
if (!command) throw new Error(`Unknown command: ${process.argv[2]}`);
await command();

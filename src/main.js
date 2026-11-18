import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAnnotations, parseAnnotationType } from './annotations.js';
import { listChangedFiles, upsertComment } from './comment.js';
import { renderHtml } from './html.js';
import { appendPoint, readHistory } from './history.js';
import { parseJunit } from './junit.js';
import { parseLcov, percent, summarize, total } from './lcov.js';
import { badgeJson, MARKER, parseThresholds, renderMarkdown } from './render.js';

const parseMinimum = (value) => {
  if (!value) return 0; // only the gate step receives it
  const minimum = Number(value);
  if (Number.isNaN(minimum)) throw new Error(`Invalid minimum-coverage: ${value}`);
  return minimum;
};

// every environment variable the action reads, in one place
const env = process.env;
const root = process.cwd();
const tempRoot = env.RUNNER_TEMP ?? root;
const config = {
  // inputs, mapped one by one in action.yml
  lcovFile: env.INPUT_LCOV_FILE,
  junitFile: env.INPUT_JUNIT_FILE,
  baselineFile: env.INPUT_BASELINE_FILE,
  title: env.INPUT_TITLE,
  artifactName: env.INPUT_ARTIFACT_NAME,
  thresholds: parseThresholds(env.INPUT_THRESHOLDS),
  minimumCoverage: parseMinimum(env.INPUT_MINIMUM_COVERAGE),
  skipCovered: env.INPUT_SKIP_COVERED === 'true',
  expandChanged: env.INPUT_EXPAND_CHANGED_FILES !== 'false',
  annotateMissingLines: env.INPUT_ANNOTATE_MISSING_LINES !== 'false',
  annotationType: parseAnnotationType(env.INPUT_ANNOTATION_TYPE),
  maxFiles: Number(env.INPUT_MAX_FILES_IN_COMMENT) || undefined,
  reportUrl: env.REPORT_URL,
  token: env.GITHUB_TOKEN,
  // set by the runner
  repository: env.GITHUB_REPOSITORY,
  server: env.GITHUB_SERVER_URL ?? 'https://github.com',
  eventPath: env.GITHUB_EVENT_PATH,
  sha: env.GITHUB_SHA,
  workflow: env.GITHUB_WORKFLOW,
  runId: env.GITHUB_RUN_ID,
  runNumber: env.GITHUB_RUN_NUMBER,
  outputFile: env.GITHUB_OUTPUT,
  summaryFile: env.GITHUB_STEP_SUMMARY,
};

const outDir = join(tempRoot, 'cov-comment');
const htmlPath = join(outDir, config.artifactName);
const baselineDir = join(tempRoot, 'cov-comment-baseline');
const historyFile = join(baselineDir, 'history.json');
const previousHistory = () => (existsSync(historyFile) ? readHistory(readFileSync(historyFile, 'utf8')) : []);

const load = (path) => summarize(parseLcov(readFileSync(path, 'utf8')), root);
const rows = load(config.lcovFile);
const baseRows = config.baselineFile && existsSync(config.baselineFile) ? load(config.baselineFile) : null;
const tests = config.junitFile && existsSync(config.junitFile) ? parseJunit(readFileSync(config.junitFile, 'utf8')) : null;
const totalLines = percent(total(rows).lines);

const event = config.eventPath ? JSON.parse(readFileSync(config.eventPath, 'utf8')) : {};
const pull = event.pull_request;
const { repository, server } = config;
const sha = pull?.head.sha ?? config.sha;
const canComment = Boolean(pull && config.token);
const fetchChanged = () =>
  canComment ? listChangedFiles({ fetchImpl: fetch, token: config.token, repository, issueNumber: pull.number }) : null;

const setOutput = (key, value) => config.outputFile && appendFileSync(config.outputFile, `${key}=${value}\n`);

const commands = {
  async report() {
    const changed = await fetchChanged();
    const sources = new Map(rows.map((row) => [row.path, existsSync(row.path) ? readFileSync(row.path, 'utf8') : null]));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(htmlPath, renderHtml({ title: config.title, rows, sources, changed, tests, thresholds: config.thresholds }));
    setOutput('html-path', htmlPath);
    setOutput('total-coverage', totalLines.toFixed(2));
  },

  async comment() {
    const changed = await fetchChanged();
    const body = renderMarkdown({
      title: config.title,
      rows,
      baseRows,
      reportUrl: config.reportUrl,
      changed,
      thresholds: config.thresholds,
      history: previousHistory(),
      tests,
      skipCovered: config.skipCovered,
      maxFiles: config.maxFiles,
      expandChanged: config.expandChanged,
      blobUrl: sha ? `${server}/${repository}/blob/${sha}` : null,
      commit: sha ? { sha, url: `${server}/${repository}/commit/${sha}` } : null,
      run: config.runId
        ? { label: `${config.workflow} #${config.runNumber}`, url: `${server}/${repository}/actions/runs/${config.runId}` }
        : null,
    });
    buildAnnotations({
      rows,
      changed,
      tests,
      root,
      missingLines: config.annotateMissingLines,
      type: config.annotationType,
    }).forEach((line) => console.log(line));
    if (config.summaryFile) appendFileSync(config.summaryFile, `${body}\n`);
    if (!canComment) return;
    await upsertComment({ fetchImpl: fetch, token: config.token, repository, issueNumber: pull.number, body, marker: MARKER });
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
    copyFileSync(config.lcovFile, join(publishDir, 'lcov.info'));
    writeFileSync(join(publishDir, 'history.json'), JSON.stringify(appendPoint(previousHistory(), point)));
  },

  badge() {
    const badgeDir = join(tempRoot, 'cov-comment-badge');
    mkdirSync(badgeDir, { recursive: true });
    writeFileSync(join(badgeDir, 'coverage.json'), JSON.stringify(badgeJson(totalLines, config.thresholds)));
  },

  gate() {
    if (totalLines < config.minimumCoverage) {
      console.error(`Line coverage ${totalLines.toFixed(2)}% is below the minimum of ${config.minimumCoverage}%`);
      process.exitCode = 1;
    }
  },
};

const command = commands[process.argv[2]];
if (!command) throw new Error(`Unknown command: ${process.argv[2]}`);
await command();

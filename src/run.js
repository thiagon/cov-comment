import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
export function createConfig(env, cwd) {
  return {
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
    tempRoot: env.RUNNER_TEMP ?? cwd,
  };
}

function createContext(config, cwd, fetchImpl) {
  const read = (path) => readFileSync(resolve(cwd, path), 'utf8');
  const exists = (path) => existsSync(resolve(cwd, path));
  const load = (path) => summarize(parseLcov(read(path)), cwd);
  const rows = load(config.lcovFile);
  const event = config.eventPath ? JSON.parse(read(config.eventPath)) : {};
  const pull = event.pull_request;
  const baselineDir = join(config.tempRoot, 'cov-comment-baseline');
  const historyFile = join(baselineDir, 'history.json');
  const canComment = Boolean(pull && config.token);
  return {
    rows,
    read,
    exists,
    pull,
    canComment,
    totalLines: percent(total(rows).lines),
    baseRows: config.baselineFile && exists(config.baselineFile) ? load(config.baselineFile) : null,
    tests: config.junitFile && exists(config.junitFile) ? parseJunit(read(config.junitFile)) : null,
    sha: pull?.head.sha ?? config.sha,
    previousHistory: () => (existsSync(historyFile) ? readHistory(readFileSync(historyFile, 'utf8')) : []),
    fetchChanged: () =>
      canComment ? listChangedFiles({ fetchImpl, token: config.token, repository: config.repository, issueNumber: pull.number }) : null,
    setOutput: (key, value) => config.outputFile && appendFileSync(config.outputFile, `${key}=${value}\n`),
  };
}

const commands = {
  async report(config, ctx) {
    const changed = await ctx.fetchChanged();
    const sources = new Map(ctx.rows.map((row) => [row.path, ctx.exists(row.path) ? ctx.read(row.path) : null]));
    const outDir = join(config.tempRoot, 'cov-comment');
    const htmlPath = join(outDir, config.artifactName);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(htmlPath, renderHtml({ title: config.title, rows: ctx.rows, sources, changed, tests: ctx.tests, thresholds: config.thresholds }));
    ctx.setOutput('html-path', htmlPath);
    ctx.setOutput('total-coverage', ctx.totalLines.toFixed(2));
  },

  async comment(config, ctx, { cwd, fetchImpl, log }) {
    const { repository, server } = config;
    const changed = await ctx.fetchChanged();
    const body = renderMarkdown({
      title: config.title,
      rows: ctx.rows,
      baseRows: ctx.baseRows,
      reportUrl: config.reportUrl,
      changed,
      thresholds: config.thresholds,
      history: ctx.previousHistory(),
      tests: ctx.tests,
      skipCovered: config.skipCovered,
      maxFiles: config.maxFiles,
      expandChanged: config.expandChanged,
      blobUrl: ctx.sha ? `${server}/${repository}/blob/${ctx.sha}` : null,
      commit: ctx.sha ? { sha: ctx.sha, url: `${server}/${repository}/commit/${ctx.sha}` } : null,
      run: config.runId
        ? { label: `${config.workflow} #${config.runNumber}`, url: `${server}/${repository}/actions/runs/${config.runId}` }
        : null,
    });
    buildAnnotations({
      rows: ctx.rows,
      changed,
      tests: ctx.tests,
      root: cwd,
      missingLines: config.annotateMissingLines,
      type: config.annotationType,
    }).forEach((line) => log(line));
    if (config.summaryFile) appendFileSync(config.summaryFile, `${body}\n`);
    if (!ctx.canComment) return;
    await upsertComment({ fetchImpl, token: config.token, repository, issueNumber: ctx.pull.number, body, marker: MARKER });
  },

  history(config, ctx, { cwd }) {
    const totals = total(ctx.rows);
    const point = {
      sha: ctx.sha,
      date: new Date().toISOString(),
      lines: Number(percent(totals.lines).toFixed(2)),
      functions: Number(percent(totals.functions).toFixed(2)),
      branches: Number(percent(totals.branches).toFixed(2)),
    };
    const publishDir = join(config.tempRoot, 'cov-comment-publish');
    mkdirSync(publishDir, { recursive: true });
    copyFileSync(resolve(cwd, config.lcovFile), join(publishDir, 'lcov.info'));
    writeFileSync(join(publishDir, 'history.json'), JSON.stringify(appendPoint(ctx.previousHistory(), point)));
  },

  badge(config, ctx) {
    const badgeDir = join(config.tempRoot, 'cov-comment-badge');
    mkdirSync(badgeDir, { recursive: true });
    writeFileSync(join(badgeDir, 'coverage.json'), JSON.stringify(badgeJson(ctx.totalLines, config.thresholds)));
  },

  gate(config, ctx, { error }) {
    if (ctx.totalLines >= config.minimumCoverage) return 0;
    error(`Line coverage ${ctx.totalLines.toFixed(2)}% is below the minimum of ${config.minimumCoverage}%`);
    return 1;
  },
};

// runs one command and returns the process exit code, everything it touches is injected
export async function run(command, { env, cwd, fetchImpl, log, error }) {
  if (!Object.hasOwn(commands, command)) throw new Error(`Unknown command: ${command}`);
  const config = createConfig(env, cwd);
  const ctx = createContext(config, cwd, fetchImpl);
  return (await commands[command](config, ctx, { cwd, fetchImpl, log, error })) ?? 0;
}

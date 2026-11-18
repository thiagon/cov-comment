import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createConfig, run } from '../src/run.js';

const LCOV = 'SF:src/a.js\nFN:1,f\nFNDA:1,f\nDA:1,1\nDA:2,0\nBRDA:1,0,0,1\nend_of_record\nSF:src/gone.js\nDA:1,1\nend_of_record\n';
const BASELINE = 'SF:src/a.js\nDA:1,1\nDA:2,1\nend_of_record\n';
const JUNIT = '<testsuite tests="2" failures="1" errors="0" skipped="0" time="0.5"><testcase name="ok"/><testcase name="bad"><failure message="boom"/></testcase></testsuite>';

function workspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'cov-run-'));
  mkdirSync(join(cwd, 'src'));
  mkdirSync(join(cwd, 'coverage'));
  writeFileSync(join(cwd, 'src/a.js'), 'const a = 1;\nconst b = 2;\n');
  writeFileSync(join(cwd, 'coverage/lcov.info'), LCOV);
  const env = {
    INPUT_LCOV_FILE: 'coverage/lcov.info',
    INPUT_TITLE: 'My Report',
    INPUT_ARTIFACT_NAME: 'report.html',
    RUNNER_TEMP: join(cwd, 'tmp'),
    GITHUB_OUTPUT: join(cwd, 'output.txt'),
    GITHUB_STEP_SUMMARY: join(cwd, 'summary.md'),
  };
  mkdirSync(env.RUNNER_TEMP);
  const out = { logs: [], errors: [], calls: [] };
  const fetchImpl = async (url, init = {}) => {
    out.calls.push({ url, method: init.method ?? 'GET', body: init.body });
    const json = url.includes('/pulls/') ? [{ filename: 'src/a.js' }] : url.includes('/comments?') ? [] : { id: 1 };
    return { ok: true, json: async () => json };
  };
  const options = { env, cwd, fetchImpl, log: (line) => out.logs.push(line), error: (line) => out.errors.push(line) };
  const pullRequest = (sha = 'headsha1') => {
    writeFileSync(join(cwd, 'event.json'), JSON.stringify({ pull_request: { number: 7, head: { sha } } }));
    Object.assign(env, { GITHUB_EVENT_PATH: join(cwd, 'event.json'), GITHUB_TOKEN: 'tkn', GITHUB_REPOSITORY: 'o/r' });
  };
  return { cwd, env, out, options, pullRequest };
}

test('createConfig reads the inputs once and applies the defaults', () => {
  const config = createConfig({ INPUT_MINIMUM_COVERAGE: '80', INPUT_SKIP_COVERED: 'true', INPUT_EXPAND_CHANGED_FILES: 'false', INPUT_MAX_FILES_IN_COMMENT: '5' }, '/work');
  assert.equal(config.minimumCoverage, 80);
  assert.equal(config.skipCovered, true);
  assert.equal(config.expandChanged, false);
  assert.equal(config.maxFiles, 5);
  assert.equal(config.server, 'https://github.com');
  assert.equal(config.tempRoot, '/work');
  assert.equal(config.annotationType, 'warning');
  const empty = createConfig({}, '/work');
  assert.equal(empty.minimumCoverage, 0);
  assert.equal(empty.skipCovered, false);
  assert.equal(empty.expandChanged, true);
  assert.equal(empty.maxFiles, undefined);
  assert.throws(() => createConfig({ INPUT_MINIMUM_COVERAGE: 'abc' }, '/work'), /Invalid minimum-coverage: abc/);
});

test('an unknown command is an error', async () => {
  const { options } = workspace();
  await assert.rejects(run('nope', options), /Unknown command: nope/);
});

test('report writes the html with the sources and sets the outputs', async () => {
  const { env, options } = workspace();
  assert.equal(await run('report', options), 0);
  const html = readFileSync(join(env.RUNNER_TEMP, 'cov-comment/report.html'), 'utf8');
  assert.match(html, /<title>My Report<\/title>/);
  assert.match(html, /const a = 1;/);
  assert.match(html, /Source not available/);
  const output = readFileSync(env.GITHUB_OUTPUT, 'utf8');
  assert.match(output, /html-path=.*report\.html/);
  assert.match(output, /total-coverage=66\.67/);
});

test('report without an output file still works, and lists the changed files of a pull request', async () => {
  const { env, out, options, pullRequest } = workspace();
  delete env.GITHUB_OUTPUT;
  pullRequest();
  await run('report', options);
  assert.ok(out.calls.some((call) => call.url.includes('/repos/o/r/pulls/7/files')));
  assert.match(readFileSync(join(env.RUNNER_TEMP, 'cov-comment/report.html'), 'utf8'), /data-changed="true"/);
  assert.equal(existsSync(join(options.cwd, 'output.txt')), false);
});

test('comment without a pull request only writes the summary', async () => {
  const { env, out, options } = workspace();
  Object.assign(env, { GITHUB_RUN_ID: '9', GITHUB_RUN_NUMBER: '3', GITHUB_WORKFLOW: 'ci', GITHUB_SHA: 'abc1234', GITHUB_REPOSITORY: 'o/r', REPORT_URL: 'https://x/report' });
  assert.equal(await run('comment', options), 0);
  const summary = readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8');
  assert.match(summary, /### 📊 My Report/);
  assert.match(summary, /Commit \[`abc1234`\]\(https:\/\/github\.com\/o\/r\/commit\/abc1234\)/);
  assert.match(summary, /\[ci #3\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/9\)/);
  assert.match(summary, /Full HTML report/);
  assert.deepEqual(out.calls, []);
});

test('comment without sha, run or summary file leaves those parts out', async () => {
  const { env, options } = workspace();
  delete env.GITHUB_STEP_SUMMARY;
  assert.equal(await run('comment', options), 0);
  assert.equal(existsSync(join(options.cwd, 'summary.md')), false);
});

test('comment on a pull request annotates, compares with the baseline and posts', async () => {
  const { cwd, env, out, options, pullRequest } = workspace();
  pullRequest('headsha1');
  writeFileSync(join(cwd, 'junit.xml'), JUNIT);
  writeFileSync(join(cwd, 'baseline.info'), BASELINE);
  Object.assign(env, { INPUT_JUNIT_FILE: 'junit.xml', INPUT_BASELINE_FILE: 'baseline.info', INPUT_SKIP_COVERED: 'true' });
  mkdirSync(join(env.RUNNER_TEMP, 'cov-comment-baseline'));
  writeFileSync(join(env.RUNNER_TEMP, 'cov-comment-baseline/history.json'), JSON.stringify([{ sha: 'x', date: 'd', lines: 50, functions: 50, branches: 50 }, { sha: 'y', date: 'd', lines: 60, functions: 50, branches: 50 }]));
  await run('comment', options);
  assert.ok(out.logs.some((line) => line.startsWith('::warning')), 'uncovered lines are annotated');
  assert.ok(out.logs.some((line) => line.startsWith('::error') && line.includes('bad')), 'failed tests are annotated');
  const posted = out.calls.find((call) => call.method === 'POST');
  assert.ok(posted.url.endsWith('/repos/o/r/issues/7/comments'));
  const body = JSON.parse(posted.body).body;
  assert.match(body, /blob\/headsha1\/src\/a\.js/);
  assert.match(body, /Tests/);
  assert.match(body, /Trend/);
  assert.match(body, /\| 📈 Lines \| 100\.0% \|/);
});

test('missing optional files are ignored', async () => {
  const { env, options } = workspace();
  Object.assign(env, { INPUT_JUNIT_FILE: 'nope.xml', INPUT_BASELINE_FILE: 'nope.info' });
  assert.equal(await run('comment', options), 0);
  assert.doesNotMatch(readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8'), /🧪 Tests/);
});

test('a pull request without a token does not call the api', async () => {
  const { env, out, options, pullRequest } = workspace();
  pullRequest();
  delete env.GITHUB_TOKEN;
  await run('comment', options);
  assert.deepEqual(out.calls, []);
});

test('history publishes the lcov and appends a point to the previous history', async () => {
  const { env, options } = workspace();
  Object.assign(env, { GITHUB_SHA: 'abc1234' });
  await run('history', options);
  const publish = join(env.RUNNER_TEMP, 'cov-comment-publish');
  assert.equal(readFileSync(join(publish, 'lcov.info'), 'utf8'), LCOV);
  const first = JSON.parse(readFileSync(join(publish, 'history.json'), 'utf8'));
  assert.equal(first.length, 1);
  assert.equal(first[0].sha, 'abc1234');
  assert.equal(first[0].lines, 66.67);
  mkdirSync(join(env.RUNNER_TEMP, 'cov-comment-baseline'));
  writeFileSync(join(env.RUNNER_TEMP, 'cov-comment-baseline/history.json'), JSON.stringify(first));
  env.GITHUB_SHA = 'def5678';
  await run('history', options);
  assert.deepEqual(JSON.parse(readFileSync(join(publish, 'history.json'), 'utf8')).map((point) => point.sha), ['abc1234', 'def5678']);
});

test('badge writes the shields endpoint json', async () => {
  const { env, options } = workspace();
  await run('badge', options);
  const badge = JSON.parse(readFileSync(join(env.RUNNER_TEMP, 'cov-comment-badge/coverage.json'), 'utf8'));
  assert.deepEqual(badge, { schemaVersion: 1, label: 'coverage', message: '67%', color: 'red' });
});

test('gate passes at or above the minimum and fails below it', async () => {
  const { env, out, options } = workspace();
  env.INPUT_MINIMUM_COVERAGE = '66';
  assert.equal(await run('gate', options), 0);
  env.INPUT_MINIMUM_COVERAGE = '90';
  assert.equal(await run('gate', options), 1);
  assert.match(out.errors[0], /Line coverage 66\.67% is below the minimum of 90%/);
  delete env.INPUT_MINIMUM_COVERAGE;
  assert.equal(await run('gate', options), 0);
});

test('the entry point runs a command and exits with its code', () => {
  const { cwd, env } = workspace();
  const entry = new URL('../src/main.js', import.meta.url).pathname;
  const exec = (command, minimum) =>
    spawnSync(process.execPath, [entry, command], { cwd, env: { ...env, INPUT_MINIMUM_COVERAGE: minimum }, encoding: 'utf8' });
  assert.equal(exec('gate', '10').status, 0);
  const failing = exec('gate', '99');
  assert.equal(failing.status, 1);
  assert.match(failing.stderr, /below the minimum of 99%/);
});

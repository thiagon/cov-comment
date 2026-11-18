import { run } from './run.js';

process.exitCode = await run(process.argv[2], {
  env: process.env,
  cwd: process.cwd(),
  fetchImpl: fetch,
  log: console.log,
  error: console.error,
});

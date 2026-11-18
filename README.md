# cov-comment

GitHub Action that turns an lcov file into a sticky PR comment with a coverage badge, per-file table with missing lines and, when a baseline is provided, deltas. It also publishes a single self-contained `coverage.html` as an unzipped artifact that works offline.

No external service and no secrets: it only needs the default `GITHUB_TOKEN`. Runs on any language that can export lcov.

## Usage

```yaml
permissions:
  contents: read
  pull-requests: write

steps:
  - uses: actions/checkout@v7
  - run: mkdir -p coverage
  - run: node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/lcov.info
  - uses: thiagon/cov-comment@main
    with:
      lcov-file: coverage/lcov.info
      minimum-coverage: 100
```

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `lcov-file` | required | Path to the lcov file |
| `baseline-file` | `''` | lcov file from the base branch, enables deltas |
| `junit-file` | `''` | JUnit XML test report; adds the tests table (counts and execution time) and failed test details |
| `title` | `Coverage Report` | Comment and report title |
| `thresholds` | `90,70` | Green and yellow cutoffs in percent, they drive the tier emojis and the badge color |
| `expand-changed-files` | `true` | Start the changed files section of the comment expanded; `false` starts it collapsed |
| `annotations` | `true` | Annotate failed tests and the uncovered lines of changed files in the PR, at most 10 of each kind |
| `badge-branch` | `''` | Branch that receives `coverage.json` on pushes to the baseline branch, for a README badge |
| `minimum-coverage` | `0` | Fail when total line coverage is below this value |
| `hide-fully-covered` | `false` | Hide 100% files from the all files list and the HTML report; changed files are always listed |
| `html-name` | `coverage.html` | HTML report file name, also used as the artifact name |
| `github-token` | `github.token` | Token used to post the comment |

## Outputs

| Output | Description |
| --- | --- |
| `total-coverage` | Total line coverage percentage |
| `report-url` | URL of the HTML report artifact |

## README badge

Set `badge-branch: badges` and give the job `contents: write`. On each push to the baseline branch the action commits a shields endpoint file (`coverage.json`) to that branch. For a public repository:

```markdown
![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/OWNER/REPO/badges/coverage.json)
```

Raw URLs of private repositories need authentication, so the badge only renders for public repositories.

## History

The baseline artifact also carries `history.json` with up to 30 points from the baseline branch. Pull requests render it as a trend line. The chain depends on the artifact retention (90 days by default): if the branch has no push for longer than that, the history restarts.

## Baseline

On a push to `baseline-branch` (default `main`) the action uploads the lcov file as the `cov-comment-baseline` artifact. On pull requests it downloads the one from the latest successful run of the same workflow on that branch and shows deltas. The job needs `actions: read`. Without a previous run the report is shown without deltas; `baseline-file` overrides the automatic lookup.

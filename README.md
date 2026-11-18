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
| `title` | `Coverage Report` | Comment and report title |
| `thresholds` | `90,70` | Green and yellow cutoffs in percent, used for the emojis and the badge color |
| `minimum-coverage` | `0` | Fail when total line coverage is below this value |
| `emojis` | `🟢,🟡,🔴,⚪` | Emojis for green, yellow, red and no data |
| `html-name` | `coverage.html` | HTML report file name, also used as the artifact name |
| `github-token` | `github.token` | Token used to post the comment |

## Outputs

| Output | Description |
| --- | --- |
| `total-coverage` | Total line coverage percentage |
| `report-url` | URL of the HTML report artifact |

## Baseline

On a push to `baseline-branch` (default `main`) the action uploads the lcov file as the `cov-comment-baseline` artifact. On pull requests it downloads the one from the latest successful run of the same workflow on that branch and shows deltas. The job needs `actions: read`. Without a previous run the report is shown without deltas; `baseline-file` overrides the automatic lookup.

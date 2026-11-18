# cov-comment

GitHub Action that turns an lcov file into a sticky pull request comment and a self-contained HTML report, with no external service and no secrets beyond the default `GITHUB_TOKEN`. It works with any language that can export lcov, and optionally reads a JUnit XML report.

## What you get

- **Sticky comment** on the pull request, updated on every push instead of duplicated.
- **Before and after** coverage for lines, functions and branches, compared with the default branch.
- **Changed files table** with statements, misses and links to the uncovered lines at the exact commit.
- **Tests summary** (counts and execution time) when a JUnit XML file is provided.
- **Annotations** for uncovered lines of changed files and for failed tests.
- **Offline HTML report** published as an unzipped artifact, with the source of every file and the covered and uncovered lines highlighted.
- **Trend** of the coverage of the default branch and an optional **README badge**.

Layout of the comment:

```
### 📊 Coverage Report
badge

#### 📈 Summary          Metric | Before | After | Δ | Covered
📉 Trend (last N runs): ▁▃▅▇█ 80.0% → 100.0%
📁 Changed files        File | Stmts | Miss | Before | After | Δ | Missing   (collapsible)
🗂️ Other files          same table for the files that were not changed       (collapsible)
#### 🧪 Tests           Tests | Passed | Skipped | Failures | Errors | Time

📄 Full HTML report
Commit abc1234 · workflow #12
```

## Usage

```yaml
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  pull-requests: write
  actions: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: mkdir -p coverage
      - run: >-
          node --test
          --experimental-test-coverage
          --test-reporter=lcov --test-reporter-destination=coverage/lcov.info
          --test-reporter=junit --test-reporter-destination=coverage/junit.xml
      - uses: thiagon/cov-comment@main
        with:
          lcov-file: coverage/lcov.info
          junit-file: coverage/junit.xml
          minimum-coverage: 90
```

The workflow must also run on `push` to the default branch, because that run is what publishes the baseline that pull requests compare against.

## Inputs

### Files

| Input | Default | Description |
| --- | --- | --- |
| `lcov-file` | required | Path to the lcov file. Several records of the same source file are merged. |
| `junit-file` | `''` | Path to a JUnit XML test report. Adds the tests table and annotates failed tests. |
| `baseline-file` | `''` | Path to an lcov file to compare against, overriding the automatic baseline. |
| `default-branch` | `main` | Branch whose pushes publish the baseline and the history, and that pull requests compare against. |

### Comment

| Input | Default | Description |
| --- | --- | --- |
| `title` | `Coverage Report` | Title of the comment and of the HTML report. |
| `thresholds` | `90,70` | Green and yellow cutoffs in percent. They define the tier emoji (🟢 🟡 🔴) and the badge color. |
| `skip-covered` | `false` | Hide fully covered files (lines, functions and branches at 100%) from the other files list and from the HTML report. Changed files are always listed. |
| `max-files-in-comment` | `100` | Maximum number of files listed in each table. |
| `expand-changed-files` | `true` | Start the changed files section expanded. `false` starts it collapsed. |
| `minimum-coverage` | `0` | Fail the job when the total line coverage is below this percentage. The comment is posted before the job fails. |

### Annotations

| Input | Default | Description |
| --- | --- | --- |
| `annotate-missing-lines` | `true` | Annotate the uncovered lines of the changed files, at most 10. |
| `annotation-type` | `warning` | Level of those annotations: `notice`, `warning` or `error`. |

Failed tests are annotated as errors whenever `junit-file` is set, at most 10, on the test file and line when the report provides them.

### Report and badge

| Input | Default | Description |
| --- | --- | --- |
| `artifact-name` | `coverage.html` | File name of the HTML report, which is also the artifact name. |
| `badge-branch` | `''` | Branch that receives `coverage.json` on pushes to `default-branch`, for a README badge. Empty disables it. |
| `github-token` | `github.token` | Token used to post the comment, find the baseline and push the badge. |

## Outputs

| Output | Description |
| --- | --- |
| `total-coverage` | Total line coverage percentage. |
| `report-url` | URL of the HTML report artifact. |

## How it works

### Baseline

On a push to `default-branch` the action uploads the lcov file, together with the history, as the `cov-comment-baseline` artifact. On a pull request it downloads the one from the latest successful run of the same workflow on that branch and shows the difference. Without a previous run the comment is shown without deltas, and new files show `—` in the Before column. `baseline-file` skips the lookup and uses the file you provide.

### History and trend

The baseline artifact also carries a `history.json` with up to 30 points from the default branch. Pull requests render it as the trend line. The chain depends on the artifact retention (90 days by default): if the default branch has no push for longer than that, the history restarts.

### HTML report

The report is a single `coverage.html` with inline CSS, so it works offline. It is uploaded with `actions/upload-artifact` and `archive: false`, so GitHub serves it as the file itself instead of a zip. On pull requests the changed files come first and expanded, followed by the other files.

### Annotations

Annotations are emitted as workflow commands. Uncovered lines are only annotated for files changed by the pull request, so they do not appear on pushes. Failed tests are annotated on any event. Annotations always show in the Checks tab, and in "Files changed" when the line is part of the diff.

### README badge

Set `badge-branch: badges` and give the job `contents: write`. On each push to `default-branch` the action commits a shields endpoint file to that branch:

```markdown
![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/OWNER/REPO/badges/coverage.json)
```

Raw URLs of private repositories need authentication, so the badge only renders for public repositories. The badge inside the comment is a plain shields URL and works everywhere.

## Permissions

| Permission | Why |
| --- | --- |
| `pull-requests: write` | Post and update the comment. |
| `actions: read` | Find and download the baseline artifact of another run. |
| `contents: write` | Only for `badge-branch`. |

## Limitations

- Coverage is measured on lines, functions and branches as reported by lcov. The "Stmts" and "Miss" columns count lines, because lcov has no notion of statements.
- Paths in the lcov file must be relative to the repository root, or absolute under the workspace. Monorepo setups with one lcov per package are not supported yet.
- The comment marker and the baseline artifact name are fixed, so running the action several times in the same pull request makes the runs overwrite each other.

## License

MIT, see [LICENSE](LICENSE).

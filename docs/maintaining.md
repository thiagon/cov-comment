# Maintaining

## Repository settings

Import the rulesets in `.github/rulesets/` under Settings, Rules, Rulesets, New ruleset, Import a ruleset:

- `protect-main.json`: pull request required, squash only, linear history, the `test` check must pass on an up to date branch, no force push and no deletion, and no bypass actors.
- `protect-release-tags.json`: semver tags (`v1.2.3`) cannot be moved or deleted. The moving major tag (`v1`) is not covered on purpose.

Recommended settings besides the rulesets:

- Merge commits and rebase merges disabled, squash merge only with the PR title as commit message, delete branch on merge.
- Secret scanning with push protection, Dependabot alerts and security updates, private vulnerability reporting.
- Actions: only GitHub owned actions, fork pull request workflows require approval, default workflow permissions read only.

## Releasing

1. Wait for CI to be green on `main`.
2. Tag the commit and push the tag: `git tag v1.0.0 && git push origin v1.0.0`.
3. The `release` workflow checks the tag is on `main`, creates the GitHub Release with generated notes and moves the major tag (`v1`) to the same commit.

Consumers reference `thiagon/cov-comment@v1`, or a full commit SHA for the strictest pinning.

## GitHub Marketplace

The action is not published to the Marketplace. Publishing is a separate, manual step on a release in the GitHub UI, and it needs a unique action name. The `release` workflow never publishes to the Marketplace.

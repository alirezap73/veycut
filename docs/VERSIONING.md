# VeyCut version and commit policy

## Version numbers

The app version comes from `[workspace.package].version` in
[`src/Cargo.toml`](../src/Cargo.toml). Workspace package entries in
`src/Cargo.lock` must agree with it; dependency versions have their own lifecycle.

- Small fixes and modest additions use a patch increment, such as `0.3.0` to
  `0.3.1`, when preparing the next tested release.
- A substantial, documented expansion of capabilities may use a minor increment.
- A major increment requires a major product milestone.
- Further test candidates for the same milestone increment their pre-release
  suffix, such as `-beta.1` to `-beta.2`, when published as separate releases.
- Routine edits, commits, test runs and documentation updates do not change the
  app version. Version numbers do not measure feature coverage or product quality.

Keep development source at **0.3.1** during the current validation. The public experimental
Mac pre-release is **0.3.1-beta.3**, with documented package revisions, checksums
and remaining limitations. A development commit or successful CI run alone is not a beta release.
See [the beta gates](BETA-READINESS.md).

## Commit titles

Describe the concrete change in an imperative title, for example:

- `Fix multi-clip duplicate shortcut`
- `Preserve clip spacing during grouped paste`
- `Document the beta installation checks`

Reserve version numbers in titles for commits whose purpose is preparing an
actual release. Routine titles should not repeat a version number or include
comparisons with other products.

GitHub's file list shows the last commit that changed each file. A historical
title mentioning `0.1.0` stays beside an unchanged file and does not identify the
current app version. Preserve existing history; apply this policy to new commits.
The development branch name `development/0.3.0` is also a historical label, not
the source of the app version.

## Before publication

Record the exact source revision, changes, checks, package checksum and known
limitations in the release evidence. Use the version in the release tag, title
and package metadata. Keep candidate evidence distinct from public downloads.

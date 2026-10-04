# GitHub Actions

Publish **this directory's contents** as the repository root, including the hidden
.github directory and package-lock.json. The workflow must be at
.github/workflows/ci.yml in that repository; it has no sibling-project dependencies.
This follows [GitHub's workflow layout](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).

The workflow runs on pushes, pull requests, and manual dispatch:

- Workflow syntax is checked with checksum-verified actionlint; installed
  ShellCheck also checks embedded shell commands.
- Node 20 (minimum compatibility), 22, and 24 each build and run unit tests.
- Each Node job packs the real npm archive, installs it in an independent temporary
  project, compiles TypeScript against its declarations, and exercises the public
  root, rational, and standalone browser exports.
- Separate Chromium, Firefox, and WebKit jobs install the pinned Playwright browser
  and its system dependencies, then import the bundle and exercise exact queries.
  Installation follows [Playwright's CI guidance](https://playwright.dev/docs/ci).
- The Node 24 job uploads the tested npm archive from artifacts/.

All jobs use Ubuntu 24.04. Actions are pinned to release commit hashes, and the
npm cache uses package-lock.json. The workflow needs only read access to repository
contents and no repository secrets. It neither publishes to npm nor creates
GitHub releases. Download archives from the workflow run's Artifacts section.

Local equivalents:

~~~sh
npm ci --ignore-scripts
npm test
npm run test:package
npm exec -- playwright install --with-deps chromium firefox webkit
npm run test:browser
~~~

Dependency lifecycle scripts are disabled in CI. Bundle compilation and Playwright's
browser/system setup run explicitly, using the pinned dependencies.

To reproduce one browser job, set RATIONAL_BROWSER_ENGINES to chromium, firefox,
or webkit. Missing browsers, failed launches, assertions, and timeouts fail the job.
RATIONAL_BROWSER_PATHS is an optional local executable override; CI uses
Playwright's own version-matched downloads.

The first [GitHub-hosted run](https://github.com/athanclark/rational-map/actions/runs/37240950582)
passed every job, including Node 20/22/24, package installation, and Chromium,
Firefox, and WebKit. Subsequent pushes and pull requests run the same workflow.

Cross-backend checks live in the independent rational-conformance project. Its CI
checks this repository's upstream default branch alongside sqlite-rational and
pgmp, and can select explicit refs without adding sibling dependencies here.

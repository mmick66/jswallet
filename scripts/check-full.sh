#!/bin/sh
# scripts/check-full.sh: every check, scripts/check-fast.sh then the slower suites. tutti runs it once at
# the end of a run.
# tutti init wrote it; it is the project's to edit. Each suite is one command, run from the
# repository's root, and finds its own test files: a new test in an existing suite needs no edit here.
# Each runs in a subshell, ( ), so that a command failing anywhere in it (cd web && npm test) fails
# the script, and its cd leaves the next suite at the root.
# Each suite prints SUITE: <name> as it starts. A suite that reruns a failed test, and passes when
# the rerun does, prints FLAKY: <test> for it: the ticket merges, and tutti warns of it.
set -e
cd "$(dirname "$0")/.."

# from the merge check
printf '%s\n' 'SUITE: scripts/check-fast.sh'
(
scripts/check-fast.sh
)

# dependency audit, from package.json:18
printf '%s\n' 'SUITE: dependency audit'
(
npm run audit
)

# electron-forge make, from package.json:14
printf '%s\n' 'SUITE: electron-forge make'
(
npm run make
)

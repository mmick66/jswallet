#!/bin/sh
# scripts/check-fast.sh: tutti's merge check, run on every ticket before it merges.
# tutti init wrote it; it is the project's to edit. Each suite is one command, run from the
# repository's root, and finds its own test files: a new test in an existing suite needs no edit here.
# Each runs in a subshell, ( ), so that a command failing anywhere in it (cd web && npm test) fails
# the script, and its cd leaves the next suite at the root.
# tutti --overnight's pre-flight runs it on the base's head with TUTTI_CHECK_WHOLE=1: a suite that
# checks only a branch's change since main checks the whole project then, as that change is empty.
# Each suite prints SUITE: <name> as it starts. A suite that reruns a failed test, and passes when
# the rerun does, prints FLAKY: <test> for it: the ticket merges, and tutti warns of it.
set -e
cd "$(dirname "$0")/.."

# eslint, from package.json:16
printf '%s\n' 'SUITE: eslint'
(
npm run lint
)

# vitest tests, from package.json:17
# Under tutti, run no more test files at once than TUTTI_CORES, this run's share of the machine's cores.
printf '%s\n' 'SUITE: vitest tests'
(
npm test -- ${TUTTI_CORES:+--maxWorkers="$TUTTI_CORES"}
)

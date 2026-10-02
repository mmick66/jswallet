// Fails when npm audit reports an advisory against Electron itself.
//
// npm run audit passes --omit=dev, and Electron Forge requires electron in devDependencies, so that
// audit skips the Electron runtime the packaged app ships. This script audits the whole tree but
// only fails on electron's own advisories: the other dev dependencies (Forge, its makers,
// @electron/fuses, Vite) only run at build time.
//
// Usage: node scripts/audit-electron.mjs [--audit-level=<info|low|moderate|high|critical>]
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const Severities = ['info', 'low', 'moderate', 'high', 'critical'];

// The advisories npm audit lists against the electron package. Its "via" entries are either
// advisories (objects) or the names of vulnerable dependencies it inherits them from. electron's own
// dependencies (@electron/get, extract-zip) only download and unpack the binary at install time, so
// those inherited entries don't count.
export const electronAdvisories = (report) => (report.vulnerabilities?.electron?.via ?? [])
    .filter((via) => typeof via === 'object' && via.name === 'electron');

export const atOrAbove = (advisories, level) => advisories
    .filter((advisory) => Severities.indexOf(advisory.severity) >= Severities.indexOf(level));

export function parseLevel(args) {
    const flag = args.find((arg) => arg.startsWith('--audit-level='));
    const level = flag ? flag.slice('--audit-level='.length) : 'high';
    if (!Severities.includes(level)) {
        throw new Error(`Unknown audit level '${level}': use one of ${Severities.join(', ')}`);
    }
    return level;
}

// Runs npm audit --json over the dev dependencies as well (--include=dev overrides an omit=dev from
// .npmrc or NODE_ENV=production). npm audit exits 1 whenever it finds anything, so the exit code
// says nothing here: read the report, and fail if there is none, as npm audit does offline.
function audit() {
    const result = spawnSync('npm', ['audit', '--json', '--include=dev'], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        shell: process.platform === 'win32',
    });
    if (result.error) {
        throw result.error;
    }
    let report;
    try {
        report = JSON.parse(result.stdout);
    } catch {
        throw new Error(`npm audit printed no JSON report (exit ${result.status}): ${result.stderr.trim()}`);
    }
    // A failed audit prints { message, error: { summary, detail } } instead of the vulnerabilities.
    if (report.error || typeof report.vulnerabilities !== 'object') {
        throw new Error(`npm audit failed: ${report.message || report.error?.summary || result.stderr.trim()}`);
    }
    return report;
}

const plural = (count, noun, nouns) => `${count} ${count === 1 ? noun : nouns}`;

const describeAdvisory = (advisory) => `  ${advisory.severity}: ${advisory.title} (electron ${advisory.range}) ${advisory.url}`;

// Prints every advisory against electron, like npm audit does, and returns the exit code: 1 if any
// of them is at or above the level.
export function printReport(advisories, level) {
    const failing = atOrAbove(advisories, level);
    if (advisories.length === 0) {
        console.log('electron: no advisories');
    } else {
        console.log(`electron: ${plural(advisories.length, 'advisory', 'advisories')}, ${failing.length} at or above ${level}`);
        advisories.forEach((advisory) => console.log(describeAdvisory(advisory)));
    }
    if (failing.length > 0) {
        console.log('Update electron to a release that fixes them (npm audit fix, or npm install --save-dev electron@<fixed version>).');
        return 1;
    }
    return 0;
}

function main(args) {
    try {
        const level = parseLevel(args);
        process.exitCode = printReport(electronAdvisories(audit()), level);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main(process.argv.slice(2));
}

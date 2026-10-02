import fs from 'node:fs';
import {
    afterEach, describe, expect, it, vi
} from 'vitest';
import {
    atOrAbove, electronAdvisories, parseLevel, printReport
} from '../scripts/audit-electron.mjs';

const advisory = (severity, title) => ({
    source: 1,
    name: 'electron',
    dependency: 'electron',
    title,
    url: 'https://github.com/advisories/GHSA-xxxx-xxxx-xxxx',
    severity,
    range: '<22.3.6',
});

const contextIsolation = advisory('moderate', 'Electron context isolation bypass via nested unserializable return value');
const cspEval = advisory('high', "Electron's Content-Secrity-Policy disabling eval not applied consistently in renderers with sandbox disabled");

// Trimmed from npm audit --json with electron@22.0.0 in devDependencies.
const vulnerableReport = {
    auditReportVersion: 2,
    vulnerabilities: {
        electron: {
            name: 'electron',
            severity: 'high',
            isDirect: true,
            via: [contextIsolation, cspEval, 'extract-zip'],
            effects: [],
            nodes: ['node_modules/electron'],
            fixAvailable: true,
        },
        'extract-zip': {
            name: 'extract-zip',
            severity: 'high',
            isDirect: false,
            via: [{ ...advisory('critical', 'A dependency of extract-zip'), name: 'yauzl', dependency: 'yauzl' }],
            effects: ['electron'],
            nodes: ['node_modules/extract-zip'],
            fixAvailable: true,
        },
    },
};

describe('electronAdvisories', () => {
    it('lists the advisories against electron itself', () => {
        expect(electronAdvisories(vulnerableReport)).toEqual([contextIsolation, cspEval]);
    });

    it('ignores what electron inherits from its install-time dependencies', () => {
        const inheritedOnly = {
            vulnerabilities: {
                electron: { ...vulnerableReport.vulnerabilities.electron, via: ['extract-zip'] },
            },
        };
        expect(electronAdvisories(inheritedOnly)).toEqual([]);
    });

    it('finds none when electron is not vulnerable', () => {
        expect(electronAdvisories({ auditReportVersion: 2, vulnerabilities: {} })).toEqual([]);
        expect(electronAdvisories({})).toEqual([]);
    });
});

describe('atOrAbove', () => {
    it('keeps the advisories at or above the level', () => {
        const advisories = [contextIsolation, cspEval];
        expect(atOrAbove(advisories, 'high')).toEqual([cspEval]);
        expect(atOrAbove(advisories, 'moderate')).toEqual(advisories);
        expect(atOrAbove(advisories, 'critical')).toEqual([]);
    });
});

describe('parseLevel', () => {
    it('reads --audit-level and defaults to high', () => {
        expect(parseLevel(['--audit-level=moderate'])).toBe('moderate');
        expect(parseLevel([])).toBe('high');
    });

    it('refuses an unknown level', () => {
        expect(() => parseLevel(['--audit-level=severe'])).toThrow("Unknown audit level 'severe'");
        expect(() => parseLevel(['--audit-level='])).toThrow('Unknown audit level');
    });
});

describe('printReport', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('fails on an advisory at or above the level and prints every advisory', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        expect(printReport([contextIsolation, cspEval], 'high')).toBe(1);
        const output = log.mock.calls.flat().join('\n');
        expect(output).toContain('electron: 2 advisories, 1 at or above high');
        expect(output).toContain(contextIsolation.title);
        expect(output).toContain(cspEval.title);
    });

    it('passes when every advisory is below the level', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        expect(printReport([contextIsolation], 'high')).toBe(0);
        expect(log.mock.calls.flat().join('\n')).toContain('electron: 1 advisory, 0 at or above high');
    });

    it('passes when electron has no advisories', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        expect(printReport([], 'high')).toBe(0);
        expect(log).toHaveBeenCalledWith('electron: no advisories');
    });
});

describe('npm run audit', () => {
    it('audits the production tree and Electron at the same level', () => {
        const { scripts } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
        expect(scripts.audit).toBe('npm audit --omit=dev --audit-level=high && node scripts/audit-electron.mjs --audit-level=high');
    });
});

import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import lockfile from '../package-lock.json';

// npm 11.16 warns about install scripts that package.json allowScripts doesn't
// cover, and a later release will block them. CI installs with
// --strict-allow-scripts, but that only sees the CI platform's packages, so
// this checks every package in the lockfile, macOS- and Windows-only ones too.
// Review a new script, then record it with npm approve-scripts <pkg> (pinned
// to the reviewed version) or npm deny-scripts <pkg>.

const nameAt = path => path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);

// An allowScripts key is a bare name or a name pinned to exact versions
// joined by ||, e.g. electron-winstaller@5.4.4 or @scope/pkg@1.0.0 || 1.0.1.
const covers = (key, name, version) => {
    const at = key.indexOf('@', 1);
    const keyName = at === -1 ? key : key.slice(0, at);
    const versions = at === -1 ? '*' : key.slice(at + 1);
    return keyName === name
        && (versions === '*' || versions.split('||').map(v => v.trim()).includes(version));
};

const installScriptPackages = Object.entries(lockfile.packages)
    .filter(([path, entry]) => path !== '' && entry.hasInstallScript)
    .map(([path, entry]) => ({ name: entry.name ?? nameAt(path), version: entry.version }));

describe('allowScripts', () => {
    it('covers every locked package with an install script', () => {
        const keys = Object.keys(packageJson.allowScripts ?? {});
        const unreviewed = installScriptPackages
            .filter(({ name, version }) => !keys.some(key => covers(key, name, version)))
            .map(({ name, version }) => `${name}@${version}`);
        expect(unreviewed).toEqual([]);
    });

    it('matches bare names and exact pinned versions only', () => {
        expect(covers('fsevents', 'fsevents', '2.3.3')).toBe(true);
        expect(covers('electron-winstaller@5.4.4', 'electron-winstaller', '5.4.4')).toBe(true);
        expect(covers('electron-winstaller@5.4.4', 'electron-winstaller', '5.4.5')).toBe(false);
        expect(covers('@scope/pkg@1.0.0 || 1.0.1', '@scope/pkg', '1.0.1')).toBe(true);
        expect(covers('@scope/pkg', '@scope/pkg', '2.0.0')).toBe(true);
        expect(covers('@scope/pkg', '@scope/other', '2.0.0')).toBe(false);
        expect(covers('pkg@^1.0.0', 'pkg', '1.0.0')).toBe(false);
    });
});

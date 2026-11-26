import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import forgeConfig from '../forge.config.mjs';

const root = path.resolve(import.meta.dirname, '..');
const upstreamTemplate = path.join(root, 'node_modules/electron-installer-redhat/resources/spec.ejs');
const rpm = forgeConfig.makers.find(maker => maker.name === 'rpm');
const { specTemplate } = rpm.configOrConfigFetcher.options;

const lines = file => readFileSync(file, 'utf8').split('\n');

describe('rpm spec template', () => {
    it('is the copy in packaging/', () => {
        expect(path.relative(root, specTemplate)).toBe(path.join('packaging', 'rpm.spec.ejs'));
        expect(existsSync(specTemplate)).toBe(true);
    });

    it('copies the staged usr/ from %{_topdir}/BUILD, where rpm 4.20 and later no longer build', () => {
        const install = lines(specTemplate).filter(line => line.startsWith('cp '));
        expect(install).toEqual(["cp <%= process.platform === 'darwin' ? '-R' : '-r' %> %{_topdir}/BUILD/usr/* %{buildroot}/usr/"]);
    });

    // When electron-installer-redhat changes its template, this fails, so the copy is brought up to date
    // (or dropped, once upstream copies from an absolute path).
    it('differs from electron-installer-redhat\'s template only in that line', () => {
        const ours = lines(specTemplate);
        const upstream = lines(upstreamTemplate);
        expect(ours).toHaveLength(upstream.length);
        const changed = ours.map((line, i) => [line, upstream[i]]).filter(([a, b]) => a !== b);
        expect(changed).toEqual([[
            "cp <%= process.platform === 'darwin' ? '-R' : '-r' %> %{_topdir}/BUILD/usr/* %{buildroot}/usr/",
            "cp <%= process.platform === 'darwin' ? '-R' : '-r' %> usr/* %{buildroot}/usr/",
        ]]);
    });
});

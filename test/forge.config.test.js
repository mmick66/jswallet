import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FuseV1Options } from '@electron/fuses';
import forgeConfig from '../forge.config.mjs';
import { devContentSecurityPolicy } from '../vite.renderer.config.mjs';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const pluginNamed = name => forgeConfig.plugins.find(plugin => plugin.name === name);

describe('forge config', () => {
    it('makes squirrel on win32, zip on darwin, and deb and rpm on linux', () => {
        const targets = forgeConfig.makers.map(maker => [maker.name, maker.platformsToMakeOn]);
        expect(targets).toEqual([
            ['squirrel', ['win32']],
            ['zip', ['darwin']],
            ['deb', ['linux']],
            ['rpm', ['linux']],
        ]);
    });

    it('names the squirrel installer jswallet', () => {
        const squirrel = forgeConfig.makers.find(maker => maker.name === 'squirrel');
        expect(squirrel.configOrConfigFetcher).toMatchObject({ name: 'jswallet' });
    });

    it('builds main, preload and the main_window renderer with Vite', () => {
        const { build, renderer } = pluginNamed('vite').config;
        expect(build.map(({ entry, target }) => [entry, target])).toEqual([
            ['src/index.js', 'main'],
            ['src/preload.js', 'preload'],
        ]);
        expect(renderer.map(({ name }) => name)).toEqual(['main_window']);
    });

    it('packages into an ASAR and only loads the app from it', () => {
        expect(forgeConfig.packagerConfig.asar).toBe(true);
        const { fusesConfig } = pluginNamed('fuses');
        expect(fusesConfig[FuseV1Options.RunAsNode]).toBe(false);
        expect(fusesConfig[FuseV1Options.OnlyLoadAppFromAsar]).toBe(true);
        expect(fusesConfig[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]).toBe(true);
    });
});

describe('renderer content security policy', () => {
    it('allows only same-origin scripts in production', () => {
        const csp = indexHtml.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)[1];
        expect(csp).toBe("script-src 'self'");
        expect(indexHtml).toContain('<script type="module" src="/src/renderer.jsx"></script>');
    });

    it('allows the inline Fast Refresh preamble on the dev server only', () => {
        const plugin = devContentSecurityPolicy();
        expect(plugin.apply).toBe('serve');
        expect(plugin.transformIndexHtml(indexHtml)).toContain(`content="script-src 'self' 'unsafe-inline'"`);
    });

    it('fails the dev server when index.html loses its policy', () => {
        expect(() => devContentSecurityPolicy().transformIndexHtml('<head></head>')).toThrow(/Content-Security-Policy/);
    });
});

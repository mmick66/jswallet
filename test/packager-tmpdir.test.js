import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import forgeConfig, { removePrivateTmpdir, usePrivateTmpdir } from '../forge.config.mjs';

describe('private packager tmpdir', () => {
    let parent;

    beforeEach(async () => {
        parent = await mkdtemp(path.join(tmpdir(), 'jswallet-tmpdir-test-'));
    });

    afterEach(async () => {
        await rm(parent, { recursive: true, force: true });
    });

    it('gives each package run a directory of its own', async () => {
        const first = {};
        const second = {};
        await usePrivateTmpdir(first, parent);
        await usePrivateTmpdir(second, parent);
        expect(path.dirname(first.tmpdir)).toBe(parent);
        expect(path.dirname(second.tmpdir)).toBe(parent);
        expect(first.tmpdir).not.toBe(second.tmpdir);
        expect((await stat(first.tmpdir)).isDirectory()).toBe(true);
    });

    it('removes the directory and what the packager left in it', async () => {
        const packagerConfig = {};
        await usePrivateTmpdir(packagerConfig, parent);
        await writeFile(path.join(packagerConfig.tmpdir, 'left-over'), '');
        await removePrivateTmpdir(packagerConfig);
        expect(await readdir(parent)).toEqual([]);
        expect(packagerConfig).not.toHaveProperty('tmpdir');
    });

    it('leaves a config without a private tmpdir alone', async () => {
        const packagerConfig = { tmpdir: false };
        await removePrivateTmpdir(packagerConfig);
        expect(packagerConfig).toEqual({ tmpdir: false });
    });

    it('sets it up before packaging and removes it after', async () => {
        const config = { packagerConfig: {} };
        await forgeConfig.hooks.prePackage(config, 'linux', 'x64');
        const dir = config.packagerConfig.tmpdir;
        expect((await stat(dir)).isDirectory()).toBe(true);
        await forgeConfig.hooks.postPackage(config, { platform: 'linux', outputPaths: [] });
        await expect(stat(dir)).rejects.toMatchObject({ code: 'ENOENT' });
        expect(config.packagerConfig).not.toHaveProperty('tmpdir');
    });
});

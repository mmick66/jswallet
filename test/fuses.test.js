import { describe, expect, it } from 'vitest';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import forgeConfig from '../forge.config.mjs';

const { fusesConfig } = forgeConfig.plugins.find(plugin => plugin.name === 'fuses');
const fuseNames = Object.keys(FuseV1Options).filter(key => Number.isNaN(Number(key)));

describe('electron fuses', () => {
    it('sets every fuse that @electron/fuses knows', () => {
        const unset = fuseNames.filter(name => typeof fusesConfig[FuseV1Options[name]] !== 'boolean');
        expect(unset).toEqual([]);
    });

    it('fails the package when the Electron binary has a fuse that is not set', () => {
        expect(fusesConfig.version).toBe(FuseVersion.V1);
        expect(fusesConfig.strictlyRequireAllFuses).toBe(true);
    });

    it('turns off running as Node, NODE_OPTIONS and --inspect', () => {
        expect(fusesConfig[FuseV1Options.RunAsNode]).toBe(false);
        expect(fusesConfig[FuseV1Options.EnableNodeOptionsEnvironmentVariable]).toBe(false);
        expect(fusesConfig[FuseV1Options.EnableNodeCliInspectArguments]).toBe(false);
    });

    it('takes away the extra privileges of file:// pages', () => {
        expect(fusesConfig[FuseV1Options.GrantFileProtocolExtraPrivileges]).toBe(false);
    });

    it('matches the decided value of each fuse', () => {
        const wire = Object.fromEntries(fuseNames.map(name => [name, fusesConfig[FuseV1Options[name]]]));
        expect(wire).toEqual({
            RunAsNode: false,
            EnableCookieEncryption: true,
            EnableNodeOptionsEnvironmentVariable: false,
            EnableNodeCliInspectArguments: false,
            EnableEmbeddedAsarIntegrityValidation: true,
            OnlyLoadAppFromAsar: true,
            LoadBrowserProcessSpecificV8Snapshot: false,
            GrantFileProtocolExtraPrivileges: false,
            WasmTrapHandlers: true,
        });
    });
});

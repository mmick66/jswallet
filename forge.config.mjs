import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * macOS signing, from the environment (the release workflow sets these from its secrets; see jswallet-kvl).
 * APPLE_SIGNING_IDENTITY is a Developer ID Application identity in the keychain, such as
 * "Developer ID Application: Jane Doe (TEAMID)". With it the packager signs the app with the hardened
 * runtime (@electron/osx-sign's default entitlements for Electron). With an App Store Connect API key
 * as well (APPLE_API_KEY: path to the .p8 file, APPLE_API_KEY_ID, APPLE_API_ISSUER) it notarizes the app.
 */
export const macSigning = (env = process.env) => {
    if (!env.APPLE_SIGNING_IDENTITY) return {};
    const signing = { osxSign: { identity: env.APPLE_SIGNING_IDENTITY } };
    if (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) {
        signing.osxNotarize = {
            appleApiKey: env.APPLE_API_KEY,
            appleApiKeyId: env.APPLE_API_KEY_ID,
            appleApiIssuer: env.APPLE_API_ISSUER,
        };
    }
    return signing;
};

/**
 * Without a Developer ID, the app keeps an ad-hoc signature, which has to be renewed after packaging:
 * the fuses plugin signs ad hoc as it flips the fuses, and the packager writes Info.plist (with the ASAR
 * integrity digest) after that, which breaks the signature. macOS calls a downloaded app with a broken
 * signature damaged, and offers no way to open it; an intact ad-hoc signature gets "Open Anyway".
 */
export const resignAdHoc = async (outputPaths, exec = run) => {
    for (const dir of outputPaths) {
        const apps = (await readdir(dir)).filter((name) => name.endsWith('.app'));
        for (const app of apps) {
            const bundle = path.join(dir, app);
            await exec('codesign', ['--force', '--deep', '--sign', '-', bundle]);
            await exec('codesign', ['--verify', '--deep', '--strict', bundle]);
        }
    }
};

const config = {
    packagerConfig: {
        asar: true,
        ...macSigning(),
    },
    rebuildConfig: {},
    hooks: {
        postPackage: async (forgeConfig, { platform, outputPaths }) => {
            if (platform === 'darwin' && !forgeConfig.packagerConfig.osxSign) await resignAdHoc(outputPaths);
        },
    },
    makers: [
        new MakerSquirrel({ name: 'jswallet' }, ['win32']),
        new MakerZIP({}, ['darwin']),
        new MakerDeb({}, ['linux']),
        new MakerRpm({}, ['linux']),
    ],
    plugins: [
        new VitePlugin({
            // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
            build: [
                {
                    // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
                    entry: 'src/index.js',
                    config: 'vite.main.config.mjs',
                    target: 'main',
                },
                {
                    entry: 'src/preload.js',
                    config: 'vite.preload.config.mjs',
                    target: 'preload',
                },
            ],
            renderer: [
                {
                    name: 'main_window',
                    config: 'vite.renderer.config.mjs',
                },
            ],
        }),
        // Fuses switch Electron features on or off in the packaged binary, before code signing.
        // Every fuse of the wire is set here on purpose: see https://www.electronjs.org/docs/latest/tutorial/fuses
        new FusesPlugin({
            version: FuseVersion.V1,
            // Fail the package when Electron's wire has a fuse that @electron/fuses does not know yet,
            // so a new fuse gets a decision instead of its default.
            strictlyRequireAllFuses: true,
            // ELECTRON_RUN_AS_NODE, NODE_OPTIONS, NODE_EXTRA_CA_CERTS, --inspect and SIGUSR1 would let
            // anyone who can launch the binary run code under the app's identity and entitlements.
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            // Load the app only from app.asar, and only when it matches the hash recorded at package time
            // (macOS and Windows).
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
            // The renderer is served from app://jswallet (src/main/security/app-protocol.js), never file://.
            [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
            // Defaults. A browser-process snapshot needs a browser_v8_context_snapshot.bin that the build
            // does not make; turning off the Wasm trap handlers only makes WebAssembly slower.
            [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
            [FuseV1Options.WasmTrapHandlers]: true,
        }),
    ],
};

export default config;

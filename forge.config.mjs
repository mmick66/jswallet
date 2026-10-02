import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config = {
    packagerConfig: {
        asar: true,
    },
    rebuildConfig: {},
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

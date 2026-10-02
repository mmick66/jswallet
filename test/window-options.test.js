import { fileURLToPath } from 'node:url';
import {
    afterAll, beforeAll, describe, expect, it, vi
} from 'vitest';
import mainWindowOptions from '../src/main/security/window-options';

const electron = vi.hoisted(() => {
    let ready;
    const app = {
        isPackaged: true,
        quit: vi.fn(),
        on: vi.fn(),
        getPath: vi.fn(() => '/userData'),
        enableSandbox: vi.fn(),
        whenReady: vi.fn(() => new Promise((resolve) => {
            ready = resolve;
        })),
    };
    return {
        app,
        becomeReady: () => ready(),
        BrowserWindow: vi.fn(function BrowserWindow() {
            this.loadURL = vi.fn();
            this.loadFile = vi.fn();
            this.on = vi.fn();
        }),
        clipboard: { writeText: vi.fn() },
        ipcMain: { handle: vi.fn() },
        net: { fetch: vi.fn() },
        protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
        session: {
            defaultSession: {
                setPermissionRequestHandler: vi.fn(),
                setPermissionCheckHandler: vi.fn(),
                setDevicePermissionHandler: vi.fn(),
                webRequest: { onHeadersReceived: vi.fn() },
            },
        },
    };
});

vi.mock('electron', () => electron);
vi.mock('electron-squirrel-startup', () => ({ default: false }));
vi.mock('electron-devtools-installer', () => ({ default: vi.fn(), REACT_DEVELOPER_TOOLS: {} }));
vi.mock('../src/main/storage', () => ({ databaseDirectory: vi.fn(() => '/userData/db'), migrateLegacyDatabase: vi.fn() }));
vi.mock('../src/main/wallet.class', () => ({ default: { open: vi.fn(), Defaults: { DBFileName: 'wallets' } } }));

describe('mainWindowOptions', () => {
    const { webPreferences } = mainWindowOptions({ preload: '/app/preload.cjs' });

    it.each([
        ['nodeIntegration', false],
        ['nodeIntegrationInWorker', false],
        ['nodeIntegrationInSubFrames', false],
        ['contextIsolation', true],
        ['sandbox', true],
        ['webSecurity', true],
        ['allowRunningInsecureContent', false],
        ['experimentalFeatures', false],
        ['webviewTag', false],
    ])('sets %s to %s', (option, value) => {
        expect(webPreferences[option]).toBe(value);
    });

    it('enables no Blink features', () => {
        expect(webPreferences).not.toHaveProperty('enableBlinkFeatures');
    });

    it('sets no other webPreferences than the preload script', () => {
        expect(Object.keys(webPreferences).sort()).toEqual([
            'allowRunningInsecureContent', 'contextIsolation', 'experimentalFeatures', 'nodeIntegration',
            'nodeIntegrationInSubFrames', 'nodeIntegrationInWorker', 'preload', 'sandbox', 'webSecurity', 'webviewTag',
        ]);
        expect(webPreferences.preload).toBe('/app/preload.cjs');
    });
});

describe('main process', () => {
    // Vitest clears mocks before each test, so note the calls that loading src/index.js makes
    let loadCalls;

    beforeAll(async () => {
        vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', 'http://localhost:5173');
        vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');
        await import('../src'); // src/index.js
        const { enableSandbox, whenReady } = electron.app;
        loadCalls = { enableSandbox: [...enableSandbox.mock.invocationCallOrder], whenReady: [...whenReady.mock.invocationCallOrder] };
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it('sandboxes every renderer before the app is ready', () => {
        const { enableSandbox, whenReady } = loadCalls;
        expect(enableSandbox).toHaveLength(1);
        expect(whenReady).toHaveLength(1);
        expect(enableSandbox[0]).toBeLessThan(whenReady[0]);
    });

    it('opens the main window with mainWindowOptions', async () => {
        electron.becomeReady();
        await vi.waitFor(() => expect(electron.BrowserWindow).toHaveBeenCalledTimes(1));
        const preload = fileURLToPath(new URL('../src/preload.cjs', import.meta.url));
        expect(electron.BrowserWindow).toHaveBeenCalledWith(mainWindowOptions({ preload }));
    });
});

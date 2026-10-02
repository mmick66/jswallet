import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
    afterAll, beforeAll, describe, expect, it, vi
} from 'vitest';
import {
    APP_INDEX_URL, APP_ORIGIN, appProtocolHandler, handleAppProtocol, registerAppScheme, resolveAppPath
} from '../src/main/security/app-protocol';

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
        // Answers with the URL it fetched, to tell which file was served
        net: { fetch: vi.fn(url => Promise.resolve(new Response(url))) },
        protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
        session: {
            defaultSession: {
                setPermissionRequestHandler: vi.fn(),
                setPermissionCheckHandler: vi.fn(),
                setDevicePermissionHandler: vi.fn(),
            },
        },
    };
});

vi.mock('electron', () => electron);
vi.mock('electron-squirrel-startup', () => ({ default: false }));
vi.mock('electron-devtools-installer', () => ({ default: vi.fn(), REACT_DEVELOPER_TOOLS: {} }));
vi.mock('../src/main/storage', () => ({ databaseDirectory: vi.fn(() => '/userData/db'), migrateLegacyDatabase: vi.fn() }));
vi.mock('../src/main/wallet.class', () => ({ default: { open: vi.fn(), Defaults: { DBFileName: 'wallets' } } }));

const PRIVILEGES = { standard: true, secure: true, supportFetchAPI: true };

describe('the app: scheme', () => {

    it('has the origin app://jswallet and loads its index.html', () => {
        expect(APP_ORIGIN).toBe('app://jswallet');
        expect(APP_INDEX_URL).toBe('app://jswallet/index.html');
    });

    it('is registered as a standard, secure scheme that fetch() can use', () => {
        registerAppScheme();
        expect(electron.protocol.registerSchemesAsPrivileged).toHaveBeenCalledExactlyOnceWith([{ scheme: 'app', privileges: PRIVILEGES }]);
    });
});

describe('resolveAppPath', () => {

    describe.each([
        ['POSIX', path.posix, '/app/renderer'],
        ['Windows', path.win32, 'C:\\app\\renderer'],
    ])('on %s', (platform, paths, root) => {
        const under = (...names) => paths.join(root, ...names);

        it.each([
            ['/', ['index.html']],
            ['/index.html', ['index.html']],
            ['/assets/index-B1x2.js', ['assets', 'index-B1x2.js']],
            ['/assets/planet%20(1).png', ['assets', 'planet (1).png']],
            ['/assets/../index.html', ['index.html']],
            ['/..index.html', ['..index.html']], // a name that starts with .., in rendererRoot
            // Absolute paths stay under rendererRoot, where no such file is
            ['//etc/passwd', ['etc', 'passwd']],
            ['/%2Fetc%2Fpasswd', ['etc', 'passwd']],
        ])('resolves %s under rendererRoot', (pathname, names) => {
            expect(resolveAppPath(root, pathname, paths)).toBe(under(...names));
        });

        it.each([
            '/..',
            '/../secret.txt',
            '/../../../etc/passwd',
            '/assets/../../secret.txt',
            '/%2e%2e',
            '/%2e%2e%2fsecret.txt',
            '/%2E%2E%2F%2E%2E%2Fetc%2Fpasswd',
            '/..%2fsecret.txt',
            '/assets%2f..%2f..%2fsecret.txt',
        ])('rejects %s, which leaves rendererRoot', (pathname) => {
            expect(resolveAppPath(root, pathname, paths)).toBeNull();
        });

        it.each(['/%', '/%E0%A4%A', '/index.html%00.png'])('rejects %s, which is not a file name', (pathname) => {
            expect(resolveAppPath(root, pathname, paths)).toBeNull();
        });
    });

    describe('on Windows only', () => {
        const root = 'C:\\app\\renderer';

        it.each([
            '/..%5Csecret.txt',
            '/..%5C..%5CWindows%5Cwin.ini',
            '/assets%5C..%5C..%5Csecret.txt',
            '/%2e%2e%5Csecret.txt',
            '/C:%5CWindows%5Cwin.ini',
            '/D:/secret.txt',
        ])('rejects %s, which leaves rendererRoot', (pathname) => {
            expect(resolveAppPath(root, pathname, path.win32)).toBeNull();
        });

        it('keeps a UNC path under rendererRoot', () => {
            expect(resolveAppPath(root, '/%5C%5Cserver%5Cshare%5Csecret.txt', path.win32)).toBe('C:\\app\\renderer\\server\\share\\secret.txt');
        });
    });

    it('uses the platform\'s path by default', () => {
        expect(resolveAppPath(path.resolve('renderer'), '/')).toBe(path.resolve('renderer', 'index.html'));
    });
});

describe('the app: handler', () => {
    // A renderer build in a temporary directory, next to a file that it must not serve
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jswallet-app-protocol-'));
    const root = path.join(dir, 'renderer');
    const secret = path.join(dir, 'secret.txt');
    const fileUrl = (...names) => pathToFileURL(path.join(root, ...names)).toString();

    beforeAll(() => {
        fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
        fs.writeFileSync(path.join(root, 'index.html'), '<!DOCTYPE html>');
        fs.writeFileSync(path.join(root, 'assets', 'index.js'), '');
        fs.writeFileSync(secret, 'wallets');
    });

    afterAll(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it.each([
        ['app://jswallet/', ['index.html']],
        ['app://jswallet/index.html', ['index.html']],
        ['app://jswallet/assets/index.js?v=1#top', ['assets', 'index.js']],
    ])('serves %s from rendererRoot', async (url, names) => {
        const response = await appProtocolHandler(root)(new Request(url));
        expect(electron.net.fetch).toHaveBeenCalledExactlyOnceWith(fileUrl(...names));
        expect(await response.text()).toBe(fileUrl(...names));
    });

    it.each([
        ['../, which the URL resolves first', 'app://jswallet/../secret.txt'],
        ['%2e%2e%2f', 'app://jswallet/%2e%2e%2fsecret.txt'],
        ['..%2F', 'app://jswallet/assets/..%2F..%2Fsecret.txt'],
        ['an absolute path', `app://jswallet/${encodeURIComponent(secret)}`],
        ['an absolute path', `app://jswallet/${pathToFileURL(secret).pathname}`],
        ['another host', 'app://example/index.html'],
        ['another host', 'app://jswallet.example/index.html'],
        ['a directory', 'app://jswallet/assets'],
        ['a directory', 'app://jswallet/assets/'],
        ['a missing file', 'app://jswallet/missing.js'],
        ['a malformed escape', 'app://jswallet/%E0%A4%A'],
    ])('answers 404 for %s: %s', async (what, url) => {
        const response = await appProtocolHandler(root)(new Request(url));
        expect(response.status).toBe(404);
        expect(electron.net.fetch).not.toHaveBeenCalled();
    });

    it('is the handler of app: once handleAppProtocol is called', async () => {
        handleAppProtocol(root);
        expect(electron.protocol.handle).toHaveBeenCalledExactlyOnceWith('app', expect.any(Function));
        const [[, handler]] = electron.protocol.handle.mock.calls;
        expect(await (await handler(new Request(APP_INDEX_URL))).text()).toBe(fileUrl('index.html'));
    });
});

describe('the packaged main process', () => {
    // Vitest clears mocks before each test, so note the calls that loading src/index.js and the ready app make
    let calls;

    beforeAll(async () => {
        vi.clearAllMocks(); // the calls of the tests above
        vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', undefined);
        vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');
        await import('../src'); // src/index.js
        const { protocol } = electron;
        const beforeReady = {
            register: [...protocol.registerSchemesAsPrivileged.mock.calls],
            registerOrder: [...protocol.registerSchemesAsPrivileged.mock.invocationCallOrder],
            whenReadyOrder: [...electron.app.whenReady.mock.invocationCallOrder],
            handle: protocol.handle.mock.calls.length,
        };
        electron.becomeReady();
        await vi.waitFor(() => expect(electron.BrowserWindow).toHaveBeenCalledTimes(1));
        const [window] = electron.BrowserWindow.mock.instances;
        calls = {
            beforeReady,
            handle: [...protocol.handle.mock.calls],
            handleOrder: [...protocol.handle.mock.invocationCallOrder],
            loadURL: [...window.loadURL.mock.calls],
            loadURLOrder: [...window.loadURL.mock.invocationCallOrder],
            loadFile: [...window.loadFile.mock.calls],
        };
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it('makes app: privileged before the app is ready', () => {
        const { register, registerOrder, whenReadyOrder } = calls.beforeReady;
        expect(register).toEqual([[[{ scheme: 'app', privileges: PRIVILEGES }]]]);
        expect(registerOrder[0]).toBeLessThan(whenReadyOrder[0]);
    });

    it('serves app: once the app is ready, before the window loads', () => {
        expect(calls.beforeReady.handle).toBe(0);
        expect(calls.handle).toEqual([['app', expect.any(Function)]]);
        expect(calls.handleOrder[0]).toBeLessThan(calls.loadURLOrder[0]);
    });

    it('loads app://jswallet/index.html, not a file', () => {
        expect(calls.loadURL).toEqual([['app://jswallet/index.html']]);
        expect(calls.loadFile).toEqual([]);
    });

    it('serves the renderer build of main_window', async () => {
        // The build is not there in a test, so take any path for a file
        const stat = vi.spyOn(fs.promises, 'stat').mockResolvedValue({ isFile: () => true });
        try {
            const [[, handler]] = calls.handle;
            await handler(new Request('app://jswallet/assets/index.js'));
        } finally {
            stat.mockRestore();
        }
        const file = fileURLToPath(new URL('../renderer/main_window/assets/index.js', import.meta.url));
        expect(electron.net.fetch).toHaveBeenCalledExactlyOnceWith(pathToFileURL(file).toString());
    });
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    afterAll, beforeAll, beforeEach, describe, expect, it, vi
} from 'vitest';
import Channels from '../src/common/ipc.channels';
import * as check from '../src/main/ipc.arguments';
import { createIpcHandle, RefusedMessage, senderProblem } from '../src/main/security/ipc';

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
            this.webContents = { mainFrame: null };
            // The main frame has the origin of the page that main loads. app: is a standard scheme,
            // so Chromium gives it the origin scheme://host; Node's URL would say 'null'.
            this.loadURL = vi.fn((url) => {
                this.webContents.mainFrame = { origin: url.match(/^[a-z]+:\/\/[^/]+/)[0], url };
            });
            this.on = vi.fn();
            this.isDestroyed = vi.fn(() => false);
        }),
        clipboard: { writeText: vi.fn() },
        ipcMain: { handle: vi.fn(), on: vi.fn() },
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
vi.mock('../src/main/wallet.class', () => ({
    default: { open: vi.fn(), all: vi.fn(async () => []), Defaults: { DBFileName: 'wallets' } },
}));

const ORIGIN = 'app://jswallet';
const DEV_ORIGIN = 'http://localhost:5173';
const RECEIVER = 'tb1qur7330emxypadqvr0mu4989sfzw32gpkxgyd2m';

// WebFrameMain as far as the checks read it
const frame = (origin, url = `${origin}/index.html`) => ({ origin, url });

describe('senderProblem', () => {
    const main = frame(ORIGIN);

    it('accepts the top frame of the main window', () => {
        expect(senderProblem(main, main, ORIGIN)).toBeNull();
    });

    it.each([
        ['a frame that has navigated or is gone', null],
        ['a frame of another origin', frame('https://example.com')],
        ['the dev server in the packaged app', frame(DEV_ORIGIN)],
        ['a file:// page, whose origin is null', frame('null', 'file:///Users/me/Downloads/page.html')],
        ['a subframe of the same origin', frame(ORIGIN, `${ORIGIN}/frame.html`)],
        ['another window on the same page', frame(ORIGIN)],
    ])('refuses %s', (_name, sender) => {
        expect(senderProblem(sender, main, ORIGIN)).toEqual(expect.any(String));
    });

    it('refuses even the main frame when there is no main window', () => {
        expect(senderProblem(main, null, ORIGIN)).toEqual(expect.any(String));
    });

    it('takes the dev server origin in development', () => {
        const dev = frame(DEV_ORIGIN);
        expect(senderProblem(dev, dev, DEV_ORIGIN)).toBeNull();
        expect(senderProblem(dev, dev, ORIGIN)).toEqual(expect.any(String));
    });
});

describe('createIpcHandle', () => {
    const main = frame(ORIGIN);
    let ipcMain;
    let log;
    let mainFrame;
    let handle;

    // Calls a channel's listener as Electron does, with the event first
    const invoke = (channel, senderFrame, ...args) => ipcMain.handle.mock.calls
        .find(([c]) => c === channel)[1]({ senderFrame }, ...args);

    beforeEach(() => {
        ipcMain = { handle: vi.fn() };
        log = vi.fn();
        mainFrame = main;
        handle = createIpcHandle({
            ipcMain, getMainFrame: () => mainFrame, origin: ORIGIN, log,
        });
    });

    describe('with the schema of createWallet', () => {
        const schema = check.object({ name: check.text(check.Limits.Name), password: check.text(check.Limits.Password) });
        let schemaSpy;
        let fn;

        beforeEach(() => {
            schemaSpy = vi.fn(schema);
            fn = vi.fn(async ({ name }) => ({ created: name }));
            handle(Channels.CreateWallet, schemaSpy, fn);
        });

        it('registers the channel with ipcMain.handle', () => {
            expect(ipcMain.handle).toHaveBeenCalledExactlyOnceWith(Channels.CreateWallet, expect.any(Function));
        });

        it('accepts the main frame with valid arguments, and passes the handler only those', async () => {
            await expect(invoke(Channels.CreateWallet, main, { name: 'New', password: 'pw', extra: 1 }))
                .resolves.toEqual({ created: 'New' });
            expect(fn).toHaveBeenCalledExactlyOnceWith({ name: 'New', password: 'pw' });
            expect(log).not.toHaveBeenCalled();
        });

        it.each([
            ['a null frame', null],
            ['a wrong origin', frame('https://example.com')],
            ['a subframe', frame(ORIGIN, `${ORIGIN}/frame.html`)],
        ])('rejects %s with a generic error, before it reads the arguments', async (_name, sender) => {
            await expect(invoke(Channels.CreateWallet, sender, { name: 'New', password: 'pw' }))
                .rejects.toThrow(new Error(RefusedMessage));
            expect(schemaSpy).not.toHaveBeenCalled();
            expect(fn).not.toHaveBeenCalled();
            expect(log).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(`Refused IPC ${Channels.CreateWallet}: `));
        });

        it('logs why, but never the arguments', async () => {
            await invoke(Channels.CreateWallet, frame('https://example.com'), { name: 'New', password: 'secret' }).catch(() => {});
            const [[message]] = log.mock.calls;
            expect(message).toContain('https://example.com');
            expect(message).not.toContain('secret');
        });

        it('rejects invalid arguments from the main frame with the TypeError of the schema', async () => {
            await expect(invoke(Channels.CreateWallet, main, { name: '', password: 'pw' })).rejects.toThrow(TypeError);
            await expect(invoke(Channels.CreateWallet, main)).rejects.toThrow('Invalid argument: expected an object');
            expect(fn).not.toHaveBeenCalled();
        });

        it('rejects more than one argument', async () => {
            await expect(invoke(Channels.CreateWallet, main, { name: 'New', password: 'pw' }, 'extra')).rejects.toThrow(TypeError);
            expect(fn).not.toHaveBeenCalled();
        });

        it('asks for the main frame on every call, as the window can be reopened', async () => {
            mainFrame = null;
            await expect(invoke(Channels.CreateWallet, main, { name: 'New', password: 'pw' })).rejects.toThrow(RefusedMessage);

            const reopened = frame(ORIGIN);
            mainFrame = reopened;
            await expect(invoke(Channels.CreateWallet, main, { name: 'New', password: 'pw' })).rejects.toThrow(RefusedMessage);
            await expect(invoke(Channels.CreateWallet, reopened, { name: 'New', password: 'pw' })).resolves.toEqual({ created: 'New' });
        });

        it('rejects a frame that throws when it is read', async () => {
            const disposed = { get origin() { throw new Error('Render frame was disposed'); } };
            await expect(invoke(Channels.CreateWallet, disposed, { name: 'New', password: 'pw' })).rejects.toThrow(new Error(RefusedMessage));
            expect(log).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Render frame was disposed'));
        });
    });

    it('rejects an argument for a channel that takes none', async () => {
        const fn = vi.fn(async () => 'ok');
        handle(Channels.ListWallets, check.none, fn);
        await expect(invoke(Channels.ListWallets, main)).resolves.toBe('ok');
        await expect(invoke(Channels.ListWallets, main, 'extra')).rejects.toThrow('Invalid argument: expected none');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('validates addresses for the network', async () => {
        const fn = vi.fn(async (address) => address);
        handle(Channels.RefreshWallet, check.address, fn);
        await expect(invoke(Channels.RefreshWallet, main, RECEIVER)).resolves.toBe(RECEIVER);
        await expect(invoke(Channels.RefreshWallet, main, '1BoatSLRHtKNngkdXEeobR76b53LETtpyT')).rejects.toThrow(TypeError);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('refuses to register a channel without a schema', () => {
        expect(() => handle(Channels.ListWallets, undefined, vi.fn())).toThrow(TypeError);
        expect(ipcMain.handle).not.toHaveBeenCalled();
    });
});

describe('IPC registrations', () => {
    const src = fileURLToPath(new URL('../src', import.meta.url));
    const sources = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) return sources(file);
        return /\.(c|m)?jsx?$/.test(entry.name) ? [file] : [];
    });

    it('go through src/main/security/ipc.js only', () => {
        const callers = sources(src).filter((file) => /ipcMain\.(handle|on)\(/.test(fs.readFileSync(file, 'utf8')));
        expect(callers.map((file) => path.relative(src, file))).toEqual([path.join('main', 'security', 'ipc.js')]);
    });
});

describe.each([
    ['packaged', undefined, ORIGIN, DEV_ORIGIN],
    ['in development', `${DEV_ORIGIN}/`, DEV_ORIGIN, ORIGIN],
])('the main process, %s,', (_mode, devServerUrl, origin, otherOrigin) => {
    let window;
    // Vitest clears mocks before each test, so note what loading src/index.js registers
    let listeners;
    let onCalls;

    // The listener that src/index.js registered for a channel, called as Electron does
    const invoke = (channel, senderFrame, ...args) => listeners.get(channel)({ senderFrame }, ...args);

    beforeAll(async () => {
        vi.resetModules();
        vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', devServerUrl);
        vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        electron.BrowserWindow.mockClear();
        electron.ipcMain.handle.mockClear();
        electron.ipcMain.on.mockClear();
        await import('../src'); // src/index.js
        electron.becomeReady();
        await vi.waitFor(() => expect(electron.BrowserWindow).toHaveBeenCalledTimes(1));
        [window] = electron.BrowserWindow.mock.instances;
        listeners = new Map(electron.ipcMain.handle.mock.calls);
        onCalls = electron.ipcMain.on.mock.calls.length;
    });

    afterAll(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('registers every channel through the helper', () => {
        expect([...listeners.keys()].sort()).toEqual(Object.values(Channels).sort());
        expect(onCalls).toBe(0);
    });

    it('answers the top frame of the main window, on the page it loaded', async () => {
        expect(window.webContents.mainFrame.origin).toBe(origin);
        await expect(invoke(Channels.ListWallets, window.webContents.mainFrame)).resolves.toEqual([]);
    });

    it.each([
        ['a subframe', () => frame(origin, `${origin}/frame.html`)],
        ['the other origin', () => frame(otherOrigin)],
        ['no frame', () => null],
    ])('refuses %s', async (_name, sender) => {
        await expect(invoke(Channels.ListWallets, sender())).rejects.toThrow(new Error(RefusedMessage));
    });

    it('refuses the frame of a window that has been destroyed', async () => {
        window.isDestroyed.mockReturnValue(true);
        await expect(invoke(Channels.ListWallets, window.webContents.mainFrame)).rejects.toThrow(new Error(RefusedMessage));
        window.isDestroyed.mockReturnValue(false);
    });
});

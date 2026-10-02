import {
    afterAll, beforeAll, describe, expect, it, vi
} from 'vitest';
import { AllowedPermissions, isPermissionAllowed, registerPermissionHandlers } from '../src/main/security/permissions';

const electron = vi.hoisted(() => {
    let ready;
    const app = {
        isPackaged: false,
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
            },
        },
    };
});

vi.mock('electron', () => electron);
vi.mock('electron-squirrel-startup', () => ({ default: false }));
vi.mock('electron-devtools-installer', () => ({ default: vi.fn(), REACT_DEVELOPER_TOOLS: {} }));
vi.mock('../src/main/storage', () => ({ databaseDirectory: vi.fn(() => '/userData/db'), migrateLegacyDatabase: vi.fn() }));
vi.mock('../src/main/wallet.class', () => ({ default: { open: vi.fn(), Defaults: { DBFileName: 'wallets' } } }));

const APP = 'app://jswallet';
const DEV = 'http://localhost:5173';
const CLIPBOARD = 'clipboard-sanitized-write';

// Every permission that Electron 44 passes to the request and check handlers (electron.d.ts), but the clipboard write
const DENIED = [
    'ar', 'automatic-fullscreen', 'background-fetch', 'background-sync', 'captured-surface-control', 'clipboard-read',
    'deprecated-sync-clipboard-read', 'display-capture', 'fileSystem', 'fullscreen', 'geolocation',
    'geolocation-approximate', 'hand-tracking', 'hid', 'idle-detection', 'keyboardLock', 'local-fonts', 'local-network',
    'local-network-access', 'loopback-network', 'media', 'mediaKeySystem', 'midi', 'midiSysex', 'nfc', 'notifications',
    'openExternal', 'payment-handler', 'periodic-background-sync', 'persistent-storage', 'pointerLock',
    'screen-wake-lock', 'sensors', 'serial', 'smart-card', 'speaker-selection', 'storage-access', 'system-wake-lock',
    'top-level-storage-access', 'usb', 'vr', 'web-app-installation', 'web-printing', 'window-management', 'unknown',
];

// A Session as far as registerPermissionHandlers uses it, and the handlers that it was given
const fakeSession = () => {
    const handlers = {};
    const session = {
        setPermissionRequestHandler: vi.fn((handler) => { handlers.request = handler; }),
        setPermissionCheckHandler: vi.fn((handler) => { handlers.check = handler; }),
        setDevicePermissionHandler: vi.fn((handler) => { handlers.device = handler; }),
    };
    return { session, handlers };
};

// Asks the request handler like Electron does, and answers what it granted
const request = (handlers, permission, requestingUrl) => {
    const callback = vi.fn();
    handlers.request({}, permission, callback, { requestingUrl, isMainFrame: true });
    expect(callback).toHaveBeenCalledOnce();
    return callback.mock.calls[0][0];
};

describe('isPermissionAllowed', () => {

    it('allows only the clipboard write', () => {
        expect(AllowedPermissions).toEqual([CLIPBOARD]);
    });

    it.each([APP, `${APP}/`, `${APP}/index.html`, `${APP}/index.html?x=1#top`])('allows %s to write the clipboard', (origin) => {
        expect(isPermissionAllowed(CLIPBOARD, origin)).toBe(true);
    });

    it.each([DEV, `${DEV}/`, `${DEV}/index.html`])('allows %s to write the clipboard when the renderer is on the dev server', (origin) => {
        expect(isPermissionAllowed(CLIPBOARD, origin, DEV)).toBe(true);
        expect(isPermissionAllowed(CLIPBOARD, origin, `${DEV}/`)).toBe(true);
    });

    it.each(DENIED)('denies %s to the renderer', (permission) => {
        expect(isPermissionAllowed(permission, APP)).toBe(false);
        expect(isPermissionAllowed(permission, DEV, DEV)).toBe(false);
    });

    it.each(['', 'Clipboard-Sanitized-Write', 'clipboard-write', undefined])('denies an unknown permission: %s', (permission) => {
        expect(isPermissionAllowed(permission, APP)).toBe(false);
    });

    it.each([
        ['the dev server, once packaged', DEV, undefined],
        ['the app, in dev', APP, DEV],
        ['another port of the dev server', 'http://localhost:5174', DEV],
        ['https: on the dev server host', 'https://localhost:5173', DEV],
        ['a host that starts with the dev server host', 'http://localhost.evil.com:5173', DEV],
        ['another app: host', 'app://evil', undefined],
        ['a host that starts with the app host', 'app://jswallet.example', undefined],
        ['a website', 'https://example.com', undefined],
        ['a file', 'file:///Users/me/Downloads/page.html', undefined],
        ['a data: URL', 'data:text/html,<p>hi</p>', undefined],
        ['a blob: URL', `blob:${APP}/0b1d1e52-77d4-4b8c-9d43-2a9a5d6c3f1e`, undefined],
        ['the DevTools frontend', 'devtools://devtools', undefined],
        ['an extension', 'chrome-extension://fmkadmapgofadopljbjfkapdkoienihi', undefined],
        ['an opaque origin', 'null', undefined],
        ['no origin', '', undefined],
        ['no origin', undefined, undefined],
    ])('denies the clipboard write to %s', (_name, origin, rendererOrigin) => {
        expect(isPermissionAllowed(CLIPBOARD, origin, rendererOrigin)).toBe(false);
    });

    it('denies everything when the renderer origin is not a URL', () => {
        expect(isPermissionAllowed(CLIPBOARD, 'null', 'null')).toBe(false);
        expect(isPermissionAllowed(CLIPBOARD, '', '')).toBe(false);
        expect(isPermissionAllowed(CLIPBOARD, undefined, undefined)).toBe(false);
    });
});

describe('registerPermissionHandlers', () => {

    it('answers permission requests by the URL of the requesting frame', () => {
        const { session, handlers } = fakeSession();
        registerPermissionHandlers(session);
        expect(request(handlers, CLIPBOARD, `${APP}/index.html`)).toBe(true);
        expect(request(handlers, CLIPBOARD, 'https://example.com/')).toBe(false);
        expect(request(handlers, CLIPBOARD, undefined)).toBe(false);
        expect(request(handlers, 'geolocation', `${APP}/index.html`)).toBe(false);
        expect(request(handlers, 'media', `${APP}/index.html`)).toBe(false);
        expect(request(handlers, 'notifications', `${APP}/index.html`)).toBe(false);
    });

    it('answers permission checks, which bypass the request handler', () => {
        const { session, handlers } = fakeSession();
        registerPermissionHandlers(session);
        expect(handlers.check(null, CLIPBOARD, APP, { isMainFrame: true })).toBe(true);
        expect(handlers.check(null, CLIPBOARD, `${APP}/`, { isMainFrame: true })).toBe(true);
        expect(handlers.check(null, CLIPBOARD, 'https://example.com/', { isMainFrame: true })).toBe(false);
        expect(handlers.check(null, 'notifications', APP, { isMainFrame: true })).toBe(false);
        expect(handlers.check(null, 'media', APP, { isMainFrame: true, mediaType: 'video' })).toBe(false);
    });

    it.each(['hid', 'serial', 'usb'])('denies every %s device, even to the renderer', (deviceType) => {
        const { session, handlers } = fakeSession();
        registerPermissionHandlers(session);
        expect(handlers.device({ deviceType, origin: APP, device: {} })).toBe(false);
    });

    it('allows the dev server origin in place of the app origin', () => {
        const { session, handlers } = fakeSession();
        registerPermissionHandlers(session, { rendererOrigin: DEV });
        expect(request(handlers, CLIPBOARD, `${DEV}/`)).toBe(true);
        expect(request(handlers, CLIPBOARD, `${APP}/index.html`)).toBe(false);
        expect(handlers.check(null, CLIPBOARD, `${DEV}/`, { isMainFrame: true })).toBe(true);
        expect(handlers.check(null, CLIPBOARD, APP, { isMainFrame: true })).toBe(false);
    });

    it('logs each denial when asked to, and nothing else', () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        try {
            const { session, handlers } = fakeSession();
            registerPermissionHandlers(session, { logDenied: true });
            request(handlers, CLIPBOARD, `${APP}/index.html`);
            handlers.check(null, CLIPBOARD, APP, { isMainFrame: true });
            expect(info).not.toHaveBeenCalled();

            request(handlers, 'geolocation', `${APP}/index.html`);
            handlers.check(null, 'notifications', APP, { isMainFrame: true });
            handlers.device({ deviceType: 'usb', origin: APP, device: {} });
            expect(info.mock.calls).toEqual([
                [`Denied permission request: geolocation for ${APP}/index.html`],
                [`Denied permission check: notifications for ${APP}`],
                [`Denied usb device for ${APP}`],
            ]);
        } finally {
            info.mockRestore();
        }
    });

    it('logs nothing by default', () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        try {
            const { session, handlers } = fakeSession();
            registerPermissionHandlers(session);
            request(handlers, 'geolocation', `${APP}/index.html`);
            handlers.check(null, 'notifications', APP, { isMainFrame: true });
            handlers.device({ deviceType: 'usb', origin: APP, device: {} });
            expect(info).not.toHaveBeenCalled();
        } finally {
            info.mockRestore();
        }
    });
});

describe('the main process in dev', () => {
    const { defaultSession } = electron.session;
    // Vitest clears mocks before each test, so note what the ready app did
    let calls;

    beforeAll(async () => {
        vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', DEV);
        vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');
        await import('../src'); // src/index.js
        electron.becomeReady();
        await vi.waitFor(() => expect(electron.BrowserWindow).toHaveBeenCalledTimes(1));
        const order = (mock) => mock.mock.invocationCallOrder;
        calls = {
            request: defaultSession.setPermissionRequestHandler.mock.calls.map(([handler]) => handler),
            check: defaultSession.setPermissionCheckHandler.mock.calls.map(([handler]) => handler),
            device: defaultSession.setDevicePermissionHandler.mock.calls.map(([handler]) => handler),
            handlersOrder: [
                ...order(defaultSession.setPermissionRequestHandler),
                ...order(defaultSession.setPermissionCheckHandler),
                ...order(defaultSession.setDevicePermissionHandler),
            ],
            windowOrder: [...order(electron.BrowserWindow)],
        };
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    it('installs the three handlers in the default session once, before the window opens', () => {
        expect(calls.request).toHaveLength(1);
        expect(calls.check).toHaveLength(1);
        expect(calls.device).toHaveLength(1);
        expect(Math.max(...calls.handlersOrder)).toBeLessThan(calls.windowOrder[0]);
    });

    it('allows the clipboard write to the dev server, and nothing else', () => {
        const [check] = calls.check;
        const [device] = calls.device;
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        expect(check(null, CLIPBOARD, `${DEV}/`, { isMainFrame: true })).toBe(true);
        expect(check(null, CLIPBOARD, APP, { isMainFrame: true })).toBe(false);
        expect(check(null, 'geolocation', `${DEV}/`, { isMainFrame: true })).toBe(false);
        expect(device({ deviceType: 'hid', origin: `${DEV}/`, device: {} })).toBe(false);
        info.mockRestore();
    });

    it('logs the denials, since the app is not packaged', () => {
        const [request] = calls.request;
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const callback = vi.fn();
        request({}, 'notifications', callback, { requestingUrl: `${DEV}/`, isMainFrame: true });
        expect(callback).toHaveBeenCalledExactlyOnceWith(false);
        expect(info).toHaveBeenCalledExactlyOnceWith(`Denied permission request: notifications for ${DEV}/`);
        info.mockRestore();
    });
});

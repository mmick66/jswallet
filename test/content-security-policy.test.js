import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    afterAll, beforeAll, describe, expect, it, vi
} from 'vitest';
import {
    contentSecurityPolicy, DEV_POLICY, enforceContentSecurityPolicy, META_POLICY, originOf, PRODUCTION_POLICY,
    withContentSecurityPolicy
} from '../src/main/security/content-security-policy';
import { appProtocolHandler } from '../src/main/security/app-protocol';
import rendererConfig, { contentSecurityPolicyMeta } from '../vite.renderer.config.mjs';

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
            this.on = vi.fn();
        }),
        clipboard: { writeText: vi.fn() },
        ipcMain: { handle: vi.fn() },
        net: { fetch: vi.fn(() => Promise.resolve(new Response('<!DOCTYPE html>', { headers: { 'Content-Type': 'text/html' } }))) },
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

/** A policy as directive names to their sources */
const directives = policy => Object.fromEntries(policy.split('; ').map((directive) => {
    const [name, ...sources] = directive.split(' ');
    return [name, sources];
}));

describe('the production policy', () => {
    const policy = directives(PRODUCTION_POLICY);

    it('is the policy of jswallet-4il.3', () => {
        expect(PRODUCTION_POLICY).toBe(
            "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
            + "font-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; "
            + "frame-src 'none'; worker-src 'none'; frame-ancestors 'none'"
        );
    });

    it('allows nothing by default', () => {
        expect(policy['default-src']).toEqual(["'none'"]);
    });

    it('runs only the scripts of the build: no inline script and no eval', () => {
        expect(policy['script-src']).toEqual(["'self'"]);
    });

    it('connects to no other host', () => {
        expect(policy['connect-src']).toEqual(["'self'"]);
    });

    it.each(['base-uri', 'form-action', 'object-src', 'frame-src', 'worker-src', 'frame-ancestors'])('allows no %s', (name) => {
        expect(policy[name]).toEqual(["'none'"]);
    });

    it('is the policy of a packaged app', () => {
        expect(contentSecurityPolicy({ packaged: true })).toBe(PRODUCTION_POLICY);
    });
});

describe('the dev policy', () => {
    const policy = directives(DEV_POLICY);

    it('allows the dev server\'s inline Fast Refresh preamble and its websocket, and nothing else more', () => {
        expect(policy).toEqual({
            ...directives(PRODUCTION_POLICY),
            'script-src': ["'self'", "'unsafe-inline'"],
            'connect-src': ["'self'", 'ws://localhost:*'],
        });
    });

    it('is the policy of an app that is not packaged', () => {
        expect(contentSecurityPolicy({ packaged: false })).toBe(DEV_POLICY);
    });

    // Electron warns of an "Insecure Content-Security-Policy" in a renderer that can eval
    it.each([['production', PRODUCTION_POLICY], ['dev', DEV_POLICY]])('lets the %s renderer eval nothing', (name, csp) => {
        expect(csp).not.toContain("'unsafe-eval'");
        expect(csp).not.toContain("'wasm-unsafe-eval'");
    });
});

describe('the meta policy', () => {
    it('is the production policy without frame-ancestors, which a meta tag ignores', () => {
        const { 'frame-ancestors': frameAncestors, ...rest } = directives(PRODUCTION_POLICY);
        expect(frameAncestors).toEqual(["'none'"]);
        expect(directives(META_POLICY)).toEqual(rest);
    });
});

describe('withContentSecurityPolicy', () => {
    it('adds the policy to the headers', () => {
        const headers = { 'Content-Type': ['text/html'] };
        expect(withContentSecurityPolicy(headers, PRODUCTION_POLICY)).toEqual({
            'Content-Type': ['text/html'],
            'Content-Security-Policy': [PRODUCTION_POLICY],
        });
        expect(headers).toEqual({ 'Content-Type': ['text/html'] });
    });

    it('replaces the policy that the response has, under any case', () => {
        const headers = {
            'content-security-policy': ["script-src 'self'"],
            'CONTENT-SECURITY-POLICY': ['default-src *'],
            'Content-Security-Policy-Report-Only': ["default-src 'none'"],
        };
        expect(withContentSecurityPolicy(headers, DEV_POLICY)).toEqual({
            'Content-Security-Policy-Report-Only': ["default-src 'none'"],
            'Content-Security-Policy': [DEV_POLICY],
        });
    });

    it('takes a response without headers', () => {
        expect(withContentSecurityPolicy(undefined, PRODUCTION_POLICY)).toEqual({ 'Content-Security-Policy': [PRODUCTION_POLICY] });
    });
});

describe('originOf', () => {
    it.each([
        ['app://jswallet/index.html', 'app://jswallet'],
        ['app://jswallet/assets/index.js?v=1#top', 'app://jswallet'],
        ['http://localhost:5173/', 'http://localhost:5173'],
        ['http://localhost:5173/src/renderer.jsx', 'http://localhost:5173'],
        ['https://mempool.space/api', 'https://mempool.space'],
    ])('of %s is %s', (url, origin) => {
        expect(originOf(url)).toBe(origin);
    });

    it.each(['', 'index.html', 'http://'])('of %j is null', (url) => {
        expect(originOf(url)).toBeNull();
    });
});

describe('enforceContentSecurityPolicy', () => {
    const listen = (origin, policy) => {
        const session = { webRequest: { onHeadersReceived: vi.fn() } };
        enforceContentSecurityPolicy(session, { origin, policy });
        expect(session.webRequest.onHeadersReceived).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
        const [[listener]] = session.webRequest.onHeadersReceived.mock.calls;
        return (url, responseHeaders) => {
            const callback = vi.fn();
            listener({ url, responseHeaders }, callback);
            expect(callback).toHaveBeenCalledOnce();
            return callback.mock.calls[0][0];
        };
    };

    it.each([
        'app://jswallet/index.html',
        'app://jswallet/assets/index.js',
        'app://jswallet/missing.js',
    ])('sends the policy with %s, a response from the renderer\'s origin', (url) => {
        const receive = listen('app://jswallet', PRODUCTION_POLICY);
        expect(receive(url, { 'content-type': ['text/html'] })).toEqual({
            responseHeaders: { 'content-type': ['text/html'], 'Content-Security-Policy': [PRODUCTION_POLICY] },
        });
    });

    it('sends the dev policy with the dev server\'s responses', () => {
        const receive = listen('http://localhost:5173', DEV_POLICY);
        expect(receive('http://localhost:5173/', {})).toEqual({ responseHeaders: { 'Content-Security-Policy': [DEV_POLICY] } });
    });

    it.each([
        'http://localhost:5174/',
        'https://localhost:5173/',
        'app://jswallet.example/index.html',
        'chrome-extension://fmkadmapgofadopljbjfkapdkoienihi/panel.html',
        'devtools://devtools/bundled/devtools_app.html',
        'not a URL',
    ])('lets %s, from another origin, be', (url) => {
        const receive = listen('http://localhost:5173', DEV_POLICY);
        expect(receive(url, { 'Content-Security-Policy': ['default-src *'] })).toEqual({});
    });
});

describe('the app: handler', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jswallet-content-security-policy-'));

    beforeAll(() => {
        fs.writeFileSync(path.join(dir, 'index.html'), '<!DOCTYPE html>');
    });

    afterAll(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('sends the production policy with every file', async () => {
        const response = await appProtocolHandler(dir)(new Request('app://jswallet/index.html'));
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Security-Policy')).toBe(PRODUCTION_POLICY);
        expect(response.headers.get('Content-Type')).toBe('text/html');
        expect(await response.text()).toBe('<!DOCTYPE html>');
    });

    it('sends the production policy with a 404', async () => {
        const response = await appProtocolHandler(dir)(new Request('app://jswallet/missing.html'));
        expect(response.status).toBe(404);
        expect(response.headers.get('Content-Security-Policy')).toBe(PRODUCTION_POLICY);
    });
});

describe('the renderer build', () => {
    const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

    it('carries the meta policy at the head of index.html, before any script', () => {
        const plugin = contentSecurityPolicyMeta();
        expect(plugin.apply).toBe('build');
        expect(plugin.transformIndexHtml(indexHtml)).toEqual([{
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: META_POLICY },
            injectTo: 'head-prepend',
        }]);
    });

    it('uses the meta policy plugin', () => {
        expect(rendererConfig.plugins.flat().map(plugin => plugin.name)).toContain('jswallet:content-security-policy-meta');
    });

    // A policy in index.html would also apply to the dev server, and block its inline preamble
    it('leaves index.html without a policy of its own', () => {
        expect(indexHtml).not.toMatch(/Content-Security-Policy/i);
    });
});

describe.each([
    ['a packaged', true, undefined, 'app://jswallet', PRODUCTION_POLICY],
    ['an unpackaged', false, 'http://localhost:5173', 'http://localhost:5173', DEV_POLICY],
])('%s main process', (what, packaged, devServerUrl, origin, policy) => {
    let calls;

    beforeAll(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', devServerUrl);
        vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');
        electron.app.isPackaged = packaged;
        await import('../src'); // src/index.js
        electron.becomeReady();
        await vi.waitFor(() => expect(electron.BrowserWindow).toHaveBeenCalledTimes(1));
        const { onHeadersReceived } = electron.session.defaultSession.webRequest;
        const [window] = electron.BrowserWindow.mock.instances;
        calls = {
            onHeadersReceived: [...onHeadersReceived.mock.calls],
            onHeadersReceivedOrder: [...onHeadersReceived.mock.invocationCallOrder],
            loadURLOrder: [...window.loadURL.mock.invocationCallOrder],
        };
    });

    afterAll(() => {
        vi.unstubAllGlobals();
        electron.app.isPackaged = true;
    });

    it(`sends its policy with the responses from ${origin}, before the window loads`, () => {
        expect(calls.onHeadersReceived).toHaveLength(1);
        expect(calls.onHeadersReceivedOrder[0]).toBeLessThan(calls.loadURLOrder[0]);

        const [[listener]] = calls.onHeadersReceived;
        const callback = vi.fn();
        listener({ url: `${origin}/index.html`, responseHeaders: {} }, callback);
        expect(callback).toHaveBeenCalledExactlyOnceWith({ responseHeaders: { 'Content-Security-Policy': [policy] } });
    });
});

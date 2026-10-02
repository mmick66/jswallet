import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { isAllowedNavigation, lockWebContents, registerNavigationGuards } from '../src/main/security/navigation';

const DEV = 'http://localhost:5173/';
const PACKAGED = 'file:///Applications/jswallet.app/Contents/Resources/app.asar/.vite/renderer/main_window/index.html';
const DEVTOOLS = 'devtools://devtools/bundled/devtools_app.html?remoteBase=https://chrome-devtools-frontend.appspot.com/';

// A WebContents as far as the guards use it
const fakeContents = (url) => Object.assign(new EventEmitter(), {
    getURL: () => url,
    setWindowOpenHandler: vi.fn(),
});

// Emits a navigation event like Electron does and tells whether a listener prevented it
const emit = (contents, name, details = {}) => {
    const event = { preventDefault: vi.fn(), ...details };
    contents.emit(name, event);
    return event.preventDefault.mock.calls.length > 0;
};

describe('isAllowedNavigation', () => {

    it.each([
        ['the dev server page', DEV, DEV],
        ['the packaged page', PACKAGED, PACKAGED],
        ['the page with a fragment', `${PACKAGED}#wallets`, PACKAGED],
        ['the page to a fragment', PACKAGED, `${PACKAGED}#wallets`],
    ])('allows a reload of %s', (_name, current, url) => {
        expect(isAllowedNavigation(current, { url, isMainFrame: true })).toBe(true);
    });

    it.each([
        ['an external site', DEV, 'https://example.com/'],
        ['another page of the dev server', DEV, `${DEV}other.html`],
        ['the dev server with a query', DEV, `${DEV}?x=1`],
        ['a form submission', PACKAGED, `${PACKAGED}?q=1`],
        ['a dropped .html file, which has the same origin', PACKAGED, 'file:///Users/me/Downloads/page.html'],
        ['a dropped .txt file', PACKAGED, 'file:///Users/me/Downloads/notes.txt'],
        ['a data: URL', PACKAGED, 'data:text/html,<p>hi</p>'],
        ['the DevTools frontend', PACKAGED, DEVTOOLS],
        ['a host that starts with the dev server host', 'http://localhost/', 'http://localhost.evil.com/'],
    ])('refuses navigating the main frame to %s', (_name, current, url) => {
        expect(isAllowedNavigation(current, { url, isMainFrame: true })).toBe(false);
    });

    it('refuses an iframe, even one with the page itself', () => {
        expect(isAllowedNavigation(DEV, { url: 'https://example.com/', isMainFrame: false })).toBe(false);
        expect(isAllowedNavigation(DEV, { url: DEV, isMainFrame: false })).toBe(false);
    });

    it('refuses when either address is not a URL', () => {
        expect(isAllowedNavigation('', { url: '', isMainFrame: true })).toBe(false);
        expect(isAllowedNavigation('', { url: DEV, isMainFrame: true })).toBe(false);
        expect(isAllowedNavigation(DEV, { url: 'not a url', isMainFrame: true })).toBe(false);
        expect(isAllowedNavigation(DEV, { isMainFrame: true })).toBe(false);
    });

    it('lets the DevTools frontend load the panels of React Developer Tools', () => {
        const panel = 'chrome-extension://fmkadmapgofadopljbjfkapdkoienihi/main.html';
        expect(isAllowedNavigation(DEVTOOLS, { url: panel, isMainFrame: false })).toBe(true);
    });
});

describe('lockWebContents', () => {

    it.each(['will-navigate', 'will-frame-navigate', 'will-redirect'])('prevents %s away from the page', (name) => {
        const contents = fakeContents(DEV);
        lockWebContents(contents);
        expect(emit(contents, name, { url: 'https://example.com/', isMainFrame: true })).toBe(true);
        expect(emit(contents, name, { url: 'https://example.com/', isMainFrame: false })).toBe(true);
    });

    it.each(['will-navigate', 'will-frame-navigate'])('lets %s reload the page', (name) => {
        const contents = fakeContents(DEV);
        lockWebContents(contents);
        expect(emit(contents, name, { url: DEV, isMainFrame: true })).toBe(false);
    });

    it('denies every new window', () => {
        const contents = fakeContents(DEV);
        lockWebContents(contents);
        expect(contents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
        const [[handler]] = contents.setWindowOpenHandler.mock.calls;
        [DEV, 'https://example.com/', 'about:blank', 'https://mempool.space/tx/00'].forEach((url) => {
            expect(handler({ url, frameName: '', disposition: 'new-window' })).toEqual({ action: 'deny' });
        });
    });

    it('prevents every <webview> from attaching', () => {
        const contents = fakeContents(DEV);
        lockWebContents(contents);
        expect(emit(contents, 'will-attach-webview')).toBe(true);
    });
});

describe('registerNavigationGuards', () => {

    it('locks every web contents the app creates', () => {
        const app = new EventEmitter();
        registerNavigationGuards(app);

        const contents = fakeContents(PACKAGED);
        app.emit('web-contents-created', {}, contents);
        expect(emit(contents, 'will-navigate', { url: 'https://example.com/', isMainFrame: true })).toBe(true);
        expect(contents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
        expect(emit(contents, 'will-attach-webview')).toBe(true);
    });
});

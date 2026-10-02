/**
 * Keeps every web contents on the page that main loaded into it. The window holds window.jswallet
 * (src/preload.js), which can create wallets and send payments, and whatever it navigated to would get
 * it too: a link, a form, a dropped file or an injected script. jswallet is a single page that never
 * navigates and never opens a window, so none of that goes through.
 */

const parse = (url) => {
    try {
        return new URL(url);
    } catch {
        return null;
    }
};

/**
 * Whether a web contents that shows currentUrl may go ahead with a navigation. Only a reload of the
 * page in the main frame may: Vite reloads it in dev with location.reload(), which emits will-navigate
 * and will-frame-navigate like any other navigation. Any other address is refused, even one with the
 * same origin, since every file:// URL has the origin 'null' and a dropped file would pass.
 * The DevTools frontend is let be: React Developer Tools loads its panels into it as frames, and it
 * has no window.jswallet.
 * @param currentUrl contents.getURL()
 * @param navigation The event of will-navigate, will-frame-navigate or will-redirect
 */
export const isAllowedNavigation = (currentUrl, { url, isMainFrame }) => {
    const current = parse(currentUrl);
    if (current === null) return false;
    if (current.protocol === 'devtools:') return true;

    const target = parse(url);
    if (!isMainFrame || target === null) return false;

    // The fragment only scrolls within the document
    current.hash = '';
    target.hash = '';
    return target.href === current.href;
};

/**
 * Refuses every navigation but a reload (see isAllowedNavigation), every new window and every <webview>.
 * @param contents A WebContents
 */
export const lockWebContents = (contents) => {
    // loadURL and webContents.reload() emit none of these. will-frame-navigate covers iframes as well.
    const guard = (event) => {
        if (!isAllowedNavigation(contents.getURL(), event)) event.preventDefault();
    };
    contents.on('will-navigate', guard);
    contents.on('will-frame-navigate', guard);
    contents.on('will-redirect', guard);

    // No window.open, and no link or form with a target. Nothing calls shell.openExternal either. If a
    // "view on mempool.space" link is ever added, open it here with shell.openExternal, and only once
    // new URL(url).protocol is 'https:' and its host is on an allowlist.
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));

    // webPreferences.webviewTag is false, so <webview> does not work at all; this is defence in depth.
    contents.on('will-attach-webview', (event) => event.preventDefault());
};

/**
 * Locks every web contents that the app creates, DevTools included, with lockWebContents. Call it
 * before the first window: web-contents-created is not emitted for the contents that exist already.
 * @param app Electron's app
 */
export const registerNavigationGuards = (app) => {
    app.on('web-contents-created', (_event, contents) => lockWebContents(contents));
};

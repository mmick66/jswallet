/**
 * The Content-Security-Policy of the renderer. The renderer makes no network requests (main does, see
 * src/main/network.js) and loads nothing but its own build, so the policy allows little more than that:
 * an injected <script>, a fetch() to another host, a <form>, <object>, <iframe> or worker all fail.
 * main sends it as a header (enforceContentSecurityPolicy, and appProtocolHandler for app://jswallet),
 * which is the only way frame-ancestors works; the build also carries it in a meta tag
 * (vite.renderer.config.mjs). So that the Vite config can load it too, this module imports nothing
 * from Electron, and it is an .mjs file: Node loads a .js file in this package as CommonJS.
 * See https://www.electronjs.org/docs/latest/tutorial/security#7-define-a-content-security-policy
 */

const PRODUCTION_DIRECTIVES = {
    'default-src': ["'none'"],
    'script-src': ["'self'"],
    // antd 6 injects <style> elements (CSS-in-JS). Its ConfigProvider csp={{ nonce }} covers those of
    // the theme, but not the one that a Modal's scroll locker (@rc-component/portal) injects, nor style
    // attributes (index.html's, a TextArea's autosize), which no nonce can allow. With a nonce,
    // 'unsafe-inline' no longer applies, so styles keep 'unsafe-inline' and get no nonce.
    'style-src': ["'self'", "'unsafe-inline'"],
    // Vite inlines small images and fonts as data: URLs
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
    'object-src': ["'none'"],
    'frame-src': ["'none'"],
    'worker-src': ["'none'"],
    'frame-ancestors': ["'none'"],
};

// The Vite dev server injects the React Fast Refresh preamble as an inline script, and its client
// reloads modules over a websocket.
const DEV_DIRECTIVES = {
    ...PRODUCTION_DIRECTIVES,
    'script-src': ["'self'", "'unsafe-inline'"],
    'connect-src': ["'self'", 'ws://localhost:*'],
};

const serialize = (directives) => Object.entries(directives)
    .map(([name, sources]) => [name, ...sources].join(' '))
    .join('; ');

/** The policy of the packaged renderer. */
export const PRODUCTION_POLICY = serialize(PRODUCTION_DIRECTIVES);

/** The policy of the renderer on the Vite dev server, in an app that is not packaged. */
export const DEV_POLICY = serialize(DEV_DIRECTIVES);

/** The production policy for a meta tag, which ignores frame-ancestors and logs an error for it. */
export const META_POLICY = serialize(Object.fromEntries(Object.entries(PRODUCTION_DIRECTIVES)
    .filter(([name]) => name !== 'frame-ancestors')));

/**
 * The policy of the renderer: unsafe inline scripts and websockets are for the dev server only.
 * @param packaged app.isPackaged
 */
export const contentSecurityPolicy = ({ packaged }) => (packaged ? PRODUCTION_POLICY : DEV_POLICY);

/**
 * responseHeaders with policy as their only Content-Security-Policy, whatever the case of the name
 * that they had it under.
 * @param responseHeaders The headers of an Electron webRequest response: names to arrays of values
 * @param policy A Content-Security-Policy
 */
export const withContentSecurityPolicy = (responseHeaders, policy) => ({
    ...Object.fromEntries(Object.entries(responseHeaders ?? {})
        .filter(([name]) => name.toLowerCase() !== 'content-security-policy')),
    'Content-Security-Policy': [policy],
});

/**
 * The origin of url as scheme://host[:port], or null if it is not a URL. Unlike URL.origin, which
 * is 'null' for app: in Node, since only Chromium knows that app: is a standard scheme.
 */
export const originOf = (url) => {
    try {
        const { protocol, host } = new URL(url);
        return `${protocol}//${host}`;
    } catch {
        return null;
    }
};

/**
 * Sends policy with every response from origin, the renderer's, that the session receives: the dev
 * server's, or app://jswallet's. Others, such as React Developer Tools' in dev, keep their own.
 * A session has a single onHeadersReceived listener, so this replaces any other; that is why
 * appProtocolHandler sends the production policy as well.
 * @param session An Electron Session, such as session.defaultSession
 * @param origin The origin of the page that main loads into the window, as originOf gives it
 * @param policy The Content-Security-Policy, as contentSecurityPolicy gives it
 */
export const enforceContentSecurityPolicy = (session, { origin, policy }) => {
    session.webRequest.onHeadersReceived((details, callback) => {
        if (originOf(details.url) !== origin) {
            callback({});
            return;
        }
        callback({ responseHeaders: withContentSecurityPolicy(details.responseHeaders, policy) });
    });
};

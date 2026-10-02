import { APP_ORIGIN } from './app-protocol';

/**
 * Electron grants a page every permission it asks for, unless the session has handlers: camera,
 * microphone, location, notifications, MIDI, HID, serial and USB devices, screen capture and more.
 * jswallet needs none of them. The one exception is a write to the clipboard, for copying an address
 * (src/clipboard.js), and only from the renderer itself.
 * See https://www.electronjs.org/docs/latest/tutorial/security#5-handle-session-permission-requests-from-remote-content
 */
export const AllowedPermissions = ['clipboard-sanitized-write'];

/**
 * scheme://host[:port] of url, or null for a URL without a host (file:, data:, blob:) and for no URL.
 * Node's URL.origin is 'null' for app:, which Chromium knows as a standard scheme.
 */
const originOf = (url) => {
    try {
        const { protocol, host } = new URL(url);
        return host === '' ? null : `${protocol}//${host}`;
    } catch {
        return null;
    }
};

/**
 * Whether a page of requestingOrigin may have permission: only one of AllowedPermissions, and only
 * for the renderer's origin. Any other origin is refused, as is a host that only starts like it.
 * @param permission The permission of a request or check, as Electron names it
 * @param requestingOrigin The origin of the page, or its URL: only the scheme, host and port count
 * @param rendererOrigin The origin of the renderer, or its URL: app://jswallet, or the Vite dev server's in dev
 */
export const isPermissionAllowed = (permission, requestingOrigin, rendererOrigin = APP_ORIGIN) => {
    const origin = originOf(requestingOrigin);
    return AllowedPermissions.includes(permission) && origin !== null && origin === originOf(rendererOrigin);
};

/**
 * Applies isPermissionAllowed to the permission requests of session and to its permission checks,
 * which pages make synchronously (navigator.permissions.query, Notification.permission) without a
 * request. Every device (HID, serial, USB) is refused. Call it once the app is ready.
 * @param session An Electron Session, such as session.defaultSession
 * @param rendererOrigin The origin of the renderer, or its URL (see isPermissionAllowed)
 * @param logDenied Whether to log each permission that is refused, in dev
 */
export const registerPermissionHandlers = (session, { rendererOrigin = APP_ORIGIN, logDenied = false } = {}) => {
    const decide = (kind, permission, requestingOrigin) => {
        const allowed = isPermissionAllowed(permission, requestingOrigin, rendererOrigin);
        if (!allowed && logDenied) console.info(`Denied permission ${kind}: ${permission} for ${requestingOrigin}`);
        return allowed;
    };

    session.setPermissionRequestHandler((_contents, permission, callback, { requestingUrl }) => {
        callback(decide('request', permission, requestingUrl));
    });
    session.setPermissionCheckHandler((_contents, permission, requestingOrigin) => decide('check', permission, requestingOrigin));
    session.setDevicePermissionHandler(({ deviceType, origin }) => {
        if (logDenied) console.info(`Denied ${deviceType} device for ${origin}`);
        return false;
    });
};

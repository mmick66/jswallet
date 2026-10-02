import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';

/**
 * The packaged renderer is served from app://jswallet, not file://. A page on file:// can read any
 * local file it can name, so an XSS there could read the wallet database. On app:// it gets only
 * the files of its build directory, and a real origin that other checks can compare against.
 * See https://www.electronjs.org/docs/latest/tutorial/security#18-avoid-usage-of-the-file-protocol-and-prefer-usage-of-custom-protocols
 */
export const APP_SCHEME = 'app';
export const APP_HOST = 'jswallet';

/** The origin of the packaged renderer, as location.origin and IPC senders report it. */
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** The page that the packaged app loads into the main window. */
export const APP_INDEX_URL = `${APP_ORIGIN}/index.html`;

/**
 * Makes app: a standard scheme, so relative and root URLs resolve and pages get an origin, and a
 * secure one, as https: is. Electron only accepts this before the app is ready.
 */
export const registerAppScheme = () => {
    protocol.registerSchemesAsPrivileged([{
        scheme: APP_SCHEME,
        privileges: { standard: true, secure: true, supportFetchAPI: true },
    }]);
};

/**
 * The file under rendererRoot that the path of an app: URL names, or null for a path that leaves
 * rendererRoot: ../ (also as %2e%2e%2f, or with \ on Windows), an absolute path, another drive, a
 * malformed %-escape or a NUL. / is index.html.
 * @param rendererRoot The absolute path of the renderer's build directory
 * @param pathname The pathname of the URL, still %-encoded
 * @param paths node:path, or path.win32 or path.posix to resolve for another platform
 * @returns {string|null} An absolute path under rendererRoot, which need not exist
 */
export const resolveAppPath = (rendererRoot, pathname, paths = path) => {
    let decoded;
    try {
        decoded = decodeURIComponent(pathname);
    } catch {
        return null;
    }
    if (decoded.includes('\0')) return null;

    const root = paths.resolve(rendererRoot);
    const resolved = paths.resolve(root, '.' + decoded);
    const relative = paths.relative(root, resolved);
    if (relative === '') return paths.join(root, 'index.html');
    if (relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) return null;
    return resolved;
};

const isFile = (file) => fs.promises.stat(file).then((stats) => stats.isFile(), () => false);

/**
 * The handler of app: requests: the file that resolveAppPath finds for app://jswallet/<path>, or
 * 404 for another host, a path outside rendererRoot, or a path that is not a file (no directory listings).
 * @param rendererRoot The absolute path of the renderer's build directory
 */
export const appProtocolHandler = (rendererRoot) => async (request) => {
    const { host, pathname } = new URL(request.url);
    const file = host === APP_HOST ? resolveAppPath(rendererRoot, pathname) : null;
    if (file === null || !(await isFile(file))) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
};

/**
 * Serves app://jswallet from rendererRoot in the default session. Call once the app is ready.
 * @param rendererRoot The absolute path of the renderer's build directory
 */
export const handleAppProtocol = (rendererRoot) => {
    protocol.handle(APP_SCHEME, appProtocolHandler(rendererRoot));
};

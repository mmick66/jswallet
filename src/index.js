/* global MAIN_WINDOW_VITE_DEV_SERVER_URL, MAIN_WINDOW_VITE_NAME */
import {
    app, BrowserWindow, clipboard, ipcMain, session
} from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import Wallet from './main/wallet.class';
import { createIpcHandlers, registerIpcHandlers } from './main/ipc';
import { createIpcHandle } from './main/security/ipc';
import { registerNavigationGuards } from './main/security/navigation';
import { databaseDirectory, migrateLegacyDatabase } from './main/storage';
import mainWindowOptions from './main/security/window-options';
import {
    APP_INDEX_URL, APP_ORIGIN, handleAppProtocol, registerAppScheme
} from './main/security/app-protocol';
import { registerPermissionHandlers } from './main/security/permissions';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
    app.quit();
}

// Sandbox every renderer, including any created later, whatever its own webPreferences say.
// It only takes effect before the app is ready.
app.enableSandbox();

// The packaged renderer is served from app://jswallet, not file:// (src/main/security/app-protocol.js).
// Like the sandbox, the scheme's privileges must be set before the app is ready.
registerAppScheme();

// The window never navigates or opens another; this has to come before the first web contents.
registerNavigationGuards(app);

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

// The origin of the page in the main window, the only one that IPC answers
const rendererOrigin = MAIN_WINDOW_VITE_DEV_SERVER_URL ? new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin : APP_ORIGIN;

// The only frame that IPC answers (src/main/security/ipc.js)
const mainFrame = () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.mainFrame : null);

// DevTools are a development aid only: a failure to install them must not block startup.
const installDevTools = async () => {
    try {
        await installExtension(REACT_DEVELOPER_TOOLS);
    } catch (error) {
        console.warn('Could not install React Developer Tools:', error);
    }
};

const createWindow = () => {

    // Create the browser window.
    // The renderer gets no Node: it reaches the wallets through window.jswallet (src/preload.js)
    mainWindow = new BrowserWindow(mainWindowOptions({ preload: path.join(__dirname, 'preload.cjs') }));

    // and load the index.html of the app.
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadURL(APP_INDEX_URL);
    }

    // Open the DevTools.
    // mainWindow.webContents.openDevTools();

    // Emitted when the window is closed.
    mainWindow.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
    const dbDir = databaseDirectory(app.getPath('userData'));
    migrateLegacyDatabase(Wallet.Defaults.DBFileName, dbDir);
    Wallet.open(dbDir);

    // app://jswallet serves the renderer's build directory, and nothing else
    handleAppProtocol(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`));

    // No camera, location, notifications, devices and so on: only clipboard writes from the renderer
    registerPermissionHandlers(session.defaultSession, { rendererOrigin, logDenied: !app.isPackaged });

    const handle = createIpcHandle({ ipcMain, getMainFrame: mainFrame, origin: rendererOrigin });
    registerIpcHandlers(handle, createIpcHandlers({
        writeClipboard: (text) => clipboard.writeText(text),
    }));

    if (!app.isPackaged) {
        await installDevTools();
    }

    createWindow();

    app.on('activate', () => {
        // On OS X it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (mainWindow === null) {
            createWindow();
        }
    });
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

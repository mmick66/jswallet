/* global MAIN_WINDOW_VITE_DEV_SERVER_URL, MAIN_WINDOW_VITE_NAME */
import {
    app, BrowserWindow, clipboard, ipcMain
} from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import Wallet from './main/wallet.class';
import { createIpcHandlers, registerIpcHandlers } from './main/ipc';
import { databaseDirectory, migrateLegacyDatabase } from './main/storage';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
    app.quit();
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

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
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        // The renderer gets no Node: it reaches the wallets through window.jswallet (src/preload.js)
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            sandbox: true,
        }
    });

    // and load the index.html of the app.
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
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

    registerIpcHandlers(ipcMain, createIpcHandlers({
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

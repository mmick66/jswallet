/**
 * The BrowserWindow options of the main window. The preload bridge can create wallets and send
 * funds, so the renderer gets no Node and runs sandboxed and context-isolated: it reaches the main
 * process only through window.jswallet (src/preload.js). Each security setting is spelled out, even
 * where it is Electron's default, and test/window-options.test.js checks every one. Code that needs
 * Node belongs in src/main behind an IPC channel, not in a relaxed option here.
 * See https://www.electronjs.org/docs/latest/tutorial/security
 * @param preload The absolute path of the bundled preload script
 */
const mainWindowOptions = ({ preload }) => ({
    width: 800,
    height: 600,
    webPreferences: {
        preload,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        // No <webview>, so no <webview allowpopups> either. Never set enableBlinkFeatures.
        webviewTag: false,
    },
});

export default mainWindowOptions;

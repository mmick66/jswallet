/**
 * The only place that registers IPC handlers. The channels create wallets, return the mnemonic and
 * send payments, so main answers no frame but the top frame of the main window, on the page that
 * main loaded into it: not a subframe, not another window, and not a page the window was somehow
 * navigated to (src/main/security/navigation.js refuses that too). Each channel's argument goes
 * through its schema before the handler sees it.
 * See https://www.electronjs.org/docs/latest/tutorial/security#17-validate-the-sender-of-all-ipc-messages
 */

/** What a refused sender gets back. The details go to the log of main only. */
export const RefusedMessage = 'Request refused';

/**
 * Why main must not answer the frame that sent an IPC message, or null if it may.
 * @param senderFrame event.senderFrame: null once the frame has navigated or is gone
 * @param mainFrame The main window's webContents.mainFrame, or null when there is no window
 * @param origin The renderer's origin: APP_ORIGIN, or the Vite dev server's in development
 * @returns {string|null}
 */
export const senderProblem = (senderFrame, mainFrame, origin) => {
    if (!senderFrame) return 'the frame has navigated or is gone';
    if (senderFrame.origin !== origin) return `the origin ${senderFrame.origin} of ${senderFrame.url} is not ${origin}`;
    if (!mainFrame || senderFrame !== mainFrame) return `${senderFrame.url} is not the top frame of the main window`;
    return null;
};

/**
 * Creates handle(channel, schema, fn), which answers channel with fn(schema(argument)). It refuses,
 * before it looks at the argument, a call from a frame that senderProblem objects to: the renderer
 * gets RefusedMessage and main logs why. A call with more than one argument is refused too.
 * Handlers never see the event.
 * @param ipcMain From electron
 * @param getMainFrame Returns the main window's webContents.mainFrame, or null when there is no window.
 *        It is asked on every call, as macOS opens a new window when the dock icon is clicked.
 * @param origin The renderer's origin, see senderProblem
 * @param log Where refusals are reported
 * @returns {function(string, function(*, string): *, function(*): Promise): void} handle(channel, schema, fn):
 *          schema(value, what) returns the value, or a copy with only the fields it knows, or throws a
 *          TypeError (see src/main/ipc.arguments.js); fn gets what schema returned
 */
export const createIpcHandle = ({
    ipcMain, getMainFrame, origin, log = console.warn,
}) => (channel, schema, fn) => {
    if (typeof schema !== 'function') throw new TypeError(`The IPC channel ${channel} has no schema`);

    ipcMain.handle(channel, async (event, ...args) => {
        let problem;
        try {
            problem = senderProblem(event.senderFrame, getMainFrame(), origin);
        } catch (error) {
            // A frame that is being torn down throws when it is read
            problem = `the frame cannot be read: ${error.message}`;
        }
        if (problem) {
            log(`Refused IPC ${channel}: ${problem}`);
            throw new Error(RefusedMessage);
        }
        if (args.length > 1) throw new TypeError('Invalid arguments: expected at most one');
        return fn(schema(args[0], 'argument'));
    });
};

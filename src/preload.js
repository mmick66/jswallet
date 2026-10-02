// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';
import Channels from './common/ipc.channels';

// ipcRenderer.invoke rejects with "Error invoking remote method '<channel>': Error: <message>"
// when a handler throws. The UI shows only the handler's message.
const RemoteErrorPrefix = /^Error invoking remote method '[^']*': (?:[A-Za-z]*Error: )?/;

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args).catch((error) => {
    throw new Error(String(error?.message ?? error).replace(RemoteErrorPrefix, ''));
});

// The renderer's only way to the main process. Each function invokes one fixed channel, which
// src/main/ipc.js answers, and returns its promise. The preload runs sandboxed, so it imports
// nothing but electron and modules that Vite bundles into it.
// Whatever runs in the page can call these, so expose only named functions for one purpose each:
// never ipcRenderer, its on or send, an IPC event, or an invoke(channel, ...args) that takes the
// channel from the page. A subscription, if one is ever needed, hands the page the value only:
//     (cb) => { const l = (_e, v) => cb(v); ipcRenderer.on(ch, l); return () => ipcRenderer.removeListener(ch, l); }
// Main checks the sender and the argument of every call anyway (src/main/security/ipc.js).
// src/jswallet.js lists these functions; keep the two in step.
contextBridge.exposeInMainWorld('jswallet', {
    // [{ name, address, network, coins, utxoValues }]
    listWallets: () => invoke(Channels.ListWallets),
    // { wallet, mnemonic }
    createWallet: ({ name, password }) => invoke(Channels.CreateWallet, { name, password }),
    deleteWallet: (address) => invoke(Channels.DeleteWallet, address),
    // { coins, utxoValues }
    refreshWallet: (address) => invoke(Channels.RefreshWallet, address),
    // { txid }
    sendPayment: ({
        from, to, btc, password
    }) => invoke(Channels.SendPayment, {
        from, to, btc, password
    }),
    getPrice: () => invoke(Channels.GetPrice),
    // The fee rate in sat/vB
    getFee: () => invoke(Channels.GetFee),
    getTransactions: (addresses) => invoke(Channels.GetTransactions, addresses),
    getPriceChart: (timespan) => invoke(Channels.GetPriceChart, timespan),
    writeClipboard: (text) => invoke(Channels.WriteClipboard, text),
});

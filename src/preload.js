// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';
import Channels from './common/ipc.channels';

// The renderer's only way to the main process. Each function invokes one fixed channel, which
// src/main/ipc.js answers, and returns its promise. The preload runs sandboxed, so it imports
// nothing but electron and modules that Vite bundles into it.
contextBridge.exposeInMainWorld('jswallet', {
    // [{ name, address, network, coins, utxoValues }]
    listWallets: () => ipcRenderer.invoke(Channels.ListWallets),
    // { wallet, mnemonic }
    createWallet: ({ name, password }) => ipcRenderer.invoke(Channels.CreateWallet, { name, password }),
    deleteWallet: (address) => ipcRenderer.invoke(Channels.DeleteWallet, address),
    // { coins, utxoValues }
    refreshWallet: (address) => ipcRenderer.invoke(Channels.RefreshWallet, address),
    // { txid }
    sendPayment: ({
        from, to, btc, password
    }) => ipcRenderer.invoke(Channels.SendPayment, {
        from, to, btc, password
    }),
    getPrice: () => ipcRenderer.invoke(Channels.GetPrice),
    // The fee rate in sat/vB
    getFee: () => ipcRenderer.invoke(Channels.GetFee),
    getTransactions: (addresses) => ipcRenderer.invoke(Channels.GetTransactions, addresses),
    getPriceChart: (timespan) => ipcRenderer.invoke(Channels.GetPriceChart, timespan),
    writeClipboard: (text) => ipcRenderer.invoke(Channels.WriteClipboard, text),
});

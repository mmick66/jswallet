/**
 * The IPC channels that src/main/ipc.js answers, one per function that src/preload.js exposes as window.jswallet
 */
export default {
    ListWallets: 'wallets:list',
    CreateWallet: 'wallets:create',
    DeleteWallet: 'wallets:delete',
    RefreshWallet: 'wallets:refresh',
    SendPayment: 'wallets:send',
    GetPrice: 'network:price',
    GetFee: 'network:fee',
    GetTransactions: 'network:transactions',
    GetPriceChart: 'network:price-chart',
    WriteClipboard: 'clipboard:write',
};

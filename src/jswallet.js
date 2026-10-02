/**
 * The functions that src/preload.js exposes, and nothing else:
 * listWallets, createWallet, deleteWallet, refreshWallet, sendPayment, getPrice, getFee,
 * getTransactions, getPriceChart and writeClipboard.
 * Each returns a promise that src/main/ipc.js settles with plain data: wallets come as
 * { name, address, network, coins, utxoValues }.
 */
const { jswallet } = window;

export default jswallet;

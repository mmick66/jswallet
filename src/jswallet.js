/**
 * The functions that src/preload.js exposes. Each returns a promise that src/main/ipc.js settles
 * with plain data: wallets come as { name, address, network, coins, utxoValues }.
 */
const { jswallet } = window;

export default jswallet;

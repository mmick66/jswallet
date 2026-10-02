import Constants from './logic/constants';

const sumFor = (entries, address) => {
    return entries.filter(e => e.address === address).reduce((a, e) => a + e.value, 0);
};

/**
 * One row per wallet that a transaction touches, with that wallet's net flow:
 * what its address receives in the outputs minus what it spends in the inputs.
 * @param txs Normalized transactions from network.api.getTransactions
 * @param wallets Objects with a name and an address
 */
const toPaymentRows = (txs, wallets) => {

    const rows = [];

    txs.forEach((tx) => {
        wallets.forEach((wallet) => {

            const touches = e => e.address === wallet.address;
            if (!tx.inputs.some(touches) && !tx.outputs.some(touches)) return;

            const net = sumFor(tx.outputs, wallet.address) - sumFor(tx.inputs, wallet.address);

            rows.push({
                key: `${tx.hash}/${wallet.address}`,
                name: wallet.name,
                address: wallet.address,
                inflow: net >= 0,
                time: tx.time === null ? 'Pending' : new Date(tx.time * 1000).toDateString(),
                coins: Math.abs(net) / Constants.Bitcoin.Satoshis,
                hash: tx.hash,
            });
        });
    });

    return rows;
};

export default toPaymentRows;

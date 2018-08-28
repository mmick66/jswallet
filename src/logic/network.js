import { exchange, blockexplorer, pushtx } from 'blockchain.info';
import bitcoin from 'bitcoinjs-lib';
import Constants from './constants';


const env = require('../env.json');

const c_exchange = exchange;

let c_blockexplorer;
let c_pushtx;
let c_network;

switch (env.network) {
case Constants.Bitcoin.Networks.Testnet:
    c_blockexplorer = blockexplorer.usingNetwork(3);
    c_pushtx = pushtx.usingNetwork(3).pushtx;
    c_network = bitcoin.networks.testnet;
    break;
case Constants.Bitcoin.Networks.Bitcoin:
    c_blockexplorer = blockexplorer;
    c_pushtx = pushtx.pushtx;
    c_network = bitcoin.networks.bitcoin;
    break;
default:
    throw new Error('Unknown network in env file');

}

const getPrice = currency => c_exchange.getTicker({ currency: currency || 'USD' });

const getFee = () => {
    return c_blockexplorer.getLatestBlock()
        .then(block => c_blockexplorer.getBlock(block.hash))
        .then(block => block.fee);
};

const broadcast = tx => c_pushtx(tx).then(result => result === Constants.ReturnValues.TransactionSubmitted);

const getUnspentOutputs = (address) => {
    return c_blockexplorer.getUnspentOutputs(address).then((result) => {
        return {
            utxos: result.unspent_outputs,
            coins: result.unspent_outputs.reduce((a, c) => a + c.value, 0) / Constants.Bitcoin.Satoshis
        };
    });
};


const getTransactions = (addresses) => {
    return c_blockexplorer.getMultiAddress(addresses, {}).then((result) => {
        return Array.isArray(result.txs) ? result.txs : [];
    });
};



export default {
    current: c_network,
    name: env.network,
    api: {
        getPrice: getPrice,
        getFee: getFee,
        broadcast: broadcast,
        getUnspentOutputs: getUnspentOutputs,
        getTransactions: getTransactions,
    }
};

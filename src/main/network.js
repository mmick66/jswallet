import axios from 'axios';
import Constants from '../common/constants';
import chain from '../common/chain';
import env from '../env.json';


// Esplora REST API (mempool.space) for the configured network
const c_apiBase = env.apiBase && env.apiBase[env.network];
if (!c_apiBase) throw new Error(`No apiBase for ${env.network} in env file`);

/**
 * Keeps the provider's error text (Esplora answers errors with a plain text body,
 * e.g. the "min relay fee not met" RPC error) in the message the UI reads.
 */
const toError = (e) => {
    const body = e.response && e.response.data;
    const detail = typeof body === 'string' && body ? `: ${body}` : '';
    return new Error(`${e.message}${detail}`, { cause: e });
};

const unwrap = (request) => request.then((response) => response.data, (e) => {
    throw toError(e);
});

const get = (url, config) => unwrap(axios.get(url, config));

const post = (url, data, config) => unwrap(axios.post(url, data, config));

// Responses that are plain text must not go through axios' JSON parsing
const asText = { responseType: 'text' };


// Normalized shapes, so that the UI does not depend on the provider

const toUtxo = (utxo) => ({
    txid: utxo.txid,
    vout: utxo.vout,
    value: utxo.value,
});

// Coinbase inputs have no prevout; OP_RETURN and bare scripts have no address
const toEntry = (output) => ({
    address: (output && output.scriptpubkey_address) || null,
    value: output ? output.value : 0,
});

const toTransaction = (tx) => ({
    hash: tx.txid,
    time: tx.status.confirmed ? tx.status.block_time : null,
    inputs: tx.vin.map((vin) => toEntry(vin.prevout)),
    outputs: tx.vout.map(toEntry),
});

// Unconfirmed transactions (no time yet) first, then newest first
const recency = (tx) => (tx.time === null ? Number.MAX_SAFE_INTEGER : tx.time);
const byNewest = (a, b) => recency(b) - recency(a);


const getPrice = (currency = 'USD') => get(Constants.Endpoints.Prices).then((prices) => {
    const price = prices[currency];
    if (typeof price !== 'number') throw new Error(`No ${currency} price available`);
    return price;
});

/**
 * @param timespan One of '30days', '90days' or '1year'
 * @returns {Promise<Array<{time: number, price: number}>>} Daily USD prices, time in seconds
 */
const getPriceChart = (timespan) => get(Constants.Endpoints.PriceChart, {
    // cors=true asks for the CORS headers that the renderer needed when it made this call; main does not need them
    params: { timespan: timespan, format: 'json', cors: true },
}).then((chart) => chart.values.map((point) => ({ time: point.x, price: point.y })));

/**
 * The fastest fee rate in sat/vB. The fee of a transaction depends on its size, see src/common/fee.js
 */
const getFee = () => get(`${c_apiBase}${Constants.Endpoints.Fees}`).then((fees) => {
    const rate = fees.fastestFee;
    if (typeof rate !== 'number' || !(rate > 0)) throw new Error('No fee rate available');
    return rate;
});

/**
 * @param tx The signed transaction as hex
 * @returns {Promise<string>} The txid; rejects with the node's error text
 */
const broadcast = (tx) => post(`${c_apiBase}/tx`, tx, {
    headers: { 'Content-Type': 'text/plain' },
    ...asText,
});

const getTxHex = (txid) => get(`${c_apiBase}/tx/${txid}/hex`, asText);

/**
 * @returns {Promise<Array<{txid: string, vout: number, value: number}>>} Values in satoshis
 */
const getUnspentOutputs = (address) => {
    return get(`${c_apiBase}/address/${address}/utxo`).then((utxos) => utxos.map(toUtxo));
};

/**
 * The latest transactions of each address (Esplora's first page: up to 50 unconfirmed and
 * 25 confirmed), merged without duplicates.
 * @returns {Promise<Array<{hash, time, inputs: Array<{address, value}>, outputs: Array<{address, value}>}>>}
 */
const getTransactions = (addresses) => {
    return Promise.all(addresses.map((address) => get(`${c_apiBase}/address/${address}/txs`))).then((pages) => {
        const byHash = new Map();
        pages.forEach((txs) => {
            txs.forEach((tx) => {
                if (!byHash.has(tx.txid)) byHash.set(tx.txid, toTransaction(tx));
            });
        });
        return [...byHash.values()].sort(byNewest);
    });
};



export default {
    current: chain.current,
    name: chain.name,
    api: {
        getPrice: getPrice,
        getPriceChart: getPriceChart,
        getFee: getFee,
        broadcast: broadcast,
        getTxHex: getTxHex,
        getUnspentOutputs: getUnspentOutputs,
        getTransactions: getTransactions,
    }
};

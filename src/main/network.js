import axios from 'axios';
import Constants from '../common/constants';
import chain from '../common/chain';
import env from '../env.json';
import { checkApiUrl } from './security/api-allowlist';


// Esplora REST API (mempool.space) for the configured network
const c_apiBase = env.apiBase && env.apiBase[env.network];

/**
 * Why the API is off, or null. Every configured URL must be https: on an allowed host
 * (see ./security/api-allowlist). If one is not, no request goes out and every call rejects with
 * this error, but the wallets stay readable.
 */
const c_disabled = (() => {
    try {
        if (!c_apiBase) throw new Error(`No apiBase for ${env.network} in env file`);
        [c_apiBase, Constants.Endpoints.Prices, Constants.Endpoints.PriceChart].forEach(checkApiUrl);
        return null;
    } catch (e) {
        return new Error(`Network features are disabled: ${e.message}`);
    }
})();
if (c_disabled) console.error(c_disabled.message);

/**
 * The client of every API call. Its interceptor checks each request against the allowlist,
 * whatever built the URL. It follows no redirect, which could lead to another host: Esplora and
 * the charts API do not redirect. Only the http adapter honors maxRedirects (fetch follows).
 */
export const client = axios.create({ adapter: 'http', maxRedirects: 0 });

client.interceptors.request.use((config) => {
    if (c_disabled) throw c_disabled;
    checkApiUrl(client.getUri(config));
    return config;
});

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

const get = (url, config) => unwrap(client.get(url, config));

const post = (url, data, config) => unwrap(client.post(url, data, config));

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

// Esplora pages the confirmed history 25 transactions at a time (/txs/chain/:last_seen_txid)
const c_chainPageSize = 25;
// The chain pages read per address at most (5,000 transactions), should the API keep answering full pages
const c_maxChainPages = 200;

/**
 * The history of an address, newest first, as Esplora returns it. The first page (/txs) holds the
 * unconfirmed transactions and then the latest confirmed ones: on mempool.space up to 50 in all,
 * on Blockstream's Esplora up to 50 unconfirmed and 25 confirmed. Each full page asks for the
 * confirmed transactions after the last one seen, until a page is short.
 */
const getHistory = (address) => {
    const url = `${c_apiBase}/address/${address}/txs`;
    const next = (history, page, pages) => {
        if (page.length < c_chainPageSize || pages === c_maxChainPages) return history;
        const last = history.findLast((tx) => tx.status.confirmed);
        const after = last ? `/${last.txid}` : '';
        return get(`${url}/chain${after}`).then((more) => next([...history, ...more], more, pages + 1));
    };
    return get(url).then((first) => next(first, first, 0));
};

/**
 * The transactions of each address, merged without duplicates.
 * @returns {Promise<Array<{hash, time, inputs: Array<{address, value}>, outputs: Array<{address, value}>}>>}
 */
const getTransactions = (addresses) => {
    return Promise.all(addresses.map(getHistory)).then((histories) => {
        const byHash = new Map();
        histories.forEach((txs) => {
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

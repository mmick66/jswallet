import http from 'http';
import https from 'https';
import net from 'net';
import {
    afterAll, afterEach, beforeAll, describe, expect, it, vi,
} from 'vitest';
import env from '../src/env.json';
import { checkApiUrl } from '../src/main/security/api-allowlist';
import { client } from '../src/main/network';

const BASE = 'https://mempool.space/testnet4/api';
const ADDRESS = 'mvE8CiixdhZycmZEUR4mUtEiAtnu9PK2YD';
const TXID = 'a6873a7d7bccba2d3ee05f48fad654f5fbd33b034e795240c7fab748ae8ee76a';

// Answers in place of the network, for requests that the interceptor lets through
const answer = () => vi.fn(config => Promise.resolve({
    status: 200, statusText: 'OK', headers: {}, config: config, data: null,
}));

// Each call of the API, and the URL it requests on testnet4
const calls = [
    [api => api.getPrice(), 'https://mempool.space/api/v1/prices'],
    [api => api.getPriceChart('30days'), 'https://api.blockchain.info/charts/market-price?timespan=30days&format=json&cors=true'],
    [api => api.getFee(), `${BASE}/v1/fees/recommended`],
    [api => api.broadcast('00'), `${BASE}/tx`],
    [api => api.getTxHex(TXID), `${BASE}/tx/${TXID}/hex`],
    [api => api.getUnspentOutputs(ADDRESS), `${BASE}/address/${ADDRESS}/utxo`],
    [api => api.getTransactions([ADDRESS]), `${BASE}/address/${ADDRESS}/txs`],
];

describe('checkApiUrl', () => {

    it.each([
        'https://mempool.space/api',
        'https://mempool.space/testnet4/api/tx',
        'https://api.blockchain.info/charts/market-price?timespan=30days',
        'https://MEMPOOL.SPACE:443/api', // the same host, in another case and with the default port
    ])('accepts %s', (url) => {
        expect(() => checkApiUrl(url)).not.toThrow();
    });

    it.each([
        'http://mempool.space/api',
        'http://api.blockchain.info/charts/market-price',
        'ws://mempool.space/api',
        'file:///etc/passwd',
    ])('rejects %s, which does not use https:', (url) => {
        expect(() => checkApiUrl(url)).toThrow(`${url} does not use https:`);
    });

    it.each([
        'https://example.com/api',
        'https://blockchain.info/charts/market-price',
        'https://www.mempool.space/api',
        'https://mempool.space.example.com/api',
        'https://mempool.space@example.com/api',
        'https://mempool.space:8443/api',
        'https://127.0.0.1/api',
    ])('rejects %s, which is not on an allowed host', (url) => {
        expect(() => checkApiUrl(url)).toThrow('is not on an allowed host (mempool.space, api.blockchain.info)');
    });

    it.each(['', 'mempool.space/api', '/api', undefined])('rejects %j, which is not a URL', (url) => {
        expect(() => checkApiUrl(url)).toThrow('is not a URL');
    });
});

describe('the API client', () => {

    it('lets a request to an allowed https: URL through', async () => {
        const adapter = answer();
        await client.get('https://mempool.space/api/v1/prices', { adapter });
        expect(adapter).toHaveBeenCalledOnce();
    });

    it.each([
        ['http://mempool.space/api/v1/prices', {}, 'does not use https:'],
        ['https://example.com/api/v1/prices', {}, 'is not on an allowed host'],
        ['/api/v1/prices', { baseURL: 'https://example.com' }, 'is not on an allowed host'],
    ])('rejects %s %j before it goes out', async (url, config, reason) => {
        const adapter = answer();
        await expect(client.get(url, { ...config, adapter })).rejects.toThrow(reason);
        await expect(client.post(url, '00', { ...config, adapter })).rejects.toThrow(reason);
        expect(adapter).not.toHaveBeenCalled();
    });
});

describe('network with env.json', () => {

    afterEach(() => {
        vi.doUnmock('../src/env.json');
        vi.resetModules();
        vi.restoreAllMocks();
    });

    // A fresh network module, and so a fresh client, on this config
    const load = (config) => {
        vi.resetModules();
        vi.doMock('../src/env.json', () => ({ default: config }));
        return import('../src/main/network');
    };

    it.each(['testnet', 'bitcoin'])('calls the API with the default apiBase of %s', async (name) => {
        const error = vi.spyOn(console, 'error');
        const { default: network, client: fresh } = await load({ ...env, network: name });
        fresh.defaults.adapter = answer();

        // The answers are empty: only the requests matter here
        await Promise.all(calls.map(([call]) => call(network.api).catch(() => {})));

        const urls = fresh.defaults.adapter.mock.calls.map(([config]) => fresh.getUri(config));
        expect(urls.sort()).toEqual(calls.map(([, url]) => url.replace(BASE, env.apiBase[name])).sort());
        expect(error).not.toHaveBeenCalled();
    });

    it.each([
        ['an http: apiBase', { testnet: 'http://mempool.space/testnet4/api' }, 'http://mempool.space/testnet4/api does not use https:'],
        ['an apiBase on another host', { testnet: 'https://example.com/api' }, 'https://example.com/api is not on an allowed host'],
        ['an apiBase that is not a URL', { testnet: 'mempool.space/testnet4/api' }, 'mempool.space/testnet4/api is not a URL'],
        ['no apiBase for the network', { bitcoin: 'https://mempool.space/api' }, 'No apiBase for testnet in env file'],
    ])('disables every call of the API for %s', async (what, apiBase, reason) => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { default: network, client: fresh } = await load({ network: 'testnet', apiBase: apiBase });
        fresh.defaults.adapter = answer();

        expect(error).toHaveBeenCalledWith(expect.stringContaining(`Network features are disabled: ${reason}`));
        await Promise.all(calls.map(([call]) => expect(call(network.api))
            .rejects.toThrow(`Network features are disabled: ${reason}`)));
        expect(fresh.defaults.adapter).not.toHaveBeenCalled();
    });

    describe('when the API redirects', () => {

        // A server that answers every request with a redirect. The client reaches it through an agent
        // that connects to it in place of the host, so the URLs, and the allowlist, stay real.
        let redirect;
        const requests = [];
        const server = http.createServer((req, res) => {
            requests.push(`${req.method} ${req.headers.host}${req.url}`);
            res.writeHead(redirect.status, { Location: redirect.location });
            res.end();
        });
        const agent = new https.Agent();
        agent.createConnection = () => net.connect(server.address().port, '127.0.0.1');

        beforeAll(() => new Promise((resolve) => {
            server.listen(0, '127.0.0.1', resolve);
        }));

        afterAll(() => new Promise((resolve) => {
            server.closeAllConnections();
            server.close(resolve);
        }));

        it.each([
            ['getPrice', api => api.getPrice(), 'GET mempool.space/api/v1/prices', 302, 'https://example.com/steal'],
            ['broadcast', api => api.broadcast('00'), 'POST mempool.space/testnet4/api/tx', 307, 'https://example.com/steal'],
            ['getUnspentOutputs', api => api.getUnspentOutputs(ADDRESS), `GET mempool.space/testnet4/api/address/${ADDRESS}/utxo`,
                301, 'https://mempool.space/elsewhere'],
        ])('does not follow it from %s', async (name, call, request, status, location) => {
            redirect = { status, location };
            requests.length = 0;
            const { default: network, client: fresh } = await load({ ...env, network: 'testnet' });
            Object.assign(fresh.defaults, { httpsAgent: agent, proxy: false });

            await expect(call(network.api)).rejects.toThrow(`Request failed with status code ${status}`);
            expect(requests).toEqual([request]);
        });
    });
});

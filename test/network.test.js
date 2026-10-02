import fs from 'fs';
import path from 'path';
import axios, { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Constants from '../src/common/constants';
import network from '../src/main/network';

// Recorded from mempool.space (testnet4 unless noted) on 2026-10-02:
//   utxo.json, txs.json   /address/mvE8CiixdhZycmZEUR4mUtEiAtnu9PK2YD/utxo and /txs
//   coinbase-tx.json      /tx/4226d91c...593f (a coinbase, its input has no prevout)
//   mempool-tx.json       /tx/f0e98a20...22d8 (unconfirmed)
//   tx.hex                /tx/a6873a7d...e76a/hex
//   fees.json             mainnet /v1/fees/recommended
//   prices.json           mainnet /v1/prices
//   broadcast-error.txt   the 400 body of POST /tx with the body "deadbeef"
//   market-price.json     https://api.blockchain.info/charts/market-price?timespan=30days&format=json
const FIXTURES = path.join(__dirname, 'fixtures', 'mempool');
const text = name => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const json = name => JSON.parse(text(name));

const BASE = 'https://mempool.space/testnet4/api';
const ADDRESS = 'mvE8CiixdhZycmZEUR4mUtEiAtnu9PK2YD';

const ok = data => Promise.resolve({ status: 200, data: data });

const httpError = (status, body) => new AxiosError(
    `Request failed with status code ${status}`, AxiosError.ERR_BAD_REQUEST, {}, {}, { status: status, data: body },
);

describe('network', () => {

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('uses testnet and testnet4 by default', async () => {
        const get = vi.spyOn(axios, 'get').mockReturnValue(ok(json('fees.json')));

        await network.api.getFee();

        expect(network.name).toBe(Constants.Networks.Testnet);
        expect(network.current.bech32).toBe('tb');
        expect(get).toHaveBeenCalledWith(`${BASE}/v1/fees/recommended`, undefined);
    });

    describe('getUnspentOutputs', () => {

        it('normalizes UTXOs to { txid, vout, value }', async () => {
            const get = vi.spyOn(axios, 'get').mockReturnValue(ok(json('utxo.json')));

            const utxos = await network.api.getUnspentOutputs(ADDRESS);

            expect(get).toHaveBeenCalledWith(`${BASE}/address/${ADDRESS}/utxo`, undefined);
            expect(utxos).toEqual([
                { txid: 'a6873a7d7bccba2d3ee05f48fad654f5fbd33b034e795240c7fab748ae8ee76a', vout: 0, value: 207256 },
                { txid: 'aedaf242c83a50e071bcae28baa31d6e97ee2dc9980591b9899e5432d8c97353', vout: 1, value: 129480 },
            ]);
        });

        it('resolves to no UTXOs for an empty address', async () => {
            vi.spyOn(axios, 'get').mockReturnValue(ok([]));
            expect(await network.api.getUnspentOutputs(ADDRESS)).toEqual([]);
        });
    });

    describe('getTransactions', () => {

        it('normalizes transactions to { hash, time, inputs, outputs }', async () => {
            const get = vi.spyOn(axios, 'get').mockReturnValue(ok(json('txs.json')));

            const txs = await network.api.getTransactions([ADDRESS]);

            expect(get).toHaveBeenCalledWith(`${BASE}/address/${ADDRESS}/txs`, undefined);
            expect(txs).toEqual([
                {
                    hash: 'a6873a7d7bccba2d3ee05f48fad654f5fbd33b034e795240c7fab748ae8ee76a',
                    time: 1790903134,
                    inputs: [{ address: 'msnAjqUbt9VGJPr4sC6ziCUMQFxhB8t9YN', value: 3344377645 }],
                    outputs: [
                        { address: ADDRESS, value: 207256 },
                        { address: 'mqoSUvLoJLsT95VYTTPA4xJ5o7LwYaCSVw', value: 3344170161 },
                    ],
                },
                {
                    hash: 'aedaf242c83a50e071bcae28baa31d6e97ee2dc9980591b9899e5432d8c97353',
                    time: 1790903134,
                    inputs: [{ address: ADDRESS, value: 209080 }],
                    outputs: [
                        { address: 'msewZs5Cz7CbvzejUETXS6bvK8DtNwJJRY', value: 74600 },
                        { address: ADDRESS, value: 129480 },
                    ],
                },
                {
                    hash: '0119eeef8e8386f8c921393f3178acedd45682cc25742982192e672fd5297fa9',
                    time: 1790826390,
                    inputs: [{ address: 'tb1pvvaz08nu95v5p2hsq4p5szs6ydxu9gvllqv3wcm297ultk389ppqdwe0mm', value: 1309281115 }],
                    outputs: [
                        { address: ADDRESS, value: 209080 },
                        { address: 'mxRGhsgmxhwuc3QyrYyvFoYmaPvgDJJPDF', value: 1309071896 },
                    ],
                },
            ]);
        });

        it('gives a coinbase input no address and no value', async () => {
            vi.spyOn(axios, 'get').mockReturnValue(ok([json('coinbase-tx.json')]));

            const [tx] = await network.api.getTransactions([ADDRESS]);

            expect(tx.inputs).toEqual([{ address: null, value: 0 }]);
            expect(tx.outputs).toEqual([{ address: 'tb1qur7330emxypadqvr0mu4989sfzw32gpkxgyd2m', value: 5000000000 }]);
        });

        it('merges the addresses, without duplicates, unconfirmed first and then newest first', async () => {
            const [newest, , oldest] = json('txs.json');
            const unconfirmed = json('mempool-tx.json');
            const pages = {
                [`${BASE}/address/a/txs`]: [oldest, newest],
                [`${BASE}/address/b/txs`]: [unconfirmed, newest],
            };
            vi.spyOn(axios, 'get').mockImplementation(url => ok(pages[url]));

            const txs = await network.api.getTransactions(['a', 'b']);

            expect(txs.map(tx => tx.hash)).toEqual([unconfirmed.txid, newest.txid, oldest.txid]);
            expect(txs[0].time).toBeNull();
        });

        it('makes no request without addresses', async () => {
            const get = vi.spyOn(axios, 'get');
            expect(await network.api.getTransactions([])).toEqual([]);
            expect(get).not.toHaveBeenCalled();
        });

        it('rejects when an address cannot be read', async () => {
            vi.spyOn(axios, 'get').mockRejectedValue(httpError(400, 'Invalid Bitcoin address'));
            await expect(network.api.getTransactions(['x'])).rejects.toThrow('Invalid Bitcoin address');
        });
    });

    describe('getFee', () => {

        it('prices an average transaction at fastestFee sat/vB, in bitcoins', async () => {
            vi.spyOn(axios, 'get').mockReturnValue(ok(json('fees.json')));
            expect(await network.api.getFee()).toBe((1 * 255) / 1e8);
        });

        it('reads fastestFee and not the slower rates', async () => {
            vi.spyOn(axios, 'get').mockReturnValue(ok({
                fastestFee: 12, halfHourFee: 8, hourFee: 5, economyFee: 2, minimumFee: 1,
            }));
            expect(await network.api.getFee()).toBe((12 * 255) / 1e8);
        });

        it('rejects instead of resolving a zero fee when the API fails', async () => {
            vi.spyOn(axios, 'get').mockRejectedValue(httpError(502, 'Bad Gateway'));
            await expect(network.api.getFee()).rejects.toThrow('status code 502: Bad Gateway');
        });
    });

    describe('getPrice', () => {

        it('resolves to the mainnet USD price as a number', async () => {
            const get = vi.spyOn(axios, 'get').mockReturnValue(ok(json('prices.json')));

            expect(await network.api.getPrice()).toBe(85962);
            expect(get).toHaveBeenCalledWith('https://mempool.space/api/v1/prices', undefined);
        });

        it('reads other currencies', async () => {
            vi.spyOn(axios, 'get').mockReturnValue(ok(json('prices.json')));
            expect(await network.api.getPrice('EUR')).toBe(76352);
        });

        it('rejects for a currency without a price', async () => {
            vi.spyOn(axios, 'get').mockReturnValue(ok(json('prices.json')));
            await expect(network.api.getPrice('XYZ')).rejects.toThrow('No XYZ price available');
        });
    });

    describe('getPriceChart', () => {

        it('requests the timespan and normalizes points to { time, price }', async () => {
            const chart = json('market-price.json');
            const get = vi.spyOn(axios, 'get').mockReturnValue(ok(chart));

            const points = await network.api.getPriceChart('30days');

            expect(get).toHaveBeenCalledWith('https://api.blockchain.info/charts/market-price', {
                params: { timespan: '30days', format: 'json', cors: true },
            });
            expect(points).toHaveLength(chart.values.length);
            expect(points[0]).toEqual({ time: 1788307200, price: 77410.57 });
        });
    });

    describe('getTxHex', () => {

        it('resolves to the raw transaction as text', async () => {
            const hex = text('tx.hex');
            const get = vi.spyOn(axios, 'get').mockReturnValue(ok(hex));
            const txid = 'a6873a7d7bccba2d3ee05f48fad654f5fbd33b034e795240c7fab748ae8ee76a';

            expect(await network.api.getTxHex(txid)).toBe(hex);
            expect(get).toHaveBeenCalledWith(`${BASE}/tx/${txid}/hex`, { responseType: 'text' });
        });
    });

    describe('broadcast', () => {

        it('posts the raw hex as text/plain and resolves to the txid', async () => {
            const hex = text('tx.hex');
            const txid = 'a6873a7d7bccba2d3ee05f48fad654f5fbd33b034e795240c7fab748ae8ee76a';
            const post = vi.spyOn(axios, 'post').mockReturnValue(ok(txid));

            expect(await network.api.broadcast(hex)).toBe(txid);
            expect(post).toHaveBeenCalledWith(`${BASE}/tx`, hex, {
                headers: { 'Content-Type': 'text/plain' },
                responseType: 'text',
            });
        });

        it('rejects with the node error text', async () => {
            const body = text('broadcast-error.txt');
            const failure = httpError(400, body);
            vi.spyOn(axios, 'post').mockRejectedValue(failure);

            const error = await network.api.broadcast('deadbeef').catch(e => e);

            expect(error).toBeInstanceOf(Error);
            expect(error.message).toBe(`Request failed with status code 400: ${body}`);
            expect(error.cause).toBe(failure);
        });

        it('keeps the minimum relay fee error recognizable by the UI', async () => {
            const body = 'sendrawtransaction RPC error: {"code":-26,"message":"min relay fee not met, 0 < 110"}';
            vi.spyOn(axios, 'post').mockRejectedValue(httpError(400, body));

            const error = await network.api.broadcast('00').catch(e => e);

            expect(error.toString()).toContain(Constants.ReturnValues.Fragments.MinimumFeeNotMet);
        });

        it('rejects when the request does not reach the API', async () => {
            vi.spyOn(axios, 'post').mockRejectedValue(new AxiosError('Network Error', AxiosError.ERR_NETWORK));
            await expect(network.api.broadcast('00')).rejects.toThrow(/^Network Error$/);
        });
    });
});

describe('network on mainnet', () => {

    afterEach(() => {
        vi.doUnmock('../src/env.json');
        vi.resetModules();
        vi.restoreAllMocks();
    });

    const load = (env) => {
        vi.resetModules();
        vi.doMock('../src/env.json', () => ({ default: env }));
        return import('../src/main/network').then(m => m.default);
    };

    it('uses the bitcoin network and its apiBase from env.json', async () => {
        const mainnet = await load({
            network: 'bitcoin',
            apiBase: { bitcoin: 'https://mempool.space/api', testnet: BASE },
        });
        const get = vi.spyOn(axios, 'get').mockReturnValue(ok(json('utxo.json')));

        await mainnet.api.getUnspentOutputs('1BoatSLRHtKNngkdXEeobR76b53LETtpyT');

        expect(mainnet.current.bech32).toBe('bc');
        expect(get).toHaveBeenCalledWith('https://mempool.space/api/address/1BoatSLRHtKNngkdXEeobR76b53LETtpyT/utxo', undefined);
    });

    it('refuses to load without an apiBase for the network', async () => {
        await expect(load({ network: 'bitcoin', apiBase: { testnet: BASE } }))
            .rejects.toThrow('No apiBase for bitcoin in env file');
    });
});

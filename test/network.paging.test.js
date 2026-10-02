import fs from 'fs';
import path from 'path';
import { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import network, { client } from '../src/main/network';

const FIXTURES = path.join(__dirname, 'fixtures', 'mempool');
const json = name => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));

const BASE = 'https://mempool.space/testnet4/api';
const TXS = `${BASE}/address/a/txs`;

// Transactions shaped as Esplora returns them, numbered newest first
const [template] = json('txs.json');
const txid = n => n.toString(16).padStart(64, '0');
const confirmed = n => ({ ...template, txid: txid(n), status: { ...template.status, block_time: 1790903134 - n } });
const unconfirmed = n => ({ ...template, txid: txid(n), status: { confirmed: false } });
const range = (from, count, make = confirmed) => Array.from({ length: count }, (_, i) => make(from + i));

const ok = data => Promise.resolve({ status: 200, data: data });

// Answers each URL with its page, and an unexpected URL with a 404
const serve = (pages) => vi.spyOn(client, 'get').mockImplementation((url) => {
    if (url in pages) return ok(pages[url]);
    return Promise.reject(new AxiosError('Request failed with status code 404', AxiosError.ERR_BAD_REQUEST));
});

const urls = get => get.mock.calls.map(([url]) => url);

describe('network.api.getTransactions paging', () => {

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reads only the first page when it is short', async () => {
        const get = serve({ [TXS]: [...range(0, 2, unconfirmed), ...range(2, 22)] });

        const txs = await network.api.getTransactions(['a']);

        expect(urls(get)).toEqual([TXS]);
        expect(txs).toHaveLength(24);
    });

    it('pages the confirmed history after mempool.space\'s first page of 50, until a page is short', async () => {
        const get = serve({
            [TXS]: range(0, 50),
            [`${TXS}/chain/${txid(49)}`]: range(50, 25),
            [`${TXS}/chain/${txid(74)}`]: range(75, 25),
            [`${TXS}/chain/${txid(99)}`]: range(100, 3),
        });

        const txs = await network.api.getTransactions(['a']);

        expect(urls(get)).toEqual([TXS, `${TXS}/chain/${txid(49)}`, `${TXS}/chain/${txid(74)}`, `${TXS}/chain/${txid(99)}`]);
        expect(txs.map(tx => tx.hash)).toEqual(range(0, 103).map(tx => tx.txid));
    });

    it('pages after the last confirmed transaction of a first page that also holds unconfirmed ones', async () => {
        const get = serve({
            [TXS]: [...range(0, 10, unconfirmed), ...range(10, 25)],
            [`${TXS}/chain/${txid(34)}`]: range(35, 1),
        });

        const txs = await network.api.getTransactions(['a']);

        expect(urls(get)).toEqual([TXS, `${TXS}/chain/${txid(34)}`]);
        expect(txs).toHaveLength(36);
        expect(txs.slice(0, 10).every(tx => tx.time === null)).toBe(true);
    });

    it('pages the confirmed history from its start after a first page full of unconfirmed transactions', async () => {
        const get = serve({
            [TXS]: range(0, 50, unconfirmed),
            [`${TXS}/chain`]: range(50, 2),
        });

        const txs = await network.api.getTransactions(['a']);

        expect(urls(get)).toEqual([TXS, `${TXS}/chain`]);
        expect(txs).toHaveLength(52);
    });

    it('stops at an empty page when the history fills its last page', async () => {
        const get = serve({
            [TXS]: range(0, 50),
            [`${TXS}/chain/${txid(49)}`]: [],
        });

        const txs = await network.api.getTransactions(['a']);

        expect(urls(get)).toEqual([TXS, `${TXS}/chain/${txid(49)}`]);
        expect(txs).toHaveLength(50);
    });

    it('stops after 200 chain pages when the API keeps answering full pages', async () => {
        const page = range(0, 25);
        const get = vi.spyOn(client, 'get').mockImplementation(() => ok(page));

        const txs = await network.api.getTransactions(['a']);

        expect(get).toHaveBeenCalledTimes(201);
        expect(txs).toHaveLength(25);
    });

    it('pages each address on its own and merges them without duplicates', async () => {
        const b = `${BASE}/address/b/txs`;
        const get = serve({
            [TXS]: range(0, 25),
            [`${TXS}/chain/${txid(24)}`]: range(25, 5),
            [b]: range(20, 10),
        });

        const txs = await network.api.getTransactions(['a', 'b']);

        expect(urls(get).sort()).toEqual([TXS, `${TXS}/chain/${txid(24)}`, b].sort());
        expect(txs.map(tx => tx.hash)).toEqual(range(0, 30).map(tx => tx.txid));
    });

    it('rejects when a later page cannot be read', async () => {
        serve({ [TXS]: range(0, 50) });
        await expect(network.api.getTransactions(['a'])).rejects.toThrow('status code 404');
    });
});

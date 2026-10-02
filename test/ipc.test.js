import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bitcoin from '../src/common/bitcoin';
import Channels from '../src/common/ipc.channels';
import Constants from '../src/common/constants';
import cipher from '../src/main/cipher';
import Database from '../src/main/database';
import Hasher from '../src/main/hasher.util';
import network from '../src/main/network';
import Wallet from '../src/main/wallet.class';
import { createIpcHandlers, registerIpcHandlers } from '../src/main/ipc';

// Testnet WIF of private key 1 and its address
const WIF = 'cMahea7zqjxrtgAbB7LSGbcQUr1uX1ojuat9jZodMN87JcbXMTcA';
const ADDRESS = 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r';
const RECEIVER = 'tb1qur7330emxypadqvr0mu4989sfzw32gpkxgyd2m';
const MAINNET = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
// What the user types, and Hasher.hash of it, which the wallets are encrypted with
const TYPED = 'hunter2';
const PASSWORD = '2fce64ac1708c5916a6958f9f25419c408580ed2bdf8a336805fcdd1db7f7346e6a9156eaecf1b2ee58d142939bc9762';
// WIF as crypto.createCipher('aes-256-cbc', PASSWORD) stored it; see cipher.test.js
const LEGACY_WIF = '87d47afa0b1f75d574b022f58593dda7b4d109ebee898597716d14df253650e5c86877c5767832c203d7d38dc2136c809b29c4f6d7d6ccfbb3ec32f6bef04039';

const LEGACY_RECORD = {
    name: 'Savings',
    address: ADDRESS,
    wif: LEGACY_WIF,
    network: 'testnet',
    password: PASSWORD,
};

const script = address => bitcoin.address.toOutputScript(address, network.current);

// A fabricated previous transaction that pays the wallet 60000 sat in output 0
const PREV = new bitcoin.Transaction();
PREV.version = 2;
PREV.addInput(new Uint8Array(32).fill(7), 1);
PREV.addOutput(script(ADDRESS), 60000n);
const UTXOS = [{ txid: PREV.getId(), vout: 0, value: 60000 }];
// sat/vB: spending one UTXO with change is 226 vB
const RATE = 10;

// Every string anywhere in a value, to check that no key or password hash crosses IPC
const strings = value => {
    if (typeof value === 'string') return [value];
    if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
    return [];
};

describe('IPC handlers', () => {
    let dir;
    let writeClipboard;
    let handlers;

    const call = (channel, arg) => handlers[channel](arg);
    // Read back from the file, once the app's store has loaded it (nedb hangs on a file that two stores load at once)
    const stored = () => Wallet.store.find({}).then(() => new Database('wallets', dir).find({}));

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jswallet-ipc-'));
        Wallet.open(dir);
        writeClipboard = vi.fn().mockResolvedValue(undefined);
        handlers = createIpcHandlers({ writeClipboard });
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await Wallet.store.find({});
        Wallet.__store = undefined;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('answers every channel', () => {
        expect(Object.keys(handlers).sort()).toEqual(Object.values(Channels).sort());
    });

    it('registers each handler with ipcMain and passes it only the argument', async () => {
        const ipcMain = { handle: vi.fn() };
        const ping = vi.fn().mockResolvedValue('pong');

        registerIpcHandlers(ipcMain, { 'test:ping': ping });

        expect(ipcMain.handle).toHaveBeenCalledWith('test:ping', expect.any(Function));
        const [[, listener]] = ipcMain.handle.mock.calls;
        expect(await listener({ sender: {} }, 'arg', 'extra')).toBe('pong');
        expect(ping).toHaveBeenCalledWith('arg');
    });

    describe('createWallet', () => {

        it('stores a wallet encrypted with the hash of the password and returns its mnemonic once', async () => {
            const { wallet, mnemonic } = await call(Channels.CreateWallet, { name: 'New', password: TYPED });

            expect(mnemonic.split(' ')).toHaveLength(12);
            const restored = Wallet.create('New', mnemonic);
            expect(wallet).toEqual({
                name: 'New', address: restored.address, network: 'testnet', coins: 0, utxoValues: [],
            });

            const [doc] = await stored();
            expect(doc).toMatchObject({ name: 'New', address: restored.address, password: await Hasher.hash(TYPED) });
            expect(cipher.isLegacy(doc.wif)).toBe(false);
            expect(cipher.decrypt(doc.wif, PASSWORD)).toBe(restored.wif);
            expect(JSON.stringify(doc)).not.toContain(mnemonic);
        });

        it.each([
            ['no arguments', undefined],
            ['no name', { password: TYPED }],
            ['an empty name', { name: '', password: TYPED }],
            ['a name of 101 characters', { name: 'n'.repeat(101), password: TYPED }],
            ['a password that is not a string', { name: 'New', password: 1234 }],
            ['a password of 1025 characters', { name: 'New', password: 'p'.repeat(1025) }],
        ])('rejects %s', async (what, args) => {
            await expect(call(Channels.CreateWallet, args)).rejects.toThrow(TypeError);
            expect(await stored()).toEqual([]);
        });

        it('does not repeat the password in its errors', async () => {
            const password = 'p'.repeat(1025);
            await expect(call(Channels.CreateWallet, { name: 'New', password })).rejects.toThrow(/^Invalid password/);
            await call(Channels.CreateWallet, { name: 'New', password }).catch(e => expect(e.message).not.toContain(password));
        });
    });

    describe('listWallets', () => {

        it('returns plain data without the key or the password hash', async () => {
            await Wallet.store.insert(LEGACY_RECORD);
            await call(Channels.CreateWallet, { name: 'New', password: TYPED });

            const wallets = await call(Channels.ListWallets);

            expect(wallets).toHaveLength(2);
            wallets.forEach(w => expect(Object.keys(w).sort()).toEqual(['address', 'coins', 'name', 'network', 'utxoValues']));
            expect(wallets.find(w => w.name === 'Savings')).toEqual({
                name: 'Savings', address: ADDRESS, network: 'testnet', coins: 0, utxoValues: [],
            });
            const docs = await stored();
            const secrets = docs.flatMap(doc => [doc.wif, doc.password]);
            expect(strings(wallets).filter(s => secrets.includes(s))).toEqual([]);
        });

        it('lists only the wallets of the configured network', async () => {
            await Wallet.store.insert({ ...LEGACY_RECORD, address: MAINNET, network: 'bitcoin' });
            expect(await call(Channels.ListWallets)).toEqual([]);
        });
    });

    describe('refreshWallet', () => {

        it('resolves with the balance and values of the unspent outputs, which listWallets then shows', async () => {
            await Wallet.store.insert(LEGACY_RECORD);
            const getUnspentOutputs = vi.spyOn(network.api, 'getUnspentOutputs').mockResolvedValue([
                { txid: 'a', vout: 0, value: 60000 }, { txid: 'b', vout: 1, value: 15000 },
            ]);

            const balance = { coins: 0.00075, utxoValues: [60000, 15000] };
            expect(await call(Channels.RefreshWallet, ADDRESS)).toEqual(balance);
            expect(getUnspentOutputs).toHaveBeenCalledWith(ADDRESS);
            expect(await call(Channels.ListWallets)).toEqual([expect.objectContaining({ address: ADDRESS, ...balance })]);
        });

        it('rejects an address that has no wallet', async () => {
            await expect(call(Channels.RefreshWallet, RECEIVER)).rejects.toThrow(`No wallet has the address ${RECEIVER}`);
        });

        it.each([
            ['a mainnet address', MAINNET],
            ['a number', 42],
            ['an address of 101 characters', 'm'.repeat(101)],
        ])('rejects %s', async (what, address) => {
            const getUnspentOutputs = vi.spyOn(network.api, 'getUnspentOutputs');
            await expect(call(Channels.RefreshWallet, address)).rejects.toThrow(TypeError);
            expect(getUnspentOutputs).not.toHaveBeenCalled();
        });
    });

    describe('deleteWallet', () => {

        it('resolves once the wallet is removed from the store', async () => {
            await Wallet.store.insert(LEGACY_RECORD);
            await Wallet.store.insert({ ...LEGACY_RECORD, name: 'Other', address: RECEIVER });

            await call(Channels.DeleteWallet, ADDRESS);

            expect((await stored()).map(doc => doc.address)).toEqual([RECEIVER]);
            expect((await call(Channels.ListWallets)).map(w => w.address)).toEqual([RECEIVER]);
        });

        it('rejects when the store cannot remove it', async () => {
            await Wallet.store.insert(LEGACY_RECORD);
            vi.spyOn(Wallet.store, 'remove').mockRejectedValue(new Error('disk full'));

            await expect(call(Channels.DeleteWallet, ADDRESS)).rejects.toThrow('disk full');
        });
    });

    describe('sendPayment', () => {
        let broadcast;

        beforeEach(async () => {
            await Wallet.store.insert(LEGACY_RECORD);
            vi.spyOn(network.api, 'getUnspentOutputs').mockResolvedValue(UTXOS);
            vi.spyOn(network.api, 'getFee').mockResolvedValue(RATE);
            vi.spyOn(network.api, 'getTxHex').mockResolvedValue(PREV.toHex());
            broadcast = vi.spyOn(network.api, 'broadcast').mockImplementation(hex => Promise.resolve(
                bitcoin.Transaction.fromHex(hex).getId(),
            ));
        });

        it('sends from a legacy-encrypted wallet with the current outputs and fee rate, and upgrades its key', async () => {
            const { txid } = await call(Channels.SendPayment, {
                from: ADDRESS, to: RECEIVER, btc: '0.00050000', password: TYPED,
            });

            const tx = bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0]);
            expect(txid).toBe(tx.getId());
            expect(tx.outs).toEqual([
                { script: script(RECEIVER), value: 50000n },
                { script: script(ADDRESS), value: 60000n - 50000n - 2260n },
            ]);

            const [doc] = await stored();
            expect(doc.wif).toMatch(/^v2:/);
            expect(cipher.decrypt(doc.wif, PASSWORD)).toBe(WIF);
        });

        it('rejects a wrong password before it touches the network', async () => {
            await expect(call(Channels.SendPayment, {
                from: ADDRESS, to: RECEIVER, btc: '0.0005', password: 'hunter3',
            })).rejects.toThrow(Constants.ReturnValues.Fragments.WrongPassword);

            expect(network.api.getUnspentOutputs).not.toHaveBeenCalled();
            expect(broadcast).not.toHaveBeenCalled();
            expect((await stored())[0].wif).toBe(LEGACY_WIF);
        });

        it.each([
            ['no arguments', undefined],
            ['a receiver on another network', { to: MAINNET }],
            ['a sender with a bad checksum', { from: 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8s' }],
            ['a negative amount', { btc: '-0.0005' }],
            ['an amount that is not a number', { btc: '0.0005 BTC' }],
            ['an amount of 33 characters', { btc: `0.${'0'.repeat(31)}` }],
            ['an amount that is not finite', { btc: Infinity }],
            ['no password', { password: '' }],
        ])('rejects %s', async (what, args) => {
            const valid = {
                from: ADDRESS, to: RECEIVER, btc: '0.0005', password: TYPED,
            };
            await expect(call(Channels.SendPayment, args && { ...valid, ...args })).rejects.toThrow(TypeError);
            expect(broadcast).not.toHaveBeenCalled();
        });
    });

    describe('network calls', () => {

        it('passes getPrice, getFee and getTransactions through', async () => {
            vi.spyOn(network.api, 'getPrice').mockResolvedValue(64000);
            vi.spyOn(network.api, 'getFee').mockResolvedValue(RATE);
            const getTransactions = vi.spyOn(network.api, 'getTransactions').mockResolvedValue([{ hash: 'a' }]);

            expect(await call(Channels.GetPrice)).toBe(64000);
            expect(await call(Channels.GetFee)).toBe(RATE);
            expect(await call(Channels.GetTransactions, [ADDRESS, RECEIVER])).toEqual([{ hash: 'a' }]);
            expect(getTransactions).toHaveBeenCalledWith([ADDRESS, RECEIVER]);
        });

        it.each([
            ['an address list that is not an array', ADDRESS],
            ['an invalid address in the list', [ADDRESS, MAINNET]],
            ['more than 100 addresses', Array(101).fill(ADDRESS)],
        ])('rejects %s for getTransactions', async (what, addresses) => {
            const getTransactions = vi.spyOn(network.api, 'getTransactions');
            await expect(call(Channels.GetTransactions, addresses)).rejects.toThrow(TypeError);
            expect(getTransactions).not.toHaveBeenCalled();
        });

        it('passes the known timespans to getPriceChart and rejects others', async () => {
            const getPriceChart = vi.spyOn(network.api, 'getPriceChart').mockResolvedValue([]);

            await Promise.all(['30days', '90days', '1year'].map(t => call(Channels.GetPriceChart, t)));
            expect(getPriceChart.mock.calls).toEqual([['30days'], ['90days'], ['1year']]);

            await expect(call(Channels.GetPriceChart, '1day')).rejects.toThrow(TypeError);
            expect(getPriceChart).toHaveBeenCalledTimes(3);
        });
    });

    describe('writeClipboard', () => {

        it('writes the text with the clipboard of main', async () => {
            await call(Channels.WriteClipboard, ADDRESS);
            expect(writeClipboard).toHaveBeenCalledWith(ADDRESS);
        });

        it.each([
            ['no text', undefined],
            ['an object', { text: ADDRESS }],
            ['text of 1001 characters', 't'.repeat(1001)],
        ])('rejects %s', async (what, text) => {
            await expect(call(Channels.WriteClipboard, text)).rejects.toThrow(TypeError);
            expect(writeClipboard).not.toHaveBeenCalled();
        });
    });
});

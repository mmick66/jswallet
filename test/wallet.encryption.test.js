import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cipher from '../src/main/cipher';
import Database from '../src/main/database';
import Wallet from '../src/main/wallet.class';

// Testnet WIF of private key 1 and its address
const WIF = 'cMahea7zqjxrtgAbB7LSGbcQUr1uX1ojuat9jZodMN87JcbXMTcA';
const ADDRESS = 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r';
// Hasher.hash('hunter2')
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

describe('Wallet encryption', () => {
    let dir;

    const stored = () => new Database('wallets', dir).find({ address: ADDRESS }).then(([doc]) => doc);

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jswallet-wallet-'));
        Wallet.__store = new Database('wallets', dir);
    });

    afterEach(() => {
        Wallet.__store = undefined;
        vi.restoreAllMocks();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('encrypts new wallets with v2 and reads them back', async () => {
        const wallet = new Wallet({ name: 'New', address: ADDRESS, wif: WIF, network: 'testnet' }).encrypt(PASSWORD);
        expect(cipher.isLegacy(wallet.wif)).toBe(false);

        await wallet.save();
        const update = vi.spyOn(Wallet.store, 'update');

        expect(await wallet.readDecrypted(PASSWORD)).toBe(WIF);
        expect(update).not.toHaveBeenCalled();
    });

    it('re-encrypts a legacy record with v2 and persists it after a successful read', async () => {
        await Wallet.store.insert(LEGACY_RECORD);
        const [wallet] = await Wallet.all();

        expect(await wallet.readDecrypted(PASSWORD)).toBe(WIF);

        const doc = await stored();
        expect(doc.wif).toMatch(/^v2:/);
        expect(cipher.decrypt(doc.wif, PASSWORD)).toBe(WIF);
        expect(wallet.wif).toBe(doc.wif);
        expect(doc).toMatchObject({ ...LEGACY_RECORD, wif: doc.wif });
    });

    it('migrates a legacy record only once', async () => {
        await Wallet.store.insert(LEGACY_RECORD);
        const [wallet] = await Wallet.all();

        await wallet.readDecrypted(PASSWORD);
        const migrated = (await stored()).wif;

        expect(await wallet.readDecrypted(PASSWORD)).toBe(WIF);
        const [reloaded] = await Wallet.all();
        expect(await reloaded.readDecrypted(PASSWORD)).toBe(WIF);
        expect((await stored()).wif).toBe(migrated);
    });

    it('leaves a legacy record alone when the password is wrong', async () => {
        await Wallet.store.insert(LEGACY_RECORD);
        const [wallet] = await Wallet.all();

        await expect(wallet.readDecrypted(`${PASSWORD}0`)).rejects.toThrow('Passwords do not match');
        expect((await stored()).wif).toBe(LEGACY_WIF);
        expect(wallet.wif).toBe(LEGACY_WIF);
    });

    it('still returns the key when saving the migration fails, and retries on the next read', async () => {
        await Wallet.store.insert(LEGACY_RECORD);
        const [wallet] = await Wallet.all();
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(Wallet.store, 'update').mockRejectedValueOnce(new Error('disk full'));

        expect(await wallet.readDecrypted(PASSWORD)).toBe(WIF);
        expect(error).toHaveBeenCalled();
        expect(wallet.wif).toBe(LEGACY_WIF);
        expect((await stored()).wif).toBe(LEGACY_WIF);

        expect(await wallet.readDecrypted(PASSWORD)).toBe(WIF);
        expect((await stored()).wif).toMatch(/^v2:/);
    });
});

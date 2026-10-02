import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bitcoin, { ECPair } from '../src/common/bitcoin';
import network from '../src/main/network';
import Wallet from '../src/main/wallet.class';

// Testnet WIF of private key 1 and its address
const WIF = 'cMahea7zqjxrtgAbB7LSGbcQUr1uX1ojuat9jZodMN87JcbXMTcA';
const ADDRESS = 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r';
const RECEIVER = 'tb1qur7330emxypadqvr0mu4989sfzw32gpkxgyd2m';
const OTHER = 'mvE8CiixdhZycmZEUR4mUtEiAtnu9PK2YD';
// Hasher.hash('hunter2')
const PASSWORD = '2fce64ac1708c5916a6958f9f25419c408580ed2bdf8a336805fcdd1db7f7346e6a9156eaecf1b2ee58d142939bc9762';

const script = address => bitcoin.address.toOutputScript(address, network.current);

// A fabricated previous transaction that pays this wallet in outputs 0 and 2
const fabricate = () => {
    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.addInput(new Uint8Array(32).fill(7), 1);
    tx.addOutput(script(ADDRESS), 60000n);
    tx.addOutput(script(OTHER), 1000000n);
    tx.addOutput(script(ADDRESS), 50000n);
    return tx;
};
const PREV = fabricate();
const PREV_TXID = PREV.getId();
const PREV_HEX = PREV.toHex();

const UTXOS = [
    { txid: PREV_TXID, vout: 0, value: 60000 },
    { txid: PREV_TXID, vout: 2, value: 50000 },
];

// The fee rate in sat/vB, as network.api.getFee gives it. Spending one UTXO with change is
// 226 vB, so 2260 sat; spending both is 374 vB, so 3740 sat, or 3400 sat without change.
const RATE = 10;

// Cross-checked by signing the same transaction by hand, without Psbt
const EXPECTED_TXID = 'c2dc78d8872ddf97b530fc5c646321dcc881ddb79399fb4a7010167c7703a764';

const txidOf = input => Buffer.from(input.hash).reverse().toString('hex');

describe('Wallet.send', () => {
    let wallet;
    let getTxHex;
    let broadcast;

    const sent = () => bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0]);

    beforeEach(() => {
        wallet = new Wallet({ name: 'Spender', address: ADDRESS, wif: WIF, network: 'testnet' });
        wallet.utxos = UTXOS;
        getTxHex = vi.spyOn(network.api, 'getTxHex').mockResolvedValue(PREV_HEX);
        broadcast = vi.spyOn(network.api, 'broadcast').mockImplementation(hex => Promise.resolve(
            bitcoin.Transaction.fromHex(hex).getId(),
        ));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('spends two UTXOs into a fully signed, finalized transaction with change', async () => {
        const txid = await wallet.send('0.00080000', RECEIVER, RATE);

        expect(getTxHex.mock.calls).toEqual([[PREV_TXID], [PREV_TXID]]);
        expect(broadcast).toHaveBeenCalledTimes(1);

        const tx = sent();
        expect(txid).toBe(tx.getId());
        expect(tx.getId()).toBe(EXPECTED_TXID);

        expect(tx.ins.map(input => [txidOf(input), input.index])).toEqual([[PREV_TXID, 0], [PREV_TXID, 2]]);
        expect(tx.outs).toEqual([
            { script: script(RECEIVER), value: 80000n },
            { script: script(ADDRESS), value: 26260n },
        ]);
        expect(110000n - tx.outs.reduce((a, out) => a + out.value, 0n)).toBe(3740n);

        // Every input carries a valid SIGHASH_ALL signature by the wallet's key
        const key = ECPair.fromWIF(WIF, network.current);
        tx.ins.forEach((input, i) => {
            const [signature, pubkey] = bitcoin.script.decompile(input.script);
            const decoded = bitcoin.script.signature.decode(signature);
            const hash = tx.hashForSignature(i, script(ADDRESS), bitcoin.Transaction.SIGHASH_ALL);

            expect(decoded.hashType).toBe(bitcoin.Transaction.SIGHASH_ALL);
            expect(pubkey).toEqual(key.publicKey);
            expect(key.verify(hash, decoded.signature)).toBe(true);
        });
    });

    it('spends only the UTXOs it needs', async () => {
        await wallet.send(0.0005, RECEIVER, RATE);

        expect(getTxHex).toHaveBeenCalledTimes(1);
        const tx = sent();
        expect(tx.ins.map(input => input.index)).toEqual([0]);
        expect(tx.outs.map(out => out.value)).toEqual([50000n, 7740n]);
    });

    it('leaves change below the dust limit to the fee', async () => {
        await wallet.send((110000 - 3740 - 545) / 1e8, RECEIVER, RATE);

        expect(sent().outs).toEqual([{ script: script(RECEIVER), value: 105715n }]);
    });

    it('keeps change at the dust limit', async () => {
        await wallet.send((110000 - 3740 - 546) / 1e8, RECEIVER, RATE);

        expect(sent().outs.map(out => out.value)).toEqual([105714n, 546n]);
    });

    it('signs with the key of an encrypted wallet', async () => {
        const encrypted = new Wallet({ name: 'Locked', address: ADDRESS, wif: WIF, network: 'testnet' }).encrypt(PASSWORD);
        encrypted.utxos = UTXOS;

        await encrypted.send(0.0008, RECEIVER, RATE, PASSWORD);

        expect(sent().getId()).toBe(EXPECTED_TXID);
    });

    it('rejects a wrong password before reading the network', async () => {
        const encrypted = new Wallet({ name: 'Locked', address: ADDRESS, wif: WIF, network: 'testnet' }).encrypt(PASSWORD);
        encrypted.utxos = UTXOS;

        await expect(encrypted.send(0.0008, RECEIVER, RATE, `${PASSWORD}0`)).rejects.toThrow('Passwords do not match');
        expect(getTxHex).not.toHaveBeenCalled();
        expect(broadcast).not.toHaveBeenCalled();
    });

    describe('fails early', () => {

        const refuses = async (sending, error) => {
            await expect(sending).rejects.toThrow(error);
            expect(getTxHex).not.toHaveBeenCalled();
            expect(broadcast).not.toHaveBeenCalled();
        };

        it('when the UTXOs do not cover the amount and the fee', async () => {
            await refuses(wallet.send(0.0011, RECEIVER, RATE), 'Not enough funds: 113400 satoshis needed with the fee, 110000 available');
        });

        it('when there are no UTXOs', async () => {
            wallet.utxos = [];
            await refuses(wallet.send(0.0001, RECEIVER, RATE), 'Not enough funds');
        });

        it('when the fee rate is not known yet', async () => {
            await refuses(wallet.send(0.0001, RECEIVER, undefined), 'Not a valid fee rate in sat/vB: undefined');
        });

        it.each([['not a number', 'abc'], ['empty', ''], ['negative', -0.001]])('when the amount is %s', async (what, btc) => {
            await refuses(wallet.send(btc, RECEIVER, RATE), 'Not a valid amount in bitcoins');
        });

        it('when the amount is zero', async () => {
            await refuses(wallet.send('0.00000000', RECEIVER, RATE), 'The amount must be more than zero');
        });

        it('when the amount is below the dust limit', async () => {
            await refuses(wallet.send('0.00000545', RECEIVER, RATE), 'The amount must be at least Ƀ 0.00000546');
        });

        it('when the receiver is not an address on this network', async () => {
            await refuses(wallet.send(0.0001, '1BoatSLRHtKNngkdXEeobR76b53LETtpyT', RATE), 'Not a valid testnet address');
        });
    });

    describe('refuses a previous transaction that does not match the UTXO', () => {

        it('when it is another transaction', async () => {
            const other = fabricate();
            other.locktime = 1;
            getTxHex.mockResolvedValue(other.toHex());

            await expect(wallet.send(0.0005, RECEIVER, RATE)).rejects.toThrow(`The transaction of ${PREV_TXID}:0 does not match`);
            expect(broadcast).not.toHaveBeenCalled();
        });

        it('when the output value differs', async () => {
            wallet.utxos = [{ ...UTXOS[0], value: 600000 }];

            await expect(wallet.send(0.0005, RECEIVER, RATE)).rejects.toThrow(`The transaction of ${PREV_TXID}:0 does not match`);
            expect(broadcast).not.toHaveBeenCalled();
        });

        it('when the output does not exist', async () => {
            wallet.utxos = [{ ...UTXOS[0], vout: 3 }];

            await expect(wallet.send(0.0005, RECEIVER, RATE)).rejects.toThrow(`The transaction of ${PREV_TXID}:3 does not match`);
            expect(broadcast).not.toHaveBeenCalled();
        });
    });
});

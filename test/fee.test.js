import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bitcoin from '../src/common/bitcoin';
import { planSpend, vbytes } from '../src/common/fee';
import network from '../src/main/network';
import Wallet from '../src/main/wallet.class';

// Testnet WIF of private key 1 and its address
const WIF = 'cMahea7zqjxrtgAbB7LSGbcQUr1uX1ojuat9jZodMN87JcbXMTcA';
const ADDRESS = 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r';
// A P2PKH receiver, so that every output has the size that vbytes counts
const RECEIVER = 'mvE8CiixdhZycmZEUR4mUtEiAtnu9PK2YD';

const RATE = 10;
const VALUES = [60000, 50000, 40000];

describe('vbytes', () => {

    it('sizes a P2PKH spend at 10 + 148 per input + 34 per output', () => {
        expect([1, 2, 3].map(inputs => vbytes(inputs, 2))).toEqual([226, 374, 522]);
        expect(vbytes(2, 1)).toBe(340);
    });
});

describe('planSpend', () => {

    it.each([
        [1, 50000, 2260, 7740],
        [2, 80000, 3740, 26260],
        [3, 120000, 5220, 24780],
    ])('pays the fee for %i input(s) and change at the rate', (inputs, amount, fee, change) => {
        expect(planSpend(VALUES, amount, RATE)).toEqual({
            covered: true, inputs, fee, change,
        });
        expect(fee).toBe(RATE * vbytes(inputs, 2));
    });

    it('leaves change below the dust limit to the fee', () => {
        expect(planSpend(VALUES, 110000 - 3740 - 545, RATE)).toEqual({
            covered: true, inputs: 2, fee: 3740 + 545, change: 0,
        });
    });

    it('keeps change at the dust limit', () => {
        expect(planSpend(VALUES, 110000 - 3740 - 546, RATE)).toEqual({
            covered: true, inputs: 2, fee: 3740, change: 546,
        });
    });

    it('sends without change when the inputs cover only the fee for one output', () => {
        expect(planSpend(VALUES.slice(0, 2), 110000 - 3400, RATE)).toEqual({
            covered: true, inputs: 2, fee: 3400, change: 0,
        });
    });

    it('picks another input when the ones so far cover the amount but not the fee', () => {
        // One input without change would need 1920 sat
        expect(planSpend(VALUES, 60000 - 1000, RATE)).toEqual({
            covered: true, inputs: 2, fee: 3740, change: 110000 - 59000 - 3740,
        });
    });

    it('is not covered when all the inputs cannot pay the amount and the fee without change', () => {
        expect(planSpend(VALUES.slice(0, 2), 110000 - 3399, RATE)).toEqual({
            covered: false, inputs: 2, fee: 3400, change: 0,
        });
        expect(planSpend([], 1000, RATE)).toEqual({
            covered: false, inputs: 0, fee: RATE * vbytes(0, 1), change: 0,
        });
    });

    it('rounds the fee up at a fractional rate', () => {
        expect(planSpend(VALUES, 50000, 1.1).fee).toBe(249);
    });
});

describe('Wallet.send at a fee rate', () => {

    const script = address => bitcoin.address.toOutputScript(address, network.current);

    // A fabricated previous transaction that pays this wallet in each output
    const PREV = new bitcoin.Transaction();
    PREV.version = 2;
    PREV.addInput(new Uint8Array(32).fill(9), 0);
    VALUES.forEach(value => PREV.addOutput(script(ADDRESS), BigInt(value)));

    let wallet;
    let broadcast;

    beforeEach(() => {
        wallet = new Wallet({ name: 'Spender', address: ADDRESS, wif: WIF, network: 'testnet' });
        wallet.utxos = VALUES.map((value, vout) => ({ txid: PREV.getId(), vout, value }));
        vi.spyOn(network.api, 'getTxHex').mockResolvedValue(PREV.toHex());
        broadcast = vi.spyOn(network.api, 'broadcast').mockImplementation(hex => Promise.resolve(
            bitcoin.Transaction.fromHex(hex).getId(),
        ));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        [1, 50000],
        [2, 80000],
        [3, 120000],
    ])('pays at least the rate for the size of a spend of %i input(s)', async (inputs, amount) => {
        await wallet.send(amount / 1e8, RECEIVER, RATE);

        const tx = bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0]);
        const total = BigInt(VALUES.slice(0, inputs).reduce((a, v) => a + v, 0));
        const fee = total - tx.outs.reduce((a, out) => a + out.value, 0n);

        expect(tx.ins).toHaveLength(inputs);
        expect(tx.outs).toHaveLength(2);
        expect(fee).toBe(BigInt(RATE * vbytes(inputs, 2)));
        // The estimate is an upper bound: signatures have 71 or 72 bytes
        expect(tx.virtualSize()).toBeLessThanOrEqual(vbytes(inputs, 2));
        expect(tx.virtualSize()).toBeGreaterThanOrEqual(vbytes(inputs, 2) - inputs);
    });

    it('sends the change below the dust limit to the fee', async () => {
        await wallet.send((110000 - 3740 - 545) / 1e8, RECEIVER, RATE);

        const tx = bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0]);
        expect(tx.ins).toHaveLength(2);
        expect(tx.outs).toEqual([{ script: script(RECEIVER), value: 105715n }]);
    });
});

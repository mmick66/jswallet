import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bitcoin from '../src/common/bitcoin';
import { outputVbytes, planSpend, vbytes } from '../src/common/fee';
import network from '../src/main/network';
import Wallet from '../src/main/wallet.class';

// Testnet WIF of private key 1 and its address
const WIF = 'cMahea7zqjxrtgAbB7LSGbcQUr1uX1ojuat9jZodMN87JcbXMTcA';
const ADDRESS = 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r';

// Testnet addresses of private keys 2 to 6, one of each type, and the size of an output that pays it
const RECEIVERS = [
    ['P2WPKH', 'tb1qcsh8a7f0mdsr47zy6pj04tv4mwdumlfa6erhuq', 31],
    ['P2SH', '2N2uFi5LbDQQwTqAVd5veF6qE9hWww2DVzF', 32],
    ['P2PKH', 'mg8Jz5776UdyiYcBb9Z873NTozEiADRW5H', 34],
    ['P2WSH', 'tb1qng2fykm5rkfafnxjwut4a0k2h6ecy684vxf4c807jkjd908muy8q4rlla9', 43],
    ['P2TR', 'tb1p4rsld9ryjhte00drc0r23r8ngd63xrzh5s4fvmy6q5yt70xzlsdq056ycr', 43],
];
const P2TR = RECEIVERS[4][1];
// The change pays the wallet's own P2PKH address
const CHANGE = 34;

const RATE = 10;
const VALUES = [60000, 50000, 40000];

describe('outputVbytes', () => {

    it.each(RECEIVERS)('sizes the output that pays a %s address', (type, address, size) => {
        expect(outputVbytes(address)).toBe(size);
    });

    it.each([
        ['no address', undefined],
        ['an empty address', ''],
        ['an address being typed', 'tb1p4rsld9'],
        ['a mainnet address', '1cMh228HTCiwS8ZsaakH8A8wze1JR5ZsP'],
    ])('counts the largest output for %s', (what, address) => {
        expect(outputVbytes(address)).toBe(43);
    });
});

describe('planSpend for the receiver', () => {

    it.each(RECEIVERS)('pays the fee for the %s output and the change', (type, address, size) => {
        expect(planSpend(VALUES, 50000, RATE, size)).toEqual({
            covered: true, inputs: 1, fee: RATE * (10 + 148 + size + CHANGE), change: 10000 - RATE * (10 + 148 + size + CHANGE),
        });
    });

    it('needs more funds for a bigger receiver', () => {
        // Two inputs without change: 3370 sat for a P2WPKH receiver, 3490 sat for a P2TR one
        expect(planSpend(VALUES.slice(0, 2), 110000 - 3400, RATE, 31)).toMatchObject({ covered: true, fee: 3400 });
        expect(planSpend(VALUES.slice(0, 2), 110000 - 3400, RATE, 43)).toMatchObject({ covered: false, fee: 3490 });
    });
});

describe('Wallet.send to each type of receiver', () => {

    const script = address => bitcoin.address.toOutputScript(address, network.current);

    // A fabricated previous transaction that pays this wallet in each output
    const PREV = new bitcoin.Transaction();
    PREV.version = 2;
    PREV.addInput(new Uint8Array(32).fill(5), 0);
    VALUES.forEach(value => PREV.addOutput(script(ADDRESS), BigInt(value)));

    let wallet;
    let broadcast;

    const sent = () => {
        const tx = bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0]);
        const total = BigInt(VALUES.slice(0, tx.ins.length).reduce((a, v) => a + v, 0));
        return { tx, fee: Number(total - tx.outs.reduce((a, out) => a + out.value, 0n)) };
    };

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

    describe.each(RECEIVERS)('a %s receiver', (type, address, size) => {

        it.each([
            [1, 50000],
            [2, 80000],
            [3, 120000],
        ])('pays at least the rate for %i input(s) and change', async (inputs, amount) => {
            await wallet.send(amount / 1e8, address, RATE);

            const { tx, fee } = sent();
            const estimate = vbytes(inputs, [size, CHANGE]);

            expect(tx.ins).toHaveLength(inputs);
            expect(tx.outs.map(out => out.script)).toEqual([script(address), script(ADDRESS)]);
            expect(fee).toBe(RATE * estimate);
            expect(fee).toBeGreaterThanOrEqual(RATE * tx.virtualSize());
            // The estimate is an upper bound by at most a byte per signature
            expect(tx.virtualSize()).toBeLessThanOrEqual(estimate);
            expect(tx.virtualSize()).toBeGreaterThanOrEqual(estimate - inputs);
        });

        it('pays at least the rate without change', async () => {
            await wallet.send((110000 - RATE * vbytes(2, [size])) / 1e8, address, RATE);

            const { tx, fee } = sent();

            expect(tx.ins).toHaveLength(2);
            expect(tx.outs.map(out => out.script)).toEqual([script(address)]);
            expect(fee).toBe(RATE * vbytes(2, [size]));
            expect(fee).toBeGreaterThanOrEqual(RATE * tx.virtualSize());
        });
    });

    it('pays for the P2TR output that a P2PKH-sized estimate would miss', async () => {
        await wallet.send(0.0005, P2TR, RATE);

        expect(sent().tx.virtualSize()).toBeGreaterThan(vbytes(1, [CHANGE, CHANGE]));
    });
});

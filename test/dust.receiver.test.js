import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bitcoin from '../src/common/bitcoin';
import { amountError } from '../src/common/amount';
import { dustLimit, outputVbytes } from '../src/common/fee';
import network from '../src/main/network';
import Wallet from '../src/main/wallet.class';

// Testnet WIF of private key 1 and its address
const WIF = 'cMahea7zqjxrtgAbB7LSGbcQUr1uX1ojuat9jZodMN87JcbXMTcA';
const ADDRESS = 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r';

// Testnet addresses of private keys 2 to 6, one of each type, and Bitcoin Core's dust limit for an
// output that pays it: 3 sat/vB for the output and for spending it, 148 vB or 67 vB for a witness program
const RECEIVERS = [
    ['P2WPKH', 'tb1qcsh8a7f0mdsr47zy6pj04tv4mwdumlfa6erhuq', 294],
    ['P2SH', '2N2uFi5LbDQQwTqAVd5veF6qE9hWww2DVzF', 540],
    ['P2PKH', 'mg8Jz5776UdyiYcBb9Z873NTozEiADRW5H', 546],
    ['P2WSH', 'tb1qng2fykm5rkfafnxjwut4a0k2h6ecy684vxf4c807jkjd908muy8q4rlla9', 330],
    ['P2TR', 'tb1p4rsld9ryjhte00drc0r23r8ngd63xrzh5s4fvmy6q5yt70xzlsdq056ycr', 330],
];
const [[, P2WPKH], [, P2SH]] = RECEIVERS;
const MAINNET = '1cMh228HTCiwS8ZsaakH8A8wze1JR5ZsP';

const dust = satoshis => `The amount must be at least Ƀ ${(satoshis / 1e8).toFixed(8)}`;

describe('dustLimit', () => {

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each(RECEIVERS)('is Bitcoin Core\'s for a %s receiver', (type, address, limit) => {
        expect(dustLimit(address)).toBe(limit);
    });

    it('follows whether the output is a witness program, not only its size', () => {
        expect(outputVbytes(P2WPKH)).toBe(31);
        expect(outputVbytes(P2SH)).toBe(32);
        expect(dustLimit(P2WPKH)).toBe(294);
        expect(dustLimit(P2SH)).toBe(540);
    });

    it('counts an unassigned witness version as a witness program', () => {
        // bitcoinjs-lib warns once about sending to a future segwit version
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const future = bitcoin.address.toBech32(new Uint8Array(40).fill(1), 2, network.current.bech32);

        // A 51-vbyte output, larger than P2PKH's 34, and still spent from the witness
        expect(outputVbytes(future)).toBe(51);
        expect(dustLimit(future)).toBe(3 * (51 + 67));
    });

    it.each([
        ['no address', undefined],
        ['an empty address', ''],
        ['an address being typed', 'tb1qcsh8a7'],
        ['a mainnet address', MAINNET],
    ])('is P2PKH\'s for %s', (what, address) => {
        expect(dustLimit(address)).toBe(546);
    });
});

describe('amountError for the receiver', () => {

    it.each(RECEIVERS)('refuses less than the %s limit and names it', (type, address, limit) => {
        expect(amountError(limit - 1, address)).toBe(dust(limit));
        expect(amountError(1, address)).toBe(dust(limit));
    });

    it.each(RECEIVERS)('passes the %s limit', (type, address, limit) => {
        expect(amountError(limit, address)).toBeUndefined();
    });

    it('keeps P2PKH\'s limit until the address is valid', () => {
        expect(amountError(545)).toBe(dust(546));
        expect(amountError(545, 'tb1qcsh8a7')).toBe(dust(546));
        expect(amountError(545, P2WPKH)).toBeUndefined();
    });

    it.each(RECEIVERS)('asks for more than zero, whatever the %s limit', (type, address) => {
        expect(amountError(0, address)).toBe('The amount must be more than zero');
    });
});

describe('Wallet.send at the receiver\'s dust limit', () => {

    const script = address => bitcoin.address.toOutputScript(address, network.current);

    // A fabricated previous transaction that pays this wallet
    const PREV = new bitcoin.Transaction();
    PREV.version = 2;
    PREV.addInput(new Uint8Array(32).fill(9), 0);
    PREV.addOutput(script(ADDRESS), 60000n);

    const RATE = 10;

    let wallet;
    let getTxHex;
    let broadcast;

    beforeEach(() => {
        wallet = new Wallet({ name: 'Spender', address: ADDRESS, wif: WIF, network: 'testnet' });
        wallet.utxos = [{ txid: PREV.getId(), vout: 0, value: 60000 }];
        getTxHex = vi.spyOn(network.api, 'getTxHex').mockResolvedValue(PREV.toHex());
        broadcast = vi.spyOn(network.api, 'broadcast').mockImplementation(hex => Promise.resolve(
            bitcoin.Transaction.fromHex(hex).getId(),
        ));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each(RECEIVERS)('sends the %s limit', async (type, address, limit) => {
        await wallet.send(limit / 1e8, address, RATE);

        const tx = bitcoin.Transaction.fromHex(broadcast.mock.calls[0][0]);
        expect(tx.outs[0]).toEqual({ script: script(address), value: BigInt(limit) });
    });

    it.each(RECEIVERS)('refuses a satoshi less than the %s limit', async (type, address, limit) => {
        await expect(wallet.send((limit - 1) / 1e8, address, RATE)).rejects.toThrow(dust(limit));
        expect(getTxHex).not.toHaveBeenCalled();
        expect(broadcast).not.toHaveBeenCalled();
    });

    it('refuses an address of another network before the amount', async () => {
        await expect(wallet.send(0.000003, MAINNET, RATE)).rejects.toThrow('Not a valid testnet address');
        expect(broadcast).not.toHaveBeenCalled();
    });
});

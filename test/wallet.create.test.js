import { afterEach, describe, expect, it, vi } from 'vitest';
import golden from './fixtures/wallet/golden-vectors.json';

// Captured from Wallet.create before the migration to bitcoinjs-lib 7 (jswallet-2cb.5), with
// bitcoinjs-lib 3.3.2 and bip39 2.6.0 on Node 20. git log -- test/fixtures/wallet has the capture script.
const { vectors } = golden;

const ENV = {
    apiBase: { bitcoin: 'https://mempool.space/api', testnet: 'https://mempool.space/testnet4/api' },
};

const load = (network) => {
    vi.resetModules();
    vi.doMock('../src/env.json', () => ({ default: { ...ENV, network: network } }));
    return import('../src/logic/wallet.class').then(m => m.default);
};

describe('Wallet.create', () => {

    afterEach(() => {
        vi.doUnmock('../src/env.json');
        vi.resetModules();
    });

    describe.each(['testnet', 'bitcoin'])('on %s', (network) => {

        it.each(vectors)('restores the address and WIF of "$mnemonic"', async (vector) => {
            const Wallet = await load(network);

            const wallet = Wallet.create('Golden', vector.mnemonic);

            expect(wallet.address).toBe(vector[network].address);
            expect(wallet.wif).toBe(vector[network].wif);
            expect(wallet.toObject()).toEqual({
                name: 'Golden',
                address: vector[network].address,
                wif: vector[network].wif,
                network: network,
            });
        });
    });

    it('derives at the path the vectors were captured with', async () => {
        const Wallet = await load('testnet');
        vectors.forEach(vector => expect(vector.path).toBe(Wallet.Defaults.Path));
    });

    it('generates a 12 word mnemonic that creates a wallet', async () => {
        const Wallet = await load('testnet');

        const mnemonic = Wallet.generate();

        expect(mnemonic.split(' ')).toHaveLength(12);
        expect(Wallet.create('New', mnemonic).address).toMatch(/^[mn]/);
    });
});

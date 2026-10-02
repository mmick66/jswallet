import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidAddress } from '../src/common/address';

const TESTNET = {
    P2PKH: 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r',
    P2SH: '2MsLXsEGDDUgsgRwwzqQbPvr9MZRApVae6w',
    P2WPKH: 'tb1qur7330emxypadqvr0mu4989sfzw32gpkxgyd2m',
    P2TR: 'tb1pvvaz08nu95v5p2hsq4p5szs6ydxu9gvllqv3wcm297ultk389ppqdwe0mm',
};

const MAINNET = {
    P2PKH: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
    P2SH: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
    P2WPKH: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
};

describe('isValidAddress on testnet', () => {

    it.each(Object.entries(TESTNET))('accepts a %s address', (type, address) => {
        expect(isValidAddress(address)).toBe(true);
    });

    it.each(Object.entries(MAINNET))('rejects a mainnet %s address', (type, address) => {
        expect(isValidAddress(address)).toBe(false);
    });

    it.each([
        ['Base58Check', 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8s'],
        ['bech32', 'tb1qur7330emxypadqvr0mu4989sfzw32gpkxgyd2n'],
        ['bech32m', 'tb1pvvaz08nu95v5p2hsq4p5szs6ydxu9gvllqv3wcm297ultk389ppqdwe0mn'],
    ])('rejects a bad %s checksum', (encoding, address) => {
        expect(isValidAddress(address)).toBe(false);
    });

    it('rejects Base58Check data that is not an address, such as a WIF', () => {
        expect(isValidAddress('cMahea7zqjxrtgAbB7LSGbcQUr1uX1ojuat9jZodMN87JcbXMTcA')).toBe(false);
    });

    it.each([
        ['an empty string', ''],
        ['an address with spaces around it', ` ${TESTNET.P2PKH} `],
        ['undefined', undefined],
        ['null', null],
        ['a number', 42],
    ])('rejects %s', (what, value) => {
        expect(isValidAddress(value)).toBe(false);
    });
});

describe('isValidAddress on mainnet', () => {

    afterEach(() => {
        vi.doUnmock('../src/env.json');
        vi.resetModules();
    });

    const load = () => {
        vi.resetModules();
        vi.doMock('../src/env.json', () => ({
            default: { network: 'bitcoin', apiBase: { bitcoin: 'https://mempool.space/api' } },
        }));
        return import('../src/common/address').then(m => m.isValidAddress);
    };

    it('accepts mainnet and rejects testnet addresses', async () => {
        const isValidMainnetAddress = await load();

        Object.values(MAINNET).forEach(address => expect(isValidMainnetAddress(address)).toBe(true));
        Object.values(TESTNET).forEach(address => expect(isValidMainnetAddress(address)).toBe(false));
    });
});

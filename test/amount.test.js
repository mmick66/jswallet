import { describe, expect, it } from 'vitest';
import { amountError, toSatoshis } from '../src/common/amount';

const NOT_POSITIVE = 'The amount must be more than zero';
const DUST = 'The amount must be at least Ƀ 0.00000546';

describe('toSatoshis', () => {

    it.each([
        ['0.00000546', 546],
        ['1', 100000000],
        ['0.000005459', 546],
        ['0.000000004', 0],
        ['-0.0005', -50000],
        [0.0005, 50000],
    ])('rounds %s to %i', (btc, satoshis) => {
        expect(toSatoshis(btc)).toBe(satoshis);
    });
});

describe('amountError', () => {

    it.each([0, -0, -1, -546, NaN])('asks for more than zero for %s satoshis', (satoshis) => {
        expect(amountError(satoshis)).toBe(NOT_POSITIVE);
    });

    it.each([1, 545])('refuses %i satoshis, below the dust limit', (satoshis) => {
        expect(amountError(satoshis)).toBe(DUST);
    });

    it.each([546, 50000, 100000000])('passes %i satoshis', (satoshis) => {
        expect(amountError(satoshis)).toBeUndefined();
    });
});

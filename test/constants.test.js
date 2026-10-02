import { describe, expect, it } from 'vitest';
import Constants from '../src/logic/constants';

describe('constants', () => {
    it('defines one bitcoin as 10^8 satoshis', () => {
        expect(Constants.Bitcoin.Satoshis).toBe(10 ** Constants.Bitcoin.Decimals);
    });

    it('names the testnet and mainnet networks', () => {
        expect(Constants.Networks).toEqual({ Testnet: 'testnet', Bitcoin: 'bitcoin' });
    });
});

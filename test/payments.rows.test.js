import { describe, expect, it } from 'vitest';
import toPaymentRows from '../src/payments.rows';

const SAVINGS = { name: 'Savings', address: 'mvE8CiixdhZycmZEUR4mUtEiAtnu9PK2YD' };
const SPENDING = { name: 'Spending', address: 'msewZs5Cz7CbvzejUETXS6bvK8DtNwJJRY' };
const STRANGER = 'msnAjqUbt9VGJPr4sC6ziCUMQFxhB8t9YN';

const TIME = 1790903134;

// Normalized as network.api.getTransactions returns them (from test/fixtures/mempool/txs.json)
const received = {
    hash: 'a6873a7d',
    time: TIME,
    inputs: [{ address: STRANGER, value: 3344377645 }],
    outputs: [{ address: SAVINGS.address, value: 207256 }, { address: STRANGER, value: 3344170161 }],
};

// Savings pays Spending 74600 sat, gets 129480 back as change and pays a 5000 sat fee
const transfer = {
    hash: 'aedaf242',
    time: TIME,
    inputs: [{ address: SAVINGS.address, value: 209080 }],
    outputs: [{ address: SPENDING.address, value: 74600 }, { address: SAVINGS.address, value: 129480 }],
};

describe('toPaymentRows', () => {

    it('shows a receipt as an inflow to the wallet', () => {
        expect(toPaymentRows([received], [SAVINGS])).toEqual([{
            key: `a6873a7d/${SAVINGS.address}`,
            name: 'Savings',
            address: SAVINGS.address,
            inflow: true,
            time: new Date(TIME * 1000).toDateString(),
            coins: 0.00207256,
            hash: 'a6873a7d',
        }]);
    });

    it('shows a spend net of its change, fee included', () => {
        const [row] = toPaymentRows([transfer], [SAVINGS]);
        expect(row).toMatchObject({ name: 'Savings', inflow: false, coins: 0.000796 });
    });

    it('matches wallets by address, not by their position', () => {
        const rows = toPaymentRows([received, transfer], [SPENDING, SAVINGS]);

        expect(rows.map(r => [r.hash, r.name, r.inflow, r.coins])).toEqual([
            ['a6873a7d', 'Savings', true, 0.00207256],
            ['aedaf242', 'Spending', true, 0.000746],
            ['aedaf242', 'Savings', false, 0.000796],
        ]);
    });

    it('skips transactions that touch no wallet', () => {
        expect(toPaymentRows([received], [SPENDING])).toEqual([]);
    });

    it('marks unconfirmed transactions as pending', () => {
        const [row] = toPaymentRows([{ ...received, time: null }], [SAVINGS]);
        expect(row.time).toBe('Pending');
    });

    it('ignores inputs and outputs without an address', () => {
        const coinbase = {
            hash: 'coinbase',
            time: TIME,
            inputs: [{ address: null, value: 0 }],
            outputs: [{ address: SAVINGS.address, value: 5000000000 }, { address: null, value: 0 }],
        };
        const [row] = toPaymentRows([coinbase], [SAVINGS]);
        expect(row).toMatchObject({ inflow: true, coins: 50 });
    });
});

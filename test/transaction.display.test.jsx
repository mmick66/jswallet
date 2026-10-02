import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TransactionDisplay from '../src/transaction.display';

const SAVINGS = 'mvE8CiixdhZycmZEUR4mUtEiAtnu9PK2YD';
const SPENDING = 'msewZs5Cz7CbvzejUETXS6bvK8DtNwJJRY';
const STRANGER = 'msnAjqUbt9VGJPr4sC6ziCUMQFxhB8t9YN';

// Normalized as network.api.getTransactions returns them
const received = {
    hash: 'a6873a7d',
    time: 1790903134,
    inputs: [{ address: STRANGER, value: 3344377645 }],
    outputs: [{ address: SAVINGS, value: 207256 }, { address: STRANGER, value: 3344170161 }],
};

const transfer = {
    hash: 'aedaf242',
    time: 1790903134,
    inputs: [{ address: SAVINGS, value: 209080 }],
    outputs: [{ address: SPENDING, value: 74600 }, { address: SAVINGS, value: 129480 }],
};

const render = (content) => renderToStaticMarkup(<TransactionDisplay content={content} />);

describe('TransactionDisplay', () => {

    it('shows the hash, inputs and outputs of the transaction it is given', () => {
        const html = render(transfer);

        expect(html).toContain('<h3>aedaf242</h3>');
        expect(html).toContain(`${SAVINGS} 209080`);
        expect(html).toContain(`${SPENDING} 74600`);
        expect(html).toContain(`${SAVINGS} 129480`);
        expect(html).not.toContain('a6873a7d');
    });

    it('shows an empty display before a payment is selected', () => {
        const html = render(null);

        expect(html).toContain('<h3></h3>');
        expect(html).not.toContain(SAVINGS);
    });

    it('names outputs without an address', () => {
        const html = render({ ...received, outputs: [{ address: null, value: 0 }] });

        expect(html).toContain('(no address) 0');
    });
});

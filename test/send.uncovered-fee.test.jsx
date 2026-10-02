// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';

import './support/antd-dom';
import paste from './support/paste';
import CreateTransactionForm from '../src/create.transaction.modal.component';

const TESTNET_ADDRESS = 'tb1qur7330emxypadqvr0mu4989sfzw32gpkxgyd2m';

// No unspent outputs, and one of 0.01 BTC
const EMPTY = {
    name: 'Empty', address: 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r', network: 'testnet', coins: 0, utxoValues: [],
};
const SMALL = {
    name: 'Small', address: 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r', network: 'testnet', coins: 0.01, utxoValues: [1000000],
};

// $50,000 per bitcoin, as WalletsContent passes it: bitcoins per dollar
const RATE = 1 / 50000;
const FEE_RATE = 1;

const NOT_ENOUGH = 'Not enough funds';
const RATE_ONLY = 'Network fee at 1 sat/vB';

// The send form as WalletsContent hosts it: the parent owns the instance and passes the props
const renderForm = (props = {}) => {
    const host = {};
    function Host(current) {
        [host.form] = Form.useForm();
        return <CreateTransactionForm form={host.form} sender={EMPTY} feeRate={FEE_RATE} rate={RATE} {...current} />;
    }
    const { rerender } = render(<Host {...props} />);
    host.rerender = (changed) => rerender(<Host {...props} {...changed} />);
    return host;
};

// The errors of the bitcoin field, none once it is valid
const bitcoinErrors = (form) => act(() => form.validateFields(['bitcoin']).then(() => [], ({ errorFields }) => (
    errorFields.flatMap(({ errors }) => errors)
)));

const field = {
    address: () => screen.getByPlaceholderText("Receiver's Address"),
    bitcoin: () => screen.getByPlaceholderText('Amount in Bitcoin'),
};

// The text below the bitcoin field
const feeText = () => screen.getByText(/^Network fee/).textContent;

describe('CreateTransactionForm\'s fee when the funds fall short', () => {

    it('shows only the rate on a wallet without unspent outputs', async () => {
        const user = userEvent.setup();
        const { form } = renderForm();

        await user.type(field.bitcoin(), '0.001');
        expect(await screen.findByText(NOT_ENOUGH)).toBeTruthy();
        expect(feeText()).toBe(RATE_ONLY);

        await paste(user, field.address(), TESTNET_ADDRESS);
        expect(await bitcoinErrors(form)).toEqual([NOT_ENOUGH]);
        expect(feeText()).toBe(RATE_ONLY);
    });

    it('shows only the rate for more than the outputs cover, and the fee again for less', async () => {
        const user = userEvent.setup();
        const { form } = renderForm({ sender: SMALL });

        await user.type(field.bitcoin(), '0.011');
        expect(await bitcoinErrors(form)).toEqual([NOT_ENOUGH]);
        expect(feeText()).toBe(RATE_ONLY);

        // One input, the largest kind of output until an address is entered (43 vB) and the change: 235 vbytes
        await user.clear(field.bitcoin());
        await user.type(field.bitcoin(), '0.005');
        expect(await bitcoinErrors(form)).toEqual([]);
        expect(feeText()).toBe('Network fee: Ƀ 0.00000235 for 1 input at 1 sat/vB');
    });

    it('shows the fee once the wallet has the funds', async () => {
        const user = userEvent.setup();
        const { form, rerender } = renderForm();

        await user.type(field.bitcoin(), '0.005');
        expect(await bitcoinErrors(form)).toEqual([NOT_ENOUGH]);
        expect(feeText()).toBe(RATE_ONLY);

        rerender({ sender: SMALL });
        expect(await bitcoinErrors(form)).toEqual([]);
        expect(feeText()).toBe('Network fee: Ƀ 0.00000235 for 1 input at 1 sat/vB');
    });
});

// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import {
    act, render, screen, waitFor
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';

import './support/antd-dom';
import paste from './support/paste';
import CreateTransactionForm from '../src/create.transaction.modal.component';

// Testnet addresses of each type and the dust limit of an output that pays it, in satoshis
const RECEIVERS = [
    ['P2WPKH', 'tb1qcsh8a7f0mdsr47zy6pj04tv4mwdumlfa6erhuq', 294],
    ['P2SH', '2N2uFi5LbDQQwTqAVd5veF6qE9hWww2DVzF', 540],
    ['P2PKH', 'mg8Jz5776UdyiYcBb9Z873NTozEiADRW5H', 546],
    ['P2TR', 'tb1p4rsld9ryjhte00drc0r23r8ngd63xrzh5s4fvmy6q5yt70xzlsdq056ycr', 330],
];
const [[, P2WPKH], , [, P2PKH]] = RECEIVERS;

// One output of 0.01 BTC
const SMALL = {
    name: 'Small', address: 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r', network: 'testnet', coins: 0.01, utxoValues: [1000000],
};

// $50,000 per bitcoin, as WalletsContent passes it: bitcoins per dollar
const RATE = 1 / 50000;
const FEE_RATE = 2;

const bitcoins = satoshis => (satoshis / 1e8).toFixed(8);
const dust = satoshis => `The amount must be at least Ƀ ${bitcoins(satoshis)}`;

// The send form as WalletsContent hosts it: the parent owns the instance and passes the props
const renderForm = () => {
    const host = {};
    function Host() {
        [host.form] = Form.useForm();
        return <CreateTransactionForm form={host.form} sender={SMALL} feeRate={FEE_RATE} rate={RATE} />;
    }
    render(<Host />);
    return host;
};

// The errors of the fields that failed, by name; none once every field is valid
const errorsOf = (form) => act(() => form.validateFields().then(() => ({}), ({ errorFields }) => (
    Object.fromEntries(errorFields.map(({ name, errors }) => [name.join('.'), errors]))
)));

const field = {
    address: () => screen.getByPlaceholderText("Receiver's Address"),
    dollars: () => screen.getByPlaceholderText('Amount in Dollars'),
    bitcoin: () => screen.getByPlaceholderText('Amount in Bitcoin'),
};

describe('CreateTransactionForm and the receiver\'s dust limit', () => {

    it.each(RECEIVERS)('refuses less than the %s limit and names it', async (type, address, limit) => {
        const user = userEvent.setup();
        const { form } = renderForm();

        await paste(user, field.address(), address);
        await user.type(field.bitcoin(), bitcoins(limit - 1));
        expect(await screen.findByText(dust(limit))).toBeTruthy();
        expect((await errorsOf(form)).bitcoin).toEqual([dust(limit)]);

        await user.clear(field.bitcoin());
        await user.type(field.bitcoin(), bitcoins(limit));
        expect(await errorsOf(form)).not.toHaveProperty('bitcoin');
    });

    it('keeps P2PKH\'s limit until a valid address is entered', async () => {
        const user = userEvent.setup();
        const { form } = renderForm();

        await user.type(field.bitcoin(), bitcoins(300));
        expect(await screen.findByText(dust(546))).toBeTruthy();

        await user.type(field.address(), P2WPKH.slice(0, 10));
        expect((await errorsOf(form)).bitcoin).toEqual([dust(546)]);

        await user.type(field.address(), P2WPKH.slice(10));
        await waitFor(() => expect(screen.queryByText(dust(546))).toBeNull());
        expect(await errorsOf(form)).not.toHaveProperty('bitcoin');
    });

    it('checks both amounts again when the receiver changes', async () => {
        const user = userEvent.setup();
        const { form } = renderForm();

        // $0.15 is Ƀ 0.00000300, enough for P2WPKH but not for P2PKH
        await paste(user, field.address(), P2WPKH);
        await user.type(field.dollars(), '0.15');
        expect(field.bitcoin().value).toBe(bitcoins(300));
        expect(await errorsOf(form)).not.toHaveProperty('dollars');

        await user.clear(field.address());
        await paste(user, field.address(), P2PKH);
        await waitFor(() => expect(screen.getAllByText(dust(546))).toHaveLength(2));
        expect(await errorsOf(form)).toMatchObject({ dollars: [dust(546)], bitcoin: [dust(546)] });
    });

    it('shows the fee for an amount that only the receiver\'s type accepts', async () => {
        const user = userEvent.setup();
        renderForm();

        await user.type(field.bitcoin(), bitcoins(300));
        expect(screen.getByText('Network fee at 2 sat/vB')).toBeTruthy();

        // One input, the P2WPKH output and the change: 223 vbytes at 2 sat/vB
        await paste(user, field.address(), P2WPKH);
        expect(screen.getByText('Network fee: Ƀ 0.00000446 for 1 input at 2 sat/vB')).toBeTruthy();
    });
});

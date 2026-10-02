// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';

import './support/antd-dom';
import CreateTransactionForm from '../src/create.transaction.modal.component';

// Testnet addresses whose dust limit is below P2PKH's, the limit until a valid address is entered, in satoshis
const RECEIVERS = [
    ['P2WPKH', 'tb1qcsh8a7f0mdsr47zy6pj04tv4mwdumlfa6erhuq', 294],
    ['P2TR', 'tb1p4rsld9ryjhte00drc0r23r8ngd63xrzh5s4fvmy6q5yt70xzlsdq056ycr', 330],
    ['P2SH', '2N2uFi5LbDQQwTqAVd5veF6qE9hWww2DVzF', 540],
];
const [[, P2WPKH]] = RECEIVERS;

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
const errorsOf = (form, names) => form.validateFields(names).then(() => ({}), ({ errorFields }) => (
    Object.fromEntries(errorFields.map(({ name, errors }) => [name.join('.'), errors]))
));

const field = {
    dollars: () => screen.getByPlaceholderText('Amount in Dollars'),
};

// Form.useWatch's values catch up a macrotask after the form's store, so a check that read the watched
// address would see the one before it for that long. Typing shows it only by chance: user-event leaves a
// macrotask between the fields, and even with userEvent.setup({ delay: null }) the watch often catches up in it.
describe('CreateTransactionForm checks amounts against the address in the form', () => {

    it.each(RECEIVERS)('checks an amount set with a %s address in the same task against it', async (type, address, limit) => {
        const { form } = renderForm();

        const errors = await act(() => {
            form.setFieldsValue({ address, bitcoin: bitcoins(limit - 1) });
            return errorsOf(form, ['bitcoin']);
        });
        expect(errors).toEqual({ bitcoin: [dust(limit)] });
    });

    it('checks both amounts again against an address set in the same task', async () => {
        const user = userEvent.setup();
        const { form } = renderForm();

        // $0.15 is Ƀ 0.00000300, enough for P2WPKH but not for P2PKH. The bitcoin field it fills is not checked yet.
        await user.type(field.dollars(), '0.15');
        expect(await screen.findByText(dust(546))).toBeTruthy();

        const errors = await act(() => {
            form.setFieldsValue({ address: P2WPKH });
            return errorsOf(form, ['dollars', 'bitcoin']);
        });
        expect(errors).toEqual({});
    });
});

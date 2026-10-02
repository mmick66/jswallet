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
const MAINNET_ADDRESS = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

// One output of 0.01 BTC, and two of 0.006 BTC
const SMALL = {
    name: 'Small', address: 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r', network: 'testnet', coins: 0.01, utxoValues: [1000000],
};
const SPLIT = {
    name: 'Split', address: '2MsLXsEGDDUgsgRwwzqQbPvr9MZRApVae6w', network: 'testnet', coins: 0.012, utxoValues: [600000, 600000],
};

// $50,000 per bitcoin, as WalletsContent passes it: bitcoins per dollar
const RATE = 1 / 50000;
const FEE_RATE = 2;

const Errors = {
    Address: 'Please input an address!',
    Amount: 'Please input an amount!',
    Password: 'Please input a password',
    InvalidAddress: 'Not a valid bitcoin address for this network',
    NotNumeric: 'The value is not numeric',
    NotPositive: 'The amount must be more than zero',
    Dust: 'The amount must be at least Ƀ 0.00000546',
    NotEnough: 'Not enough funds',
};

// The send form as WalletsContent hosts it: the parent owns the instance and passes the props
const renderForm = (props = {}) => {
    const host = {};
    function Host(current) {
        [host.form] = Form.useForm();
        return <CreateTransactionForm form={host.form} sender={SMALL} feeRate={FEE_RATE} rate={RATE} {...current} />;
    }
    const { rerender } = render(<Host {...props} />);
    host.rerender = (changed) => rerender(<Host {...props} {...changed} />);
    return host;
};

// Resolves with the values, or with the fields that failed and their errors
const validate = (form) => act(() => form.validateFields().catch(({ errorFields }) => ({
    errors: Object.fromEntries(errorFields.map(({ name, errors }) => [name.join('.'), errors])),
})));

const field = {
    address: () => screen.getByPlaceholderText("Receiver's Address"),
    dollars: () => screen.getByPlaceholderText('Amount in Dollars'),
    bitcoin: () => screen.getByPlaceholderText('Amount in Bitcoin'),
    password: () => screen.getByPlaceholderText('Unlock'),
};

describe('CreateTransactionForm', () => {

    it('requires an address, an amount and a password', async () => {
        const { form } = renderForm();

        expect(await validate(form)).toEqual({
            errors: {
                address: [Errors.Address], dollars: [Errors.Amount], bitcoin: [Errors.Amount], password: [Errors.Password],
            },
        });
        expect(await screen.findByText(Errors.Address)).toBeTruthy();
        expect(screen.getAllByText(Errors.Amount)).toHaveLength(2);
        expect(screen.getByText(Errors.Password)).toBeTruthy();
    });

    it('returns what Send needs once every field is valid', async () => {
        const user = userEvent.setup();
        const { form } = renderForm();

        await paste(user, field.address(), TESTNET_ADDRESS);
        await user.type(field.bitcoin(), '0.005');
        await paste(user, field.password(), 'secret');

        expect(await validate(form)).toEqual({
            address: TESTNET_ADDRESS, dollars: '250.00', bitcoin: '0.005', password: 'secret',
        });
    });

    it.each([
        ['a mainnet address', MAINNET_ADDRESS],
        ['a bad checksum', 'tb1qur7330emxypadqvr0mu4989sfzw32gpkxgyd2n'],
        ['text', 'not an address'],
    ])('refuses %s as the address', async (what, address) => {
        const user = userEvent.setup();
        const { form } = renderForm();

        await paste(user, field.address(), address);

        expect(await screen.findByText(Errors.InvalidAddress)).toBeTruthy();
        expect((await validate(form)).errors.address).toEqual([Errors.InvalidAddress]);
    });

    describe('amounts', () => {

        it('converts dollars to bitcoins with 8 decimals', async () => {
            const user = userEvent.setup();
            renderForm();

            await user.type(field.dollars(), '100');
            expect(field.bitcoin().value).toBe('0.00200000');

            await user.clear(field.dollars());
            await user.type(field.dollars(), '0.33');
            expect(field.bitcoin().value).toBe('0.00000660');
        });

        it('converts bitcoins to dollars with 2 decimals', async () => {
            const user = userEvent.setup();
            renderForm();

            await user.type(field.bitcoin(), '0.003');
            expect(field.dollars().value).toBe('150.00');

            await user.clear(field.bitcoin());
            await user.type(field.bitcoin(), '0.00012345');
            expect(field.dollars().value).toBe('6.17');
        });

        it('leaves the other field as it is while the amount is not numeric', async () => {
            const user = userEvent.setup();
            const { form } = renderForm();

            await user.type(field.bitcoin(), '0.003');
            await user.type(field.dollars(), 'x');

            expect(field.dollars().value).toBe('150.00x');
            expect(field.bitcoin().value).toBe('0.003');
            expect(await screen.findByText(Errors.NotNumeric)).toBeTruthy();
            expect((await validate(form)).errors).toMatchObject({ dollars: [Errors.NotNumeric] });
        });

        it.each([
            ['text', 'abc', Errors.NotNumeric],
            ['a comma', '0,005', Errors.NotNumeric],
            ['zero', '0', Errors.NotPositive],
            ['a negative amount', '-0.005', Errors.NotPositive],
            ['less than the dust limit', '0.00000545', Errors.Dust],
            ['the whole balance, which leaves nothing for the fee', '0.01', Errors.NotEnough],
            ['more than the balance', '0.5', Errors.NotEnough],
        ])('refuses %s in bitcoins', async (what, amount, error) => {
            const user = userEvent.setup();
            const { form } = renderForm();

            await user.type(field.bitcoin(), amount);

            expect(await screen.findByText(error)).toBeTruthy();
            expect((await validate(form)).errors.bitcoin).toEqual([error]);
        });

        it('checks the bitcoins that the dollars amount to', async () => {
            const user = userEvent.setup();
            const { form } = renderForm();

            // Ƀ 0.01, the whole balance
            await user.type(field.dollars(), '500');

            expect(field.bitcoin().value).toBe('0.01000000');
            expect(await screen.findByText(Errors.NotEnough)).toBeTruthy();
            expect((await validate(form)).errors).toMatchObject({
                dollars: [Errors.NotEnough], bitcoin: [Errors.NotEnough],
            });
        });

        it('accepts the largest amount whose fee the balance still covers', async () => {
            const user = userEvent.setup();
            const { form } = renderForm();

            // Ƀ 0.01 less the fee for one input and the receiver's output at 2 sat/vB: 402 satoshis. Until an
            // address is entered, the receiver's output counts as the largest kind (43 vB)
            await user.type(field.bitcoin(), '0.00999598');
            expect((await validate(form)).errors).not.toHaveProperty('bitcoin');

            await user.clear(field.bitcoin());
            await user.type(field.bitcoin(), '0.00999599');
            expect((await validate(form)).errors.bitcoin).toEqual([Errors.NotEnough]);
        });
    });

    describe('network fee', () => {

        it('shows only the rate until the amount can be sent', async () => {
            const user = userEvent.setup();
            renderForm();

            expect(screen.getByText('Network fee at 2 sat/vB')).toBeTruthy();

            await user.type(field.bitcoin(), '0');
            expect(screen.getByText('Network fee at 2 sat/vB')).toBeTruthy();
        });

        it('shows the fee for the inputs that the amount needs', async () => {
            const user = userEvent.setup();
            renderForm({ sender: SPLIT });

            await user.type(field.bitcoin(), '0.005');
            expect(screen.getByText('Network fee: Ƀ 0.00000470 for 1 input at 2 sat/vB')).toBeTruthy();

            await user.clear(field.bitcoin());
            await user.type(field.bitcoin(), '0.01');
            expect(screen.getByText('Network fee: Ƀ 0.00000766 for 2 inputs at 2 sat/vB')).toBeTruthy();
        });
    });

    describe('props that change while the form is open', () => {

        it('checks the funds of the current sender', async () => {
            const user = userEvent.setup();
            const { form, rerender } = renderForm();

            await user.type(field.bitcoin(), '0.011');
            expect((await validate(form)).errors.bitcoin).toEqual([Errors.NotEnough]);

            rerender({ sender: SPLIT });
            expect((await validate(form)).errors).not.toHaveProperty('bitcoin');

            rerender({ sender: SMALL });
            expect((await validate(form)).errors.bitcoin).toEqual([Errors.NotEnough]);
        });

        it('checks the funds at the current fee rate', async () => {
            const user = userEvent.setup();
            const { form, rerender } = renderForm();

            await user.type(field.bitcoin(), '0.0099');
            expect((await validate(form)).errors).not.toHaveProperty('bitcoin');

            // 470 satoshis at 2 sat/vB leave change; at 100 sat/vB even the 20,100 without change are more than
            // the 10,000 the balance has to spare
            expect(screen.getByText('Network fee: Ƀ 0.00000470 for 1 input at 2 sat/vB')).toBeTruthy();
            rerender({ feeRate: 100 });
            expect(screen.getByText('Network fee at 100 sat/vB')).toBeTruthy();
            expect((await validate(form)).errors.bitcoin).toEqual([Errors.NotEnough]);
        });

        it('converts at the current rate', async () => {
            const user = userEvent.setup();
            const { rerender } = renderForm();

            rerender({ rate: 1 / 25000 });
            await user.type(field.dollars(), '100');

            expect(field.bitcoin().value).toBe('0.00400000');
        });
    });
});

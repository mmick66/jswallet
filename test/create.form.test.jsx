// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';

import './support/antd-dom';
import CreateForm from '../src/create.form.modal.component';

// The create-wallet form as WalletsContent hosts it: the parent owns the instance and validates it
const renderForm = () => {
    const host = {};
    function Host() {
        [host.form] = Form.useForm();
        return <CreateForm form={host.form} />;
    }
    render(<Host />);
    return host;
};

// Resolves with the values, or with the fields that failed and their errors
const validate = (form) => act(() => form.validateFields().catch(({ errorFields }) => ({
    errors: Object.fromEntries(errorFields.map(({ name, errors }) => [name.join('.'), errors])),
})));

const Errors = {
    Name: 'Please input a wallet name!',
    Password: 'Please input your password!',
    Confirm: 'Please confirm your password!',
    Mismatch: 'Two passwords that you enter is inconsistent!',
};

describe('CreateForm', () => {

    it('requires a name, a password and its confirmation', async () => {
        const { form } = renderForm();

        expect(await validate(form)).toEqual({
            errors: { name: [Errors.Name], password: [Errors.Password], confirm: [Errors.Confirm] },
        });
        expect(await screen.findByText(Errors.Name)).toBeTruthy();
        expect(screen.getByText(Errors.Password)).toBeTruthy();
        expect(screen.getByText(Errors.Confirm)).toBeTruthy();
    });

    it('returns the name and the password when both passwords match', async () => {
        const user = userEvent.setup();
        const { form } = renderForm();

        await user.type(screen.getByPlaceholderText('Wallet Name'), 'Savings');
        await user.type(screen.getByPlaceholderText('Password'), 'correct horse');
        await user.type(screen.getByPlaceholderText('Confirm Password'), 'correct horse');

        expect(await validate(form)).toEqual({ name: 'Savings', password: 'correct horse', confirm: 'correct horse' });
        expect(screen.queryByText(Errors.Mismatch)).toBeNull();
    });

    it('refuses a confirmation that differs from the password', async () => {
        const user = userEvent.setup();
        const { form } = renderForm();

        await user.type(screen.getByPlaceholderText('Wallet Name'), 'Savings');
        await user.type(screen.getByPlaceholderText('Password'), 'correct horse');
        await user.type(screen.getByPlaceholderText('Confirm Password'), 'correct hose');

        expect(await screen.findByText(Errors.Mismatch)).toBeTruthy();
        expect(await validate(form)).toEqual({ errors: { confirm: [Errors.Mismatch] } });
    });

    it('checks the confirmation again when the password changes', async () => {
        const user = userEvent.setup();
        const { form } = renderForm();
        const password = screen.getByPlaceholderText('Password');

        await user.type(password, 'correct hose');
        await user.type(screen.getByPlaceholderText('Confirm Password'), 'correct horse');
        expect(await screen.findByText(Errors.Mismatch)).toBeTruthy();

        // Now the confirmation matches, without editing it
        await user.clear(password);
        await user.type(password, 'correct horse');
        await expect.poll(() => screen.queryByText(Errors.Mismatch)).toBeNull();

        // And no longer does
        await user.type(password, '!');
        expect(await screen.findByText(Errors.Mismatch)).toBeTruthy();
        expect((await validate(form)).errors).toEqual({ name: [Errors.Name], confirm: [Errors.Mismatch] });
    });
});

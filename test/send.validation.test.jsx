// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    render, screen, waitFor, within
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';

import './support/antd-dom';
import Constants from '../src/common/constants';
import WalletsContent from '../src/wallets.content.component';

// window.jswallet, which src/preload.js exposes in the app
const jswallet = vi.hoisted(() => ({
    listWallets: vi.fn(),
    createWallet: vi.fn(),
    deleteWallet: vi.fn(),
    refreshWallet: vi.fn(),
    sendPayment: vi.fn(),
    getPrice: vi.fn(),
    getFee: vi.fn(),
    writeClipboard: vi.fn(),
}));

vi.mock('../src/jswallet', () => ({ default: jswallet }));

const RECEIVER = 'tb1qur7330emxypadqvr0mu4989sfzw32gpkxgyd2m';
const MAINNET_ADDRESS = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

const SMALL = {
    name: 'Small', address: 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r', network: 'testnet', coins: 0.01, utxoValues: [1000000],
};

const VALID = { address: RECEIVER, bitcoin: '0.001', password: 'secret' };

const Placeholders = {
    address: "Receiver's Address", bitcoin: 'Amount in Bitcoin', password: 'Unlock',
};

beforeEach(() => {
    Object.values(jswallet).forEach((fn) => fn.mockReset());
    jswallet.listWallets.mockResolvedValue([SMALL]);
    jswallet.refreshWallet.mockResolvedValue({ coins: SMALL.coins, utxoValues: SMALL.utxoValues });
    jswallet.getPrice.mockResolvedValue(50000);
    jswallet.getFee.mockResolvedValue(2);
    jswallet.sendPayment.mockResolvedValue('txid');
    // WalletsContent logs the fetches that fail
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Opens the send form of the only wallet, inside antd's App as src/renderer.jsx mounts it
const openSendForm = async (user) => {
    render(<App><WalletsContent /></App>);
    const row = (await screen.findByText(SMALL.name)).closest('tr');
    const send = within(row).getByRole('button', { name: 'login' });
    await waitFor(() => expect(send.disabled).toBe(false));
    await user.click(send);
    return screen.findByRole('dialog');
};

// Types the valid values with the given ones in their place; an empty value leaves the field empty
const fillSendForm = async (user, dialog, values) => {
    const entries = Object.entries({ ...VALID, ...values }).filter(([, value]) => value);
    for (const [name, value] of entries) {
        await user.type(within(dialog).getByPlaceholderText(Placeholders[name]), value);
    }
};

const errorOf = (dialog, name, text) => within(within(dialog).getByPlaceholderText(Placeholders[name])
    .closest('.ant-form-item')).findByText(text);

const toasts = () => [...document.querySelectorAll('.ant-message-notice')].map((notice) => notice.textContent);

describe('Send Money with an invalid form', () => {

    it.each([
        ['no address', { address: '' }, 'address', 'Please input an address!'],
        ['an address of another network', { address: MAINNET_ADDRESS }, 'address', 'Not a valid bitcoin address for this network'],
        ['no amount', { bitcoin: '' }, 'bitcoin', 'Please input an amount!'],
        ['a negative amount', { bitcoin: '-0.001' }, 'bitcoin', 'The amount must be more than zero'],
        ['a zero amount', { bitcoin: '0' }, 'bitcoin', 'The amount must be more than zero'],
        ['a dust amount', { bitcoin: '0.000001' }, 'bitcoin', 'The amount must be at least Ƀ 0.00000294'],
        ['more than the wallet holds', { bitcoin: '0.1' }, 'bitcoin', 'Not enough funds'],
        ['no password', { password: '' }, 'password', 'Please input a password'],
    ])('shows what is wrong with %s under the field and no toast', async (_, values, name, error) => {
        const user = userEvent.setup();
        const dialog = await openSendForm(user);
        await fillSendForm(user, dialog, values);

        await user.click(within(dialog).getByRole('button', { name: 'Send' }));

        expect(await errorOf(dialog, name, error)).toBeTruthy();
        expect(toasts()).toEqual([]);
        expect(jswallet.sendPayment).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBe(dialog);
    });

    it('still shows a toast when a valid form fails to send', async () => {
        const user = userEvent.setup();
        jswallet.sendPayment.mockRejectedValue(new Error(`${Constants.ReturnValues.Fragments.WrongPassword} for this wallet`));
        const dialog = await openSendForm(user);
        await fillSendForm(user, dialog, {});

        await user.click(within(dialog).getByRole('button', { name: 'Send' }));

        await waitFor(() => expect(toasts()).toEqual(['Wrong password entered.']));
    });
});

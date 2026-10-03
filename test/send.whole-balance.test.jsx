// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    render, screen, waitFor, within
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';

import './support/antd-dom';
import paste from './support/paste';
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

const RECEIVER = 'tb1qcsh8a7f0mdsr47zy6pj04tv4mwdumlfa6erhuq';
const NOT_ENOUGH = 'Not enough funds';

// One output of 27,818 sat. At 1 sat/vB, one input and the P2WPKH output alone cost 189 sat, so the most it
// sends is 27,629 sat. At $84,642 per bitcoin that is $23.3857, shown as $23.39, which buys 27,634 sat.
const ONE_OUTPUT = {
    name: 'One output', address: 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r', network: 'testnet', coins: 0.00027818, utxoValues: [27818],
};
const PRICE = 84642;
const WHOLE_BALANCE = '0.00027629';

beforeEach(() => {
    Object.values(jswallet).forEach((fn) => fn.mockReset());
    jswallet.listWallets.mockResolvedValue([ONE_OUTPUT]);
    jswallet.refreshWallet.mockResolvedValue({ coins: ONE_OUTPUT.coins, utxoValues: ONE_OUTPUT.utxoValues });
    jswallet.getPrice.mockResolvedValue(PRICE);
    jswallet.getFee.mockResolvedValue(1);
    jswallet.sendPayment.mockResolvedValue('txid');
    // WalletsContent logs the fetches that fail
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Opens the send form of the only wallet, inside antd's App as src/renderer.jsx mounts it
const openSendForm = async (user) => {
    render(<App><WalletsContent /></App>);
    const row = (await screen.findByText(ONE_OUTPUT.name)).closest('tr');
    const send = within(row).getByRole('button', { name: 'login' });
    await waitFor(() => expect(send.disabled).toBe(false));
    await user.click(send);
    return screen.findByRole('dialog');
};

const field = {
    address: () => screen.getByPlaceholderText("Receiver's Address"),
    dollars: () => screen.getByPlaceholderText('Amount in Dollars'),
    bitcoin: () => screen.getByPlaceholderText('Amount in Bitcoin'),
    password: () => screen.getByPlaceholderText('Unlock'),
};

const itemOf = (input) => within(input.closest('.ant-form-item'));

describe('Send Money with the whole balance', () => {

    it('sends the most the wallet can, although its dollars buy a few satoshis more', async () => {
        const user = userEvent.setup();
        const dialog = await openSendForm(user);

        await paste(user, field.address(), RECEIVER);
        await user.type(field.bitcoin(), WHOLE_BALANCE);
        await paste(user, field.password(), 'secret');
        expect(field.dollars().value).toBe('23.39');
        expect(screen.getByText('Network fee: Ƀ 0.00000189 for 1 input at 1 sat/vB')).toBeTruthy();

        await user.click(within(dialog).getByRole('button', { name: 'Send' }));

        await waitFor(() => expect(jswallet.sendPayment).toHaveBeenCalledWith({
            from: ONE_OUTPUT.address, to: RECEIVER, btc: WHOLE_BALANCE, password: 'secret',
        }));
    });

    it('refuses one satoshi more under both amounts', async () => {
        const user = userEvent.setup();
        const dialog = await openSendForm(user);

        await paste(user, field.address(), RECEIVER);
        await user.type(field.bitcoin(), '0.00027630');
        await paste(user, field.password(), 'secret');

        await user.click(within(dialog).getByRole('button', { name: 'Send' }));

        expect(await itemOf(field.bitcoin()).findByText(NOT_ENOUGH)).toBeTruthy();
        expect(await itemOf(field.dollars()).findByText(NOT_ENOUGH)).toBeTruthy();
        expect(jswallet.sendPayment).not.toHaveBeenCalled();
    });

    it('refuses the dollars of the whole balance, as they buy more than it', async () => {
        const user = userEvent.setup();
        await openSendForm(user);

        await paste(user, field.address(), RECEIVER);
        await user.type(field.dollars(), '23.39');

        expect(field.bitcoin().value).toBe('0.00027634');
        expect(await itemOf(field.dollars()).findByText(NOT_ENOUGH)).toBeTruthy();
    });
});

// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    act, render, screen, waitFor, within
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, Form } from 'antd';

import './support/antd-dom';
import CreateTransactionForm from '../src/create.transaction.modal.component';
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

// Popconfirm, which asks before Delete, observes the size of its popup
window.ResizeObserver ??= function ResizeObserver() {
    return { observe() {}, unobserve() {}, disconnect() {} };
};

const RECEIVER = 'tb1qur7330emxypadqvr0mu4989sfzw32gpkxgyd2m';
const NOT_ENOUGH = 'Not enough funds';

// One output of 0.01 BTC, two of 0.006 BTC, and one of 0.5 BTC
const SMALL = {
    name: 'Small', address: 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r', network: 'testnet', coins: 0.01, utxoValues: [1000000],
};
const SPLIT = {
    name: 'Split', address: '2MsLXsEGDDUgsgRwwzqQbPvr9MZRApVae6w', network: 'testnet', coins: 0.012, utxoValues: [600000, 600000],
};
const LARGE = {
    name: 'Large', address: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn', network: 'testnet', coins: 0.5, utxoValues: [50000000],
};

const field = {
    address: () => screen.getByPlaceholderText("Receiver's Address"),
    dollars: () => screen.getByPlaceholderText('Amount in Dollars'),
    bitcoin: () => screen.getByPlaceholderText('Amount in Bitcoin'),
    password: () => screen.getByPlaceholderText('Unlock'),
};

// The errors shown below the amount fields
const bitcoinItem = () => within(field.bitcoin().closest('.ant-form-item'));
const dollarsItem = () => within(field.dollars().closest('.ant-form-item'));
const showsNotEnough = () => bitcoinItem().findByText(NOT_ENOUGH);
const showsNoError = () => waitFor(() => expect(bitcoinItem().queryByText(NOT_ENOUGH)).toBeNull());

describe('CreateTransactionForm shows the check of its current props', () => {

    // The send form as WalletsContent hosts it, at $50,000 per bitcoin and 2 sat/vB
    const renderForm = () => {
        const props = { sender: SMALL, feeRate: 2, rate: 1 / 50000 };
        const host = {};
        function Host(current) {
            [host.form] = Form.useForm();
            return <CreateTransactionForm form={host.form} {...current} />;
        }
        const { rerender } = render(<Host {...props} />);
        host.rerender = (changed) => rerender(<Host {...props} {...changed} />);
        return host;
    };

    it('checks the entered amount again when the sender changes', async () => {
        const user = userEvent.setup();
        const { rerender } = renderForm();

        // Ƀ 0.011 is more than the first wallet holds, and less than the second
        await user.type(field.bitcoin(), '0.011');
        expect(await showsNotEnough()).toBeTruthy();

        rerender({ sender: SPLIT });
        await showsNoError();

        rerender({ sender: SMALL });
        expect(await showsNotEnough()).toBeTruthy();
    });

    it('checks the entered amount again when the fee rate changes', async () => {
        const user = userEvent.setup();
        const { rerender } = renderForm();

        // The balance covers the fee at 2 sat/vB, not at 100 sat/vB
        await user.type(field.bitcoin(), '0.0099');
        await showsNoError();

        rerender({ feeRate: 100 });
        expect(await showsNotEnough()).toBeTruthy();

        rerender({ feeRate: 2 });
        await showsNoError();
    });

    it('checks again the amount that Send checked but nothing was entered in', async () => {
        const user = userEvent.setup();
        const { form, rerender } = renderForm();

        // The dollars field only takes the amount that the bitcoin field converts, and Send checks both
        await user.type(field.bitcoin(), '0.011');
        await act(() => form.validateFields().catch(() => {}));
        expect(await dollarsItem().findByText(NOT_ENOUGH)).toBeTruthy();

        rerender({ sender: SPLIT });
        await waitFor(() => expect(screen.queryByText(NOT_ENOUGH)).toBeNull());
    });

    it('leaves the fields that nothing was entered in unchecked', async () => {
        const { rerender } = renderForm();

        rerender({ sender: SPLIT, feeRate: 100, rate: 1 / 25000 });

        // Give a check that should not run the time to show its errors
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(document.querySelector('.ant-form-item-explain-error')).toBeNull();
    });
});

describe('WalletsContent passes the current wallet to the send form', () => {

    const balanceOf = ({ coins, utxoValues }) => ({ coins, utxoValues });

    beforeEach(() => {
        Object.values(jswallet).forEach((fn) => fn.mockReset());
        jswallet.listWallets.mockResolvedValue([SMALL, LARGE]);
        jswallet.refreshWallet.mockImplementation((address) => {
            return Promise.resolve(balanceOf([SMALL, LARGE].find((w) => w.address === address)));
        });
        jswallet.getPrice.mockResolvedValue(50000);
        jswallet.getFee.mockResolvedValue(2);
        jswallet.sendPayment.mockResolvedValue('txid');
        jswallet.deleteWallet.mockResolvedValue();
        // WalletsContent logs the fetches that fail
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    const rowOf = (wallet) => screen.getByText(wallet.name).closest('tr');
    const sendButtonOf = (wallet) => within(rowOf(wallet)).getByRole('button', { name: 'login' });

    // As src/renderer.jsx mounts it, inside antd's App for the message and modal hooks, once Send is enabled
    const renderWallets = async () => {
        render(<App><WalletsContent /></App>);
        await screen.findByText(LARGE.name);
        await waitFor(() => expect(sendButtonOf(SMALL).disabled).toBe(false));
    };

    const fillSendForm = async (user, btc) => {
        await user.type(field.address(), RECEIVER);
        await user.type(field.bitcoin(), btc);
        await user.type(field.password(), 'secret');
    };

    it('clears the error of the first wallet when Send opens for one that covers the amount', async () => {
        const user = userEvent.setup();
        await renderWallets();

        // Ƀ 0.1 is more than the first wallet holds
        await user.click(sendButtonOf(SMALL));
        await screen.findByPlaceholderText('Amount in Bitcoin');
        await fillSendForm(user, '0.1');
        expect(await showsNotEnough()).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        await user.click(sendButtonOf(LARGE));
        await showsNoError();

        await user.click(screen.getByRole('button', { name: 'Cancel' }));
        await user.click(sendButtonOf(SMALL));
        expect(await showsNotEnough()).toBeTruthy();
    });

    it('checks the balance that a refresh loads while the form is open', async () => {
        const user = userEvent.setup();
        // As the store lists a wallet that has not been refreshed yet
        jswallet.listWallets.mockResolvedValue([{ ...SMALL, coins: 0, utxoValues: [] }, LARGE]);
        let refreshSmall;
        jswallet.refreshWallet.mockImplementation((address) => {
            if (address === SMALL.address) {
                return new Promise((resolve) => {
                    refreshSmall = resolve;
                });
            }
            return Promise.resolve(balanceOf(LARGE));
        });
        await renderWallets();

        await user.click(sendButtonOf(SMALL));
        await screen.findByPlaceholderText('Amount in Bitcoin');
        await fillSendForm(user, '0.005');
        expect(await showsNotEnough()).toBeTruthy();

        refreshSmall(balanceOf(SMALL));
        await showsNoError();

        await user.click(screen.getByRole('button', { name: 'Send' }));
        await waitFor(() => expect(jswallet.sendPayment).toHaveBeenCalledWith({
            from: SMALL.address, to: RECEIVER, btc: '0.005', password: 'secret',
        }));
    });

    it('keeps the form when the wallet it was last opened for is deleted', async () => {
        const user = userEvent.setup();
        await renderWallets();

        await user.click(sendButtonOf(SMALL));
        await screen.findByPlaceholderText('Amount in Bitcoin');
        await fillSendForm(user, '0.005');
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        await user.click(within(rowOf(SMALL)).getByRole('button', { name: 'Delete' }));
        await user.click(await screen.findByRole('button', { name: 'OK' }));
        await waitFor(() => expect(screen.queryByText(SMALL.name)).toBeNull());

        await user.click(sendButtonOf(LARGE));
        await user.click(await screen.findByRole('button', { name: 'Send' }));
        await waitFor(() => expect(jswallet.sendPayment).toHaveBeenCalledWith({
            from: LARGE.address, to: RECEIVER, btc: '0.005', password: 'secret',
        }));
    });
});

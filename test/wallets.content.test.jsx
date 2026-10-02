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

const SMALL = {
    name: 'Small', address: 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r', network: 'testnet', coins: 0.01, utxoValues: [1000000],
};
const LARGE = {
    name: 'Large', address: '2MsLXsEGDDUgsgRwwzqQbPvr9MZRApVae6w', network: 'testnet', coins: 0.5, utxoValues: [50000000],
};

const pending = () => new Promise(() => {});

beforeEach(() => {
    Object.values(jswallet).forEach((fn) => fn.mockReset());
    jswallet.listWallets.mockResolvedValue([SMALL, LARGE]);
    jswallet.refreshWallet.mockImplementation((address) => {
        const { coins, utxoValues } = [SMALL, LARGE].find((w) => w.address === address);
        return Promise.resolve({ coins, utxoValues });
    });
    jswallet.getPrice.mockResolvedValue(50000);
    jswallet.getFee.mockResolvedValue(2);
    jswallet.sendPayment.mockResolvedValue('txid');
    // WalletsContent logs the fetches that fail
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

// As src/renderer.jsx mounts it, inside antd's App for the message and modal hooks
const renderWallets = async () => {
    render(<App><WalletsContent /></App>);
    await screen.findByText(LARGE.name);
};

const rowOf = (wallet) => screen.getByText(wallet.name).closest('tr');
const sendButtonOf = (wallet) => within(rowOf(wallet)).getByRole('button', { name: 'login' });
const sendButtons = () => [SMALL, LARGE].map(sendButtonOf);

describe('WalletsContent', () => {

    describe('Send button', () => {

        it('is disabled while the fee rate loads', async () => {
            jswallet.getFee.mockImplementation(pending);
            await renderWallets();

            sendButtons().forEach((button) => expect(button.disabled).toBe(true));
        });

        it('stays disabled if the fee rate cannot be loaded', async () => {
            jswallet.getFee.mockRejectedValue(new Error('offline'));
            await renderWallets();

            await waitFor(() => expect(console.log).toHaveBeenCalledWith('Could not get fee ', expect.any(Error)));
            sendButtons().forEach((button) => expect(button.disabled).toBe(true));
        });

        it('is enabled once a fee rate loads', async () => {
            await renderWallets();

            await waitFor(() => sendButtons().forEach((button) => expect(button.disabled).toBe(false)));
        });

        it('is enabled when Reload loads the fee rate that failed before', async () => {
            const user = userEvent.setup();
            jswallet.getFee.mockRejectedValueOnce(new Error('offline'));
            await renderWallets();
            await waitFor(() => expect(console.log).toHaveBeenCalledWith('Could not get fee ', expect.any(Error)));
            expect(sendButtonOf(SMALL).disabled).toBe(true);

            await user.click(screen.getByRole('button', { name: 'reload' }));

            await waitFor(() => expect(sendButtonOf(SMALL).disabled).toBe(false));
            expect(jswallet.getFee).toHaveBeenCalledTimes(2);
            expect(jswallet.refreshWallet).toHaveBeenCalledTimes(4);
        });

        it('keeps the last fee rate when Reload cannot load a new one', async () => {
            const user = userEvent.setup();
            await renderWallets();
            await waitFor(() => expect(sendButtonOf(SMALL).disabled).toBe(false));

            jswallet.getFee.mockRejectedValueOnce(new Error('offline'));
            await user.click(screen.getByRole('button', { name: 'reload' }));
            await waitFor(() => expect(console.log).toHaveBeenCalledWith('Could not get fee ', expect.any(Error)));

            expect(sendButtonOf(SMALL).disabled).toBe(false);
            await user.click(sendButtonOf(SMALL));
            expect(await screen.findByText('Network fee at 2 sat/vB')).toBeTruthy();
        });

        it('passes the fee rate that Reload loads to the send form', async () => {
            const user = userEvent.setup();
            await renderWallets();
            await waitFor(() => expect(sendButtonOf(SMALL).disabled).toBe(false));

            jswallet.getFee.mockResolvedValueOnce(7);
            await user.click(screen.getByRole('button', { name: 'reload' }));
            await waitFor(() => expect(jswallet.getFee).toHaveBeenCalledTimes(2));

            await user.click(sendButtonOf(SMALL));
            expect(await screen.findByText('Network fee at 7 sat/vB')).toBeTruthy();
        });
    });

    describe('Send Money', () => {

        const bitcoinError = () => within(screen.getByPlaceholderText('Amount in Bitcoin').closest('.ant-form-item'))
            .findByText('Not enough funds');

        const fillSendForm = async (user, btc) => {
            await user.type(screen.getByPlaceholderText("Receiver's Address"), RECEIVER);
            await user.type(screen.getByPlaceholderText('Amount in Bitcoin'), btc);
            await user.type(screen.getByPlaceholderText('Unlock'), 'secret');
        };

        it('converts at the loaded price and sends the bitcoin amount', async () => {
            const user = userEvent.setup();
            await renderWallets();
            await waitFor(() => expect(sendButtonOf(SMALL).disabled).toBe(false));

            await user.click(sendButtonOf(SMALL));
            await user.type(await screen.findByPlaceholderText('Amount in Dollars'), '100');
            expect(screen.getByPlaceholderText('Amount in Bitcoin').value).toBe('0.00200000');
            await user.type(screen.getByPlaceholderText("Receiver's Address"), RECEIVER);
            await user.type(screen.getByPlaceholderText('Unlock'), 'secret');
            await user.click(screen.getByRole('button', { name: 'Send' }));

            await waitFor(() => expect(jswallet.sendPayment).toHaveBeenCalledWith({
                from: SMALL.address, to: RECEIVER, btc: '0.00200000', password: 'secret',
            }));
            expect(await screen.findByText(Constants.Messages.Transactions.Sent)).toBeTruthy();
        });

        it('checks the funds of the wallet it was opened for', async () => {
            const user = userEvent.setup();
            await renderWallets();
            await waitFor(() => expect(sendButtonOf(SMALL).disabled).toBe(false));

            // Ƀ 0.1 is more than the first wallet holds
            await user.click(sendButtonOf(SMALL));
            await screen.findByPlaceholderText('Amount in Bitcoin');
            await fillSendForm(user, '0.1');
            await user.click(screen.getByRole('button', { name: 'Send' }));
            expect(await bitcoinError()).toBeTruthy();
            expect(jswallet.sendPayment).not.toHaveBeenCalled();
            await user.click(screen.getByRole('button', { name: 'Cancel' }));

            // The form keeps what was entered, and the second wallet covers it
            await user.click(sendButtonOf(LARGE));
            await user.click(screen.getByRole('button', { name: 'Send' }));
            await waitFor(() => expect(jswallet.sendPayment).toHaveBeenCalledWith({
                from: LARGE.address, to: RECEIVER, btc: '0.1', password: 'secret',
            }));

            // And back to the first wallet, which still does not
            await user.click(sendButtonOf(SMALL));
            await user.click(screen.getByRole('button', { name: 'Send' }));
            expect(await bitcoinError()).toBeTruthy();
            expect(jswallet.sendPayment).toHaveBeenCalledTimes(1);
        });
    });

    describe('Create a New Wallet', () => {

        it('shows what is missing and creates the wallet once the form is valid', async () => {
            const user = userEvent.setup();
            const created = {
                name: 'Fresh', address: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn', network: 'testnet', coins: 0, utxoValues: [],
            };
            jswallet.createWallet.mockResolvedValue({ wallet: created, mnemonic: 'abandon ability able' });
            await renderWallets();

            await user.click(screen.getByRole('button', { name: /Create/ }));
            const dialog = await screen.findByRole('dialog');
            await user.click(within(dialog).getByRole('button', { name: 'Create' }));
            expect(await within(dialog).findByText('Please input a wallet name!')).toBeTruthy();
            expect(jswallet.createWallet).not.toHaveBeenCalled();

            await user.type(within(dialog).getByPlaceholderText('Wallet Name'), 'Fresh');
            await user.type(within(dialog).getByPlaceholderText('Password'), 'correct horse');
            await user.type(within(dialog).getByPlaceholderText('Confirm Password'), 'correct horse');
            await user.click(within(dialog).getByRole('button', { name: 'Create' }));

            await waitFor(() => expect(jswallet.createWallet).toHaveBeenCalledWith({ name: 'Fresh', password: 'correct horse' }));
            expect(await screen.findByText(Constants.Messages.Wallet.Created)).toBeTruthy();
            expect(rowOf(created)).toBeTruthy();
            // The mnemonic follows a second later
            expect(await screen.findByText('abandon ability able')).toBeTruthy();
        });
    });
});

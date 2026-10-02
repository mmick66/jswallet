import { beforeAll, describe, expect, it, vi } from 'vitest';
import Channels from '../src/common/ipc.channels';

const electron = vi.hoisted(() => ({
    contextBridge: { exposeInMainWorld: vi.fn() },
    ipcRenderer: { invoke: vi.fn(() => Promise.resolve('result')) },
}));

vi.mock('electron', () => electron);

describe('preload', () => {
    let api;

    beforeAll(async () => {
        await import('../src/preload.js');
        expect(electron.contextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1);
        const [[key, exposed]] = electron.contextBridge.exposeInMainWorld.mock.calls;
        expect(key).toBe('jswallet');
        api = exposed;
    });

    const invoked = async (call) => {
        electron.ipcRenderer.invoke.mockClear();
        expect(await call()).toBe('result');
        expect(electron.ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        return electron.ipcRenderer.invoke.mock.calls[0];
    };

    it('exposes only named functions, one per channel', () => {
        expect(Object.keys(api).sort()).toEqual([
            'createWallet', 'deleteWallet', 'getFee', 'getPrice', 'getPriceChart', 'getTransactions',
            'listWallets', 'refreshWallet', 'sendPayment', 'writeClipboard',
        ]);
        Object.values(api).forEach(f => expect(f).toBeTypeOf('function'));
        expect(Object.values(api)).not.toContain(electron.ipcRenderer.invoke);
    });

    it.each([
        ['listWallets', [], [Channels.ListWallets]],
        ['deleteWallet', ['addr'], [Channels.DeleteWallet, 'addr']],
        ['refreshWallet', ['addr'], [Channels.RefreshWallet, 'addr']],
        ['getPrice', [], [Channels.GetPrice]],
        ['getFee', [], [Channels.GetFee]],
        ['getTransactions', [['a', 'b']], [Channels.GetTransactions, ['a', 'b']]],
        ['getPriceChart', ['30days'], [Channels.GetPriceChart, '30days']],
        ['writeClipboard', ['text'], [Channels.WriteClipboard, 'text']],
    ])('%s invokes its channel', async (name, args, expected) => {
        expect(await invoked(() => api[name](...args))).toEqual(expected);
    });

    it('createWallet sends the name and password only', async () => {
        expect(await invoked(() => api.createWallet({ name: 'New', password: 'pw', extra: 1 })))
            .toEqual([Channels.CreateWallet, { name: 'New', password: 'pw' }]);
    });

    it('sendPayment sends the payment fields only', async () => {
        const payment = {
            from: 'a', to: 'b', btc: '0.1', password: 'pw',
        };
        expect(await invoked(() => api.sendPayment({ ...payment, fee: 0 })))
            .toEqual([Channels.SendPayment, payment]);
    });
});

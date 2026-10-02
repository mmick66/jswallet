import { beforeAll, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
    contextBridge: { exposeInMainWorld: vi.fn() },
    ipcRenderer: { invoke: vi.fn() },
}));

vi.mock('electron', () => electron);

describe('preload errors', () => {
    let api;

    beforeAll(async () => {
        await import('../src/preload.js');
        [[, api]] = electron.contextBridge.exposeInMainWorld.mock.calls;
    });

    it.each([
        ["Error invoking remote method 'wallet:create': Error: Name taken", 'Name taken'],
        ["Error invoking remote method 'wallet:send': TypeError: bad input", 'bad input'],
        ["Error invoking remote method 'wallet:send': Wrong password", 'Wrong password'],
        ['Plain failure', 'Plain failure'],
    ])('strips the IPC prefix from %j', async (raw, expected) => {
        electron.ipcRenderer.invoke.mockRejectedValueOnce(new Error(raw));
        await expect(api.listWallets()).rejects.toThrow(new Error(expected));
    });

    it('keeps the message after the prefix whole', async () => {
        electron.ipcRenderer.invoke.mockRejectedValueOnce(new Error(
            "Error invoking remote method 'wallet:send': Error: min relay fee not met: Error: x",
        ));
        await expect(api.sendPayment({})).rejects.toThrow('min relay fee not met: Error: x');
    });
});

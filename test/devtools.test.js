import {
    describe, expect, it, vi
} from 'vitest';
import { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import installReactDevTools from '../src/main/devtools';

const fakeSession = (installed = []) => {
    const deprecated = () => {
        throw new Error('deprecated session extension API called');
    };
    return {
        getAllExtensions: deprecated,
        loadExtension: deprecated,
        removeExtension: deprecated,
        extensions: {
            getAllExtensions: vi.fn(() => installed),
            loadExtension: vi.fn(async (folder) => ({ id: REACT_DEVELOPER_TOOLS.id, path: folder })),
            removeExtension: vi.fn(),
        },
    };
};

describe('installReactDevTools', () => {
    it('downloads React DevTools and loads them through session.extensions', async () => {
        const session = fakeSession();
        const download = vi.fn(async (id) => `/userData/extensions/${id}`);

        const extension = await installReactDevTools(session, { download });

        expect(download).toHaveBeenCalledWith(REACT_DEVELOPER_TOOLS.id);
        expect(session.extensions.loadExtension)
            .toHaveBeenCalledWith(`/userData/extensions/${REACT_DEVELOPER_TOOLS.id}`);
        expect(extension.id).toBe(REACT_DEVELOPER_TOOLS.id);
    });

    it('leaves them alone when they are already loaded', async () => {
        const loaded = { id: REACT_DEVELOPER_TOOLS.id, name: 'React Developer Tools' };
        const session = fakeSession([{ id: 'other' }, loaded]);
        const download = vi.fn();

        expect(await installReactDevTools(session, { download })).toBe(loaded);
        expect(download).not.toHaveBeenCalled();
        expect(session.extensions.loadExtension).not.toHaveBeenCalled();
        expect(session.extensions.removeExtension).not.toHaveBeenCalled();
    });

    it('passes a failed download on to the caller', async () => {
        const session = fakeSession();
        const download = vi.fn(async () => {
            throw new Error('offline');
        });

        await expect(installReactDevTools(session, { download })).rejects.toThrow('offline');
        expect(session.extensions.loadExtension).not.toHaveBeenCalled();
    });
});

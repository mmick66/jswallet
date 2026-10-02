import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from '../src/main/database';

// Written by nedb 1.8.0, as the old app did: four inserts, then a remove,
// which nedb 1.x appends as a {"$$deleted":true} line.
const LEGACY_FIXTURE = path.join(__dirname, 'fixtures', 'nedb1-wallets.ndjson');

const LEGACY_WALLETS = [
    {
        _id: '39dqMhhcSvBYfust',
        name: 'Savings',
        address: 'mzBc4XEFSdzCDcTxAgf6EZXgsZWpztRhef',
        wif: '3f1c9a0b6e2d4c8f7a5b1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b',
        network: 'testnet',
        password: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    },
    {
        _id: 'nGKfd68rkqFumxyn',
        name: 'Spending',
        address: 'n3GNqMveyvaPvUbH469vDRadqpJMPc84JA',
        wif: 'cPlaceholderWifNotARealKeyForFixtureUseOnly000000000',
        network: 'testnet',
    },
    {
        _id: 'kTpygTa6gBilNy7a',
        name: 'Main',
        address: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
        wif: 'KPlaceholderWifNotARealKeyForFixtureUseOnly000000000',
        network: 'bitcoin',
    },
];

const byName = (a, b) => a.name.localeCompare(b.name);

describe('Database', () => {
    let dir;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jswallet-db-'));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('stores the file as <dir>/<name>.db', async () => {
        await new Database('wallets', dir).insert({ name: 'a' });
        expect(fs.existsSync(path.join(dir, 'wallets.db'))).toBe(true);
    });

    it('inserts documents and finds them by query', async () => {
        const db = new Database('wallets', dir);
        const doc = await db.insert({ name: 'a', network: 'testnet' });
        await db.insert({ name: 'b', network: 'bitcoin' });

        expect(doc).toMatchObject({ name: 'a', network: 'testnet' });
        expect(doc._id).toEqual(expect.any(String));
        expect(await db.find({ network: 'testnet' })).toEqual([doc]);
        expect((await db.find()).map(d => d.name).sort()).toEqual(['a', 'b']);
    });

    it('handles dates and regular expressions', async () => {
        // nedb 1.x reaches util.isDate and util.isRegExp here, which Node 24 removed
        const db = new Database('wallets', dir);
        const created = new Date('2018-02-01T00:00:00Z');
        await db.insert({ name: 'Savings', created });

        const [doc] = await db.find({ name: /^Sav/, created: { $lte: new Date() } });
        expect(doc.created).toEqual(created);
    });

    it('removes matching documents', async () => {
        const db = new Database('wallets', dir);
        await db.insert({ address: 'x' });
        await db.insert({ address: 'y' });

        expect(await db.remove({ address: 'x' })).toBe(1);
        expect((await db.find()).map(d => d.address)).toEqual(['y']);
    });

    it('updates a matching document and persists it', async () => {
        const db = new Database('wallets', dir);
        await db.insert({ address: 'x', wif: 'old' });
        await db.insert({ address: 'y', wif: 'other' });

        expect(await db.update({ address: 'x' }, { $set: { wif: 'new' } })).toBe(1);
        expect(await db.update({ address: 'z' }, { $set: { wif: 'new' } })).toBe(0);

        const reloaded = new Database('wallets', dir);
        const docs = await reloaded.find();
        expect(docs.map(({ address, wif }) => ({ address, wif })).sort((a, b) => a.address.localeCompare(b.address)))
            .toEqual([{ address: 'x', wif: 'new' }, { address: 'y', wif: 'other' }]);
    });

    it('loads a wallets.db written by nedb 1.x unchanged', async () => {
        fs.copyFileSync(LEGACY_FIXTURE, path.join(dir, 'wallets.db'));
        const db = new Database('wallets', dir);

        expect((await db.find()).sort(byName)).toEqual([...LEGACY_WALLETS].sort(byName));
        expect((await db.find({ network: 'testnet' })).map(d => d.name).sort()).toEqual(['Savings', 'Spending']);
    });

    it('keeps the nedb 1.x line format when it rewrites a legacy file', async () => {
        const file = path.join(dir, 'wallets.db');
        fs.copyFileSync(LEGACY_FIXTURE, file);
        await new Database('wallets', dir).find();

        // Loading compacts the file; it must stay one JSON document per line
        const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
        expect(lines.map(l => JSON.parse(l)).sort(byName)).toEqual([...LEGACY_WALLETS].sort(byName));
    });
});

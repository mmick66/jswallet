import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from '../src/main/database';
import { databaseDirectory, migrateLegacyDatabase } from '../src/main/storage';

// Written by nedb 1.8.0, as the old app did; see database.test.js
const LEGACY_FIXTURE = path.join(__dirname, 'fixtures', 'nedb1-wallets.ndjson');

describe('databaseDirectory', () => {
    it('is the db folder in userData', () => {
        expect(databaseDirectory('/Users/me/Library/Application Support/jswallet'))
            .toBe(path.join('/Users/me/Library/Application Support/jswallet', 'db'));
    });
});

describe('migrateLegacyDatabase', () => {
    let root;
    let legacyDir;
    let dir;
    let log;

    const legacyFile = () => path.join(legacyDir, 'wallets.db');
    const newFile = () => path.join(dir, 'wallets.db');

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'jswallet-storage-'));
        legacyDir = path.join(root, 'cwd', 'db');
        dir = databaseDirectory(path.join(root, 'userData'));
        log = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('copies the old database to the new directory, keeps the original and logs it', async () => {
        fs.mkdirSync(legacyDir, { recursive: true });
        fs.copyFileSync(LEGACY_FIXTURE, legacyFile());

        expect(migrateLegacyDatabase('wallets', dir, legacyDir)).toBe(true);

        expect(fs.readFileSync(newFile(), 'utf8')).toBe(fs.readFileSync(LEGACY_FIXTURE, 'utf8'));
        expect(fs.readFileSync(legacyFile(), 'utf8')).toBe(fs.readFileSync(LEGACY_FIXTURE, 'utf8'));
        expect(fs.readdirSync(dir)).toEqual(['wallets.db']);
        expect(log).toHaveBeenCalledWith(`Migrated the database ${legacyFile()} to ${newFile()}; the original is kept`);

        const names = (await new Database('wallets', dir).find({})).map(doc => doc.name).sort();
        expect(names).toEqual(['Main', 'Savings', 'Spending']);
    });

    it('leaves an existing new database alone', () => {
        fs.mkdirSync(legacyDir, { recursive: true });
        fs.copyFileSync(LEGACY_FIXTURE, legacyFile());
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(newFile(), '');

        expect(migrateLegacyDatabase('wallets', dir, legacyDir)).toBe(false);

        expect(fs.readFileSync(newFile(), 'utf8')).toBe('');
        expect(log).not.toHaveBeenCalled();
    });

    it('does nothing without an old database', () => {
        expect(migrateLegacyDatabase('wallets', dir, legacyDir)).toBe(false);

        expect(fs.existsSync(dir)).toBe(false);
        expect(log).not.toHaveBeenCalled();
    });

    it('does nothing when both are the same file', () => {
        fs.mkdirSync(legacyDir, { recursive: true });
        fs.copyFileSync(LEGACY_FIXTURE, legacyFile());

        expect(migrateLegacyDatabase('wallets', legacyDir, legacyDir)).toBe(false);
    });

    it('logs a failed copy and leaves no new database behind', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        fs.mkdirSync(legacyDir, { recursive: true });
        fs.copyFileSync(LEGACY_FIXTURE, legacyFile());
        // A file where the new directory should be
        fs.mkdirSync(path.dirname(dir), { recursive: true });
        fs.writeFileSync(dir, '');

        expect(migrateLegacyDatabase('wallets', dir, legacyDir)).toBe(false);

        expect(error).toHaveBeenCalledWith(`Could not migrate the database ${legacyFile()} to ${newFile()}`, expect.any(Error));
        expect(fs.statSync(dir).isFile()).toBe(true);
        expect(log).not.toHaveBeenCalled();
    });

    it('looks for the old database in ./db by default', () => {
        const cwd = vi.spyOn(process, 'cwd').mockReturnValue(path.join(root, 'cwd'));
        fs.mkdirSync(legacyDir, { recursive: true });
        fs.copyFileSync(LEGACY_FIXTURE, legacyFile());

        expect(migrateLegacyDatabase('wallets', dir)).toBe(true);
        expect(cwd).toHaveBeenCalled();
    });
});

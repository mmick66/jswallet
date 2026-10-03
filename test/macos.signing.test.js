import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { macSigning, resignAdHoc } from '../forge.config.mjs';

describe('macOS signing settings', () => {

    it('signs nothing without a Developer ID identity', () => {
        expect(macSigning({})).toEqual({});
        expect(macSigning({ APPLE_API_KEY: 'key.p8', APPLE_API_KEY_ID: 'ID', APPLE_API_ISSUER: 'issuer' })).toEqual({});
    });

    it('signs with the identity, without notarizing when the API key is incomplete', () => {
        expect(macSigning({ APPLE_SIGNING_IDENTITY: 'Developer ID Application: Jane Doe (TEAMID)', APPLE_API_KEY: 'key.p8' })).toEqual({
            osxSign: { identity: 'Developer ID Application: Jane Doe (TEAMID)' },
        });
    });

    it('notarizes with an App Store Connect API key', () => {
        expect(macSigning({
            APPLE_SIGNING_IDENTITY: 'Developer ID Application: Jane Doe (TEAMID)',
            APPLE_API_KEY: '/tmp/AuthKey_ID.p8',
            APPLE_API_KEY_ID: 'ID',
            APPLE_API_ISSUER: 'issuer',
        })).toEqual({
            osxSign: { identity: 'Developer ID Application: Jane Doe (TEAMID)' },
            osxNotarize: { appleApiKey: '/tmp/AuthKey_ID.p8', appleApiKeyId: 'ID', appleApiIssuer: 'issuer' },
        });
    });
});

describe('resignAdHoc', () => {
    let dir;

    afterEach(async () => {
        if (dir) await rm(dir, { recursive: true, force: true });
    });

    it('signs each app bundle ad hoc and then verifies it', async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'jswallet-sign-'));
        await mkdir(path.join(dir, 'jswallet.app'));
        await writeFile(path.join(dir, 'LICENSE'), '');
        const calls = [];

        await resignAdHoc([dir], async (cmd, args) => { calls.push([cmd, ...args]); });

        const app = path.join(dir, 'jswallet.app');
        expect(calls).toEqual([
            ['codesign', '--force', '--deep', '--sign', '-', app],
            ['codesign', '--verify', '--deep', '--strict', app],
        ]);
    });

    it('fails the package when the signature does not verify', async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'jswallet-sign-'));
        await mkdir(path.join(dir, 'jswallet.app'));
        const exec = async (cmd, args) => {
            if (args[0] === '--verify') throw new Error('invalid Info.plist');
        };

        await expect(resignAdHoc([dir], exec)).rejects.toThrow('invalid Info.plist');
    });
});

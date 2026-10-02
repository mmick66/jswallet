import { describe, expect, it } from 'vitest';
import cipher from '../src/logic/cipher';

// Testnet WIF of private key 1
const WIF = 'cMahea7zqjxrtgAbB7LSGbcQUr1uX1ojuat9jZodMN87JcbXMTcA';
// What the app encrypts with: Hasher.hash('hunter2')
const PASSWORD = '2fce64ac1708c5916a6958f9f25419c408580ed2bdf8a336805fcdd1db7f7346e6a9156eaecf1b2ee58d142939bc9762';

// Generated with printf %s "$WIF" | openssl enc -aes-256-cbc -md md5 -nosalt -pass pass:"$PASSWORD" | xxd -p | tr -d '\n'
// and identical to crypto.createCipher('aes-256-cbc', PASSWORD) on Node 20.17
const LEGACY = {
    [PASSWORD]: '87d47afa0b1f75d574b022f58593dda7b4d109ebee898597716d14df253650e5c86877c5767832c203d7d38dc2136c809b29c4f6d7d6ccfbb3ec32f6bef04039',
    // createCipher took a string password as UTF-8
    'pässwörd': '2897670a986225549c9248ea176f39a5f90a8b0d9bfa11a0df12fba9bd3ab8a893c141a6d4e5b924225eb4847d21f9c59486939d8a602210878545116c789995',
};

const V2_FORMAT = /^v2:[0-9a-f]{32}:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/;

// Flips the lowest bit of the hex byte at the given field and position
const tamper = (stored, field, at = 0) => {
    const fields = stored.split(':');
    const byte = parseInt(fields[field].substr(at * 2, 2), 16) ^ 1;
    fields[field] = fields[field].slice(0, at * 2) + byte.toString(16).padStart(2, '0') + fields[field].slice(at * 2 + 2);
    return fields.join(':');
};

describe('cipher', () => {

    describe('legacy values', () => {
        it.each(Object.entries(LEGACY))('decrypts a createCipher value made with password %j', (password, stored) => {
            expect(cipher.decrypt(stored, password)).toBe(WIF);
        });

        it('recognises them as legacy', () => {
            expect(cipher.isLegacy(LEGACY[PASSWORD])).toBe(true);
            expect(cipher.isLegacy(cipher.encrypt(WIF, PASSWORD))).toBe(false);
        });
    });

    describe('v2 values', () => {
        it('round-trips', () => {
            const stored = cipher.encrypt(WIF, PASSWORD);
            expect(stored).toMatch(V2_FORMAT);
            expect(cipher.decrypt(stored, PASSWORD)).toBe(WIF);
        });

        it('round-trips non-ASCII text and passwords', () => {
            expect(cipher.decrypt(cipher.encrypt('κλειδί ✓', 'pässwörd'), 'pässwörd')).toBe('κλειδί ✓');
        });

        it('throws on a wrong password', () => {
            const stored = cipher.encrypt(WIF, PASSWORD);
            expect(() => cipher.decrypt(stored, `${PASSWORD}0`)).toThrow(/unable to authenticate/);
        });

        it.each([
            ['salt', 1],
            ['iv', 2],
            ['tag', 3],
            ['ciphertext', 4],
        ])('throws when the %s was changed', (name, field) => {
            const stored = cipher.encrypt(WIF, PASSWORD);
            expect(() => cipher.decrypt(tamper(stored, field), PASSWORD)).toThrow(/unable to authenticate/);
        });

        it('throws on a malformed value', () => {
            const stored = cipher.encrypt(WIF, PASSWORD);
            expect(() => cipher.decrypt(stored.split(':').slice(0, 4).join(':'), PASSWORD)).toThrow(/Malformed/);
        });

        it('differs between two encryptions of the same input', () => {
            const first = cipher.encrypt(WIF, PASSWORD);
            const second = cipher.encrypt(WIF, PASSWORD);
            expect(first).not.toBe(second);

            const [, salt1, iv1] = first.split(':');
            const [, salt2, iv2] = second.split(':');
            expect(salt1).not.toBe(salt2);
            expect(iv1).not.toBe(iv2);
        });
    });
});

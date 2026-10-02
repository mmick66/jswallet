import crypto from 'crypto';

/**
 * Encrypts the wallet keys at rest.
 *
 * Current format (v2), hex fields separated by colons:
 *   v2:<salt>:<iv>:<tag>:<ciphertext>
 * AES-256-GCM with key = scrypt(password, salt).
 *
 * Legacy format: bare hex, as written by crypto.createCipher with 'aes-256-cbc', which Node 22 removed.
 * It derived key and IV with OpenSSL EVP_BytesToKey(MD5, no salt, 1 iteration).
 * It is only ever decrypted, so keys stored by older versions stay readable.
 */

const V2 = {
    Prefix: 'v2:',
    Algorithm: 'aes-256-gcm',
    KeyLength: 32,
    SaltLength: 16,
    IvLength: 12,
    TagLength: 16,
};

const Legacy = {
    Algorithm: 'aes-256-cbc',
    KeyLength: 32,
    IvLength: 16,
};

/**
 * OpenSSL EVP_BytesToKey with MD5, no salt and one iteration:
 * D_1 = MD5(password), D_i = MD5(D_{i-1} || password), split into key then IV
 */
const evpBytesToKey = (password, keyLength, ivLength) => {
    const secret = Buffer.from(password, 'utf8');
    const blocks = [];
    let block = Buffer.alloc(0);
    let length = 0;
    while (length < keyLength + ivLength) {
        block = crypto.createHash('md5').update(block).update(secret).digest();
        blocks.push(block);
        length += block.length;
    }
    const derived = Buffer.concat(blocks);
    return {
        key: derived.subarray(0, keyLength),
        iv: derived.subarray(keyLength, keyLength + ivLength),
    };
};

const isLegacy = stored => !stored.startsWith(V2.Prefix);

/**
 * @param plaintext UTF-8 text to encrypt
 * @param password Any string; the same one decrypts it
 * @returns {string} v2:<salt>:<iv>:<tag>:<ciphertext>, a fresh salt and IV every call
 */
const encrypt = (plaintext, password) => {
    const salt = crypto.randomBytes(V2.SaltLength);
    const iv = crypto.randomBytes(V2.IvLength);
    const key = crypto.scryptSync(password, salt, V2.KeyLength);

    const cipher = crypto.createCipheriv(V2.Algorithm, key, iv, { authTagLength: V2.TagLength });
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return V2.Prefix + [salt, iv, cipher.getAuthTag(), ciphertext].map(b => b.toString('hex')).join(':');
};

const decryptV2 = (stored, password) => {
    const fields = stored.slice(V2.Prefix.length).split(':');
    if (fields.length !== 4) throw new Error('Malformed encrypted value');
    const [salt, iv, tag, ciphertext] = fields.map(f => Buffer.from(f, 'hex'));
    const key = crypto.scryptSync(password, salt, V2.KeyLength);

    const decipher = crypto.createDecipheriv(V2.Algorithm, key, iv, { authTagLength: V2.TagLength });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};

const decryptLegacy = (stored, password) => {
    const { key, iv } = evpBytesToKey(password, Legacy.KeyLength, Legacy.IvLength);
    const decipher = crypto.createDecipheriv(Legacy.Algorithm, key, iv);
    return decipher.update(stored, 'hex', 'utf8') + decipher.final('utf8');
};

/**
 * @param stored A value from encrypt, or a legacy one (see isLegacy)
 * @param password The password it was encrypted with
 * @returns {string} The plaintext; throws if the password is wrong or the value was tampered with
 */
const decrypt = (stored, password) => (isLegacy(stored) ? decryptLegacy(stored, password) : decryptV2(stored, password));

export default { encrypt, decrypt, isLegacy };

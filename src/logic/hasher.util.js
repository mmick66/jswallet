import crypto from 'crypto';

class Hasher {

    static hash(password) {

        return new Promise((resolve, reject) => {

            if (!password) reject('No value provided');

            crypto.pbkdf2(password, Hasher.Salt, 2048, 48, Hasher.Algorithm, (err, data) => {
                if (err) reject(err);

                const hex = data.toString('hex');
                resolve(hex);

            });
        });
    }

    static encrypt(key, password) {
        const cipher = crypto.createCipher(Hasher.Encryption, password);
        const encrypted = cipher.update(key, Hasher.Encoding) + cipher.final(Hasher.Encoding);
        return encrypted;
    }

    static decrypt(key, password) {
        const cipher = crypto.createDecipher(Hasher.Encryption, password);
        const decrypted = cipher.update(key, Hasher.Encoding) + cipher.final(Hasher.Encoding);
        return decrypted;
    }
}

Hasher.Salt = 'jswallet';
Hasher.Algorithm = 'sha512';
Hasher.Encryption = 'aes-256-cbc';
Hasher.Encoding = 'hex';
export default Hasher;

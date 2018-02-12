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
        return cipher.update(key, Hasher.Encoding.In, Hasher.Encoding.Out) + cipher.final(Hasher.Encoding.Out);
    }

    static decrypt(key, password) {
        const cipher = crypto.createDecipher(Hasher.Encryption, password);
        return cipher.update(key, Hasher.Encoding.Out, Hasher.Encoding.In) + cipher.final(Hasher.Encoding.In);
    }
}

Hasher.Salt = 'jswallet';
Hasher.Algorithm = 'sha512';
Hasher.Encryption = 'aes-256-cbc';
Hasher.Encoding = {
    In: 'utf8',
    Out: 'hex'
};
export default Hasher;
